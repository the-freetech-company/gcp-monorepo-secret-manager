import {
  Environment,
  EnvironmentConfig,
  MonorepoSecretManagerOptions,
  Provider,
  SecretsConfig,
  ServiceConfig,
} from "../types";

describe("Types", () => {
  describe("Environment", () => {
    it("should accept valid environment values", () => {
      const staging: Environment = "staging";
      const production: Environment = "production";

      expect(staging).toBe("staging");
      expect(production).toBe("production");
    });
  });

  describe("Provider", () => {
    it("should accept the supported backends", () => {
      const providers: Provider[] = ["gcp", "aws", "azure", "local"];
      expect(providers).toHaveLength(4);
    });
  });

  describe("ServiceConfig", () => {
    it("should have correct structure", () => {
      const serviceConfig: ServiceConfig = {
        name: "test-service",
        envPath: ".environments/.test.{env}.env",
        targetPath: "services/test/.env",
        secretPrefix: "test-env-vars",
        secrets: [
          {
            kind: "env-file",
            sourcePath: ".environments/.test.{env}.env",
            targetPath: "services/test/.env",
            remoteName: "test-env-vars_ENV_FILE",
          },
        ],
      };

      expect(serviceConfig.name).toBe("test-service");
      expect(serviceConfig.secrets[0].kind).toBe("env-file");
    });
  });

  describe("SecretsConfig", () => {
    it("should have correct v2 structure", () => {
      const staging: EnvironmentConfig = {
        provider: "gcp",
        projectId: "test-staging",
        credentials: { path: "staging-sa.json" },
      };
      const config: SecretsConfig = {
        version: 2,
        environments: {
          staging,
          production: {
            provider: "gcp",
            projectId: "test-production",
            credentials: { path: "prod-sa.json" },
          },
        },
        services: [
          {
            name: "app",
            secrets: [
              {
                kind: "env-file",
                sourcePath: ".environments/.app.{env}.env",
                targetPath: "services/app/.env",
                remoteName: "app-env-file",
              },
            ],
          },
        ],
      };

      expect(config.environments.staging.projectId).toBe("test-staging");
      expect(config.services).toHaveLength(1);
      expect(config.services[0].name).toBe("app");
    });
  });

  describe("MonorepoSecretManagerOptions", () => {
    it("should have correct structure with required fields", () => {
      const options: MonorepoSecretManagerOptions = {
        environment: "staging",
        overrideSa: false,
      };

      expect(options.environment).toBe("staging");
      expect(options.overrideSa).toBe(false);
    });

    it("should have correct structure with optional fields", () => {
      const options: MonorepoSecretManagerOptions = {
        environment: "production",
        overrideSa: true,
        configPath: "custom-config.json",
      };

      expect(options.environment).toBe("production");
      expect(options.overrideSa).toBe(true);
      expect(options.configPath).toBe("custom-config.json");
    });
  });
});
