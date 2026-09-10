export type Environment = "staging" | "production";

export type Provider = "gcp" | "aws" | "azure" | "local";

export type SecretKindId =
  | "env-file"
  | "ssh-keypair"
  | "tls-bundle"
  | "json"
  | "binary";

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

export interface CredentialsConfig {
  path?: string;
  profile?: string;
}

export interface EnvironmentConfig {
  provider: Provider;
  projectId?: string;
  region?: string;
  vaultUrl?: string;
  storePath?: string;
  keyPath?: string;
  kmsKeyId?: string;
  credentials?: CredentialsConfig;
}

export interface ServiceSecretConfig {
  kind: SecretKindId;
  remoteName: string;
  sourcePath?: string;
  targetPath?: string;
  source?: Record<string, string>;
  target?: Record<string, string>;
}

export interface ServiceConfig {
  name: string;
  secrets: ServiceSecretConfig[];
  /** @deprecated Legacy env-file path. Prefer secrets[].sourcePath. */
  envPath?: string;
  /** @deprecated Legacy env-file target. Prefer secrets[].targetPath. */
  targetPath?: string;
  /** @deprecated Legacy GCP secret prefix. Prefer secrets[].remoteName. */
  secretPrefix?: string;
}

export interface SecretsConfig {
  version?: 2;
  environments: {
    staging: EnvironmentConfig;
    production: EnvironmentConfig;
  };
  services: ServiceConfig[];
  deletePolicy?: DeletePolicy;
  /** Preserved when adapting a v1 config. */
  serviceAccountPaths?: {
    staging: string;
    production: string;
  };
  /** Preserved when adapting a v1 config. */
  projectIds?: {
    staging: string;
    production: string;
  };
}

export interface MonorepoSecretManagerOptions {
  environment: Environment;
  overrideSa?: boolean;
  configPath?: string;
}

/** @deprecated Use MonorepoSecretManagerOptions. */
export type GcpMonorepoSecretManagerOptions = MonorepoSecretManagerOptions;

/**
 * Base configuration interface with common properties for all services
 */
export interface BaseConfig {
  env: "STG" | "PROD";
}

/**
 * Service-specific configuration options for loadConfig
 */
export interface ConfigOptions {
  /** The service name, used for logging and identifying the service */
  serviceName: string;
  /** Required for the GCP provider */
  projectId?: string;
  /** Secret backend. Defaults to gcp for backward compatibility. */
  provider?: Provider;
  /** Optional path to the .env file */
  envPath?: string;
  /** Optional custom secret name (defaults to "{SERVICE_NAME}_ENV_FILE") */
  secretName?: string;
  /** Required environment variables that must be present */
  requiredEnvVars?: string[];
  /** Required for the AWS provider */
  region?: string;
  /** Required for the Azure provider */
  vaultUrl?: string;
  /** Optional local store directory */
  storePath?: string;
}
