# AGENTS.md

## Project overview

PRView is a Next.js application using Bun and the App Router.

## Development environment

- Use the repository's `.devcontainer` for all project commands.
- Do not install or invoke project dependencies from the host environment.
- The development server listens on `127.0.0.1:9999` by default. Compose binds it to the container interface and publishes the host port on `127.0.0.1` only.
- Dependencies are installed with `bun install --frozen-lockfile`.

## Common commands

Run these from inside the devcontainer:

```sh
bun run dev
bun run build
```

Keep generated dependency and build directories (`node_modules` and `dist`) out of version control.
