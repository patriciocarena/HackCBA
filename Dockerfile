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

CMD ["bash", "-c", "bun src/telegram/set-webhook.ts && bun .mastra/output/index.mjs"]
