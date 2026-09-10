import fs from "fs";
import os from "os";
import path from "path";
import { binaryKind, envFileKind, getKind, jsonKind, sshKeypairKind, tlsBundleKind } from "../kinds";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "msm-kinds-"));
}

describe("secret kinds", () => {
  it("resolves the v1 kind catalog", () => {
    expect(getKind("env-file")).toBe(envFileKind);
    expect(getKind("json")).toBe(jsonKind);
    expect(getKind("binary")).toBe(binaryKind);
    expect(getKind("ssh-keypair")).toBe(sshKeypairKind);
    expect(getKind("tls-bundle")).toBe(tlsBundleKind);
  });

  describe("env-file", () => {
    it("reads and peeks without exposing values", async () => {
      const dir = tmpDir();
      const source = path.join(dir, "app.env");
      fs.writeFileSync(source, "NODE_ENV=staging\n# comment\nTOKEN=super-secret\nEMPTY=\n");

      const data = await envFileKind.readFromDisk(
        {
          kind: "env-file",
          remoteName: "app-env",
          sourcePath: source,
          targetPath: path.join(dir, "target.env"),
        },
        "staging"
      );

      expect(data.toString("utf8")).toContain("TOKEN=super-secret");
      expect(envFileKind.peek(data)).toContain("TOKEN=********");
      expect(envFileKind.peek(data)).toContain("# comment");
      expect(envFileKind.peek(data)).not.toContain("super-secret");
    });
  });

  describe("json", () => {
    it("round-trips and redacts string values", async () => {
      const dir = tmpDir();
      const source = path.join(dir, "client.json");
      fs.writeFileSync(source, JSON.stringify({ client_id: "abc", nested: { token: "xyz" } }));

      const config = {
        kind: "json" as const,
        remoteName: "app-json",
        sourcePath: source,
        targetPath: path.join(dir, "out.json"),
      };
      const data = await jsonKind.readFromDisk(config, "staging");
      jsonKind.validate(data);
      const peek = jsonKind.peek(data);
      expect(peek).toContain("client_id");
      expect(peek).not.toContain("xyz");
      await jsonKind.writeToDisk(config, data, "target", "staging");
      expect(JSON.parse(fs.readFileSync(config.targetPath!, "utf8")).client_id).toBe("abc");
    });
  });

  describe("binary", () => {
    it("stores file bytes in an envelope", async () => {
      const dir = tmpDir();
      const source = path.join(dir, "license.bin");
      fs.writeFileSync(source, Buffer.from([1, 2, 3, 4]));
      const config = {
        kind: "binary" as const,
        remoteName: "license",
        sourcePath: source,
        targetPath: path.join(dir, "out.bin"),
      };
      const data = await binaryKind.readFromDisk(config, "staging");
      expect(binaryKind.peek(data)).toContain("bytes: 4");
      await binaryKind.writeToDisk(config, data, "target", "staging");
      expect(fs.readFileSync(config.targetPath!)).toEqual(Buffer.from([1, 2, 3, 4]));
    });
  });

  describe("typed kinds", () => {
    it("rejects envelopes that are not valid JSON", () => {
      expect(() => sshKeypairKind.validate(Buffer.from("not-json"))).toThrow(
        "not a valid JSON envelope"
      );
      expect(() => tlsBundleKind.validate(Buffer.from("not-json"))).toThrow(
        "not a valid JSON envelope"
      );
    });

    it("round-trips an ssh keypair and redacts the private file", async () => {
      const dir = tmpDir();
      const block = ["OPENSSH", "PRIVATE", "KEY"].join(" ");
      const privateBody = `-----BEGIN ${block}-----\nfake\n-----END ${block}-----\n`;
      const publicBody = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFake comment\n";
      const privatePath = path.join(dir, "id");
      const publicPath = path.join(dir, "id.pub");
      fs.writeFileSync(privatePath, privateBody);
      fs.writeFileSync(publicPath, publicBody);

      const config = {
        kind: "ssh-keypair" as const,
        remoteName: "deploy",
        source: { private: privatePath, public: publicPath },
        target: {
          private: path.join(dir, "out"),
          public: path.join(dir, "out.pub"),
        },
      };

      const data = await sshKeypairKind.readFromDisk(config, "staging");
      const peek = sshKeypairKind.peek(data);
      expect(peek).toContain("ssh-ed25519");
      expect(peek).toContain("[redacted]");
      expect(peek).not.toContain("fake");
      await sshKeypairKind.writeToDisk(config, data, "target", "staging");
      expect(fs.readFileSync(config.target.private, "utf8")).toBe(privateBody);
      expect(fs.statSync(config.target.private).mode & 0o777).toBe(0o600);
    });

    it("round-trips a tls bundle and redacts the key", async () => {
      const dir = tmpDir();
      const cert = "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n";
      const keyBlock = ["PRIVATE", "KEY"].join(" ");
      const key = `-----BEGIN ${keyBlock}-----\ndef\n-----END ${keyBlock}-----\n`;
      const certPath = path.join(dir, "tls.crt");
      const keyPath = path.join(dir, "tls.key");
      fs.writeFileSync(certPath, cert);
      fs.writeFileSync(keyPath, key);

      const config = {
        kind: "tls-bundle" as const,
        remoteName: "edge",
        source: { cert: certPath, key: keyPath },
        target: {
          cert: path.join(dir, "out.crt"),
          key: path.join(dir, "out.key"),
        },
      };

      const data = await tlsBundleKind.readFromDisk(config, "production");
      expect(tlsBundleKind.peek(data)).toContain("key: [redacted]");
      await tlsBundleKind.writeToDisk(config, data, "target", "production");
      expect(fs.readFileSync(config.target.cert, "utf8")).toBe(cert);
      expect(fs.statSync(config.target.key).mode & 0o777).toBe(0o600);
    });
  });
});
