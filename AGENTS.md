# AGENTS.md

## Project overview

PRView is a Vite-powered React application using Bun and React Router.

## Development environment

- Use the repository's `.devcontainer` for all project commands.
- Do not install or invoke project dependencies from the host environment.
- The development server listens on `0.0.0.0:9999`.
- Dependencies are installed with `bun install --frozen-lockfile`.

## Common commands

Run these from inside the devcontainer:

```sh
bun run dev
bun run build
```

Keep generated dependency and build directories (`node_modules` and `dist`) out of version control.
