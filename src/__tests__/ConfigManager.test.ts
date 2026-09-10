import { ConfigManager } from '../ConfigManager';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ConfigManager', () => {
  const mockConfig = {
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
      },
      {
        name: 'api',
        envPath: '.environments/.api.{env}.env',
        targetPath: 'services/api/.env',
        secretPrefix: 'api-env-vars'
      }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should load config from default path when no path provided', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const configManager = new ConfigManager();

      expect(mockFs.existsSync).toHaveBeenCalledWith('.secrets-config');
      expect(mockFs.readFileSync).toHaveBeenCalledWith('.secrets-config', 'utf8');
    });

    it('should load config from custom path when provided', () => {
      const customPath = 'custom-config.json';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const configManager = new ConfigManager(customPath);

      expect(mockFs.existsSync).toHaveBeenCalledWith(customPath);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(customPath, 'utf8');
    });

    it('should throw error when config file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => new ConfigManager()).toThrow('Configuration file not found at .secrets-config');
    });

    it('should throw error when config file has invalid JSON', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');

      expect(() => new ConfigManager()).toThrow('Failed to parse configuration file');
    });
  });

  describe('getProjectId', () => {
    let configManager: ConfigManager;

    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
      configManager = new ConfigManager();
    });

    it('should return staging project ID', () => {
      expect(configManager.getProjectId('staging')).toBe('test-staging');
    });

    it('should return production project ID', () => {
      expect(configManager.getProjectId('production')).toBe('test-production');
    });
  });

  describe('getServiceAccountPath', () => {
    let configManager: ConfigManager;

    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
      configManager = new ConfigManager();
    });

    it('should return staging service account path', () => {
      expect(configManager.getServiceAccountPath('staging')).toBe('staging-sa.json');
    });

    it('should return production service account path', () => {
      expect(configManager.getServiceAccountPath('production')).toBe('prod-sa.json');
    });
  });

  describe('getServiceNames', () => {
    let configManager: ConfigManager;

    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
      configManager = new ConfigManager();
    });

    it('should return all service names', () => {
      expect(configManager.getServiceNames()).toEqual(['app', 'api']);
    });
  });

  describe('getServiceByName', () => {
    let configManager: ConfigManager;

    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
      configManager = new ConfigManager();
    });

    it('should return service config when service exists', () => {
      const service = configManager.getServiceByName('app');
      expect(service).toEqual({
        name: 'app',
        envPath: '.environments/.app.{env}.env',
        targetPath: 'services/app/.env',
        secretPrefix: 'app-env-vars',
        secrets: [
          {
            kind: 'env-file',
            sourcePath: '.environments/.app.{env}.env',
            targetPath: 'services/app/.env',
            remoteName: 'app-env-vars_ENV_FILE',
          },
        ],
      });
    });

    it('should return undefined when service does not exist', () => {
      const service = configManager.getServiceByName('nonexistent');
      expect(service).toBeUndefined();
    });
  });

  describe('getServices', () => {
    let configManager: ConfigManager;

    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
      configManager = new ConfigManager();
    });

    it('should return all adapted services', () => {
      const services = configManager.getServices();
      expect(services).toHaveLength(2);
      expect(services[0].secrets[0].remoteName).toBe('app-env-vars_ENV_FILE');
      expect(services[1].name).toBe('api');
    });
  });

  describe('v2 config', () => {
    const v2Config = {
      version: 2,
      environments: {
        staging: { provider: 'local', storePath: '.msm/store' },
        production: {
          provider: 'aws',
          region: 'us-east-1',
        },
      },
      services: [
        {
          name: 'api',
          secrets: [
            {
              kind: 'env-file',
              sourcePath: '.environments/.api.{env}.env',
              targetPath: 'services/api/.env',
              remoteName: 'api-env-file',
            },
          ],
        },
      ],
    };

    it('loads a provider-aware config', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(v2Config));

      const configManager = new ConfigManager();
      expect(configManager.getEnvironmentConfig('staging').provider).toBe('local');
      expect(configManager.getEnvironmentConfig('production').region).toBe('us-east-1');
      expect(configManager.getServiceByName('api')?.secrets[0].kind).toBe('env-file');
    });
  });
}); 