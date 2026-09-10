#!/usr/bin/env node

import { MonorepoSecretManager } from "./MonorepoSecretManager";
import { ConfigManager } from "./ConfigManager";
import { Environment } from "./types";
import { addService, initializeConfig, removeService } from "./cliInit";

const showHelp = () => {
  console.log(`
Monorepo Secret Manager CLI

Usage:
  msm [options]

Options:
  --upload, -u     Upload configured files to the selected backend
  --download, -d   Download configured files from the selected backend
  --peek, -p       Display redacted values in the terminal
  --cleanup, -c    Clean up old versions based on delete policy
  --service, -s    Specify service name (use --list to see available services) or 'all'
  --stg            Use staging environment
  --prod           Use production environment
  --override-sa    Skip loading local credentials (for CI/CD)
  --set            Write downloaded values to target paths (only with --download)
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
    msm --upload --service all --prod
    msm --peek --service all --stg
    msm --download --service all --prod --set
    msm --upload --service api --stg
    msm --cleanup --service api --prod
    msm -u -s socket --prod --override-sa
`);
  process.exit(0);
};

const listServices = (configPath?: string) => {
  try {
    const configManager = new ConfigManager(configPath);
    const services = configManager.getServices();

    console.log("\nAvailable services:");
    services.forEach((service) => {
      console.log(`  • ${service.name}`);
      service.secrets.forEach((item) => {
        const dest = item.targetPath || item.target?.private || item.target?.data || "";
        console.log(`    - ${item.kind} ${item.remoteName}${dest ? ` -> ${dest}` : ""}`);
      });
      console.log();
    });

    process.exit(0);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
};

const handleOperation = async (
  operation: "upload" | "download" | "peek" | "cleanup",
  serviceName: string,
  environment: Environment,
  shouldSetEnv: boolean,
  overrideSa: boolean,
  configPath?: string
) => {
  const manager = new MonorepoSecretManager({
    environment,
    overrideSa,
    configPath,
  });

  switch (operation) {
    case "upload":
      await manager.uploadEnv(serviceName);
      break;
    case "download":
      await manager.downloadEnv(serviceName);
      if (shouldSetEnv) {
        await manager.setEnv(serviceName);
      }
      break;
    case "peek":
      await manager.peekEnv(serviceName);
      break;
    case "cleanup":
      await manager.cleanupVersions(serviceName);
      break;
  }
};

const main = async () => {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    showHelp();
    return;
  }

  if (args.includes("--init")) {
    await initializeConfig();
    return;
  }

  const configIndex = args.findIndex((arg) => arg === "--config");
  const configPath =
    configIndex !== -1 && args[configIndex + 1] ? args[configIndex + 1] : undefined;

  if (args.includes("--list")) {
    listServices(configPath);
    return;
  }

  if (args.includes("--add-service")) {
    await addService(configPath);
    return;
  }

  if (args.includes("--remove-service")) {
    await removeService(configPath);
    return;
  }

  const serviceIndex = args.findIndex((arg) => arg === "--service" || arg === "-s");
  const overrideSa = args.includes("--override-sa");
  const isStaging = args.includes("--stg");
  const isProduction = args.includes("--prod");
  const shouldSetEnv = args.includes("--set");
  const flag = args[0].toLowerCase();

  if (shouldSetEnv && !(flag === "--download" || flag === "-d")) {
    console.error("Error: --set flag can only be used with download command");
    process.exit(1);
  }

  if (serviceIndex === -1 || !args[serviceIndex + 1]) {
    console.error(
      "Error: --service flag with service name or 'all' is required. Use --list to see available services."
    );
    process.exit(1);
  }

  if (!isStaging && !isProduction) {
    console.error("Error: Must specify either --stg or --prod");
    process.exit(1);
  }

  if (isStaging && isProduction) {
    console.error("Error: Cannot specify both --stg and --prod");
    process.exit(1);
  }

  const serviceName = args[serviceIndex + 1].toLowerCase();
  const environment: Environment = isStaging ? "staging" : "production";

  if (serviceName !== "all") {
    try {
      const configManager = new ConfigManager(configPath);
      const availableServices = configManager.getServiceNames();
      if (!availableServices.includes(serviceName)) {
        console.error(
          `Error: Service '${serviceName}' not found. Available services: ${availableServices.join(", ")}, all`
        );
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  try {
    switch (flag) {
      case "--upload":
      case "-u":
        await handleOperation(
          "upload",
          serviceName,
          environment,
          shouldSetEnv,
          overrideSa,
          configPath
        );
        break;
      case "--download":
      case "-d":
        await handleOperation(
          "download",
          serviceName,
          environment,
          shouldSetEnv,
          overrideSa,
          configPath
        );
        break;
      case "--peek":
      case "-p":
        await handleOperation(
          "peek",
          serviceName,
          environment,
          shouldSetEnv,
          overrideSa,
          configPath
        );
        break;
      case "--cleanup":
      case "-c":
        await handleOperation(
          "cleanup",
          serviceName,
          environment,
          shouldSetEnv,
          overrideSa,
          configPath
        );
        break;
      default:
        console.error("Error: Invalid flag. Use --help to see available options.");
        process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : "An unknown error occurred"
    );
    process.exit(1);
  }
};

main();
