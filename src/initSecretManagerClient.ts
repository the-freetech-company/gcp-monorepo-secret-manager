import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

/**
 * Initialize and return a Secret Manager client
 * This function creates a new SecretManagerServiceClient instance
 *
 * @returns SecretManagerServiceClient instance
 */
export function initSecretManagerClient(): SecretManagerServiceClient {
  return new SecretManagerServiceClient();
} 