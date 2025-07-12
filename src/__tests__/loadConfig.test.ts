import { loadConfig } from '../loadConfig';
import { initSecretManagerClient } from '../initSecretManagerClient';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Mock the dependencies
jest.mock('../initSecretManagerClient');
jest.mock('fs');
jest.mock('dotenv');
jest.mock('path');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockDotenv = dotenv as jest.Mocked<typeof dotenv>;
const mockInitSecretManagerClient = initSecretManagerClient as jest.MockedFunction<typeof initSecretManagerClient>;

describe('loadConfig', () => {
  const mockClient = {
    accessSecretVersion: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockInitSecretManagerClient.mockReturnValue(mockClient as any);
    mockPath.resolve.mockReturnValue('/path/to/.env');
    mockDotenv.config.mockReturnValue({ parsed: {}, error: undefined });
    
    // Mock process.env
    process.env.ENV = 'STG';
  });

  afterEach(() => {
    delete process.env.ENV;
  });

  it('should use existing .env file if it exists', async () => {
    mockFs.existsSync.mockReturnValue(true);

    await loadConfig({
      serviceName: 'test-service',
      projectId: 'test-project'
    });

    expect(mockFs.existsSync).toHaveBeenCalledWith('/path/to/.env');
    expect(mockDotenv.config).toHaveBeenCalledWith({ path: '/path/to/.env' });
    expect(mockInitSecretManagerClient).not.toHaveBeenCalled();
  });

  it('should fetch from Secret Manager when .env file does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false);
    const mockSecretData = 'NODE_ENV=staging\nENV=STG\nPORT=3000';
    mockClient.accessSecretVersion.mockResolvedValue([{
      payload: {
        data: Buffer.from(mockSecretData)
      }
    }]);

    await loadConfig({
      serviceName: 'test-service',
      projectId: 'test-project'
    });

    expect(mockInitSecretManagerClient).toHaveBeenCalled();
    expect(mockClient.accessSecretVersion).toHaveBeenCalledWith({
      name: 'projects/test-project/secrets/TEST-SERVICE_ENV_FILE/versions/latest'
    });
    expect(mockFs.writeFileSync).toHaveBeenCalledWith('/path/to/.env', mockSecretData);
  });

  it('should use custom secret name when provided', async () => {
    mockFs.existsSync.mockReturnValue(false);
    mockClient.accessSecretVersion.mockResolvedValue([{
      payload: {
        data: Buffer.from('NODE_ENV=staging\nENV=STG')
      }
    }]);

    await loadConfig({
      serviceName: 'test-service',
      projectId: 'test-project',
      secretName: 'custom-secret'
    });

    expect(mockClient.accessSecretVersion).toHaveBeenCalledWith({
      name: 'projects/test-project/secrets/custom-secret/versions/latest'
    });
  });

  it('should check required environment variables', async () => {
    mockFs.existsSync.mockReturnValue(true);
    
    // Mock process.env to not have the required variable
    delete process.env.REQUIRED_VAR;

    await expect(loadConfig({
      serviceName: 'test-service',
      projectId: 'test-project',
      requiredEnvVars: ['REQUIRED_VAR']
    })).rejects.toThrow('Missing required environment variables: REQUIRED_VAR');
  });

  it('should pass when all required environment variables are present', async () => {
    mockFs.existsSync.mockReturnValue(true);
    
    // Mock process.env to have the required variable
    process.env.REQUIRED_VAR = 'test-value';

    await expect(loadConfig({
      serviceName: 'test-service',
      projectId: 'test-project',
      requiredEnvVars: ['REQUIRED_VAR']
    })).resolves.toBeUndefined();
  });

  it('should throw error when ENV is not set after loading', async () => {
    mockFs.existsSync.mockReturnValue(true);
    
    // Mock process.env to not have ENV
    delete process.env.ENV;

    await expect(loadConfig({
      serviceName: 'test-service',
      projectId: 'test-project'
    })).rejects.toThrow('ENV is not set');
  });

  it('should handle errors from Secret Manager', async () => {
    mockFs.existsSync.mockReturnValue(false);
    mockClient.accessSecretVersion.mockRejectedValue(new Error('Secret not found'));

    await expect(loadConfig({
      serviceName: 'test-service',
      projectId: 'test-project'
    })).rejects.toThrow('Failed to initialize config for test-service from Secret Manager');
  });
}); 