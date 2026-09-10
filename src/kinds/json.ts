import { Environment, ServiceSecretConfig } from "../types";
import { interpolateEnv, readRequiredFile, writeFileSecure } from "../pathUtils";
import {
  decodeEnvelope,
  encodeEnvelope,
  fileFromBase64,
  fileToBase64,
} from "./envelope";
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
    throw new Error(`json secret '${config.remoteName}' is missing a ${dest} path`);
  }

  return interpolateEnv(raw, environment);
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        redact(nested),
      ])
    );
  }
  if (typeof value === "string") {
    return value.length === 0 ? "" : "********";
  }
  return value;
}

export const jsonKind: SecretKind = {
  id: "json",

  async readFromDisk(config, environment) {
    const filePath = resolvePath(config, "source", environment);
    const contents = readRequiredFile(filePath, "JSON secret");
    JSON.parse(contents.toString("utf8"));
    return encodeEnvelope({
      kind: "json",
      files: { data: fileToBase64(contents) },
    });
  },

  async writeToDisk(config, data, dest, environment) {
    const envelope = decodeEnvelope(data);
    const filePath = resolvePath(config, dest, environment);
    const json = fileFromBase64(envelope.files.data);
    JSON.parse(json.toString("utf8"));
    writeFileSecure(filePath, json, 0o600);
    return [filePath];
  },

  peek(data) {
    const envelope = decodeEnvelope(data);
    const parsed = JSON.parse(fileFromBase64(envelope.files.data).toString("utf8"));
    return JSON.stringify(redact(parsed), null, 2);
  },

  validate(data) {
    const envelope = decodeEnvelope(data);
    if (envelope.kind !== "json") {
      throw new Error(`Expected json envelope, received ${envelope.kind}`);
    }
    JSON.parse(fileFromBase64(envelope.files.data || "").toString("utf8"));
  },
};
