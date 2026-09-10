import { Environment, ServiceSecretConfig } from "../types";
import { interpolateEnv, readRequiredFile, writeFileSecure } from "../pathUtils";
import { tryDecodeEnvelope } from "./envelope";
import { SecretKind } from "./types";

function resolvePath(
  config: ServiceSecretConfig,
  dest: "source" | "target",
  environment: Environment
): string {
  const raw =
    dest === "source"
      ? config.sourcePath || config.source?.data
      : config.targetPath || config.target?.data;

  if (!raw) {
    throw new Error(`env-file secret '${config.remoteName}' is missing a ${dest} path`);
  }

  return interpolateEnv(raw, environment);
}

function toText(data: Buffer): string {
  const envelope = tryDecodeEnvelope(data);
  if (envelope?.kind === "env-file" && envelope.files.data) {
    return Buffer.from(envelope.files.data, "base64").toString("utf8");
  }
  return data.toString("utf8");
}

export const envFileKind: SecretKind = {
  id: "env-file",

  async readFromDisk(config, environment) {
    const filePath = resolvePath(config, "source", environment);
    return readRequiredFile(filePath, "Environment file");
  },

  async writeToDisk(config, data, dest, environment) {
    const filePath = resolvePath(config, dest, environment);
    writeFileSecure(filePath, toText(data), 0o600);
    return [filePath];
  },

  peek(data) {
    return toText(data)
      .split(/\r?\n/)
      .map((line) => {
        if (!line || line.trim().startsWith("#")) {
          return line;
        }
        const separator = line.indexOf("=");
        if (separator === -1) {
          return line;
        }
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1);
        return value.length === 0 ? `${key}=` : `${key}=********`;
      })
      .join("\n");
  },

  validate(data) {
    toText(data);
  },
};
