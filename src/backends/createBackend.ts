import { EnvironmentConfig } from "../types";
import { createAwsBackend } from "./aws";
import { createAzureBackend } from "./azure";
import { createGcpBackend } from "./gcp";
import { createLocalBackend } from "./local";
import { SecretBackend } from "./types";

export async function createBackend(options: {
  environment: EnvironmentConfig;
  overrideSa?: boolean;
}): Promise<SecretBackend> {
  const { environment, overrideSa = false } = options;

  switch (environment.provider) {
    case "gcp":
      return createGcpBackend(environment, overrideSa);
    case "aws":
      return createAwsBackend(environment);
    case "azure":
      return createAzureBackend(environment);
    case "local":
      return createLocalBackend(environment);
    default:
      throw new Error(`Unknown provider: ${(environment as { provider: string }).provider}`);
  }
}
