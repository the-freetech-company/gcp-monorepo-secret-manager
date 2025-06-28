# GCP Monorepo Secret Manager

A Google Cloud Secret Manager utility for managing environment variables across multiple services in monorepos.

## Features

- 🔐 Secure environment variable management using Google Cloud Secret Manager
- 🏢 Monorepo support - manage multiple services from one configuration
- 🌍 Multi-environment support (staging/production)
- 📤 Upload/download environment files
- 👀 Peek at stored environment variables
- 🧹 Automatic cleanup of old secret versions
- 🔧 CLI and programmatic API

## Installation

```bash
npm install -g gcp-monorepo-secret-manager
```

## Quick Start

1. **Initialize configuration**:

   ```bash
   monorepo-secrets --init
   ```

2. **Upload environment files**:

   ```bash
   monorepo-secrets --upload --service frontend --stg
   ```

3. **Download environment files**:
   ```bash
   monorepo-secrets --download --service api --prod
   ```

## Configuration

Generate a configuration file:

```bash
monorepo-secrets --init
```

Example `.secrets-config`:

```json
{
  "serviceAccountPaths": {
    "staging": "gcloud/staging/service-account.json",
    "production": "gcloud/production/service-account.json"
  },
  "projectIds": {
    "staging": "your-staging-project-id",
    "production": "your-production-project-id"
  },
  "services": [
    {
      "name": "frontend",
      "envPath": ".environments/.frontend.{env}.env",
      "targetPath": "apps/web/.env",
      "secretPrefix": "frontend-env-vars"
    },
    {
      "name": "api",
      "envPath": ".environments/.api.{env}.env",
      "targetPath": "services/api/.env",
      "secretPrefix": "api-env-vars"
    }
  ],
  "deletePolicy": {
    "maxVersions": 10,
    "maxAgeDays": 30,
    "enabled": true
  }
}
```

### Configuration Fields

- **serviceAccountPaths**: Paths to Google Cloud service account JSON files
- **projectIds**: Google Cloud project IDs for each environment
- **services**: Array of service configurations
  - **name**: Service identifier (used in CLI commands)
  - **envPath**: Path to environment file template (`{env}` is replaced with `stg` or `prod`)
  - **targetPath**: Where to deploy the environment file when using `--set`
  - **secretPrefix**: Prefix for the secret name in Google Cloud Secret Manager
- **deletePolicy**: Automatic cleanup configuration
  - **maxVersions**: Maximum number of versions to keep per secret (default: 10)
  - **maxAgeDays**: Automatically delete versions older than this many days (default: 30)
  - **enabled**: Enable/disable automatic cleanup (default: true)

## CLI Commands

```bash
# Upload environment variables
monorepo-secrets --upload --service frontend --stg

# Download environment variables
monorepo-secrets --download --service api --prod

# View environment variables
monorepo-secrets --peek --service backend --stg

# Download and deploy to target location
monorepo-secrets --download --service worker --prod --set

# Clean up old versions
monorepo-secrets --cleanup --service all --prod

# Service management
monorepo-secrets --list
monorepo-secrets --add-service
monorepo-secrets --remove-service
```

### Command Options

- `--upload, -u`: Upload environment variables to Google Cloud Secret Manager
- `--download, -d`: Download environment variables from Google Cloud Secret Manager
- `--peek, -p`: Display environment variables in the terminal
- `--cleanup, -c`: Clean up old secret versions based on delete policy
- `--service, -s`: Specify service name or 'all'
- `--stg`: Use staging environment
- `--prod`: Use production environment
- `--override-sa`: Skip loading service account (for CI/CD)
- `--set`: Copy the environment file to target location after download
- `--init`: Generate a .secrets-config template file
- `--list`: List available services from configuration
- `--add-service`: Add a new service to existing configuration
- `--remove-service`: Remove a service from configuration
- `--config`: Specify custom config file path
- `--help, -h`: Show help message

### Monorepo Workflow

```bash
# Setup for a new monorepo
monorepo-secrets --init

# Add services as your monorepo grows
monorepo-secrets --add-service  # Add frontend
monorepo-secrets --add-service  # Add API
monorepo-secrets --add-service  # Add worker service

# Bulk operations across all services
monorepo-secrets --upload --service all --stg    # Upload all staging configs
monorepo-secrets --cleanup --service all --prod  # Clean up all production secrets

# Service-specific operations
monorepo-secrets --upload --service api --prod
monorepo-secrets --download --service frontend --stg --set
```

### CI/CD Integration

```bash
# Automated deployment (without service account files)
monorepo-secrets --upload --service all --prod --override-sa

# Download and deploy in container
monorepo-secrets --download --service api --prod --set --override-sa

# Automated cleanup as part of deployment pipeline
monorepo-secrets --cleanup --service all --prod --override-sa
```

## Programmatic API

```typescript
import { GcpMonorepoSecretManager } from "gcp-monorepo-secret-manager";

const secretManager = new GcpMonorepoSecretManager({
  environment: "production", // or 'staging'
  overrideSa: false, // optional, for CI/CD environments
  configPath: ".secrets-config", // optional, custom config path
});

// Core operations
await secretManager.uploadEnv("frontend");
await secretManager.downloadEnv("api");
await secretManager.peekEnv("backend");
await secretManager.setEnv("worker");

// Cleanup operations
await secretManager.cleanupVersions("frontend"); // Clean specific service
await secretManager.cleanupVersions("all"); // Clean all services

// Service management
const services = secretManager.getAvailableServices();
console.log("Available services:", services);
```

## Delete Policy & Secret Lifecycle Management

Automatic cleanup prevents Google Cloud Secret Manager from accumulating unnecessary versions:

### Automatic Cleanup

- Triggered automatically after each upload operation
- Configurable limits on version count and age
- Always keeps at least 1 version
- Graceful error handling - continues if cleanup fails

### Manual Cleanup

```bash
# Clean up specific service
monorepo-secrets --cleanup --service api --prod

# Clean up all services
monorepo-secrets --cleanup --service all --stg

# Part of deployment pipeline
monorepo-secrets --upload --service all --prod && monorepo-secrets --cleanup --service all --prod
```

### Configuration

```json
{
  "deletePolicy": {
    "maxVersions": 5, // Keep only 5 most recent versions
    "maxAgeDays": 7, // Delete versions older than 7 days
    "enabled": true // Enable automatic cleanup
  }
}
```

## Directory Structure

```
your-monorepo/
├── .secrets-config
├── .environments/
│   ├── .frontend.stg.env
│   ├── .frontend.prod.env
│   ├── .api.stg.env
│   ├── .api.prod.env
│   ├── .worker.stg.env
│   └── .worker.prod.env
├── gcloud/
│   ├── staging/
│   │   └── service-account.json
│   └── production/
│       └── service-account.json
├── apps/
│   └── web/              # Frontend application
├── services/
│   ├── api/              # Backend API
│   ├── worker/           # Background worker
│   └── socket/           # WebSocket service
└── packages/             # Shared packages
```

## Security & Best Practices

- Service account files should never be committed to version control
- Add `.secrets-config` to `.gitignore` if it contains sensitive information
- Environment files should only contain references, not actual secrets
- Use least-privilege IAM roles for Google Cloud service accounts
- Use `--override-sa` flag in CI/CD environments
- Enable delete policies to manage secret lifecycle
- Regular cleanup prevents Google Cloud Secret Manager quota issues

## Error Handling

- Missing or invalid configuration file
- Missing service account files
- Invalid service names
- Google Cloud Secret Manager access issues
- File system permissions
- Cleanup operation failures (gracefully handled)

## License

MIT License
