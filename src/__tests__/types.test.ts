import { Environment, ServiceConfig, SecretsConfig, GcpMonorepoSecretManagerOptions } from '../types';

describe('Types', () => {
  describe('Environment', () => {
    it('should accept valid environment values', () => {
      const staging: Environment = 'staging';
      const production: Environment = 'production';
      
      expect(staging).toBe('staging');
      expect(production).toBe('production');
    });
  });

  describe('ServiceConfig', () => {
    it('should have correct structure', () => {
      const serviceConfig: ServiceConfig = {
        name: 'test-service',
        envPath: '.environments/.test.{env}.env',
        targetPath: 'services/test/.env',
        secretPrefix: 'test-env-vars'
      };

      expect(serviceConfig.name).toBe('test-service');
      expect(serviceConfig.envPath).toBe('.environments/.test.{env}.env');
      expect(serviceConfig.targetPath).toBe('services/test/.env');
      expect(serviceConfig.secretPrefix).toBe('test-env-vars');
    });
  });

  describe('SecretsConfig', () => {
    it('should have correct structure', () => {
      const config: SecretsConfig = {
        serviceAccountPaths: {
          staging: 'staging-sa.json',
          production: 'prod-sa.json'
        },
        projectIds: {
          staging: 'test-staging',
          production: 'test-production'
        },
        services: [
          {
            name: 'app',
            envPath: '.environments/.app.{env}.env',
            targetPath: 'services/app/.env',
            secretPrefix: 'app-env-vars'
          }
        ]
      };

      expect(config.serviceAccountPaths.staging).toBe('staging-sa.json');
      expect(config.projectIds.staging).toBe('test-staging');
      expect(config.services).toHaveLength(1);
      expect(config.services[0].name).toBe('app');
    });
  });

  describe('GcpMonorepoSecretManagerOptions', () => {
    it('should have correct structure with required fields', () => {
      const options: GcpMonorepoSecretManagerOptions = {
        environment: 'staging',
        overrideSa: false
      };

      expect(options.environment).toBe('staging');
      expect(options.overrideSa).toBe(false);
    });

    it('should have correct structure with optional fields', () => {
      const options: GcpMonorepoSecretManagerOptions = {
        environment: 'production',
        overrideSa: true,
        configPath: 'custom-config.json'
      };

      expect(options.environment).toBe('production');
      expect(options.overrideSa).toBe(true);
      expect(options.configPath).toBe('custom-config.json');
    });
  });
}); 