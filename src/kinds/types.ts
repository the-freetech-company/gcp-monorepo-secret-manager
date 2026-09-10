import { Environment, SecretKindId, ServiceSecretConfig } from "../types";

export interface SecretKind {
  readonly id: SecretKindId;
  readFromDisk(
    config: ServiceSecretConfig,
    environment: Environment
  ): Promise<Buffer>;
  writeToDisk(
    config: ServiceSecretConfig,
    data: Buffer,
    dest: "source" | "target",
    environment: Environment
  ): Promise<string[]>;
  peek(data: Buffer): string;
  validate(data: Buffer): void;
}
