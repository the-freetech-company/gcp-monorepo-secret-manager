import { SecretKindId } from "../types";
import { binaryKind } from "./binary";
import { envFileKind } from "./env-file";
import { jsonKind } from "./json";
import { sshKeypairKind } from "./ssh-keypair";
import { tlsBundleKind } from "./tls-bundle";
import { SecretKind } from "./types";

const kinds: Record<SecretKindId, SecretKind> = {
  "env-file": envFileKind,
  "ssh-keypair": sshKeypairKind,
  "tls-bundle": tlsBundleKind,
  json: jsonKind,
  binary: binaryKind,
};

export function getKind(id: SecretKindId): SecretKind {
  const kind = kinds[id];
  if (!kind) {
    throw new Error(`Unsupported secret kind: ${id}`);
  }
  return kind;
}

export { SecretKind } from "./types";
export { envFileKind, sshKeypairKind, tlsBundleKind, jsonKind, binaryKind };
