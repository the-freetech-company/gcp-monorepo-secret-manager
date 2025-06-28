# GCP Monorepo Secret Manager

A Google Cloud Secret Manager utility for managing environment variables across multiple services in monorepos.

## Installation

```bash
npm install -g gcp-monorepo-secret-manager@1.0.0-beta.3
```

## Quick Start

1. **Initialize configuration**:
   ```bash
   msm --init
   ```

2. **Upload environment files**:
   ```bash
   msm --upload --service frontend --stg
   ```

3. **Download environment files**:
   ```bash
   msm --download --service api --prod
   ```

## CLI Reference

```bash
GCP Monorepo Secret Manager CLI

Usage:
  msm [options]

Options:
  --upload, -u     Upload environment variables to Firebase Secret Manager
  --download, -d   Download environment variables from Firebase Secret Manager
  --peek, -p       Display environment variables in the terminal
  --cleanup, -c    Clean up old secret versions based on delete policy
  --service, -s    Specify service name (use --list to see available services) or 'all'
  --stg            Use staging environment (.stg.env)
  --prod           Use production environment (.prod.env)
  --override-sa    Skip loading service account (for CI/CD)
  --set            Copy the environment file to target location after download (only with --download)
  --init           Generate a .secrets-config template file
  --list           List available services from configuration
  --add-service    Add a new service to existing configuration
  --remove-service Remove a service from configuration
  --config         Specify custom config file path (default: .secrets-config)
  --help, -h       Show this help message

Examples:
  msm --init
  msm --list
  msm --add-service
  msm --remove-service
  msm --upload --service frontend --stg
  msm -d -s functions --prod --set
  msm --peek -s api --stg
  msm -u -s socket --prod --override-sa
  msm --peek -s all --stg
  msm -u -s marketing --prod --config ./my-config.json
  msm --cleanup --service api --prod
  msm -c -s all --stg
```

## Complete Example

**Key Components:**

- **`.secrets-config`** - Defines your services, GCP projects, and where environment files live
- **`.environments/`** - Stores your actual environment files (`.env` files) for each service and environment

**How it works:** You edit environment files locally in `.environments/`, then use `msm` commands to securely sync them with Google Cloud Secret Manager.

```bash
❯ msm --init

🚀 Welcome to GCP Monorepo Secret Manager Setup!

This wizard will help you set up your configuration file.

📋 Google Cloud Project Setup
Enter your staging Google Cloud project ID [test-staging-project]: my-project-stg
Enter your production Google Cloud project ID [test-production-project]: my-project

🔑 Service Account Setup
Enter path to staging service account JSON file [firebase/test-stg/firebase-admin.json]:
Enter path to production service account JSON file [firebase/test-production/firebase-admin.json]:

📁 Environment Files Setup
Environment files directory [.environments]:

📦 Services Setup
Now let's set up your services/applications.

--- Service 1 ---
Service name [app]: app
Target path for downloaded files [services/app/.env]: web/app/.env
Secret prefix in Google Cloud [app-env-vars]:

Add another service? [y/N]: y

--- Service 2 ---
Service name [app]: api
Target path for downloaded files [services/api/.env]:
Secret prefix in Google Cloud [api-env-vars]:

Add another service? [y/N]: y

--- Service 3 ---
Service name [app]: worker
Target path for downloaded files [services/worker/.env]:
Secret prefix in Google Cloud [worker-env-vars]:

Add another service? [y/N]: n

🧹 Delete Policy Setup
Configure automatic cleanup of old secret versions:
Maximum versions to keep [10]:
Maximum age in days [30]: 35
Enable automatic cleanup? [Y/n]: y

📄 Creating environment files...
  ✅ Created .environments/.worker.stg.env
  ✅ Created .environments/.worker.prod.env

✅ Configuration file created successfully!

📝 Summary:
- Staging project: my-project-stg
- Production project: my-project
- Environment directory: .environments
- Services configured: app, api, worker
- Delete Policy: maxVersions=10, maxAgeDays=35, enabled=true

🔧 Next steps:
1. Make sure your service account files exist at the specified paths
2. Edit your environment files in the .environments directory
3. Run 'msm --list' to see your configured services
4. Use 'msm --upload --service <name> --stg/--prod' to upload environment files
5. Use 'msm --cleanup --service <name> --stg/--prod' to cleanup old versions
```

### Configuration File (`.secrets-config`)

**How it works:** The `msm --init` command generates the followings `.secrets-config` file.

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

```json
{
  "serviceAccountPaths": {
    "staging": "gcloud/staging/service-account.json",
    "production": "gcloud/production/service-account.json"
  },
  "projectIds": {
    "staging": "my-project-staging",
    "production": "my-project-prod"
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
    },
    {
      "name": "worker",
      "envPath": ".environments/.worker.{env}.env",
      "targetPath": "services/worker/.env",
      "secretPrefix": "worker-env-vars"
    }
  ],
  "deletePolicy": {
    "maxVersions": 10,
    "maxAgeDays": 30,
    "enabled": true
  }
}
```

### Suggested Directory Structure

```
your-monorepo/
├── .secrets-config              # Configuration file
├── .environments/               # Environment files directory
│   ├── .frontend.stg.env        # Frontend staging environment
│   ├── .frontend.prod.env       # Frontend production environment
│   ├── .api.stg.env             # API staging environment
│   ├── .api.prod.env            # API production environment
│   ├── .worker.stg.env          # Worker staging environment
│   └── .worker.prod.env         # Worker production environment
├── gcloud/                      # Service account files
│   ├── staging/
│   │   └── service-account.json
│   └── production/
│       └── service-account.json
├── apps/
│   └── web/                     # Frontend application
│       └── .env                 # Target location for frontend env
├── services/
│   ├── api/                     # Backend API service
│   │   └── .env                 # Target location for API env
│   └── worker/                  # Background worker service
│       └── .env                 # Target location for worker env
└── packages/                    # Shared packages
```

### List Services Output

```bash
❯ msm --list

📋 Available services:
  • app (app-env-vars)
    Environment: .environments/.app.{env}.env
    Target: web/app/.env

  • api (api-env-vars)
    Environment: .environments/.api.{env}.env
    Target: services/api/.env

  • worker (worker-env-vars)
    Environment: .environments/.worker.{env}.env
    Target: services/worker/.env
```

### CI/CD Integration

**Command Line Usage:**

Example Workflow: https://github.com/the-freetech-company/gcp-monorepo-secret-manager/tree/master/.github/workflows

## Helpers in package.json

Add these scripts to your `package.json` for easy environment management:

```json
{
  "scripts": {
    "secrets": "msm --list",
    "env:stg": "msm --download --service all --stg --set && firebase use freetech-stg",
    "env:prod": "msm --download --service all --prod --set && firebase use freetech-production",
    "env:stg:apply": "msm --upload --service all --stg",
    "env:prod:apply": "msm --upload --service all --prod",
    "env:apply": "pnpm run env:stg:apply && pnpm run env:prod:apply",
    "env:stg:ci": "msm --download --service all --stg --set --override-sa",
    "env:prod:ci": "msm --download --service all --prod --set --override-sa"
  }
}
```

### Script Explanations:

- **`pnpm secrets`** - List all configured services and their paths
- **`pnpm env:stg`** - Download all staging environments and switch Firebase project
- **`pnpm env:prod`** - Download all production environments and switch Firebase project
- **`pnpm env:stg:apply`** - Upload all staging environment files to Secret Manager
- **`pnpm env:prod:apply`** - Upload all production environment files to Secret Manager
- **`pnpm env:apply`** - Upload both staging and production environments
- **`pnpm env:stg:ci`** - Download staging environments for CI/CD (no service account needed)
- **`pnpm env:prod:ci`** - Download production environments for CI/CD (no service account needed)

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
msm --cleanup --service api --prod

# Clean up all services
msm --cleanup --service all --stg

# Part of deployment pipeline
msm --upload --service all --prod && msm --cleanup --service all --prod
```

### Configuration

```json
{
  "deletePolicy": {
    "maxVersions": 5,  // Keep only 5 most recent versions
    "maxAgeDays": 7,   // Delete versions older than 7 days
    "enabled": true    // Enable automatic cleanup
  }
}
```

## Programmatic API

```typescript
import { GcpMonorepoSecretManager } from "gcp-monorepo-secret-manager";

const secretManager = new GcpMonorepoSecretManager({
  environment: "production",       // or 'staging'
  overrideSa: false,              // optional, for CI/CD environments
  configPath: ".secrets-config",   // optional, custom config path
});

// Core operations
await secretManager.uploadEnv("frontend");
await secretManager.downloadEnv("api");
await secretManager.peekEnv("api");
await secretManager.setEnv("worker");

// Cleanup operations
await secretManager.cleanupVersions("frontend");  // Clean specific service
await secretManager.cleanupVersions("all");       // Clean all services

// Service management
const services = secretManager.getAvailableServices();
console.log("Available services:", services);
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
