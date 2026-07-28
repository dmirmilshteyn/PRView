FROM oven/bun:1.3.14

WORKDIR /workspaces/PRView

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

EXPOSE 9999

CMD ["bun", "run", "dev"]
