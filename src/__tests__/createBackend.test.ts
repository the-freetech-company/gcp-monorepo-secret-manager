import { createBackend } from "../backends/createBackend";
import { createAwsBackend } from "../backends/aws";
import { createAzureBackend } from "../backends/azure";
import { createGcpBackend } from "../backends/gcp";
import { createLocalBackend } from "../backends/local";

jest.mock("../backends/gcp", () => ({
  createGcpBackend: jest.fn().mockResolvedValue({ provider: "gcp" }),
}));
jest.mock("../backends/aws", () => ({
  createAwsBackend: jest.fn().mockResolvedValue({ provider: "aws" }),
}));
jest.mock("../backends/azure", () => ({
  createAzureBackend: jest.fn().mockResolvedValue({ provider: "azure" }),
}));
jest.mock("../backends/local", () => ({
  createLocalBackend: jest.fn().mockResolvedValue({ provider: "local" }),
}));

const mockCreateGcp = createGcpBackend as jest.MockedFunction<typeof createGcpBackend>;
const mockCreateAws = createAwsBackend as jest.MockedFunction<typeof createAwsBackend>;
const mockCreateAzure = createAzureBackend as jest.MockedFunction<
  typeof createAzureBackend
>;
const mockCreateLocal = createLocalBackend as jest.MockedFunction<
  typeof createLocalBackend
>;

describe("createBackend", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("routes gcp with overrideSa", async () => {
    const environment = { provider: "gcp" as const, projectId: "p" };
    await createBackend({ environment, overrideSa: true });
    expect(mockCreateGcp).toHaveBeenCalledWith(environment, true);
    expect(mockCreateAws).not.toHaveBeenCalled();
  });

  it("defaults overrideSa to false", async () => {
    const environment = { provider: "gcp" as const, projectId: "p" };
    await createBackend({ environment });
    expect(mockCreateGcp).toHaveBeenCalledWith(environment, false);
  });

  it("routes aws, azure, and local", async () => {
    await createBackend({ environment: { provider: "aws", region: "us-east-1" } });
    await createBackend({
      environment: { provider: "azure", vaultUrl: "https://v.vault.azure.net/" },
    });
    await createBackend({ environment: { provider: "local", storePath: ".msm/store" } });

    expect(mockCreateAws).toHaveBeenCalled();
    expect(mockCreateAzure).toHaveBeenCalled();
    expect(mockCreateLocal).toHaveBeenCalled();
  });

  it("rejects an unknown provider", async () => {
    await expect(
      createBackend({ environment: { provider: "vault" } as never })
    ).rejects.toThrow("Unknown provider: vault");
  });
});
