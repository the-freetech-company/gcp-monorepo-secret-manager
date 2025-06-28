import fs from "fs";
import path from "path";
import { SecretsConfig, ServiceConfig, DeletePolicy } from "./types";

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
        `Configuration file not found at ${this.configPath}. Please create a .secrets-config file. Run 'monorepo-secrets --init' to generate a template.`
      );
    }

    try {
      const configContent = fs.readFileSync(this.configPath, "utf8");
      return JSON.parse(configContent);
    } catch (error) {
      throw new Error(
        `Failed to parse configuration file: ${(error as Error).message}`
      );
    }
  }

  private validateConfig(): void {
    const { serviceAccountPaths, services, projectIds, deletePolicy } = this.config;

    // Validate service account paths
    if (!serviceAccountPaths || !serviceAccountPaths.staging || !serviceAccountPaths.production) {
      throw new Error(
        "Configuration must include serviceAccountPaths for both staging and production"
      );
    }

    // Validate project IDs
    if (!projectIds || !projectIds.staging || !projectIds.production) {
      throw new Error(
        "Configuration must include projectIds for both staging and production"
      );
    }

    // Services are optional now - they can be added later using --add-service
    if (services && !Array.isArray(services)) {
      throw new Error("Services must be an array if provided");
    }

    if (services && services.length > 0) {
      services.forEach((service, index) => {
        if (!service.name || !service.envPath || !service.targetPath || !service.secretPrefix) {
          throw new Error(
            `Service at index ${index} is missing required fields: name, envPath, targetPath, secretPrefix`
          );
        }
      });
    }

    // Validate delete policy if provided
    if (deletePolicy) {
      this.validateDeletePolicy(deletePolicy);
    }
  }

  private validateDeletePolicy(policy: DeletePolicy): void {
    if (policy.maxVersions !== undefined && (policy.maxVersions < 0 || !Number.isInteger(policy.maxVersions))) {
      throw new Error("deletePolicy.maxVersions must be a non-negative integer");
    }

    if (policy.maxAgeDays !== undefined && (policy.maxAgeDays < 0 || !Number.isInteger(policy.maxAgeDays))) {
      throw new Error("deletePolicy.maxAgeDays must be a non-negative integer");
    }

    if (policy.enabled !== undefined && typeof policy.enabled !== 'boolean') {
      throw new Error("deletePolicy.enabled must be a boolean");
    }
  }

  getConfig(): SecretsConfig {
    return this.config;
  }

  getServiceAccountPath(environment: "staging" | "production"): string {
    return this.config.serviceAccountPaths[environment];
  }

  getProjectId(environment: "staging" | "production"): string {
    return this.config.projectIds[environment];
  }

  getServices(): ServiceConfig[] {
    return this.config.services || [];
  }

  getServiceByName(name: string): ServiceConfig | undefined {
    return this.getServices().find(service => service.name === name);
  }

  getServiceNames(): string[] {
    return this.getServices().map(service => service.name);
  }

  getDeletePolicy(): DeletePolicy {
    // Return default delete policy if none is configured
    return this.config.deletePolicy || {
      maxVersions: 10,
      maxAgeDays: 30,
      enabled: true
    };
  }

  static generateTemplate(outputPath: string = ".secrets-config"): void {
    const template: SecretsConfig = {
      serviceAccountPaths: {
        staging: "firebase/freetech-stg/firebase-admin.json",
        production: "firebase/freetech-production/firebase-admin.json"
      },
      projectIds: {
        staging: "your-staging-project-id",
        production: "your-production-project-id"
      },
      services: [],
      deletePolicy: {
        maxVersions: 10,
        maxAgeDays: 30,
        enabled: true
      }
    };

    fs.writeFileSync(outputPath, JSON.stringify(template, null, 2));
    console.log(`✅ Configuration template created at ${outputPath}`);
    console.log("Please update the projectIds and paths according to your project structure.");
    console.log("Use 'monorepo-secrets --add-service' to add services to your configuration.");
  }
} 