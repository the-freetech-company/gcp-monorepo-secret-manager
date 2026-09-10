import fs from "fs";
import {
  DeletePolicy,
  Environment,
  EnvironmentConfig,
  Provider,
  SecretKindId,
  SecretsConfig,
  ServiceConfig,
  ServiceSecretConfig,
} from "./types";

const SECRET_KINDS: SecretKindId[] = [
  "env-file",
  "ssh-keypair",
  "tls-bundle",
  "json",
  "binary",
];

const PROVIDERS: Provider[] = ["gcp", "aws", "azure", "local"];

interface LegacyService {
  name?: string;
  envPath?: string;
  targetPath?: string;
  secretPrefix?: string;
  secrets?: ServiceSecretConfig[];
}

interface LegacyConfig {
  serviceAccountPaths?: { staging?: string; production?: string };
  projectIds?: { staging?: string; production?: string };
  services?: LegacyService[];
  deletePolicy?: DeletePolicy;
  version?: number;
  environments?: SecretsConfig["environments"];
}

function isLegacyConfig(raw: LegacyConfig): boolean {
  return Boolean(
    raw.serviceAccountPaths &&
      raw.projectIds &&
      !raw.environments
  );
}

function adaptLegacyService(service: LegacyService): ServiceConfig {
  if (!service.name) {
    throw new Error("Service is missing required field: name");
  }

  const secrets =
    service.secrets && service.secrets.length > 0
      ? service.secrets
      : service.envPath && service.targetPath && service.secretPrefix
        ? [
            {
              kind: "env-file" as const,
              sourcePath: service.envPath,
              targetPath: service.targetPath,
              remoteName: `${service.secretPrefix}_ENV_FILE`,
            },
          ]
        : [];

  return {
    name: service.name,
    envPath: service.envPath,
    targetPath: service.targetPath,
    secretPrefix: service.secretPrefix,
    secrets,
  };
}

function adaptLegacyConfig(raw: LegacyConfig): SecretsConfig {
  if (
    !raw.serviceAccountPaths?.staging ||
    !raw.serviceAccountPaths.production ||
    !raw.projectIds?.staging ||
    !raw.projectIds.production
  ) {
    throw new Error(
      "Legacy configuration must include serviceAccountPaths and projectIds for both staging and production"
    );
  }

  return {
    version: 2,
    environments: {
      staging: {
        provider: "gcp",
        projectId: raw.projectIds.staging,
        credentials: { path: raw.serviceAccountPaths.staging },
      },
      production: {
        provider: "gcp",
        projectId: raw.projectIds.production,
        credentials: { path: raw.serviceAccountPaths.production },
      },
    },
    services: (raw.services || []).map(adaptLegacyService),
    deletePolicy: raw.deletePolicy,
    serviceAccountPaths: {
      staging: raw.serviceAccountPaths.staging,
      production: raw.serviceAccountPaths.production,
    },
    projectIds: {
      staging: raw.projectIds.staging,
      production: raw.projectIds.production,
    },
  };
}

function normalizeService(service: LegacyService, index: number): ServiceConfig {
  if (!service.name) {
    throw new Error(`Service at index ${index} is missing required field: name`);
  }

  const normalized = adaptLegacyService(service);
  if (!normalized.secrets || normalized.secrets.length === 0) {
    throw new Error(
      `Service '${service.name}' must include secrets or legacy envPath, targetPath, and secretPrefix`
    );
  }

  normalized.secrets.forEach((secret, secretIndex) => {
    if (!secret.kind || !SECRET_KINDS.includes(secret.kind)) {
      throw new Error(
        `Service '${service.name}' secret at index ${secretIndex} has an invalid kind`
      );
    }
    if (!secret.remoteName) {
      throw new Error(
        `Service '${service.name}' secret at index ${secretIndex} is missing remoteName`
      );
    }
  });

  return normalized;
}

function validateEnvironment(label: Environment, environment: EnvironmentConfig): void {
  if (!environment || !PROVIDERS.includes(environment.provider)) {
    throw new Error(
      `environments.${label}.provider must be one of: ${PROVIDERS.join(", ")}`
    );
  }

  switch (environment.provider) {
    case "gcp":
      if (!environment.projectId) {
        throw new Error(`environments.${label}.projectId is required for the GCP provider`);
      }
      break;
    case "aws":
      if (!environment.region) {
        throw new Error(`environments.${label}.region is required for the AWS provider`);
      }
      break;
    case "azure":
      if (!environment.vaultUrl) {
        throw new Error(`environments.${label}.vaultUrl is required for the Azure provider`);
      }
      break;
    case "local":
      break;
    default:
      break;
  }
}

export class ConfigManager {
  private config: SecretsConfig;
  private configPath: string;

  constructor(configPath: string = ".secrets-config") {
    this.configPath = configPath;
    this.config = this.loadConfig();
    this.validateConfig();
  }

  private loadConfig(): SecretsConfig {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(
        `Configuration file not found at ${this.configPath}. Please create a .secrets-config file. Run 'msm --init' to generate a template.`
      );
    }

    let raw: LegacyConfig;
    try {
      raw = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
    } catch (error) {
      throw new Error(
        `Failed to parse configuration file: ${(error as Error).message}`
      );
    }

    if (isLegacyConfig(raw)) {
      return adaptLegacyConfig(raw);
    }

    if (!raw.environments) {
      throw new Error(
        "Configuration must include environments.staging and environments.production"
      );
    }

    return {
      version: 2,
      environments: raw.environments,
      services: (raw.services || []).map((service, index) =>
        normalizeService(service, index)
      ),
      deletePolicy: raw.deletePolicy,
      serviceAccountPaths: raw.serviceAccountPaths as SecretsConfig["serviceAccountPaths"],
      projectIds: raw.projectIds as SecretsConfig["projectIds"],
    };
  }

  private validateConfig(): void {
    validateEnvironment("staging", this.config.environments.staging);
    validateEnvironment("production", this.config.environments.production);

    if (this.config.services && !Array.isArray(this.config.services)) {
      throw new Error("Services must be an array if provided");
    }

    if (this.config.deletePolicy) {
      this.validateDeletePolicy(this.config.deletePolicy);
    }
  }

  private validateDeletePolicy(policy: DeletePolicy): void {
    if (
      policy.maxVersions !== undefined &&
      (policy.maxVersions < 0 || !Number.isInteger(policy.maxVersions))
    ) {
      throw new Error("deletePolicy.maxVersions must be a non-negative integer");
    }

    if (
      policy.maxAgeDays !== undefined &&
      (policy.maxAgeDays < 0 || !Number.isInteger(policy.maxAgeDays))
    ) {
      throw new Error("deletePolicy.maxAgeDays must be a non-negative integer");
    }

    if (policy.enabled !== undefined && typeof policy.enabled !== "boolean") {
      throw new Error("deletePolicy.enabled must be a boolean");
    }
  }

  getConfig(): SecretsConfig {
    return this.config;
  }

  getEnvironmentConfig(environment: Environment): EnvironmentConfig {
    return this.config.environments[environment];
  }

  getServiceAccountPath(environment: Environment): string {
    const fromLegacy = this.config.serviceAccountPaths?.[environment];
    if (fromLegacy) {
      return fromLegacy;
    }

    const path = this.config.environments[environment].credentials?.path;
    if (!path) {
      throw new Error(
        `No service account path configured for ${environment}`
      );
    }
    return path;
  }

  getProjectId(environment: Environment): string {
    const fromLegacy = this.config.projectIds?.[environment];
    if (fromLegacy) {
      return fromLegacy;
    }

    const projectId = this.config.environments[environment].projectId;
    if (!projectId) {
      throw new Error(`No project ID configured for ${environment}`);
    }
    return projectId;
  }

  getServices(): ServiceConfig[] {
    return this.config.services || [];
  }

  getServiceByName(name: string): ServiceConfig | undefined {
    return this.getServices().find((service) => service.name === name);
  }

  getServiceNames(): string[] {
    return this.getServices().map((service) => service.name);
  }

  getDeletePolicy(): DeletePolicy {
    return (
      this.config.deletePolicy || {
        maxVersions: 10,
        maxAgeDays: 30,
        enabled: true,
      }
    );
  }

  writeConfig(config: SecretsConfig = this.config): void {
    this.config = config;
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  static generateTemplate(outputPath: string = ".secrets-config"): void {
    const template: SecretsConfig = {
      version: 2,
      environments: {
        staging: {
          provider: "gcp",
          projectId: "your-staging-project-id",
          credentials: { path: "gcloud/staging/service-account.json" },
        },
        production: {
          provider: "gcp",
          projectId: "your-production-project-id",
          credentials: { path: "gcloud/production/service-account.json" },
        },
      },
      services: [],
      deletePolicy: {
        maxVersions: 10,
        maxAgeDays: 30,
        enabled: true,
      },
    };

    fs.writeFileSync(outputPath, JSON.stringify(template, null, 2));
    console.log(`Configuration template created at ${outputPath}`);
    console.log("Please update the environments and add services with 'msm --add-service'.");
  }
}
