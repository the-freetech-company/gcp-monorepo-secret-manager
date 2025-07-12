import { initSecretManagerClient } from "./initSecretManagerClient";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { BaseConfig, ConfigOptions } from "./types";

/**
 * Initializes configuration by fetching environment variables from Secret Manager
 * This function pulls the service environment variables from Secret Manager and writes them to a .env file
 *
 * @param options Configuration options for the service
 */
async function initializeConfig<T extends BaseConfig>(
  options: ConfigOptions
): Promise<string> {
  try {
    const { serviceName, envPath, secretName } = options;

    // Determine the .env file path
    const defaultEnvPath = path.resolve(process.cwd(), ".env");
    const resolvedEnvPath = envPath || defaultEnvPath;

    // Check if .env file already exists
    console.log(`Checking if .env file exists...${resolvedEnvPath}`);
    if (fs.existsSync(resolvedEnvPath)) {
      console.info(`Using existing .env file for ${serviceName}`);
      // Load environment variables from existing .env file
      dotenv.config({ path: resolvedEnvPath });
      return resolvedEnvPath;
    }

    console.info(
      `Initializing config for ${serviceName} from Secret Manager...`
    );

    // Initialize Secret Manager client
    const secretManagerClient = initSecretManagerClient();

    // Determine environment and project ID
    const projectId = options.projectId;
    const resolvedSecretName =
      secretName || `${serviceName.toUpperCase()}_ENV_FILE`;
    const secretPath = `projects/${projectId}/secrets/${resolvedSecretName}/versions/latest`;

    console.info(`Fetching secret: ${secretPath}`);

    // Access the secret
    const [version] = await secretManagerClient.accessSecretVersion({
      name: secretPath,
    });

    if (!version.payload || !version.payload.data) {
      throw new Error(`No data found for secret ${resolvedSecretName}`);
    }

    // Get the secret data
    const envContent = Buffer.from(version.payload.data as Buffer).toString();

    // Write to .env file
    fs.writeFileSync(resolvedEnvPath, envContent);
    console.info(
      `Successfully loaded environment variables for ${serviceName} from Secret Manager`
    );

    // Load the newly written environment variables into process.env
    dotenv.config({ path: resolvedEnvPath });

    // Verify that critical environment variables are now set
    if (!process.env.ENV) {
      console.error("ENV variable not set after loading from Secret Manager");
      throw new Error("ENV is not set after loading from Secret Manager");
    }

    return resolvedEnvPath;
  } catch (error) {
    console.error("Failed to initialize config from Secret Manager:", error);
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    }
    throw new Error(
      `Failed to initialize config for ${options.serviceName} from Secret Manager`
    );
  }
}

/**
 * Loads configuration for a service
 *
 * @param options Configuration options for the service
 * @returns void
 */
export async function loadConfig<T extends BaseConfig>(options: ConfigOptions) {
  // Initialize config from Secret Manager
  const envPath = await initializeConfig<T>(options);

  // Load the environment variables from the .env file
  dotenv.config({ path: envPath });

  // Verify environment variables are loaded
  if (!process.env.ENV) {
    throw new Error("ENV is not set");
  }

  // Check required environment variables if specified
  if (options.requiredEnvVars && options.requiredEnvVars.length > 0) {
    const missingVars = options.requiredEnvVars.filter(
      (varName) => !process.env[varName]
    );

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}`
      );
    }
  }
} 