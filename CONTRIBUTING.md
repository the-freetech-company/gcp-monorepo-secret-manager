# Contributing

Monorepo Secret Manager is released under the [MIT license](LICENSE). By
contributing you agree that your contribution is distributed under that
license. Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development

Requires Node.js 16 or later (20 is what CI runs).

```bash
npm ci
npm test
npm run build
```

| Script | Description |
| --- | --- |
| `npm test` | Jest |
| `npm run test:coverage` | Coverage report |
| `npm run build` | Compile to `dist/` |
| `npm run dev` | Run the CLI via `ts-node` |

Do not commit secrets, credentials, `.env` files, `.msm/`, service-account
keys, or personal data.

## Documentation

Product docs live in [README.md](README.md) and [MIGRATION.md](./MIGRATION.md).
Update them in the same pull request as the behavior they describe.

## Changelog

Every user-visible change needs a [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
bullet in [CHANGELOG.md](CHANGELOG.md) in the same PR. Use
[Semantic Versioning](https://semver.org/).

## Pull requests

- One concern per PR when you can.
- Describe the change and any security or privacy impact.
- Add or update tests for behavior changes.
- Update docs and the changelog when behavior changes.
- Preserve attribution and verify license compatibility for reused code.

Security vulnerabilities must follow [SECURITY.md](SECURITY.md), not public
issues.

See [How to Contribute to Open Source](https://opensource.guide/how-to-contribute/)
and [Using pull requests](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests).
