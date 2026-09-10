import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createBackend } from "./backends/createBackend";
import { envFileKind } from "./kinds";
import { ConfigOptions, EnvironmentConfig, Provider } from "./types";

function environmentFromOptions(options: ConfigOptions): EnvironmentConfig {
  const provider: Provider = options.provider || "gcp";

  switch (provider) {
    case "gcp":
      if (!options.projectId) {
        throw new Error("projectId is required when provider is gcp");
      }
      return { provider, projectId: options.projectId };
    case "aws":
      if (!options.region) {
        throw new Error("region is required when provider is aws");
      }
      return { provider, region: options.region };
    case "azure":
      if (!options.vaultUrl) {
        throw new Error("vaultUrl is required when provider is azure");
      }
      return { provider, vaultUrl: options.vaultUrl };
    case "local":
      return { provider, storePath: options.storePath };
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

function remoteName(options: ConfigOptions): string {
  return options.secretName || `${options.serviceName.toUpperCase()}_ENV_FILE`;
}

/**
 * Load environment variables from a local file, or fetch them from the
 * configured backend when the file is missing.
 */
export async function loadConfig(options: ConfigOptions): Promise<void> {
  const envPath = path.resolve(options.envPath || "./.env");

  if (!fs.existsSync(envPath)) {
    try {
      const backend = await createBackend({
        environment: environmentFromOptions(options),
        overrideSa: true,
      });
      const payload = await backend.get(remoteName(options));
      envFileKind.validate(payload.data);
      const text = payload.data.toString("utf8");
      const envelopeStart = text.trim().startsWith("{");
      const contents = envelopeStart
        ? (() => {
            try {
              const parsed = JSON.parse(text);
              if (parsed?.kind === "env-file" && parsed.files?.data) {
                return Buffer.from(parsed.files.data, "base64").toString("utf8");
              }
            } catch {
              // raw dotenv text that happens to start with {
            }
            return text;
          })()
        : text;
      fs.writeFileSync(envPath, contents);
    } catch (error) {
      throw new Error(
        `Failed to initialize config for ${options.serviceName} from Secret Manager: ${(error as Error).message}`
      );
    }
  }

  dotenv.config({ path: envPath });

  if (!process.env.ENV) {
    throw new Error("ENV is not set");
  }

  if (options.requiredEnvVars?.length) {
    const missing = options.requiredEnvVars.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}`
      );
    }
  }
}
