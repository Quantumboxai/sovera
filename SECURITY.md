# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Sovera, **please do not open a public GitHub issue**.

Instead, email **security@sovera.eu** with:

- A description of the issue
- Steps to reproduce
- Affected component (MCP server, Functions backend, Studio, client SDK, infra)
- Your assessment of impact

We aim to acknowledge reports within **3 business days** and to ship a fix or mitigation within **30 days** for high-severity issues.

## Scope

In scope:
- `@sovera/mcp` (this repo — `packages/mcp-server/`)
- `@sovera/client` (this repo — `packages/client/`)
- Sovera Functions backend (this repo — `services/functions/`)
- Sovera Studio (this repo — `apps/studio/`)
- Infra templates (this repo — `infra/`)
- Hosted endpoints under `*.sovera.eu`

Out of scope:
- Denial-of-service attacks
- Social engineering of Sovera staff
- Findings from automated scanners without a working PoC
- Issues in third-party dependencies already disclosed upstream (please report to the upstream project)

## Supported Versions

Only the latest minor release of each package receives security updates. Pin to a release tag for stability.

## Safe Harbor

We will not pursue legal action against researchers who:
- Make a good-faith effort to avoid privacy violations, data destruction, and service disruption
- Give us reasonable time to fix issues before public disclosure
- Do not exploit the vulnerability beyond what is necessary to demonstrate it

Thank you for helping keep Sovera and its users safe.
