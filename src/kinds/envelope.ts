import { SecretKindId } from "../types";

export interface SecretEnvelope {
  kind: SecretKindId;
  algorithm?: string;
  filename?: string;
  files: Record<string, string>;
}

export function encodeEnvelope(envelope: SecretEnvelope): Buffer {
  return Buffer.from(JSON.stringify(envelope), "utf8");
}

export function decodeEnvelope(data: Buffer): SecretEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.toString("utf8"));
  } catch {
    throw new Error("Secret payload is not a valid JSON envelope");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("kind" in parsed) ||
    !("files" in parsed) ||
    typeof (parsed as SecretEnvelope).files !== "object"
  ) {
    throw new Error("Secret payload is not a recognized envelope");
  }

  return parsed as SecretEnvelope;
}

export function tryDecodeEnvelope(data: Buffer): SecretEnvelope | null {
  try {
    return decodeEnvelope(data);
  } catch {
    return null;
  }
}

export function fileToBase64(contents: Buffer | string): string {
  return Buffer.isBuffer(contents)
    ? contents.toString("base64")
    : Buffer.from(contents, "utf8").toString("base64");
}

export function fileFromBase64(value: string): Buffer {
  return Buffer.from(value, "base64");
}
