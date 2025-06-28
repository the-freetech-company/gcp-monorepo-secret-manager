export type Environment = "staging" | "production";

export interface ServiceConfig {
  name: string;
  envPath: string;
  targetPath: string;
  secretPrefix: string;
}

export interface DeletePolicy {
  /**
   * Maximum number of secret versions to keep. When this limit is exceeded,
   * older versions will be destroyed. Set to 0 to disable automatic cleanup.
   * @default 10
   */
  maxVersions?: number;
  
  /**
   * Automatically destroy secret versions older than this many days.
   * Set to 0 to disable time-based cleanup.
   * @default 30
   */
  maxAgeDays?: number;
  
  /**
   * Whether to enable automatic cleanup of old secret versions
   * @default true
   */
  enabled?: boolean;
}

export interface SecretsConfig {
  serviceAccountPaths: {
    staging: string;
    production: string;
  };
  services: ServiceConfig[];
  projectIds: {
    staging: string;
    production: string;
  };
  /**
   * Global delete policy for secret versions. Can be overridden per service.
   */
  deletePolicy?: DeletePolicy;
}

export interface GcpMonorepoSecretManagerOptions {
  environment: Environment;
  overrideSa?: boolean;
  configPath?: string;
} 