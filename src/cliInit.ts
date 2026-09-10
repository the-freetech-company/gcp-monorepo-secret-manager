import fs from "fs";
import {
  defaultLocalKeyPath,
  defaultLocalStorePath,
  ensureGitignoreEntry,
  writeLocalKey,
} from "./backends/local";
import { EnvironmentConfig, Provider, SecretsConfig, ServiceConfig } from "./types";
import { createPrompt } from "./prompt";

const PROVIDERS: Provider[] = ["gcp", "aws", "azure", "local"];

function parseProvider(value: string, fallback: Provider): Provider {
  const normalized = value.toLowerCase() as Provider;
  return PROVIDERS.includes(normalized) ? normalized : fallback;
}

async function promptEnvironment(
  question: (prompt: string) => Promise<string>,
  label: "staging" | "production",
  existing?: EnvironmentConfig
): Promise<EnvironmentConfig> {
  const currentProvider = existing?.provider || "gcp";
  const providerInput = await question(
    `${label} provider [gcp/aws/azure/local] [${currentProvider}]: `
  );
  const provider = parseProvider(providerInput, currentProvider);

  switch (provider) {
    case "gcp": {
      const projectId =
        (await question(
          `${label} GCP project ID [${existing?.projectId || `your-${label}-project`}]: `
        )) ||
        existing?.projectId ||
        `your-${label}-project`;
      const credentialsPath =
        (await question(
          `${label} service account JSON path [${existing?.credentials?.path || `gcloud/${label}/service-account.json`}]: `
        )) ||
        existing?.credentials?.path ||
        `gcloud/${label}/service-account.json`;
      return {
        provider,
        projectId,
        credentials: { path: credentialsPath },
      };
    }
    case "aws": {
      const region =
        (await question(
          `${label} AWS region [${existing?.region || "us-east-1"}]: `
        )) ||
        existing?.region ||
        "us-east-1";
      const profile =
        (await question(
          `${label} AWS profile (empty for default) [${existing?.credentials?.profile || ""}]: `
        )) || existing?.credentials?.profile;
      const kmsKeyId =
        (await question(
          `${label} KMS key id (optional) [${existing?.kmsKeyId || ""}]: `
        )) || existing?.kmsKeyId;
      return {
        provider,
        region,
        kmsKeyId: kmsKeyId || undefined,
        credentials: profile ? { profile } : undefined,
      };
    }
    case "azure": {
      const vaultUrl =
        (await question(
          `${label} Key Vault URL [${existing?.vaultUrl || "https://my-vault.vault.azure.net/"}]: `
        )) ||
        existing?.vaultUrl ||
        "https://my-vault.vault.azure.net/";
      return { provider, vaultUrl };
    }
    case "local": {
      const storePath =
        (await question(
          `${label} local store path [${existing?.storePath || defaultLocalStorePath()}]: `
        )) ||
        existing?.storePath ||
        defaultLocalStorePath();
      return {
        provider,
        storePath,
        keyPath: existing?.keyPath || defaultLocalKeyPath(storePath),
      };
    }
    default:
      return { provider: "local", storePath: defaultLocalStorePath() };
  }
}

async function promptExtraItem(
  question: (prompt: string) => Promise<string>,
  serviceName: string,
  environmentsDir: string
): Promise<ServiceConfig["secrets"][number] | null> {
  const kindInput = await question(
    "Additional kind [ssh-keypair/tls-bundle/json/binary] (empty to skip): "
  );
  const kind = kindInput.toLowerCase();

  if (!kind) {
    return null;
  }

  if (kind === "ssh-keypair") {
    const remoteName =
      (await question(`Remote name [${serviceName}-deploy-ssh]: `)) ||
      `${serviceName}-deploy-ssh`;
    const privateSource =
      (await question(
        `Source private key [${environmentsDir}/${serviceName}.{env}.id_ed25519]: `
      )) || `${environmentsDir}/${serviceName}.{env}.id_ed25519`;
    const publicSource =
      (await question(
        `Source public key [${privateSource}.pub]: `
      )) || `${privateSource}.pub`;
    const privateTarget =
      (await question(
        `Target private key [services/${serviceName}/.ssh/deploy]: `
      )) || `services/${serviceName}/.ssh/deploy`;
    return {
      kind: "ssh-keypair",
      remoteName,
      source: { private: privateSource, public: publicSource },
      target: { private: privateTarget, public: `${privateTarget}.pub` },
    };
  }

  if (kind === "tls-bundle") {
    const remoteName =
      (await question(`Remote name [${serviceName}-tls]: `)) ||
      `${serviceName}-tls`;
    const cert =
      (await question(
        `Source cert [${environmentsDir}/${serviceName}.{env}.crt]: `
      )) || `${environmentsDir}/${serviceName}.{env}.crt`;
    const key =
      (await question(
        `Source key [${environmentsDir}/${serviceName}.{env}.key]: `
      )) || `${environmentsDir}/${serviceName}.{env}.key`;
    return {
      kind: "tls-bundle",
      remoteName,
      source: { cert, key },
      target: {
        cert: `services/${serviceName}/tls/tls.crt`,
        key: `services/${serviceName}/tls/tls.key`,
      },
    };
  }

  if (kind === "json" || kind === "binary") {
    const extension = kind === "json" ? "json" : "bin";
    const remoteName =
      (await question(`Remote name [${serviceName}-${kind}]: `)) ||
      `${serviceName}-${kind}`;
    const sourcePath =
      (await question(
        `Source path [${environmentsDir}/${serviceName}.{env}.${extension}]: `
      )) || `${environmentsDir}/${serviceName}.{env}.${extension}`;
    const targetPath =
      (await question(
        `Target path [services/${serviceName}/${kind}.${extension}]: `
      )) || `services/${serviceName}/${kind}.${extension}`;
    return { kind, remoteName, sourcePath, targetPath };
  }

  console.log("Unknown kind, skipping.");
  return null;
}

export async function initializeConfig(): Promise<void> {
  const { question, close } = createPrompt();

  try {
    console.log("\nWelcome to Monorepo Secret Manager Setup!\n");
    console.log("This wizard will help you set up your configuration file.\n");

    let existing: SecretsConfig | null = null;
    if (fs.existsSync(".secrets-config")) {
      try {
        existing = JSON.parse(fs.readFileSync(".secrets-config", "utf8"));
        console.log("Found existing configuration. Current values will be shown as defaults.\n");
      } catch {
        console.log("Found existing .secrets-config but couldn't parse it. Starting fresh.\n");
      }
    }

    console.log("Provider setup");
    const staging = await promptEnvironment(
      question,
      "staging",
      existing?.environments?.staging
    );
    const production = await promptEnvironment(
      question,
      "production",
      existing?.environments?.production
    );

    console.log("\nWorkspace files");
    const environmentsDir =
      (await question("Environment files directory [.environments]: ")) ||
      ".environments";

    console.log("\nServices");
    const services: ServiceConfig[] = [];

    if (existing?.services?.length) {
      console.log("\nExisting services found:");
      existing.services.forEach((service, index) => {
        console.log(`  ${index + 1}. ${service.name}`);
      });
      const keepExisting = await question("\nKeep existing services and add new ones? [Y/n]: ");
      if (keepExisting.toLowerCase() !== "n" && keepExisting.toLowerCase() !== "no") {
        services.push(...existing.services);
        console.log(`Kept ${existing.services.length} existing services`);
      }
    }

    let addingServices = true;
    while (addingServices) {
      console.log(`\n--- Service ${services.length + 1} ---`);
      const serviceName = (await question("Service name [app]: ")) || "app";
      if (services.some((service) => service.name === serviceName)) {
        console.log(`Service '${serviceName}' already exists. Please choose a different name.`);
        continue;
      }

      const targetPath =
        (await question(
          `Target path for downloaded env file [services/${serviceName}/.env]: `
        )) || `services/${serviceName}/.env`;
      const remoteName =
        (await question(`Remote name [${serviceName}-env-file]: `)) ||
        `${serviceName}-env-file`;

      const secrets: ServiceConfig["secrets"] = [
        {
          kind: "env-file",
          sourcePath: `${environmentsDir}/.${serviceName}.{env}.env`,
          targetPath,
          remoteName,
        },
      ];

      let addingItems = true;
      while (addingItems) {
        const extra = await promptExtraItem(question, serviceName, environmentsDir);
        if (!extra) {
          addingItems = false;
        } else {
          secrets.push(extra);
        }
      }

      services.push({
        name: serviceName,
        envPath: `${environmentsDir}/.${serviceName}.{env}.env`,
        targetPath,
        secrets,
      });

      const addAnother = await question("\nAdd another service? [y/N]: ");
      if (addAnother.toLowerCase() !== "y" && addAnother.toLowerCase() !== "yes") {
        addingServices = false;
      }
    }

    console.log("\nDelete policy");
    const currentMaxVersions = existing?.deletePolicy?.maxVersions || 10;
    const currentMaxAgeDays = existing?.deletePolicy?.maxAgeDays || 30;
    const currentEnabled = existing?.deletePolicy?.enabled !== false;
    const maxVersionsInput = await question(
      `Maximum versions to keep [${currentMaxVersions}]: `
    );
    const maxVersions = maxVersionsInput
      ? parseInt(maxVersionsInput, 10)
      : currentMaxVersions;
    const maxAgeDaysInput = await question(
      `Maximum age in days [${currentMaxAgeDays}]: `
    );
    const maxAgeDays = maxAgeDaysInput
      ? parseInt(maxAgeDaysInput, 10)
      : currentMaxAgeDays;
    const enabledInput = await question(
      `Enable automatic cleanup? [${currentEnabled ? "Y/n" : "y/N"}]: `
    );
    const enabled = currentEnabled
      ? enabledInput.toLowerCase() !== "n" && enabledInput.toLowerCase() !== "no"
      : enabledInput.toLowerCase() === "y" || enabledInput.toLowerCase() === "yes";

    const config: SecretsConfig = {
      version: 2,
      environments: { staging, production },
      services,
      deletePolicy: { maxVersions, maxAgeDays, enabled },
    };

    fs.writeFileSync(".secrets-config", JSON.stringify(config, null, 2));

    if (!fs.existsSync(environmentsDir)) {
      fs.mkdirSync(environmentsDir, { recursive: true });
      console.log(`\nCreated ${environmentsDir} directory`);
    }

    console.log("\nCreating environment files...");
    for (const service of services) {
      const stagingFile = `${environmentsDir}/.${service.name}.stg.env`;
      const productionFile = `${environmentsDir}/.${service.name}.prod.env`;
      if (!fs.existsSync(stagingFile)) {
        fs.writeFileSync(
          stagingFile,
          `# Add your staging environment variables here\nNODE_ENV=staging\nAPP_NAME=${service.name}\n`
        );
        console.log(`  Created ${stagingFile}`);
      }
      if (!fs.existsSync(productionFile)) {
        fs.writeFileSync(
          productionFile,
          `# Add your production environment variables here\nNODE_ENV=production\nAPP_NAME=${service.name}\n`
        );
        console.log(`  Created ${productionFile}`);
      }
    }

    const usesLocal =
      staging.provider === "local" || production.provider === "local";
    if (usesLocal) {
      ensureGitignoreEntry(".msm/");
      const localEnv = staging.provider === "local" ? staging : production;
      const storePath = localEnv.storePath || defaultLocalStorePath();
      const keyPath = localEnv.keyPath || defaultLocalKeyPath(storePath);
      fs.mkdirSync(storePath, { recursive: true });
      if (!fs.existsSync(keyPath) && !process.env.MSM_LOCAL_KEY) {
        writeLocalKey(keyPath);
        console.log(`Created local store key at ${keyPath}`);
      }
    }

    console.log("\nConfiguration file created successfully!");
    console.log("\nSummary:");
    console.log(`- Staging provider: ${staging.provider}`);
    console.log(`- Production provider: ${production.provider}`);
    console.log(`- Environment directory: ${environmentsDir}`);
    console.log(`- Services configured: ${services.map((service) => service.name).join(", ")}`);
    console.log(
      `- Delete Policy: maxVersions=${maxVersions}, maxAgeDays=${maxAgeDays}, enabled=${enabled}`
    );
    console.log("\nNext steps:");
    console.log(`1. Edit your files in the ${environmentsDir} directory`);
    console.log("2. Install the optional SDK for your provider, if needed");
    console.log("3. Run 'msm --list' to see your configured services");
    console.log("4. Use 'msm --upload --service <name> --stg/--prod' to upload");
  } finally {
    close();
  }
}

export async function addService(configPath?: string): Promise<void> {
  const { question, close } = createPrompt();
  const configFilePath = configPath || ".secrets-config";

  try {
    if (!fs.existsSync(configFilePath)) {
      console.error(`Configuration file not found at ${configFilePath}`);
      console.error("Please run 'msm --init' first to create a configuration file.");
      process.exit(1);
    }

    const { ConfigManager } = await import("./ConfigManager");
    const configManager = new ConfigManager(configFilePath);
    const config = configManager.getConfig();
    const existingServices = configManager.getServiceNames();

    console.log("\nAdding a new service to your configuration\n");

    let serviceName: string;
    while (true) {
      serviceName = (await question("Service name [new-service]: ")) || "new-service";
      if (!serviceName) {
        console.log("Service name cannot be empty.");
        continue;
      }
      if (existingServices.includes(serviceName)) {
        console.log(`Service '${serviceName}' already exists. Please choose a different name.`);
        continue;
      }
      break;
    }

    const existingService = config.services[0];
    const envMatch = existingService?.envPath?.match(/(.+)\.\w+\.\{env\}\.env$/);
    const environmentsDir = envMatch ? envMatch[1] : ".environments";

    const targetPath =
      (await question(
        `Target path for downloaded files [services/${serviceName}/.env]: `
      )) || `services/${serviceName}/.env`;
    const remoteName =
      (await question(`Remote name [${serviceName}-env-file]: `)) ||
      `${serviceName}-env-file`;

    const newService: ServiceConfig = {
      name: serviceName,
      envPath: `${environmentsDir}/.${serviceName}.{env}.env`,
      targetPath,
      secrets: [
        {
          kind: "env-file",
          sourcePath: `${environmentsDir}/.${serviceName}.{env}.env`,
          targetPath,
          remoteName,
        },
      ],
    };

    config.services.push(newService);
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));

    const stagingFile = `${environmentsDir}/.${serviceName}.stg.env`;
    const productionFile = `${environmentsDir}/.${serviceName}.prod.env`;
    if (!fs.existsSync(stagingFile)) {
      fs.writeFileSync(stagingFile, "# Add your staging environment variables here\n");
      console.log(`Created ${stagingFile}`);
    }
    if (!fs.existsSync(productionFile)) {
      fs.writeFileSync(productionFile, "# Add your production environment variables here\n");
      console.log(`Created ${productionFile}`);
    }

    console.log(`\nService '${serviceName}' added successfully!`);
    console.log(`Configuration updated in ${configFilePath}`);
  } finally {
    close();
  }
}

export async function removeService(configPath?: string): Promise<void> {
  const { question, close } = createPrompt();
  const configFilePath = configPath || ".secrets-config";

  try {
    if (!fs.existsSync(configFilePath)) {
      console.error(`Configuration file not found at ${configFilePath}`);
      console.error("Please run 'msm --init' first to create a configuration file.");
      process.exit(1);
    }

    const { ConfigManager } = await import("./ConfigManager");
    const configManager = new ConfigManager(configFilePath);
    const config = configManager.getConfig();
    const existingServices = configManager.getServiceNames();

    if (existingServices.length === 0) {
      console.log("No services found in configuration.");
      return;
    }

    console.log("\nRemove a service from your configuration\n");
    existingServices.forEach((service, index) => {
      console.log(`  ${index + 1}. ${service}`);
    });
    console.log();

    const serviceInput = await question("Enter service name or number to remove: ");
    const serviceNumber = parseInt(serviceInput, 10);
    let serviceToRemove: string;
    if (
      !Number.isNaN(serviceNumber) &&
      serviceNumber >= 1 &&
      serviceNumber <= existingServices.length
    ) {
      serviceToRemove = existingServices[serviceNumber - 1];
    } else if (existingServices.includes(serviceInput)) {
      serviceToRemove = serviceInput;
    } else {
      console.log("Invalid service name or number.");
      return;
    }

    const confirm = await question(
      `Are you sure you want to remove service '${serviceToRemove}'? This will NOT delete local files. (y/N): `
    );
    if (confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
      console.log("Removal cancelled.");
      return;
    }

    config.services = config.services.filter(
      (service) => service.name !== serviceToRemove
    );
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
    console.log(`Service '${serviceToRemove}' removed from configuration.`);
  } finally {
    close();
  }
}
