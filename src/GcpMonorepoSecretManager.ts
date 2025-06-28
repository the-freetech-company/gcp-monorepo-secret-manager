import { initializeApp, cert } from "firebase-admin/app";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import fs from "fs";
import path from "path";
import { Environment, GcpMonorepoSecretManagerOptions, ServiceConfig, DeletePolicy } from "./types";
import { ConfigManager } from "./ConfigManager";

export class GcpMonorepoSecretManager {
  private environment: Environment;
  private overrideSa: boolean;
  private client: SecretManagerServiceClient;
  private projectId: string;
  private configManager: ConfigManager;

  constructor(options: GcpMonorepoSecretManagerOptions) {
    this.environment = options.environment;
    this.overrideSa = options.overrideSa || false;
    this.configManager = new ConfigManager(options.configPath);
    this.projectId = this.configManager.getProjectId(this.environment);
    
    this.initializeFirebase();
    this.client = this.getSecretManagerClient();
  }

  private initializeFirebase() {
    if (this.overrideSa) {
      initializeApp();
      return;
    }
    
    const saPath = this.configManager.getServiceAccountPath(this.environment);
      
    if (!fs.existsSync(saPath)) {
      throw new Error(`Service account file not found at ${saPath}`);
    }
    
    // Set the GOOGLE_APPLICATION_CREDENTIALS environment variable
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(saPath);
    
    const serviceAccount = JSON.parse(
      fs.readFileSync(path.join("./", saPath), "utf8")
    );
    
    initializeApp({
      credential: cert(serviceAccount),
    });
    
    // Set the project ID for other Google Cloud services
    process.env.GOOGLE_CLOUD_PROJECT = serviceAccount.project_id;
  }

  private getSecretManagerClient(): SecretManagerServiceClient {
    return new SecretManagerServiceClient({
      projectId: this.projectId
    });
  }

  private getEnvPath(serviceName: string): string {
    const service = this.configManager.getServiceByName(serviceName);
    if (!service) {
      throw new Error(`Service '${serviceName}' not found in configuration`);
    }
    
    const envSuffix = this.environment === "staging" ? "stg" : "prod";
    return service.envPath.replace("{env}", envSuffix);
  }

  private getSecretName(serviceName: string): string {
    const service = this.configManager.getServiceByName(serviceName);
    if (!service) {
      throw new Error(`Service '${serviceName}' not found in configuration`);
    }
    
    return `${service.secretPrefix}_ENV_FILE`;
  }

  private getTargetPath(serviceName: string): string {
    const service = this.configManager.getServiceByName(serviceName);
    if (!service) {
      throw new Error(`Service '${serviceName}' not found in configuration`);
    }
    
    return service.targetPath;
  }

  getAvailableServices(): string[] {
    return this.configManager.getServiceNames();
  }

  async uploadEnv(serviceName: string): Promise<void> {
    if (serviceName === "all") {
      const services = this.configManager.getServiceNames();
      for (const service of services) {
        await this.uploadSingleEnv(service);
      }
      return;
    }
    
    await this.uploadSingleEnv(serviceName);
  }

  private async uploadSingleEnv(serviceName: string): Promise<void> {
    const envPath = this.getEnvPath(serviceName);
    if (!fs.existsSync(envPath)) {
      throw new Error(`Environment file not found at ${envPath}`);
    }

    const envContent = fs.readFileSync(envPath, "utf8");
    const secretName = this.getSecretName(serviceName);
    const secretPath = `projects/${this.projectId}/secrets/${secretName}`;
    
    try {
      // Try to access the secret to see if it exists
      await this.client.getSecret({ name: secretPath });
      
      // Secret exists, add a new version
      const [version] = await this.client.addSecretVersion({
        parent: secretPath,
        payload: {
          data: Buffer.from(envContent, 'utf8'),
        },
      });
      console.log(`Updated secret ${secretName} with new version: ${version.name}`);
      
      // Clean up old versions after successful upload
      await this.cleanupSecretVersions(secretName);
      
    } catch (error) {
      // Secret doesn't exist, create it
      if ((error as Error).message.includes('NOT_FOUND')) {
        await this.client.createSecret({
          parent: `projects/${this.projectId}`,
          secretId: secretName,
          secret: {
            replication: {
              automatic: {},
            },
          },
        });
        
        // Add the first version
        const [version] = await this.client.addSecretVersion({
          parent: secretPath,
          payload: {
            data: Buffer.from(envContent, 'utf8'),
          },
        });
        console.log(`Created new secret ${secretName} with version: ${version.name}`);
      } else {
        throw error;
      }
    }

    console.log(
      `✅ ${serviceName} environment file successfully uploaded to Secret Manager for ${this.environment}`
    );
  }

  /**
   * Clean up old secret versions based on the delete policy
   */
  private async cleanupSecretVersions(secretName: string): Promise<void> {
    const deletePolicy = this.configManager.getDeletePolicy();
    
    if (!deletePolicy.enabled) {
      return;
    }

    const secretPath = `projects/${this.projectId}/secrets/${secretName}`;

    try {
      // List all versions of the secret
      const [versions] = await this.client.listSecretVersions({
        parent: secretPath,
        pageSize: 100 // Adjust if you expect more versions
      });

      if (!versions || versions.length <= 1) {
        return; // Nothing to clean up
      }

      // Sort versions by creation time (newest first)
      const sortedVersions = versions
        .filter(v => v.state === 'ENABLED' || v.state === 'DISABLED')
        .sort((a, b) => {
          const timeA = new Date(a.createTime?.seconds ? Number(a.createTime.seconds) * 1000 : 0);
          const timeB = new Date(b.createTime?.seconds ? Number(b.createTime.seconds) * 1000 : 0);
          return timeB.getTime() - timeA.getTime();
        });

      const versionsToDestroy: typeof versions = [];

      // Apply maxVersions policy
      if (deletePolicy.maxVersions && deletePolicy.maxVersions > 0) {
        const excessVersions = sortedVersions.slice(deletePolicy.maxVersions);
        versionsToDestroy.push(...excessVersions);
      }

      // Apply maxAgeDays policy
      if (deletePolicy.maxAgeDays && deletePolicy.maxAgeDays > 0) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - deletePolicy.maxAgeDays);

        const oldVersions = sortedVersions.filter(version => {
          if (!version.createTime?.seconds) return false;
          const versionDate = new Date(Number(version.createTime.seconds) * 1000);
          return versionDate < cutoffDate;
        });

        // Ensure we don't duplicate versions already marked for deletion
        oldVersions.forEach(oldVersion => {
          if (!versionsToDestroy.find(v => v.name === oldVersion.name)) {
            versionsToDestroy.push(oldVersion);
          }
        });
      }

      // Always keep at least 1 version
      if (versionsToDestroy.length >= sortedVersions.length) {
        versionsToDestroy.splice(-1, 1);
      }

      // Destroy the marked versions
      if (versionsToDestroy.length > 0) {
        console.log(`🧹 Cleaning up ${versionsToDestroy.length} old version(s) of ${secretName}`);
        
        for (const version of versionsToDestroy) {
          if (version.name) {
            try {
              await this.client.destroySecretVersion({
                name: version.name
              });
              console.log(`   Destroyed version: ${version.name.split('/').pop()}`);
            } catch (error) {
              console.warn(`   Warning: Could not destroy version ${version.name}: ${(error as Error).message}`);
            }
          }
        }
      }

    } catch (error) {
      console.warn(`Warning: Could not clean up versions for ${secretName}: ${(error as Error).message}`);
    }
  }

  /**
   * Manually clean up old versions for a specific service or all services
   */
  async cleanupVersions(serviceName: string): Promise<void> {
    if (serviceName === "all") {
      const services = this.configManager.getServiceNames();
      for (const service of services) {
        const secretName = this.getSecretName(service);
        await this.cleanupSecretVersions(secretName);
      }
      console.log(`✅ Completed cleanup for all services in ${this.environment}`);
      return;
    }
    
    const secretName = this.getSecretName(serviceName);
    await this.cleanupSecretVersions(secretName);
    console.log(`✅ Completed cleanup for ${serviceName} in ${this.environment}`);
  }

  async downloadEnv(serviceName: string): Promise<void> {
    if (serviceName === "all") {
      const services = this.configManager.getServiceNames();
      for (const service of services) {
        await this.downloadSingleEnv(service);
      }
      return;
    }
    
    await this.downloadSingleEnv(serviceName);
  }

  private async downloadSingleEnv(serviceName: string): Promise<void> {
    const envPath = this.getEnvPath(serviceName);
    const secretName = this.getSecretName(serviceName);
    const secretPath = `projects/${this.projectId}/secrets/${secretName}`;
    
    try {
      // Get the latest version of the env file secret
      const [version] = await this.client.accessSecretVersion({
        name: `${secretPath}/versions/latest`,
      });
      
      if (!version.payload || !version.payload.data) {
        throw new Error(`No data found for secret ${secretName}`);
      }
      
      // Ensure the directory exists
      const envDir = path.dirname(envPath);
      if (!fs.existsSync(envDir)) {
        fs.mkdirSync(envDir, { recursive: true });
      }
      
      // Write the entire env file content
      const envContent = Buffer.from(version.payload.data as Buffer).toString();
      fs.writeFileSync(envPath, envContent);
      
      console.log(
        `✅ Environment file successfully downloaded to ${envPath} for ${this.environment}`
      );
    } catch (error) {
      console.error(`❌ Error: Could not download environment file: ${(error as Error).message}`);
      throw error;
    }
  }

  async setEnv(serviceName: string): Promise<void> {
    if (serviceName === "all") {
      const services = this.configManager.getServiceNames();
      for (const service of services) {
        await this.setSingleEnv(service);
      }
      return;
    }
    
    await this.setSingleEnv(serviceName);
  }

  private async setSingleEnv(serviceName: string): Promise<void> {
    const secretName = this.getSecretName(serviceName);
    const targetPath = this.getTargetPath(serviceName);
    const secretPath = `projects/${this.projectId}/secrets/${secretName}`;
    
    try {
      // Get the latest version of the env file secret
      const [version] = await this.client.accessSecretVersion({
        name: `${secretPath}/versions/latest`,
      });
      
      if (!version.payload || !version.payload.data) {
        throw new Error(`No data found for secret ${secretName}`);
      }
      
      // Ensure the target directory exists
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      // Write the entire env file content to the target path
      const envContent = Buffer.from(version.payload.data as Buffer).toString();
      fs.writeFileSync(targetPath, envContent);
      
      console.log(
        `✅ Environment file successfully set in ${targetPath} for ${this.environment}`
      );
    } catch (error) {
      console.error(`❌ Error: Could not set environment file: ${(error as Error).message}`);
      throw error;
    }
  }

  async peekEnv(serviceName: string): Promise<void> {
    if (serviceName === "all") {
      const services = this.configManager.getServiceNames();
      for (const service of services) {
        await this.peekSingleEnv(service);
      }
      return;
    }
    
    await this.peekSingleEnv(serviceName);
  }

  private async peekSingleEnv(serviceName: string): Promise<void> {
    const secretName = this.getSecretName(serviceName);
    const secretPath = `projects/${this.projectId}/secrets/${secretName}`;
    
    console.log(`\n📝 Environment file for ${serviceName} in ${this.environment}:\n`);
    
    try {
      // Get the latest version of the env file secret
      const [version] = await this.client.accessSecretVersion({
        name: `${secretPath}/versions/latest`,
      });
      
      if (!version.payload || !version.payload.data) {
        throw new Error(`No data found for secret ${secretName}`);
      }
      
      // Display the entire env file content
      const envContent = Buffer.from(version.payload.data as Buffer).toString();
      console.log(envContent);
    } catch (error) {
      if ((error as Error).message.includes('NOT_FOUND')) {
        console.log(`No environment file found for ${serviceName} in ${this.environment}.`);
      } else {
        console.error(`❌ Error: ${(error as Error).message}`);
      }
    }
    
    console.log(); // Add empty line at the end
  }
} 