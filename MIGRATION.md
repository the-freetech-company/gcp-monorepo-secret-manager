# Migration from gcp-monorepo-secret-manager

npm cannot rename a package. `monorepo-secret-manager` is a new name. The old name stays installable and should be deprecated, not unpublished.

## For consumers

```bash
npm uninstall gcp-monorepo-secret-manager
npm install monorepo-secret-manager
```

If you use GCP, also install the optional SDK:

```bash
npm install @google-cloud/secret-manager
```

Update imports:

```ts
// before
import { loadConfig, GcpMonorepoSecretManager } from "gcp-monorepo-secret-manager";

// after
import { loadConfig, MonorepoSecretManager } from "monorepo-secret-manager";
```

`GcpMonorepoSecretManager` still works as a deprecated alias for one major version.

The `msm` binary is unchanged, so scripts like `msm --download --service all --stg --set` keep working.

Existing `.secrets-config` files that use `serviceAccountPaths` and `projectIds` are still valid. They are treated as GCP. Run `msm --init` when you want provider-aware v2 config.

## For maintainers: publish and deprecate

Run these from the **repo root**, not from `compat/`. npm will prompt for a 2FA OTP (or pass `--otp=XXXXXX`).

```bash
cd /path/to/gcp-monorepo-secret-manager
npm publish --access public --otp=XXXXXX
npm run publish:shim -- --otp=XXXXXX
npm run deprecate:legacy
```

`publish:shim` publishes `compat/gcp-monorepo-secret-manager` as `gcp-monorepo-secret-manager@1.2.0`. Do not `cd` into that folder first.

Do not unpublish `gcp-monorepo-secret-manager`. That breaks existing `1.1.0` installs.

## GitHub repository

The source repo is
[`adamsiwiec1/monorepo-secret-manager`](https://github.com/adamsiwiec1/monorepo-secret-manager).
Old clone URLs (`the-freetech-company/gcp-monorepo-secret-manager` and
`adamsiwiec1/gcp-monorepo-secret-manager`) redirect.
