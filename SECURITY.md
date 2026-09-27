# Security

## Reporting a vulnerability

Please report vulnerabilities privately, through **[Report a vulnerability](https://github.com/0xmattthemii/toodoo/security/advisories/new)** on this repository's Security tab, rather than in a public issue or pull request. Include what an attacker can do, the steps to reproduce it and the version or commit you tested.

You'll get an acknowledgement within a few days. Once a fix is ready it ships in a release, and the advisory is published with credit to you unless you'd rather stay anonymous.

## Supported versions

Fixes land on `main`, and the desktop app updates itself to the latest release. Self-hosted deployments should track `main` and run the migrations it brings (see the [README](README.md#deploy-your-own)).

## Scope

In scope: the web app, its MCP server (`/api/mcp`) and the desktop app in [`desktop/`](desktop/). Out of scope: your deployment's own configuration (secrets, database access, the domain lock you choose) and vulnerabilities in dependencies that toodoo doesn't make exploitable.
