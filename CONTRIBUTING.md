# Contributing to Sovera

Thanks for your interest in contributing! A few ground rules so everyone stays protected.

## Developer Certificate of Origin (DCO)

By contributing to this repository you certify that you wrote the code (or otherwise have the right to submit it under the project's MIT license) and that you agree to the [Developer Certificate of Origin 1.1](https://developercertificate.org/).

**Every commit must be signed off** using `git commit -s`, which appends a line like:

```
Signed-off-by: Your Name <your.email@example.com>
```

PRs without sign-off will not be merged.

## How to contribute

1. **Open an issue first** for non-trivial changes so we can align on direction.
2. **Fork**, branch from `main`, keep PRs focused (one logical change per PR).
3. **Test locally**: `npm install && npm run build` in the affected package.
4. **Conventional commits** preferred: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.
5. **No secrets** in commits — check with `git diff` before pushing. We run secret scanning, but please don't push the alert.
6. **Open the PR** and link the issue.

## Local development

```bash
# Functions backend
cd services/functions && npm install && npm run build

# Studio
cd apps/studio && npm install && npm run dev

# MCP server
cd packages/mcp-server && npm install && npm run build
```

See individual `README.md` files in each package for more.

## Code of conduct

Be kind. Disagree on technical merit, not identity. Maintainers reserve the right to remove comments, commits, code, or contributors that violate this in spirit or letter.

## Licensing

All contributions are licensed under the [MIT License](LICENSE) of this project. By submitting a PR you agree to license your contribution under those terms.

## Security

Don't open public issues for vulnerabilities — see [SECURITY.md](SECURITY.md).
