FROM oven/bun:1.3.14

RUN apt-get update && apt-get install -y --no-install-recommends python3 gh ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.8.22 /uv /uvx /usr/local/bin/
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-bookworm-slim /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && npm install -g @openai/codex

WORKDIR /workspaces/PRView

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

EXPOSE 9999

CMD ["bun", "run", "dev"]
