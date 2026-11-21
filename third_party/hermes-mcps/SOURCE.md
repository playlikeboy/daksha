# Source: Hermes Agent suggested tool servers

Repository: https://github.com/NousResearch/hermes-agent
Commit: aeb5a071069dbd85d85f2c8d44337f16df29d475
License: MIT

Copied on 21 November 2026.

## Copied

- `optional-mcps/*/manifest.yaml`: all 66 manifests, verbatim, at the same paths.

## Changed

Nothing. The files are byte-for-byte copies.

The list of suggested tool servers in the app (`os/apps/mobile/src/mcp-suggestions.ts`) is built from these manifests by hand: name, address, and whether it needs a sign-in. `os/tests/mcp-suggestions.test.ts` checks that each suggestion still matches its manifest. On 21 November 2026 each address was asked once, without signing in, and every one answered (most with "sign in first" or "use POST"). These were left out of the app list:

- `n8n-official`: the address is a template the person fills in.
- `unreal-engine`: a server on the person's own computer over plain http.
- `asana`: its sign-in needs a client id and secret registered by hand.
- `paypal`, `square`: they only speak the older SSE way, which Daksha does not support yet.
