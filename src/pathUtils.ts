import fs from "fs";
import path from "path";
import { Environment } from "./types";

export function envSuffix(environment: Environment): "stg" | "prod" {
  return environment === "staging" ? "stg" : "prod";
}

export function interpolateEnv(
  template: string,
  environment: Environment
): string {
  return template.replace(/\{env\}/g, envSuffix(environment));
}

export function writeFileSecure(
  filePath: string,
  data: string | Buffer,
  mode: number
): void {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(filePath, data, { mode });
  fs.chmodSync(filePath, mode);
}

export function readRequiredFile(filePath: string, label: string): Buffer {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath}`);
  }
  return fs.readFileSync(filePath);
}
