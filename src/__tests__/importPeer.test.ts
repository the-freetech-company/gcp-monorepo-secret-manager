import { importPeer, missingPeerError } from "../errors";

describe("importPeer", () => {
  it("returns the loaded module", async () => {
    const mod = { ok: true };
    await expect(importPeer("gcp", ["pkg"], async () => mod)).resolves.toBe(mod);
  });

  it("rewrites missing-module errors into an install hint", async () => {
    await expect(
      importPeer("aws", ["@aws-sdk/client-secrets-manager"], async () => {
        throw new Error("Cannot find module '@aws-sdk/client-secrets-manager'");
      })
    ).rejects.toThrow(missingPeerError("aws", ["@aws-sdk/client-secrets-manager"]).message);
  });

  it("rewrites missing-package errors the same way", async () => {
    await expect(
      importPeer("azure", ["@azure/identity"], async () => {
        throw new Error("Cannot find package '@azure/identity'");
      })
    ).rejects.toThrow('Provider "azure" requires @azure/identity');
  });

  it("rethrows unrelated load errors", async () => {
    await expect(
      importPeer("gcp", ["@google-cloud/secret-manager"], async () => {
        throw new Error("network timeout");
      })
    ).rejects.toThrow("network timeout");
  });
});
