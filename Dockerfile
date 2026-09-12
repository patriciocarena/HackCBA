FROM oven/bun:1.4.0-slim

ARG LITESTREAM_VERSION=0.5.17

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && arch="$(dpkg --print-architecture)" \
  && case "$arch" in amd64) arch=x86_64 ;; esac \
  && curl -fsSL "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${arch}.tar.gz" \
    | tar -xz -C /usr/local/bin litestream \
  && apt-get purge -y curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
RUN bun run build

CMD ["bash", "-c", "bun src/storage/write-litestream-config.ts && litestream restore -config /etc/litestream.yml -if-db-not-exists -if-replica-exists \"$DATA_DIR/dante.db\" && bun src/storage/migrate-cli.ts && litestream replicate -config /etc/litestream.yml -exec \"bash -c 'bun src/telegram/set-webhook.ts && bun .mastra/output/index.mjs'\""]
