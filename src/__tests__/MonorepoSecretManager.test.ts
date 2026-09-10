import { MonorepoSecretManager } from "../MonorepoSecretManager";
import { GcpMonorepoSecretManager } from "../GcpMonorepoSecretManager";
import { ConfigManager } from "../ConfigManager";
import * as fs from "fs";
import { SecretBackend } from "../backends/types";

jest.mock("fs");
jest.mock("../ConfigManager");

const mockFs = fs as jest.Mocked<typeof fs>;
const MockConfigManager = ConfigManager as jest.MockedClass<typeof ConfigManager>;

describe("MonorepoSecretManager", () => {
  const mockServiceConfig = {
    name: "app",
    envPath: ".environments/.app.{env}.env",
    targetPath: "services/app/.env",
    secretPrefix: "app-env-vars",
    secrets: [
      {
        kind: "env-file" as const,
        sourcePath: ".environments/.app.{env}.env",
        targetPath: "services/app/.env",
        remoteName: "app-env-vars_ENV_FILE",
      },
    ],
  };

  const mockBackend: jest.Mocked<SecretBackend> = {
    provider: "gcp",
    get: jest.fn(),
    put: jest.fn(),
    listVersions: jest.fn(),
    destroyVersions: jest.fn(),
  };

  const mockConfigManager = {
    getProjectId: jest.fn(),
    getServiceAccountPath: jest.fn(),
    getServiceByName: jest.fn(),
    getServiceNames: jest.fn(),
    getServices: jest.fn(),
    getDeletePolicy: jest.fn(),
    getEnvironmentConfig: jest.fn(),
  };

  const createManager = (environment: "staging" | "production" = "staging") =>
    new MonorepoSecretManager({
      environment,
      overrideSa: true,
      backend: mockBackend,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    MockConfigManager.mockImplementation(() => mockConfigManager as never);
    mockConfigManager.getProjectId.mockReturnValue("test-project");
    mockConfigManager.getServiceAccountPath.mockReturnValue("service-account.json");
    mockConfigManager.getServiceByName.mockReturnValue(mockServiceConfig);
    mockConfigManager.getServiceNames.mockReturnValue(["app", "api"]);
    mockConfigManager.getDeletePolicy.mockReturnValue({
      maxVersions: 10,
      maxAgeDays: 30,
      enabled: true,
    });
    mockConfigManager.getEnvironmentConfig.mockReturnValue({
      provider: "gcp",
      projectId: "test-project",
      credentials: { path: "service-account.json" },
    });
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(Buffer.from("NODE_ENV=staging\nPORT=3000"));
    mockBackend.get.mockResolvedValue({
      data: Buffer.from("NODE_ENV=staging\nPORT=3000"),
    });
    mockBackend.put.mockResolvedValue();
    mockBackend.destroyVersions.mockResolvedValue();
  });

  it("is exported as the deprecated GcpMonorepoSecretManager alias", () => {
    expect(GcpMonorepoSecretManager).toBe(MonorepoSecretManager);
  });

  describe("constructor", () => {
    it("should initialize with staging environment", () => {
      createManager("staging");
      expect(MockConfigManager).toHaveBeenCalledWith(undefined);
      expect(mockConfigManager.getEnvironmentConfig).toHaveBeenCalledWith("staging");
    });

    it("should initialize with production environment", () => {
      createManager("production");
      expect(mockConfigManager.getEnvironmentConfig).toHaveBeenCalledWith("production");
    });

    it("should use custom config path when provided", () => {
      new MonorepoSecretManager({
        environment: "staging",
        overrideSa: true,
        configPath: "custom-config.json",
        backend: mockBackend,
      });
      expect(MockConfigManager).toHaveBeenCalledWith("custom-config.json");
    });

    it("should throw error when service account file does not exist", () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(
        () =>
          new MonorepoSecretManager({
            environment: "staging",
            overrideSa: false,
            backend: mockBackend,
          })
      ).toThrow("Service account file not found at service-account.json");
    });
  });

  describe("getAvailableServices", () => {
    it("should return list of available services", () => {
      const manager = createManager();
      expect(manager.getAvailableServices()).toEqual(["app", "api"]);
    });
  });

  describe("path resolution", () => {
    it("should resolve staging environment path correctly", () => {
      const manager = createManager("staging");
      expect((manager as any).getEnvPath("app")).toBe(".environments/.app.stg.env");
    });

    it("should resolve production environment path correctly", () => {
      const manager = createManager("production");
      expect((manager as any).getEnvPath("app")).toBe(".environments/.app.prod.env");
    });

    it("should resolve secret name correctly", () => {
      const manager = createManager();
      expect((manager as any).getSecretName("app")).toBe("app-env-vars_ENV_FILE");
    });

    it("should resolve target path correctly", () => {
      const manager = createManager();
      expect((manager as any).getTargetPath("app")).toBe("services/app/.env");
    });

    it("should throw error for non-existent service", () => {
      mockConfigManager.getServiceByName.mockReturnValue(undefined);
      const manager = createManager();
      expect(() => (manager as any).getEnvPath("nonexistent")).toThrow(
        "Service 'nonexistent' not found in configuration"
      );
    });
  });

  describe("uploadEnv", () => {
    it("should throw error when environment file does not exist", async () => {
      mockFs.existsSync.mockReturnValue(false);
      const manager = createManager();
      await expect(manager.uploadEnv("app")).rejects.toThrow(
        "Environment file not found at .environments/.app.stg.env"
      );
    });

    it("should upload and clean up a service", async () => {
      const manager = createManager();
      await manager.uploadEnv("app");
      expect(mockBackend.put).toHaveBeenCalledWith("app-env-vars_ENV_FILE", {
        data: Buffer.from("NODE_ENV=staging\nPORT=3000"),
      });
      expect(mockBackend.destroyVersions).toHaveBeenCalled();
    });

    it("should handle all services", async () => {
      const manager = createManager();
      await manager.uploadEnv("all");
      expect(mockConfigManager.getServiceNames).toHaveBeenCalled();
      expect(mockBackend.put).toHaveBeenCalledTimes(2);
    });
  });

  describe("downloadEnv", () => {
    it("should write the downloaded env file", async () => {
      const manager = createManager();
      await manager.downloadEnv("app");
      expect(mockBackend.get).toHaveBeenCalledWith("app-env-vars_ENV_FILE");
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        ".environments/.app.stg.env",
        "NODE_ENV=staging\nPORT=3000",
        { mode: 0o600 }
      );
    });
  });

  describe("setEnv", () => {
    it("should write the target env file", async () => {
      const manager = createManager();
      await manager.setEnv("app");
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        "services/app/.env",
        "NODE_ENV=staging\nPORT=3000",
        { mode: 0o600 }
      );
    });
  });

  describe("cleanupVersions", () => {
    it("should skip cleanup when delete policy is disabled", async () => {
      mockConfigManager.getDeletePolicy.mockReturnValue({ enabled: false });
      const manager = createManager();
      await manager.cleanupVersions("app");
      expect(mockBackend.destroyVersions).toHaveBeenCalledWith(
        "app-env-vars_ENV_FILE",
        { enabled: false }
      );
    });

    it("should handle all services cleanup", async () => {
      const manager = createManager();
      await manager.cleanupVersions("all");
      expect(mockConfigManager.getServiceNames).toHaveBeenCalled();
    });
  });

  describe("peekEnv", () => {
    it("prints a redacted env file", async () => {
      const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
      mockBackend.get.mockResolvedValue({
        data: Buffer.from("TOKEN=super-secret\n"),
      });
      const manager = createManager();
      await manager.peekEnv("app");
      const printed = log.mock.calls.map((call) => String(call[0])).join("\n");
      expect(printed).toContain("TOKEN=********");
      expect(printed).not.toContain("super-secret");
      log.mockRestore();
    });
  });
});
