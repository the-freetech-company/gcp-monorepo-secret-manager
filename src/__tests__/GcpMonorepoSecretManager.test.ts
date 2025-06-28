import { GcpMonorepoSecretManager } from '../GcpMonorepoSecretManager';
import { ConfigManager } from '../ConfigManager';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
jest.mock('fs');
jest.mock('../ConfigManager');
jest.mock('firebase-admin/app');
jest.mock('@google-cloud/secret-manager');

const mockFs = fs as jest.Mocked<typeof fs>;
const MockConfigManager = ConfigManager as jest.MockedClass<typeof ConfigManager>;

describe('GcpMonorepoSecretManager', () => {
  const mockServiceConfig = {
    name: 'app',
    envPath: '.environments/.app.{env}.env',
    targetPath: 'services/app/.env',
    secretPrefix: 'app-env-vars'
  };

  const mockConfigManager = {
    getProjectId: jest.fn(),
    getServiceAccountPath: jest.fn(),
    getServiceByName: jest.fn(),
    getServiceNames: jest.fn(),
    getServices: jest.fn(),
    getDeletePolicy: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    MockConfigManager.mockImplementation(() => mockConfigManager as any);
    
    // Default mock implementations
    mockConfigManager.getProjectId.mockReturnValue('test-project');
    mockConfigManager.getServiceAccountPath.mockReturnValue('service-account.json');
    mockConfigManager.getServiceByName.mockReturnValue(mockServiceConfig);
    mockConfigManager.getServiceNames.mockReturnValue(['app', 'api']);
    mockConfigManager.getDeletePolicy.mockReturnValue({
      maxVersions: 10,
      maxAgeDays: 30,
      enabled: true
    });
    
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ project_id: 'test-project' }));
  });

  describe('constructor', () => {
    it('should initialize with staging environment', () => {
      const manager = new GcpMonorepoSecretManager({
        environment: 'staging',
        overrideSa: false
      });

      expect(MockConfigManager).toHaveBeenCalledWith(undefined);
      expect(mockConfigManager.getProjectId).toHaveBeenCalledWith('staging');
    });

    it('should initialize with production environment', () => {
      const manager = new GcpMonorepoSecretManager({
        environment: 'production',
        overrideSa: false
      });

      expect(mockConfigManager.getProjectId).toHaveBeenCalledWith('production');
    });

    it('should use custom config path when provided', () => {
      const customPath = 'custom-config.json';
      const manager = new GcpMonorepoSecretManager({
        environment: 'staging',
        overrideSa: false,
        configPath: customPath
      });

      expect(MockConfigManager).toHaveBeenCalledWith(customPath);
    });

    it('should throw error when service account file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => new GcpMonorepoSecretManager({
        environment: 'staging',
        overrideSa: false
      })).toThrow('Service account file not found at service-account.json');
    });
  });

  describe('getAvailableServices', () => {
    it('should return list of available services', () => {
      const manager = new GcpMonorepoSecretManager({
        environment: 'staging',
        overrideSa: true
      });

      const services = manager.getAvailableServices();
      expect(services).toEqual(['app', 'api']);
      expect(mockConfigManager.getServiceNames).toHaveBeenCalled();
    });
  });

  describe('path resolution', () => {
    let manager: GcpMonorepoSecretManager;

    beforeEach(() => {
      manager = new GcpMonorepoSecretManager({
        environment: 'staging',
        overrideSa: true
      });
    });

    it('should resolve staging environment path correctly', () => {
      // Access private method through any for testing
      const envPath = (manager as any).getEnvPath('app');
      expect(envPath).toBe('.environments/.app.stg.env');
    });

    it('should resolve production environment path correctly', () => {
      const prodManager = new GcpMonorepoSecretManager({
        environment: 'production',
        overrideSa: true
      });
      
      const envPath = (prodManager as any).getEnvPath('app');
      expect(envPath).toBe('.environments/.app.prod.env');
    });

    it('should resolve secret name correctly', () => {
      const secretName = (manager as any).getSecretName('app');
      expect(secretName).toBe('app-env-vars_ENV_FILE');
    });

    it('should resolve target path correctly', () => {
      const targetPath = (manager as any).getTargetPath('app');
      expect(targetPath).toBe('services/app/.env');
    });

    it('should throw error for non-existent service', () => {
      mockConfigManager.getServiceByName.mockReturnValue(undefined);
      
      expect(() => (manager as any).getEnvPath('nonexistent')).toThrow(
        "Service 'nonexistent' not found in configuration"
      );
    });
  });

  describe('uploadEnv', () => {
    let manager: GcpMonorepoSecretManager;
    const mockClient = {
      getSecret: jest.fn(),
      addSecretVersion: jest.fn(),
      createSecret: jest.fn(),
      listSecretVersions: jest.fn()
    };

    beforeEach(() => {
      manager = new GcpMonorepoSecretManager({
        environment: 'staging',
        overrideSa: true
      });
      
      // Mock the client
      (manager as any).client = mockClient;
      
      // Mock file operations
      mockFs.readFileSync.mockReturnValue('NODE_ENV=staging\nPORT=3000');
    });

    it('should throw error when environment file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await expect(manager.uploadEnv('app')).rejects.toThrow(
        'Environment file not found at .environments/.app.stg.env'
      );
    });

    it('should handle "all" services', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockClient.getSecret.mockResolvedValue({});
      mockClient.addSecretVersion.mockResolvedValue([{ name: 'version-1' }]);
      mockClient.listSecretVersions = jest.fn().mockResolvedValue([[]]);

      await manager.uploadEnv('all');

      expect(mockConfigManager.getServiceNames).toHaveBeenCalled();
    });
  });

  describe('downloadEnv', () => {
    let manager: GcpMonorepoSecretManager;
    const mockClient = {
      accessSecretVersion: jest.fn()
    };

    beforeEach(() => {
      manager = new GcpMonorepoSecretManager({
        environment: 'staging',
        overrideSa: true
      });
      
      (manager as any).client = mockClient;
      
      // Mock directory operations
      mockFs.mkdirSync.mockImplementation(() => undefined);
      mockFs.writeFileSync.mockImplementation(() => undefined);
    });

    it('should create directory and write file on download', async () => {
      const mockPayload = {
        payload: {
          data: Buffer.from('NODE_ENV=staging\nPORT=3000')
        }
      };
      
      mockClient.accessSecretVersion.mockResolvedValue([mockPayload]);
      mockFs.existsSync.mockReturnValue(false); // Directory doesn't exist

      await manager.downloadEnv('app');

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('.environments', { recursive: true });
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '.environments/.app.stg.env',
        'NODE_ENV=staging\nPORT=3000'
      );
    });

    it('should handle "all" services', async () => {
      const mockPayload = {
        payload: {
          data: Buffer.from('NODE_ENV=staging')
        }
      };
      
      mockClient.accessSecretVersion.mockResolvedValue([mockPayload]);

      await manager.downloadEnv('all');

      expect(mockConfigManager.getServiceNames).toHaveBeenCalled();
    });
  });

  describe('setEnv', () => {
    let manager: GcpMonorepoSecretManager;
    const mockClient = {
      accessSecretVersion: jest.fn()
    };

    beforeEach(() => {
      manager = new GcpMonorepoSecretManager({
        environment: 'staging',
        overrideSa: true
      });
      
      (manager as any).client = mockClient;
      
      mockFs.mkdirSync.mockImplementation(() => undefined);
      mockFs.writeFileSync.mockImplementation(() => undefined);
    });

    it('should create target directory and write file', async () => {
      const mockPayload = {
        payload: {
          data: Buffer.from('NODE_ENV=staging\nPORT=3000')
        }
      };
      
      mockClient.accessSecretVersion.mockResolvedValue([mockPayload]);
      mockFs.existsSync.mockReturnValue(false); // Directory doesn't exist

      await manager.setEnv('app');

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('services/app', { recursive: true });
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        'services/app/.env',
        'NODE_ENV=staging\nPORT=3000'
      );
    });
  });

  describe('cleanupVersions', () => {
    let manager: GcpMonorepoSecretManager;
    const mockClient = {
      listSecretVersions: jest.fn(),
      destroySecretVersion: jest.fn()
    };

    beforeEach(() => {
      manager = new GcpMonorepoSecretManager({
        environment: 'staging',
        overrideSa: true
      });
      
      (manager as any).client = mockClient;
    });

    it('should skip cleanup when delete policy is disabled', async () => {
      mockConfigManager.getDeletePolicy.mockReturnValue({
        enabled: false
      });

      await manager.cleanupVersions('app');

      expect(mockClient.listSecretVersions).not.toHaveBeenCalled();
    });

    it('should handle "all" services cleanup', async () => {
      mockClient.listSecretVersions.mockResolvedValue([[]]);

      await manager.cleanupVersions('all');

      expect(mockConfigManager.getServiceNames).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      mockClient.listSecretVersions.mockRejectedValue(new Error('Access denied'));

      // Should not throw
      await expect(manager.cleanupVersions('app')).resolves.not.toThrow();
    });
  });
}); 