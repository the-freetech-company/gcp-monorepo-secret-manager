import path from "path";
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
    throw new Error(`binary secret '${config.remoteName}' is missing a ${dest} path`);
  }

  return interpolateEnv(raw, environment);
}

export const binaryKind: SecretKind = {
  id: "binary",

  async readFromDisk(config, environment) {
    const filePath = resolvePath(config, "source", environment);
    const contents = readRequiredFile(filePath, "Binary secret");
    return encodeEnvelope({
      kind: "binary",
      filename: path.basename(filePath),
      files: { data: fileToBase64(contents) },
    });
  },

  async writeToDisk(config, data, dest, environment) {
    const envelope = decodeEnvelope(data);
    const filePath = resolvePath(config, dest, environment);
    writeFileSecure(filePath, fileFromBase64(envelope.files.data), 0o600);
    return [filePath];
  },

  peek(data) {
    const envelope = decodeEnvelope(data);
    const bytes = fileFromBase64(envelope.files.data || "").length;
    return `kind: binary\nfilename: ${envelope.filename || "unknown"}\nbytes: ${bytes}`;
  },

  validate(data) {
    const envelope = decodeEnvelope(data);
    if (envelope.kind !== "binary") {
      throw new Error(`Expected binary envelope, received ${envelope.kind}`);
    }
    if (!envelope.files.data) {
      throw new Error("binary envelope is missing data");
    }
  },
};
