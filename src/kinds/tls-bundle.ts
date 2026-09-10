import { Environment, ServiceSecretConfig } from "../types";
import { interpolateEnv, readRequiredFile, writeFileSecure } from "../pathUtils";
import {
  decodeEnvelope,
  encodeEnvelope,
  fileFromBase64,
  fileToBase64,
} from "./envelope";
import { SecretKind } from "./types";

const CERT_RE = /-----BEGIN CERTIFICATE-----/;
const KEY_RE = /-----BEGIN (?:.* )?PRIVATE KEY-----/;

function resolvePaths(
  config: ServiceSecretConfig,
  dest: "source" | "target",
  environment: Environment
): { cert: string; key: string; chain?: string } {
  const paths = dest === "source" ? config.source : config.target;
  if (!paths?.cert || !paths.key) {
    throw new Error(
      `tls-bundle secret '${config.remoteName}' requires ${dest}.cert and ${dest}.key paths`
    );
  }

  return {
    cert: interpolateEnv(paths.cert, environment),
    key: interpolateEnv(paths.key, environment),
    chain: paths.chain ? interpolateEnv(paths.chain, environment) : undefined,
  };
}

export const tlsBundleKind: SecretKind = {
  id: "tls-bundle",

  async readFromDisk(config, environment) {
    const paths = resolvePaths(config, "source", environment);
    const files: Record<string, string> = {
      cert: fileToBase64(readRequiredFile(paths.cert, "TLS certificate")),
      key: fileToBase64(readRequiredFile(paths.key, "TLS private key")),
    };
    if (paths.chain) {
      files.chain = fileToBase64(readRequiredFile(paths.chain, "TLS certificate chain"));
    }
    const payload = encodeEnvelope({ kind: "tls-bundle", files });
    this.validate(payload);
    return payload;
  },

  async writeToDisk(config, data, dest, environment) {
    const envelope = decodeEnvelope(data);
    const paths = resolvePaths(config, dest, environment);
    const written = [paths.cert, paths.key];
    writeFileSecure(paths.cert, fileFromBase64(envelope.files.cert), 0o644);
    writeFileSecure(paths.key, fileFromBase64(envelope.files.key), 0o600);
    if (paths.chain && envelope.files.chain) {
      writeFileSecure(paths.chain, fileFromBase64(envelope.files.chain), 0o644);
      written.push(paths.chain);
    }
    return written;
  },

  peek(data) {
    const envelope = decodeEnvelope(data);
    return [
      `kind: tls-bundle`,
      `cert: [present, ${fileFromBase64(envelope.files.cert).length} bytes]`,
      `key: [redacted]`,
      `chain: ${envelope.files.chain ? "present" : "absent"}`,
    ].join("\n");
  },

  validate(data) {
    const envelope = decodeEnvelope(data);
    if (envelope.kind !== "tls-bundle") {
      throw new Error(`Expected tls-bundle envelope, received ${envelope.kind}`);
    }
    const cert = fileFromBase64(envelope.files.cert || "").toString("utf8");
    const key = fileFromBase64(envelope.files.key || "").toString("utf8");
    if (!CERT_RE.test(cert)) {
      throw new Error("TLS certificate is missing a BEGIN CERTIFICATE block");
    }
    if (!KEY_RE.test(key)) {
      throw new Error("TLS private key is missing a BEGIN PRIVATE KEY block");
    }
  },
};
