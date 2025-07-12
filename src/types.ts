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

/**
 * Base configuration interface with common properties for all FreeTech services
 */
export interface BaseConfig {
  env: "STG" | "PROD";
}

/**
 * Service-specific configuration options
 */
export interface ConfigOptions {
  /** The service name, used for logging and identifying the service */
  serviceName: string;
  /** Required project ID */
  projectId: string;
  /** Optional path to the .env file */
  envPath?: string;
  /** Optional custom secret name (defaults to "{SERVICE_NAME}_ENV_FILE") */
  secretName?: string;
  /** Required environment variables that must be present */
  requiredEnvVars?: string[];
} 