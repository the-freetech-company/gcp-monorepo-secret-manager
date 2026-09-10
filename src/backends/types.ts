import { DeletePolicy, Provider } from "../types";

export interface SecretPayload {
  data: Buffer;
  contentType?: string;
}

export interface SecretVersion {
  id: string;
  createdAt?: Date;
  enabled: boolean;
}

export interface SecretBackend {
  readonly provider: Provider;
  get(name: string): Promise<SecretPayload>;
  put(name: string, payload: SecretPayload): Promise<void>;
  listVersions(name: string): Promise<SecretVersion[]>;
  destroyVersions(name: string, policy: DeletePolicy): Promise<void>;
}

export function versionsToDestroy(
  versions: SecretVersion[],
  policy: DeletePolicy
): SecretVersion[] {
  const enabled = versions
    .filter((version) => version.enabled)
    .sort((a, b) => {
      const timeA = a.createdAt?.getTime() ?? 0;
      const timeB = b.createdAt?.getTime() ?? 0;
      return timeB - timeA;
    });

  if (enabled.length <= 1) {
    return [];
  }

  const marked = new Map<string, SecretVersion>();

  if (policy.maxVersions && policy.maxVersions > 0) {
    for (const version of enabled.slice(policy.maxVersions)) {
      marked.set(version.id, version);
    }
  }

  if (policy.maxAgeDays && policy.maxAgeDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - policy.maxAgeDays);
    for (const version of enabled) {
      if (version.createdAt && version.createdAt < cutoff) {
        marked.set(version.id, version);
      }
    }
  }

  const destroy = Array.from(marked.values());
  if (destroy.length >= enabled.length) {
    destroy.pop();
  }
  return destroy;
}
