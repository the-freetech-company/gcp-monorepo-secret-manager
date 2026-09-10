import fs from "fs";
import os from "os";
import path from "path";
import {
  LocalBackend,
  decryptLocal,
  encryptLocal,
  generateLocalKey,
  parseLocalKey,
} from "../backends/local";
import { versionsToDestroy } from "../backends/types";

describe("local backend", () => {
  it("parses hex and base64 keys", () => {
    const key = generateLocalKey();
    expect(parseLocalKey(key.toString("hex"))).toEqual(key);
    expect(parseLocalKey(key.toString("base64"))).toEqual(key);
  });

  it("round-trips encrypted payloads", () => {
    const key = generateLocalKey();
    const data = Buffer.from("hello-local-store");
    expect(decryptLocal(encryptLocal(data, key), key)).toEqual(data);
  });

  it("stores versions and applies delete policy", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "msm-store-"));
    const backend = new LocalBackend(dir, generateLocalKey());

    await backend.put("api-env-file", { data: Buffer.from("one") });
    await backend.put("api-env-file", { data: Buffer.from("two") });
    await backend.put("api-env-file", { data: Buffer.from("three") });

    expect((await backend.get("api-env-file")).data.toString()).toBe("three");
    expect(await backend.listVersions("api-env-file")).toHaveLength(3);

    await backend.destroyVersions("api-env-file", {
      enabled: true,
      maxVersions: 1,
    });

    expect(await backend.listVersions("api-env-file")).toHaveLength(1);
    expect((await backend.get("api-env-file")).data.toString()).toBe("three");
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => parseLocalKey("too-short")).toThrow("MSM_LOCAL_KEY must be 32 bytes");
  });

  it("throws when the current version file is missing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "msm-store-"));
    const backend = new LocalBackend(dir, generateLocalKey());
    await expect(backend.get("missing")).rejects.toThrow("No data found for secret missing");
  });

  it("skips cleanup when the delete policy is disabled", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "msm-store-"));
    const backend = new LocalBackend(dir, generateLocalKey());
    await backend.put("api-env-file", { data: Buffer.from("one") });
    await backend.put("api-env-file", { data: Buffer.from("two") });
    await backend.destroyVersions("api-env-file", { enabled: false });
    expect(await backend.listVersions("api-env-file")).toHaveLength(2);
  });

  it("selects old versions for destruction", () => {
    const now = Date.now();
    const versions = [
      { id: "3", createdAt: new Date(now), enabled: true },
      { id: "2", createdAt: new Date(now - 1000), enabled: true },
      { id: "1", createdAt: new Date(now - 2000), enabled: true },
    ];
    expect(
      versionsToDestroy(versions, { enabled: true, maxVersions: 1 }).map((v) => v.id)
    ).toEqual(["2", "1"]);
  });
});
