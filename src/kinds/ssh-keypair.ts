import { Environment, ServiceSecretConfig } from "../types";
import { interpolateEnv, readRequiredFile, writeFileSecure } from "../pathUtils";
import {
  decodeEnvelope,
  encodeEnvelope,
  fileFromBase64,
  fileToBase64,
} from "./envelope";
import { SecretKind } from "./types";

const PRIVATE_KEY_RE =
  /-----BEGIN (?:OPENSSH |RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/;
const PUBLIC_KEY_RE =
  /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|sk-ssh-ed25519@openssh.com|sk-ecdsa-sha2-nistp256@openssh.com)\s+\S+/;

function detectAlgorithm(publicKey: string): string | undefined {
  const prefix = publicKey.trim().split(/\s+/)[0];
  if (prefix === "ssh-ed25519" || prefix === "sk-ssh-ed25519@openssh.com") {
    return "ed25519";
  }
  if (prefix === "ssh-rsa") {
    return "rsa";
  }
  if (prefix.startsWith("ecdsa-")) {
    return "ecdsa";
  }
  return undefined;
}

function resolvePaths(
  config: ServiceSecretConfig,
  dest: "source" | "target",
  environment: Environment
): { privatePath: string; publicPath: string } {
  const paths = dest === "source" ? config.source : config.target;
  if (!paths?.private || !paths.public) {
    throw new Error(
      `ssh-keypair secret '${config.remoteName}' requires ${dest}.private and ${dest}.public paths`
    );
  }

  return {
    privatePath: interpolateEnv(paths.private, environment),
    publicPath: interpolateEnv(paths.public, environment),
  };
}

export const sshKeypairKind: SecretKind = {
  id: "ssh-keypair",

  async readFromDisk(config, environment) {
    const { privatePath, publicPath } = resolvePaths(config, "source", environment);
    const privateKey = readRequiredFile(privatePath, "SSH private key");
    const publicKey = readRequiredFile(publicPath, "SSH public key");
    const payload = encodeEnvelope({
      kind: "ssh-keypair",
      algorithm: detectAlgorithm(publicKey.toString("utf8")),
      files: {
        private: fileToBase64(privateKey),
        public: fileToBase64(publicKey),
      },
    });
    this.validate(payload);
    return payload;
  },

  async writeToDisk(config, data, dest, environment) {
    const envelope = decodeEnvelope(data);
    const { privatePath, publicPath } = resolvePaths(config, dest, environment);
    writeFileSecure(privatePath, fileFromBase64(envelope.files.private), 0o600);
    writeFileSecure(publicPath, fileFromBase64(envelope.files.public), 0o644);
    return [privatePath, publicPath];
  },

  peek(data) {
    const envelope = decodeEnvelope(data);
    const publicKey = fileFromBase64(envelope.files.public).toString("utf8").trim();
    return [
      `kind: ssh-keypair`,
      `algorithm: ${envelope.algorithm || "unknown"}`,
      `public: ${publicKey}`,
      `private: [redacted]`,
    ].join("\n");
  },

  validate(data) {
    const envelope = decodeEnvelope(data);
    if (envelope.kind !== "ssh-keypair") {
      throw new Error(`Expected ssh-keypair envelope, received ${envelope.kind}`);
    }
    if (!envelope.files.private || !envelope.files.public) {
      throw new Error("ssh-keypair envelope must include private and public files");
    }
    const privateKey = fileFromBase64(envelope.files.private).toString("utf8");
    const publicKey = fileFromBase64(envelope.files.public).toString("utf8").trim();
    if (!PRIVATE_KEY_RE.test(privateKey)) {
      throw new Error("SSH private key does not look like an OpenSSH or PEM private key");
    }
    if (!PUBLIC_KEY_RE.test(publicKey)) {
      throw new Error("SSH public key does not look like an OpenSSH public key");
    }
  },
};
