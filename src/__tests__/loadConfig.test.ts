import { loadConfig } from "../loadConfig";
import { createBackend } from "../backends/createBackend";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

jest.mock("../backends/createBackend");
jest.mock("fs");
jest.mock("dotenv");
jest.mock("path");

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockDotenv = dotenv as jest.Mocked<typeof dotenv>;
const mockCreateBackend = createBackend as jest.MockedFunction<typeof createBackend>;

describe("loadConfig", () => {
  const mockBackend = {
    provider: "gcp" as const,
    get: jest.fn(),
    put: jest.fn(),
    listVersions: jest.fn(),
    destroyVersions: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateBackend.mockResolvedValue(mockBackend);
    mockPath.resolve.mockReturnValue("/path/to/.env");
    mockDotenv.config.mockReturnValue({ parsed: {}, error: undefined });
    process.env.ENV = "STG";
  });

  afterEach(() => {
    delete process.env.ENV;
  });

  it("should use existing .env file if it exists", async () => {
    mockFs.existsSync.mockReturnValue(true);

    await loadConfig({
      serviceName: "test-service",
      projectId: "test-project",
    });

    expect(mockFs.existsSync).toHaveBeenCalledWith("/path/to/.env");
    expect(mockDotenv.config).toHaveBeenCalledWith({ path: "/path/to/.env" });
    expect(mockCreateBackend).not.toHaveBeenCalled();
  });

  it("should fetch from the backend when .env file does not exist", async () => {
    mockFs.existsSync.mockReturnValue(false);
    const mockSecretData = "NODE_ENV=staging\nENV=STG\nPORT=3000";
    mockBackend.get.mockResolvedValue({
      data: Buffer.from(mockSecretData),
    });

    await loadConfig({
      serviceName: "test-service",
      projectId: "test-project",
    });

    expect(mockCreateBackend).toHaveBeenCalled();
    expect(mockBackend.get).toHaveBeenCalledWith("TEST-SERVICE_ENV_FILE");
    expect(mockFs.writeFileSync).toHaveBeenCalledWith("/path/to/.env", mockSecretData);
  });

  it("should use custom secret name when provided", async () => {
    mockFs.existsSync.mockReturnValue(false);
    mockBackend.get.mockResolvedValue({
      data: Buffer.from("NODE_ENV=staging\nENV=STG"),
    });

    await loadConfig({
      serviceName: "test-service",
      projectId: "test-project",
      secretName: "custom-secret",
    });

    expect(mockBackend.get).toHaveBeenCalledWith("custom-secret");
  });

  it("should check required environment variables", async () => {
    mockFs.existsSync.mockReturnValue(true);
    delete process.env.REQUIRED_VAR;

    await expect(
      loadConfig({
        serviceName: "test-service",
        projectId: "test-project",
        requiredEnvVars: ["REQUIRED_VAR"],
      })
    ).rejects.toThrow("Missing required environment variables: REQUIRED_VAR");
  });

  it("should pass when all required environment variables are present", async () => {
    mockFs.existsSync.mockReturnValue(true);
    process.env.REQUIRED_VAR = "test-value";

    await expect(
      loadConfig({
        serviceName: "test-service",
        projectId: "test-project",
        requiredEnvVars: ["REQUIRED_VAR"],
      })
    ).resolves.toBeUndefined();
  });

  it("should throw error when ENV is not set after loading", async () => {
    mockFs.existsSync.mockReturnValue(true);
    delete process.env.ENV;

    await expect(
      loadConfig({
        serviceName: "test-service",
        projectId: "test-project",
      })
    ).rejects.toThrow("ENV is not set");
  });

  it("should handle errors from the backend", async () => {
    mockFs.existsSync.mockReturnValue(false);
    mockBackend.get.mockRejectedValue(new Error("Secret not found"));

    await expect(
      loadConfig({
        serviceName: "test-service",
        projectId: "test-project",
      })
    ).rejects.toThrow(
      "Failed to initialize config for test-service from Secret Manager"
    );
  });

  it("builds a GCP environment by default", async () => {
    mockFs.existsSync.mockReturnValue(false);
    mockBackend.get.mockResolvedValue({ data: Buffer.from("ENV=STG\n") });

    await loadConfig({
      serviceName: "api",
      projectId: "proj",
    });

    expect(mockCreateBackend).toHaveBeenCalledWith({
      environment: { provider: "gcp", projectId: "proj" },
      overrideSa: true,
    });
  });

  it("builds AWS and Azure environments from options", async () => {
    mockFs.existsSync.mockReturnValue(false);
    mockBackend.get.mockResolvedValue({ data: Buffer.from("ENV=STG\n") });

    await loadConfig({
      serviceName: "api",
      provider: "aws",
      region: "us-east-1",
    });
    expect(mockCreateBackend).toHaveBeenCalledWith({
      environment: { provider: "aws", region: "us-east-1" },
      overrideSa: true,
    });

    await loadConfig({
      serviceName: "api",
      provider: "azure",
      vaultUrl: "https://v.vault.azure.net/",
    });
    expect(mockCreateBackend).toHaveBeenCalledWith({
      environment: { provider: "azure", vaultUrl: "https://v.vault.azure.net/" },
      overrideSa: true,
    });
  });

  it("requires provider-specific fields", async () => {
    mockFs.existsSync.mockReturnValue(false);

    await expect(
      loadConfig({ serviceName: "api", provider: "gcp" })
    ).rejects.toThrow("projectId is required when provider is gcp");
    await expect(
      loadConfig({ serviceName: "api", provider: "aws" })
    ).rejects.toThrow("region is required when provider is aws");
    await expect(
      loadConfig({ serviceName: "api", provider: "azure" })
    ).rejects.toThrow("vaultUrl is required when provider is azure");
  });

  it("unwraps an env-file envelope before writing", async () => {
    mockFs.existsSync.mockReturnValue(false);
    const inner = "ENV=STG\nTOKEN=abc\n";
    mockBackend.get.mockResolvedValue({
      data: Buffer.from(
        JSON.stringify({
          kind: "env-file",
          files: { data: Buffer.from(inner).toString("base64") },
        })
      ),
    });

    await loadConfig({
      serviceName: "api",
      projectId: "proj",
    });

    expect(mockFs.writeFileSync).toHaveBeenCalledWith("/path/to/.env", inner);
  });
});
