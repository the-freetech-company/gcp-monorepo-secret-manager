import fs from "fs";
import { SecretBackend } from "./backends/types";
import { createBackend } from "./backends/createBackend";
import { ConfigManager } from "./ConfigManager";
import { getKind } from "./kinds";
import { interpolateEnv } from "./pathUtils";
import {
  Environment,
  EnvironmentConfig,
  MonorepoSecretManagerOptions,
  ServiceConfig,
  ServiceSecretConfig,
} from "./types";

export interface MonorepoSecretManagerTestOptions
  extends MonorepoSecretManagerOptions {
  backend?: SecretBackend;
}

export class MonorepoSecretManager {
  private environment: Environment;
  private overrideSa: boolean;
  private configManager: ConfigManager;
  private backendPromise: Promise<SecretBackend>;

  constructor(options: MonorepoSecretManagerTestOptions) {
    this.environment = options.environment;
    this.overrideSa = options.overrideSa || false;
    this.configManager = new ConfigManager(options.configPath);
    const environmentConfig = this.configManager.getEnvironmentConfig(
      this.environment
    );
    this.validateCredentials(environmentConfig);
    this.backendPromise = options.backend
      ? Promise.resolve(options.backend)
      : createBackend({
          environment: environmentConfig,
          overrideSa: this.overrideSa,
        });
  }

  private validateCredentials(environment: EnvironmentConfig): void {
    if (this.overrideSa) {
      return;
    }
    if (environment.provider === "gcp" && environment.credentials?.path) {
      if (!fs.existsSync(environment.credentials.path)) {
        throw new Error(
          `Service account file not found at ${environment.credentials.path}`
        );
      }
    }
  }

  private async getBackend(): Promise<SecretBackend> {
    return this.backendPromise;
  }

  private requireService(serviceName: string): ServiceConfig {
    const service = this.configManager.getServiceByName(serviceName);
    if (!service) {
      throw new Error(`Service '${serviceName}' not found in configuration`);
    }
    return service;
  }

  private primaryEnvItem(service: ServiceConfig): ServiceSecretConfig {
    return (
      service.secrets.find((item) => item.kind === "env-file") ||
      service.secrets[0]
    );
  }

  private getEnvPath(serviceName: string): string {
    const service = this.requireService(serviceName);
    const raw = service.envPath || this.primaryEnvItem(service)?.sourcePath;
    if (!raw) {
      throw new Error(`Service '${serviceName}' does not have an env-file source path`);
    }
    return interpolateEnv(raw, this.environment);
  }

  private getSecretName(serviceName: string): string {
    const service = this.requireService(serviceName);
    const item = this.primaryEnvItem(service);
    if (!item?.remoteName) {
      throw new Error(`Service '${serviceName}' does not have a remote name`);
    }
    return item.remoteName;
  }

  private getTargetPath(serviceName: string): string {
    const service = this.requireService(serviceName);
    const raw = service.targetPath || this.primaryEnvItem(service)?.targetPath;
    if (!raw) {
      throw new Error(`Service '${serviceName}' does not have an env-file target path`);
    }
    return interpolateEnv(raw, this.environment);
  }

  getAvailableServices(): string[] {
    return this.configManager.getServiceNames();
  }

  private async forEachService(
    serviceName: string,
    action: (name: string) => Promise<void>
  ): Promise<void> {
    const names =
      serviceName === "all"
        ? this.configManager.getServiceNames()
        : [serviceName];

    for (const name of names) {
      await action(name);
    }
  }

  async uploadEnv(serviceName: string): Promise<void> {
    await this.forEachService(serviceName, (name) => this.uploadSingleService(name));
  }

  private async uploadSingleService(serviceName: string): Promise<void> {
    const service = this.requireService(serviceName);
    const backend = await this.getBackend();
    const deletePolicy = this.configManager.getDeletePolicy();

    for (const item of service.secrets) {
      const kind = getKind(item.kind);
      if (item.kind === "env-file") {
        const envPath = item.sourcePath
          ? interpolateEnv(item.sourcePath, this.environment)
          : this.getEnvPath(serviceName);
        if (!fs.existsSync(envPath)) {
          throw new Error(`Environment file not found at ${envPath}`);
        }
      }

      const data = await kind.readFromDisk(item, this.environment);
      kind.validate(data);
      await backend.put(item.remoteName, { data });
      if (deletePolicy.enabled !== false) {
        await backend.destroyVersions(item.remoteName, deletePolicy);
      }
      console.log(
        `✅ ${serviceName} ${item.kind} successfully uploaded to ${backend.provider} for ${this.environment}`
      );
    }
  }

  async downloadEnv(serviceName: string): Promise<void> {
    await this.forEachService(serviceName, (name) =>
      this.materializeService(name, "source", "downloaded")
    );
  }

  async setEnv(serviceName: string): Promise<void> {
    await this.forEachService(serviceName, (name) =>
      this.materializeService(name, "target", "set")
    );
  }

  private async materializeService(
    serviceName: string,
    dest: "source" | "target",
    verb: string
  ): Promise<void> {
    const service = this.requireService(serviceName);
    const backend = await this.getBackend();

    for (const item of service.secrets) {
      try {
        const kind = getKind(item.kind);
        const payload = await backend.get(item.remoteName);
        kind.validate(payload.data);
        const written = await kind.writeToDisk(
          item,
          payload.data,
          dest,
          this.environment
        );
        console.log(
          `✅ ${serviceName} ${item.kind} successfully ${verb} to ${written.join(", ")} for ${this.environment}`
        );
      } catch (error) {
        console.error(
          `❌ Error: Could not ${verb} ${item.kind} for ${serviceName}: ${(error as Error).message}`
        );
        throw error;
      }
    }
  }

  async peekEnv(serviceName: string): Promise<void> {
    await this.forEachService(serviceName, (name) => this.peekSingleService(name));
  }

  private async peekSingleService(serviceName: string): Promise<void> {
    const service = this.requireService(serviceName);
    const backend = await this.getBackend();

    for (const item of service.secrets) {
      console.log(
        `\n📝 ${item.kind} for ${serviceName} in ${this.environment} (${item.remoteName}):\n`
      );
      try {
        const kind = getKind(item.kind);
        const payload = await backend.get(item.remoteName);
        console.log(kind.peek(payload.data));
      } catch (error) {
        if (
          (error as Error).message.includes("NOT_FOUND") ||
          (error as Error).message.includes("No data found")
        ) {
          console.log(`No value found for ${serviceName} (${item.remoteName}).`);
        } else {
          console.error(`❌ Error: ${(error as Error).message}`);
        }
      }
      console.log();
    }
  }

  async cleanupVersions(serviceName: string): Promise<void> {
    const deletePolicy = this.configManager.getDeletePolicy();
    await this.forEachService(serviceName, async (name) => {
      const service = this.requireService(name);
      const backend = await this.getBackend();
      for (const item of service.secrets) {
        await backend.destroyVersions(item.remoteName, deletePolicy);
      }
    });
    console.log(
      `✅ Completed cleanup for ${serviceName} in ${this.environment}`
    );
  }
}
