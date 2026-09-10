import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { GcpBackend, createGcpBackend } from "../backends/gcp";

jest.mock("@google-cloud/secret-manager");

const MockClient = SecretManagerServiceClient as jest.MockedClass<
  typeof SecretManagerServiceClient
>;

function mockClient() {
  return {
    accessSecretVersion: jest.fn(),
    getSecret: jest.fn(),
    addSecretVersion: jest.fn(),
    createSecret: jest.fn(),
    listSecretVersions: jest.fn(),
    destroySecretVersion: jest.fn(),
  };
}

describe("GcpBackend", () => {
  const projectId = "test-project";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("get", () => {
    it("reads the latest version payload", async () => {
      const client = mockClient();
      client.accessSecretVersion.mockResolvedValue([
        { payload: { data: Buffer.from("NODE_ENV=staging") } },
      ]);
      const backend = new GcpBackend(client as never, projectId);

      await expect(backend.get("api-env-file")).resolves.toEqual({
        data: Buffer.from("NODE_ENV=staging"),
      });
      expect(client.accessSecretVersion).toHaveBeenCalledWith({
        name: "projects/test-project/secrets/api-env-file/versions/latest",
      });
    });

    it("throws when the payload is empty", async () => {
      const client = mockClient();
      client.accessSecretVersion.mockResolvedValue([{ payload: {} }]);
      const backend = new GcpBackend(client as never, projectId);

      await expect(backend.get("api-env-file")).rejects.toThrow(
        "No data found for secret api-env-file"
      );
    });
  });

  describe("put", () => {
    it("adds a version when the secret already exists", async () => {
      const client = mockClient();
      client.getSecret.mockResolvedValue([{}]);
      client.addSecretVersion.mockResolvedValue([{ name: "projects/p/secrets/s/versions/2" }]);
      const backend = new GcpBackend(client as never, projectId);

      await backend.put("api-env-file", { data: Buffer.from("one") });

      expect(client.createSecret).not.toHaveBeenCalled();
      expect(client.addSecretVersion).toHaveBeenCalledWith({
        parent: "projects/test-project/secrets/api-env-file",
        payload: { data: Buffer.from("one") },
      });
    });

    it("creates the secret when getSecret returns NOT_FOUND", async () => {
      const client = mockClient();
      client.getSecret.mockRejectedValue(new Error("7 NOT_FOUND: Secret not found"));
      client.createSecret.mockResolvedValue([{}]);
      client.addSecretVersion.mockResolvedValue([{ name: "projects/p/secrets/s/versions/1" }]);
      const backend = new GcpBackend(client as never, projectId);

      await backend.put("api-env-file", { data: Buffer.from("one") });

      expect(client.createSecret).toHaveBeenCalledWith({
        parent: "projects/test-project",
        secretId: "api-env-file",
        secret: { replication: { automatic: {} } },
      });
      expect(client.addSecretVersion).toHaveBeenCalled();
    });

    it("rethrows unexpected getSecret errors", async () => {
      const client = mockClient();
      client.getSecret.mockRejectedValue(new Error("PERMISSION_DENIED"));
      const backend = new GcpBackend(client as never, projectId);

      await expect(
        backend.put("api-env-file", { data: Buffer.from("one") })
      ).rejects.toThrow("PERMISSION_DENIED");
    });
  });

  describe("listVersions and destroyVersions", () => {
    it("maps GCP version metadata", async () => {
      const client = mockClient();
      client.listSecretVersions.mockResolvedValue([
        [
          {
            name: "projects/p/secrets/s/versions/2",
            state: "ENABLED",
            createTime: { seconds: 1700000000 },
          },
          {
            name: "projects/p/secrets/s/versions/1",
            state: "DISABLED",
            createTime: { seconds: 1600000000 },
          },
        ],
      ]);
      const backend = new GcpBackend(client as never, projectId);
      const versions = await backend.listVersions("api-env-file");

      expect(versions).toHaveLength(2);
      expect(versions[0].id).toBe("projects/p/secrets/s/versions/2");
      expect(versions[0].enabled).toBe(true);
      expect(versions[1].enabled).toBe(true);
    });

    it("skips cleanup when the delete policy is disabled", async () => {
      const client = mockClient();
      const backend = new GcpBackend(client as never, projectId);
      await backend.destroyVersions("api-env-file", { enabled: false });
      expect(client.listSecretVersions).not.toHaveBeenCalled();
    });

    it("destroys versions beyond maxVersions", async () => {
      const client = mockClient();
      const now = Math.floor(Date.now() / 1000);
      client.listSecretVersions.mockResolvedValue([
        [
          {
            name: "projects/p/secrets/s/versions/3",
            state: "ENABLED",
            createTime: { seconds: now },
          },
          {
            name: "projects/p/secrets/s/versions/2",
            state: "ENABLED",
            createTime: { seconds: now - 10 },
          },
          {
            name: "projects/p/secrets/s/versions/1",
            state: "ENABLED",
            createTime: { seconds: now - 20 },
          },
        ],
      ]);
      client.destroySecretVersion.mockResolvedValue([{}]);
      const backend = new GcpBackend(client as never, projectId);

      await backend.destroyVersions("api-env-file", {
        enabled: true,
        maxVersions: 1,
      });

      expect(client.destroySecretVersion).toHaveBeenCalledTimes(2);
      expect(client.destroySecretVersion).toHaveBeenCalledWith({
        name: "projects/p/secrets/s/versions/2",
      });
    });

    it("does not throw when listing versions fails", async () => {
      const client = mockClient();
      client.listSecretVersions.mockRejectedValue(new Error("Access denied"));
      const backend = new GcpBackend(client as never, projectId);

      await expect(
        backend.destroyVersions("api-env-file", { enabled: true, maxVersions: 1 })
      ).resolves.toBeUndefined();
    });
  });
});

describe("createGcpBackend", () => {
  const originalCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  beforeEach(() => {
    jest.clearAllMocks();
    MockClient.mockImplementation(() => mockClient() as never);
  });

  afterEach(() => {
    if (originalCreds === undefined) {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    } else {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = originalCreds;
    }
  });

  it("requires a projectId", async () => {
    await expect(createGcpBackend({ provider: "gcp" }, true)).rejects.toThrow(
      'GCP provider requires "projectId"'
    );
  });

  it("constructs the official client with the project id", async () => {
    await createGcpBackend({ provider: "gcp", projectId: "proj-1" }, true);
    expect(MockClient).toHaveBeenCalledWith({ projectId: "proj-1" });
  });

  it("sets the service-account path when overrideSa is false", async () => {
    await createGcpBackend(
      {
        provider: "gcp",
        projectId: "proj-1",
        credentials: { path: "gcloud/sa.json" },
      },
      false
    );
    expect(MockClient.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        projectId: "proj-1",
        keyFilename: expect.stringContaining("gcloud/sa.json"),
      })
    );
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toContain("gcloud/sa.json");
  });
});
