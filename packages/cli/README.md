# `@sovera/cli`

The Sovera command-line interface — initialize, deploy, and operate your sovereign data backend.

## Install

```bash
npm install -g @sovera/cli
```

## Usage

```bash
sovera init                       # scaffold sovera.config.json
sovera login                      # az CLI sign-in
sovera db push                    # apply SQL migrations
sovera tenant create acme         # onboard a customer (starter tier)
sovera tenant create acme -t pro  # …or pro / enterprise
sovera functions deploy           # publish all function apps
sovera status                     # list resources in your RG
```

All commands honor `sovera.config.json` at the workspace root. Override per-call with `--rg`, `--tier`, etc.
