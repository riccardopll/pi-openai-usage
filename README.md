# pi-openai-usage

A minimal [Pi](https://pi.dev) extension that adds `/usage` for OpenAI Codex weekly usage.

## Install

```bash
pi install npm:@riccardopll/pi-openai-usage
```

Log in to OpenAI through Pi, then run:

```text
/usage
```

Example output:

```text
OpenAI weekly: 34% used · 66% remaining · resets 7/26/2026, 3:00:00 PM
```

The extension uses the same OpenAI OAuth login as Pi. Credentials stay in Pi and are only sent to OpenAI's Codex usage endpoint.

> The usage endpoint is used by the official Codex CLI but is not a documented public API, so it may change.

## Development

```bash
npm install
npm run check
pi -e ./extensions/openai-usage.ts
```

## Publishing

The package includes the `pi-package` keyword required for discovery in the [Pi package gallery](https://pi.dev/packages). Every push to `main` publishes a unique `0.1.<run number>` version to npm.

Before the first push, add an npm automation token as the `NPM_TOKEN` GitHub Actions secret.

## License

MIT
