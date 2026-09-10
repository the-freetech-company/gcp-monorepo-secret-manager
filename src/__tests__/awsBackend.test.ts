import {
  CreateSecretCommand,
  GetSecretValueCommand,
  ListSecretVersionIdsCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { AwsBackend, createAwsBackend } from "../backends/aws";

jest.mock("@aws-sdk/client-secrets-manager", () => {
  const actual = jest.requireActual("@aws-sdk/client-secrets-manager");
  return {
    ...actual,
    SecretsManagerClient: jest.fn().mockImplementation(() => ({
      send: jest.fn(),
    })),
  };
});

const MockSecretsManagerClient = SecretsManagerClient as jest.MockedClass<
  typeof SecretsManagerClient
>;

describe("AwsBackend", () => {
  const send = jest.fn();
  const client = { send } as unknown as SecretsManagerClient;
  const sdk = {
    GetSecretValueCommand,
    CreateSecretCommand,
    PutSecretValueCommand,
    ListSecretVersionIdsCommand,
  } as unknown as typeof import("@aws-sdk/client-secrets-manager");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("get", () => {
    it("prefers SecretBinary when present", async () => {
      send.mockResolvedValue({ SecretBinary: Buffer.from("binary-payload") });
      const backend = new AwsBackend(client, sdk);
      await expect(backend.get("api-env-file")).resolves.toEqual({
        data: Buffer.from("binary-payload"),
      });
      expect(send.mock.calls[0][0]).toBeInstanceOf(GetSecretValueCommand);
    });

    it("falls back to SecretString", async () => {
      send.mockResolvedValue({ SecretString: "NODE_ENV=staging" });
      const backend = new AwsBackend(client, sdk);
      await expect(backend.get("api-env-file")).resolves.toEqual({
        data: Buffer.from("NODE_ENV=staging", "utf8"),
      });
    });

    it("throws when neither string nor binary is present", async () => {
      send.mockResolvedValue({});
      const backend = new AwsBackend(client, sdk);
      await expect(backend.get("api-env-file")).rejects.toThrow(
        "No data found for secret api-env-file"
      );
    });
  });

  describe("put", () => {
    it("creates a secret with optional KMS key", async () => {
      send.mockResolvedValue({});
      const backend = new AwsBackend(client, sdk, "alias/app");
      await backend.put("api-env-file", { data: Buffer.from("one") });
      expect(send.mock.calls[0][0]).toBeInstanceOf(CreateSecretCommand);
      expect(send.mock.calls[0][0].input).toEqual({
        Name: "api-env-file",
        SecretBinary: Buffer.from("one"),
        KmsKeyId: "alias/app",
      });
    });

    it("updates when CreateSecret reports ResourceExistsException", async () => {
      const exists = new Error("already exists");
      exists.name = "ResourceExistsException";
      send.mockRejectedValueOnce(exists).mockResolvedValueOnce({});
      const backend = new AwsBackend(client, sdk);

      await backend.put("api-env-file", { data: Buffer.from("two") });

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1][0]).toBeInstanceOf(PutSecretValueCommand);
      expect(send.mock.calls[1][0].input).toEqual({
        SecretId: "api-env-file",
        SecretBinary: Buffer.from("two"),
      });
    });

    it("rethrows unexpected create errors", async () => {
      send.mockRejectedValue(new Error("AccessDeniedException"));
      const backend = new AwsBackend(client, sdk);
      await expect(
        backend.put("api-env-file", { data: Buffer.from("one") })
      ).rejects.toThrow("AccessDeniedException");
    });
  });

  describe("listVersions and destroyVersions", () => {
    it("maps version ids and staging labels", async () => {
      send.mockResolvedValue({
        Versions: [
          {
            VersionId: "v2",
            CreatedDate: new Date("2026-01-02"),
            VersionStages: ["AWSCURRENT"],
          },
          {
            VersionId: "v1",
            CreatedDate: new Date("2026-01-01"),
            VersionStages: [],
          },
        ],
      });
      const backend = new AwsBackend(client, sdk);
      const versions = await backend.listVersions("api-env-file");

      expect(send.mock.calls[0][0]).toBeInstanceOf(ListSecretVersionIdsCommand);
      expect(versions).toEqual([
        { id: "v2", createdAt: new Date("2026-01-02"), enabled: true },
        { id: "v1", createdAt: new Date("2026-01-01"), enabled: false },
      ]);
    });

    it("skips cleanup when disabled", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const backend = new AwsBackend(client, sdk);
      await backend.destroyVersions("api-env-file", { enabled: false });
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("warns that AWS cannot destroy individual versions", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const backend = new AwsBackend(client, sdk);
      await backend.destroyVersions("api-env-file", { enabled: true });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("does not support destroying individual versions")
      );
      warn.mockRestore();
    });
  });
});

describe("createAwsBackend", () => {
  const originalProfile = process.env.AWS_PROFILE;

  afterEach(() => {
    if (originalProfile === undefined) {
      delete process.env.AWS_PROFILE;
    } else {
      process.env.AWS_PROFILE = originalProfile;
    }
  });

  it("requires a region", async () => {
    await expect(createAwsBackend({ provider: "aws" })).rejects.toThrow(
      'AWS provider requires "region"'
    );
  });

  it("constructs SecretsManagerClient with the region", async () => {
    await createAwsBackend({ provider: "aws", region: "us-west-2" });
    expect(MockSecretsManagerClient).toHaveBeenCalledWith({ region: "us-west-2" });
  });

  it("sets AWS_PROFILE when a profile is configured", async () => {
    await createAwsBackend({
      provider: "aws",
      region: "eu-west-1",
      credentials: { profile: "staging" },
    });
    expect(process.env.AWS_PROFILE).toBe("staging");
  });
});
