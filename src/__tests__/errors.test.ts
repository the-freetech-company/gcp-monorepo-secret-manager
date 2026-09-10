import { azureSecretName } from "../backends/azure";
import { missingPeerError } from "../errors";

describe("helpers", () => {
  it("builds an install hint for a missing peer SDK", () => {
    expect(missingPeerError("aws", ["@aws-sdk/client-secrets-manager"]).message).toBe(
      'Provider "aws" requires @aws-sdk/client-secrets-manager. Run: npm i -D @aws-sdk/client-secrets-manager'
    );
  });

  it("sanitizes Azure secret names", () => {
    expect(azureSecretName("api-env-vars_ENV_FILE")).toBe("api-env-vars-ENV-FILE");
  });
});
