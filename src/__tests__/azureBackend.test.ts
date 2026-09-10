import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { AzureBackend, azureSecretName, createAzureBackend } from "../backends/azure";

jest.mock("@azure/identity", () => ({
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@azure/keyvault-secrets", () => ({
  SecretClient: jest.fn().mockImplementation(() => ({
    getSecret: jest.fn(),
    setSecret: jest.fn(),
    listPropertiesOfSecretVersions: jest.fn(),
    updateSecretProperties: jest.fn(),
  })),
}));

const MockSecretClient = SecretClient as jest.MockedClass<typeof SecretClient>;
const MockCredential = DefaultAzureCredential as jest.MockedClass<
  typeof DefaultAzureCredential
>;

function mockClient() {
  return {
    getSecret: jest.fn(),
    setSecret: jest.fn(),
    listPropertiesOfSecretVersions: jest.fn(),
    updateSecretProperties: jest.fn(),
  };
}

async function* asyncVersions(
  items: Array<{ version?: string; createdOn?: Date; enabled?: boolean }>
) {
  for (const item of items) {
    yield item;
  }
}

describe("AzureBackend", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sanitizes names that Azure rejects", () => {
    expect(azureSecretName("api-env-vars_ENV_FILE")).toBe("api-env-vars-ENV-FILE");
    expect(azureSecretName("ok-name")).toBe("ok-name");
  });

  describe("get", () => {
    it("reads the secret as utf8 bytes", async () => {
      const client = mockClient();
      client.getSecret.mockResolvedValue({ value: "NODE_ENV=staging" });
      const backend = new AzureBackend(client as never);

      await expect(backend.get("api_env_file")).resolves.toEqual({
        data: Buffer.from("NODE_ENV=staging", "utf8"),
      });
      expect(client.getSecret).toHaveBeenCalledWith("api-env-file");
    });

    it("throws when the vault returns no value", async () => {
      const client = mockClient();
      client.getSecret.mockResolvedValue({});
      const backend = new AzureBackend(client as never);
      await expect(backend.get("missing")).rejects.toThrow(
        "No data found for secret missing"
      );
    });
  });

  describe("put", () => {
    it("writes a string secret and logs the version", async () => {
      const client = mockClient();
      client.setSecret.mockResolvedValue({ properties: { version: "abc" } });
      const backend = new AzureBackend(client as never);
      await backend.put("api_env_file", { data: Buffer.from("one") });
      expect(client.setSecret).toHaveBeenCalledWith("api-env-file", "one");
    });
  });

  describe("listVersions and destroyVersions", () => {
    it("collects versions from the async iterator", async () => {
      const client = mockClient();
      client.listPropertiesOfSecretVersions.mockReturnValue(
        asyncVersions([
          { version: "3", createdOn: new Date("2026-01-03"), enabled: true },
          { version: "2", createdOn: new Date("2026-01-02"), enabled: true },
        ])
      );
      const backend = new AzureBackend(client as never);
      const versions = await backend.listVersions("api_env_file");
      expect(client.listPropertiesOfSecretVersions).toHaveBeenCalledWith("api-env-file");
      expect(versions.map((version) => version.id)).toEqual(["3", "2"]);
    });

    it("skips cleanup when disabled", async () => {
      const client = mockClient();
      const backend = new AzureBackend(client as never);
      await backend.destroyVersions("api_env_file", { enabled: false });
      expect(client.listPropertiesOfSecretVersions).not.toHaveBeenCalled();
    });

    it("disables versions beyond maxVersions", async () => {
      const client = mockClient();
      client.listPropertiesOfSecretVersions.mockReturnValue(
        asyncVersions([
          { version: "3", createdOn: new Date("2026-01-03"), enabled: true },
          { version: "2", createdOn: new Date("2026-01-02"), enabled: true },
          { version: "1", createdOn: new Date("2026-01-01"), enabled: true },
        ])
      );
      client.updateSecretProperties.mockResolvedValue({});
      const backend = new AzureBackend(client as never);

      await backend.destroyVersions("api_env_file", {
        enabled: true,
        maxVersions: 1,
      });

      expect(client.updateSecretProperties).toHaveBeenCalledTimes(2);
      expect(client.updateSecretProperties).toHaveBeenCalledWith(
        "api-env-file",
        "2",
        { enabled: false }
      );
    });

    it("does not throw when listing versions fails", async () => {
      const client = mockClient();
      client.listPropertiesOfSecretVersions.mockImplementation(() => {
        throw new Error("vault unavailable");
      });
      const backend = new AzureBackend(client as never);
      await expect(
        backend.destroyVersions("api_env_file", { enabled: true, maxVersions: 1 })
      ).resolves.toBeUndefined();
    });
  });
});

describe("createAzureBackend", () => {
  it("requires a vault URL", async () => {
    await expect(createAzureBackend({ provider: "azure" })).rejects.toThrow(
      'Azure provider requires "vaultUrl"'
    );
  });

  it("constructs SecretClient with DefaultAzureCredential", async () => {
    await createAzureBackend({
      provider: "azure",
      vaultUrl: "https://example.vault.azure.net/",
    });
    expect(MockCredential).toHaveBeenCalled();
    expect(MockSecretClient).toHaveBeenCalledWith(
      "https://example.vault.azure.net/",
      expect.any(Object)
    );
  });
});
