/**
 * Initialize and return a GCP Secret Manager client.
 * Prefer createBackend() for new code.
 */
export function initSecretManagerClient() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
    return new SecretManagerServiceClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Cannot find module") ||
      message.includes("Cannot find package")
    ) {
      throw new Error(
        'Provider "gcp" requires @google-cloud/secret-manager. Run: npm i -D @google-cloud/secret-manager'
      );
    }
    throw error;
  }
}
