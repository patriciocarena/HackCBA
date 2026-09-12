FROM oven/bun:1.4.0-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
RUN bun run build

# DATA_DIR is /data on Fly, where the volume mount creates it. Nothing creates it here, so a
# boot before the volume attaches, or any boot off this image without one, dies in LibSQLStore
# with "Unable to open connection to local database /data/dante.db: 14".
RUN mkdir -p /data

# The server, and only the server. Registering the webhook is a separate one-off step, because
# gating the boot on a call to Telegram means a Telegram hiccup takes the whole app down: the
# retries run 112 seconds and then exit 1, having never listened on a port.
CMD ["bun", ".mastra/output/index.mjs"]
