#!/usr/bin/env node

import { GcpMonorepoSecretManager } from './GcpMonorepoSecretManager';
import { Environment } from './types';
import { ConfigManager } from './ConfigManager';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
};

const showHelp = () => {
  console.log(`
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
    msm --upload --service all --prod
    msm --peek -service all --stg
    msm --download --service all --prod --set
    msm --upload --service api --stg
    msm --peek -service api --stg
    msm --download --service api --stg
    msm --cleanup --service api --prod
    msm -u -s socket --prod --override-sa
`);
  process.exit(0);
};

const initializeConfig = async () => {
  console.log("\n🚀 Welcome to GCP Monorepo Secret Manager Setup!\n");
  console.log("This wizard will help you set up your configuration file.\n");

  // Load existing configuration if it exists
  let existingConfig: any = null;
  if (fs.existsSync('.secrets-config')) {
    try {
      const configContent = fs.readFileSync('.secrets-config', 'utf8');
      existingConfig = JSON.parse(configContent);
      console.log("📄 Found existing configuration. Current values will be shown as defaults.\n");
    } catch (error) {
      console.log("⚠️  Found existing .secrets-config but couldn't parse it. Starting fresh.\n");
    }
  }

  // Get Google Cloud project information
  console.log("📋 Google Cloud Project Setup");
  const currentStagingProject = existingConfig?.projectIds?.staging || "test-staging-project";
  const currentProductionProject = existingConfig?.projectIds?.production || "test-production-project";
  
  const stagingProjectId = await question(`Enter your staging Google Cloud project ID [${currentStagingProject}]: `) || currentStagingProject;
  const productionProjectId = await question(`Enter your production Google Cloud project ID [${currentProductionProject}]: `) || currentProductionProject;

  // Get service account paths
  console.log("\n🔑 Service Account Setup");
  const currentStagingSA = existingConfig?.serviceAccountPaths?.staging || "firebase/test-stg/firebase-admin.json";
  const currentProductionSA = existingConfig?.serviceAccountPaths?.production || "firebase/test-production/firebase-admin.json";
  
  const stagingServiceAccount = await question(`Enter path to staging service account JSON file [${currentStagingSA}]: `) || currentStagingSA;
  const productionServiceAccount = await question(`Enter path to production service account JSON file [${currentProductionSA}]: `) || currentProductionSA;

  // Get environments directory
  console.log("\n📁 Environment Files Setup");
  const currentEnvDir = existingConfig?.services?.[0]?.envPath?.match(/(.+)\.\w+\.{env}\.env$/)?.[1] || ".environments";
  const environmentsDir = await question(`Environment files directory [${currentEnvDir}]: `) || currentEnvDir;

  // Get services information
  console.log("\n📦 Services Setup");
  console.log("Now let's set up your services/applications.");
  
  const services = [];
  let addingServices = true;
  
  // If there are existing services, show them first
  if (existingConfig?.services?.length > 0) {
    console.log("\nExisting services found:");
    existingConfig.services.forEach((service: any, index: number) => {
      console.log(`  ${index + 1}. ${service.name} -> ${service.targetPath}`);
    });
    
    const keepExisting = await question("\nKeep existing services and add new ones? [Y/n]: ");
    if (keepExisting.toLowerCase() !== 'n' && keepExisting.toLowerCase() !== 'no') {
      services.push(...existingConfig.services);
      console.log(`✅ Kept ${existingConfig.services.length} existing services`);
    }
  }
  
  while (addingServices) {
    console.log(`\n--- Service ${services.length + 1} ---`);
    const serviceName = await question(`Service name [app]: `) || "app";
    
    if (!serviceName) {
      console.log("Service name cannot be empty.");
      continue;
    }

    // Check for duplicates
    if (services.some((s: any) => s.name === serviceName)) {
      console.log(`❌ Service '${serviceName}' already exists. Please choose a different name.`);
      continue;
    }
    console.log("version")

    const targetPath = await question(`Target path for downloaded files [services/${serviceName}/.env]: `) || `services/${serviceName}/.env`;
    const secretPrefix = await question(`Secret prefix in Google Cloud [${serviceName}-env-vars]: `) || `${serviceName}-env-vars`;

    services.push({
      name: serviceName,
      envPath: `${environmentsDir}/.${serviceName}.{env}.env`,
      targetPath,
      secretPrefix
    });

    const addAnother = await question("\nAdd another service? [y/N]: ");
    if (addAnother.toLowerCase() !== 'y' && addAnother.toLowerCase() !== 'yes') {
      addingServices = false;
    }
  }

  // Get delete policy configuration
  console.log("\n🧹 Delete Policy Setup");
  console.log("Configure automatic cleanup of old secret versions:");
  
  const currentMaxVersions = existingConfig?.deletePolicy?.maxVersions || 10;
  const currentMaxAgeDays = existingConfig?.deletePolicy?.maxAgeDays || 30;
  const currentEnabled = existingConfig?.deletePolicy?.enabled !== false; // default to true
  
  const maxVersionsInput = await question(`Maximum versions to keep [${currentMaxVersions}]: `);
  const maxVersions = maxVersionsInput ? parseInt(maxVersionsInput) : currentMaxVersions;
  
  const maxAgeDaysInput = await question(`Maximum age in days [${currentMaxAgeDays}]: `);
  const maxAgeDays = maxAgeDaysInput ? parseInt(maxAgeDaysInput) : currentMaxAgeDays;
  
  const enabledInput = await question(`Enable automatic cleanup? [${currentEnabled ? 'Y/n' : 'y/N'}]: `);
  const enabled = currentEnabled 
    ? enabledInput.toLowerCase() !== 'n' && enabledInput.toLowerCase() !== 'no'
    : enabledInput.toLowerCase() === 'y' || enabledInput.toLowerCase() === 'yes';

  // Generate configuration
  const config = {
    serviceAccountPaths: {
      staging: stagingServiceAccount,
      production: productionServiceAccount
    },
    projectIds: {
      staging: stagingProjectId,
      production: productionProjectId
    },
    services,
    deletePolicy: {
      maxVersions,
      maxAgeDays,
      enabled
    }
  };

  // Write configuration file
  fs.writeFileSync('.secrets-config', JSON.stringify(config, null, 2));

  // Create environments directory if it doesn't exist
  if (!fs.existsSync(environmentsDir)) {
    fs.mkdirSync(environmentsDir, { recursive: true });
    console.log(`\n📁 Created ${environmentsDir} directory`);
  }

  // Create environment files for each service
  console.log("\n📄 Creating environment files...");
  for (const service of services) {
    // Create staging and production environment files
    const stagingFile = `${environmentsDir}/.${service.name}.stg.env`;
    const productionFile = `${environmentsDir}/.${service.name}.prod.env`;

    if (!fs.existsSync(stagingFile)) {
      fs.writeFileSync(stagingFile, '# Add your staging environment variables here\nNODE_ENV=staging\nAPP_NAME=' + service.name + '\n');
      console.log(`  ✅ Created ${stagingFile}`);
    }

    if (!fs.existsSync(productionFile)) {
      fs.writeFileSync(productionFile, '# Add your production environment variables here\nNODE_ENV=production\nAPP_NAME=' + service.name + '\n');
      console.log(`  ✅ Created ${productionFile}`);
    }
  }

  console.log("\n✅ Configuration file created successfully!");
  console.log("\n📝 Summary:");
  console.log(`- Staging project: ${stagingProjectId}`);
  console.log(`- Production project: ${productionProjectId}`);
  console.log(`- Environment directory: ${environmentsDir}`);
  console.log(`- Services configured: ${services.map((s: any) => s.name).join(', ')}`);
  console.log(`- Delete Policy: maxVersions=${maxVersions}, maxAgeDays=${maxAgeDays}, enabled=${enabled}`);
  
  console.log("\n🔧 Next steps:");
  console.log("1. Make sure your service account files exist at the specified paths");
  console.log(`2. Edit your environment files in the ${environmentsDir} directory`);
      console.log("3. Run 'msm --list' to see your configured services");
    console.log("4. Use 'msm --upload --service <name> --stg/--prod' to upload environment files");
      console.log("5. Use 'msm --cleanup --service <name> --stg/--prod' to cleanup old versions");

  rl.close();
};

const listServices = (configPath?: string) => {
  try {
    const configManager = new ConfigManager(configPath);
    const services = configManager.getServiceNames();
    
    console.log("\n📋 Available services:");
    services.forEach(service => {
      const config = configManager.getServiceByName(service)!;
      console.log(`  • ${service} (${config.secretPrefix})`);
      console.log(`    Environment: ${config.envPath}`);
      console.log(`    Target: ${config.targetPath}`);
      console.log();
    });
    
    process.exit(0);
  } catch (error) {
    console.error(`❌ Error: ${(error as Error).message}`);
    process.exit(1);
  }
};

const addService = async (configPath?: string) => {
  try {
    const configFilePath = configPath || '.secrets-config';
    
    if (!fs.existsSync(configFilePath)) {
      console.error(`❌ Configuration file not found at ${configFilePath}`);
      console.error("Please run 'freetech-secrets --init' first to create a configuration file.");
      process.exit(1);
    }

    const configManager = new ConfigManager(configFilePath);
    const config = configManager.getConfig();
    
    console.log("\n➕ Adding a new service to your configuration\n");

    // Get existing services to check for duplicates
    const existingServices = configManager.getServiceNames();
    
    let serviceName: string;
    while (true) {
      serviceName = await question("Service name [new-service]: ") || "new-service";
      
      if (!serviceName) {
        console.log("❌ Service name cannot be empty.");
        continue;
      }

      if (existingServices.includes(serviceName)) {
        console.log(`❌ Service '${serviceName}' already exists. Please choose a different name.`);
        continue;
      }

      break;
    }

    // Get environment directory from existing services
    const existingService = config.services[0];
    const envMatch = existingService.envPath.match(/(.+)\.\w+\.{env}\.env$/);
    const environmentsDir = envMatch ? envMatch[1] : '.environments';

    const targetPath = await question(`Target path for downloaded files [services/${serviceName}/.env]: `) || `services/${serviceName}/.env`;
    const secretPrefix = await question(`Secret prefix in Google Cloud [${serviceName}-env-vars]: `) || `${serviceName}-env-vars`;

    // Add the new service to configuration
    const newService = {
      name: serviceName,
      envPath: `${environmentsDir}/.${serviceName}.{env}.env`,
      targetPath,
      secretPrefix
    };

    config.services.push(newService);

    // Write updated configuration
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));

    // Create environment files
    const stagingFile = `${environmentsDir}/.${serviceName}.stg.env`;
    const productionFile = `${environmentsDir}/.${serviceName}.prod.env`;

    if (!fs.existsSync(stagingFile)) {
      fs.writeFileSync(stagingFile, '# Add your staging environment variables here\n');
      console.log(`✅ Created ${stagingFile}`);
    }

    if (!fs.existsSync(productionFile)) {
      fs.writeFileSync(productionFile, '# Add your production environment variables here\n');
      console.log(`✅ Created ${productionFile}`);
    }

    console.log(`\n✅ Service '${serviceName}' added successfully!`);
    console.log(`📝 Configuration updated in ${configFilePath}`);
    console.log("\n🔧 Next steps:");
    console.log(`1. Edit your environment files: ${stagingFile} and ${productionFile}`);
    console.log(`2. Upload them: freetech-secrets --upload --service ${serviceName} --stg/--prod`);

  } catch (error) {
    console.error(`❌ Error: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    rl.close();
  }
};

const removeService = async (configPath?: string) => {
  try {
    const configFilePath = configPath || '.secrets-config';
    
    if (!fs.existsSync(configFilePath)) {
      console.error(`❌ Configuration file not found at ${configFilePath}`);
      console.error("Please run 'freetech-secrets --init' first to create a configuration file.");
      process.exit(1);
    }

    const configManager = new ConfigManager(configFilePath);
    const config = configManager.getConfig();
    const existingServices = configManager.getServiceNames();

    if (existingServices.length === 0) {
      console.log("❌ No services found in configuration.");
      rl.close();
      return;
    }

    console.log("\n➖ Remove a service from your configuration\n");
    console.log("Available services:");
    existingServices.forEach((service, index) => {
      console.log(`  ${index + 1}. ${service}`);
    });
    console.log();

    const serviceInput = await question("Enter service name or number to remove: ");
    
    let serviceToRemove: string;
    const serviceNumber = parseInt(serviceInput);
    
    if (!isNaN(serviceNumber) && serviceNumber >= 1 && serviceNumber <= existingServices.length) {
      serviceToRemove = existingServices[serviceNumber - 1];
    } else if (existingServices.includes(serviceInput)) {
      serviceToRemove = serviceInput;
    } else {
      console.log("❌ Invalid service name or number.");
      rl.close();
      return;
    }

    // Confirm removal
    const confirm = await question(`⚠️  Are you sure you want to remove service '${serviceToRemove}'? This will NOT delete environment files. (y/N): `);
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log("❌ Removal cancelled.");
      rl.close();
      return;
    }

    // Remove service from configuration
    config.services = config.services.filter(service => service.name !== serviceToRemove);

    // Write updated configuration
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));

    console.log(`✅ Service '${serviceToRemove}' removed from configuration.`);
    console.log(`📝 Configuration updated in ${configFilePath}`);
    console.log("\n📝 Note: Environment files were not deleted. You can remove them manually if needed.");

  } catch (error) {
    console.error(`❌ Error: ${(error as Error).message}`);
    process.exit(1);
  } finally {
    rl.close();
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
      const secretManager = new GcpMonorepoSecretManager({
    environment,
    overrideSa,
    configPath
  });

  switch (operation) {
    case "upload":
      await secretManager.uploadEnv(serviceName);
      break;
    case "download":
      await secretManager.downloadEnv(serviceName);
      if (shouldSetEnv) {
        await secretManager.setEnv(serviceName);
      }
      break;
    case "peek":
      await secretManager.peekEnv(serviceName);
      break;
    case "cleanup":
      await secretManager.cleanupVersions(serviceName);
      break;
  }
};

const main = async () => {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    showHelp();
    return;
  }

  // Handle init command
  if (args.includes("--init")) {
    await initializeConfig();
    return;
  }

  // Handle list command
  if (args.includes("--list")) {
    const configIndex = args.findIndex(arg => arg === "--config");
    const configPath = configIndex !== -1 && args[configIndex + 1] ? args[configIndex + 1] : undefined;
    listServices(configPath);
    return;
  }

  // Handle add service command
  if (args.includes("--add-service")) {
    const configIndex = args.findIndex(arg => arg === "--config");
    const configPath = configIndex !== -1 && args[configIndex + 1] ? args[configIndex + 1] : undefined;
    await addService(configPath);
    return;
  }

  // Handle remove service command
  if (args.includes("--remove-service")) {
    const configIndex = args.findIndex(arg => arg === "--config");
    const configPath = configIndex !== -1 && args[configIndex + 1] ? args[configIndex + 1] : undefined;
    await removeService(configPath);
    return;
  }

  const serviceIndex = args.findIndex((arg) => arg === "--service" || arg === "-s");
  const configIndex = args.findIndex(arg => arg === "--config");
  const overrideSa = args.includes("--override-sa");
  const isStaging = args.includes("--stg");
  const isProduction = args.includes("--prod");
  const shouldSetEnv = args.includes("--set");
  const flag = args[0].toLowerCase();
  const configPath = configIndex !== -1 && args[configIndex + 1] ? args[configIndex + 1] : undefined;

  // Check if --set is used with a command other than download
  if (shouldSetEnv && !(flag === "--download" || flag === "-d")) {
    console.error(
      "❌ Error: --set flag can only be used with download command"
    );
    process.exit(1);
  }

  if (serviceIndex === -1 || !args[serviceIndex + 1]) {
    console.error(
      "❌ Error: --service flag with service name or 'all' is required. Use --list to see available services."
    );
    process.exit(1);
  }

  if (!isStaging && !isProduction) {
    console.error("❌ Error: Must specify either --stg or --prod");
    process.exit(1);
  }

  if (isStaging && isProduction) {
    console.error("❌ Error: Cannot specify both --stg and --prod");
    process.exit(1);
  }

  const serviceName = args[serviceIndex + 1].toLowerCase();
  const environment: Environment = isStaging ? "staging" : "production";

  // Validate service name (unless it's "all")
  if (serviceName !== "all") {
    try {
      const configManager = new ConfigManager(configPath);
      const availableServices = configManager.getServiceNames();
      if (!availableServices.includes(serviceName)) {
        console.error(
          `❌ Error: Service '${serviceName}' not found. Available services: ${availableServices.join(", ")}, all`
        );
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${(error as Error).message}`);
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
        console.error(
          "❌ Error: Invalid flag. Use --help to see available options."
        );
        process.exit(1);
    }
    
    // Exit successfully after completing the operation
    process.exit(0);
  } catch (error) {
    console.error(
      "❌ Error:",
      error instanceof Error ? error.message : "An unknown error occurred"
    );
    process.exit(1);
  }
};

main(); 