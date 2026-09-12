# 1. Deployment shape: Mastra's server, a Fly volume, and a health check that proves it

Date: 2026-09-11

## Status

Accepted.

## Context

A1 asks for a chassis that deploys, answers a health check, and keeps a file across two
deploys. We seeded it from `sergio-mastra`, a single tenant Mastra service already running on
Fly with LibSQL on a volume.

Three things in that precedent do not transfer, and one thing in our own README was wrong.

The precedent's image carries ffmpeg, Xvfb, Chromium, `gh` and `flyctl`, because it drives a
browser. Dante drives none of that, and Chromium is the expensive half of every build.

The README claimed Litestream replicating from the first deploy. The precedent has no
Litestream anywhere. Adding it means a binary in the image, a bucket, a supervisor for two
processes and a config file, on a ticket that sits on the critical chain at hour zero.

Mastra's built in `/health` returns `{ success: true }` unconditionally. It never opens the
database and never looks at the volume. A criterion that cannot fail proves nothing.

## Decision

The Mastra server is the HTTP server. `mastra build` emits `.mastra/output/index.mjs` and the
container runs it. Custom routes go through `server.apiRoutes`.

The image is `oven/bun:1.4.0-slim` plus `ca-certificates`. Nothing else until a ticket proves
it needs it.

No Litestream. Durability is the Fly volume plus Fly's scheduled snapshots, which are on by
default with five day retention.

The real health check is `GET /health/db`. It opens LibSQL at `DATA_DIR`, upserts a single
heartbeat row and returns it. `beats` counts every check the machine has ever answered, so
the volume persistence criterion is the same request made before and after a deploy: if the
counter keeps climbing, the volume survived. Fly's health check points at `/health/db`, not
at `/health`.

## Consequences

`/health` still exists and still returns 200 unconditionally. Mastra registers it before
custom routes and Hono matches first registration, so it cannot be overridden. Treat it as a
liveness probe for the process and `/health/db` as the one that means something.

`/health/db` fails when the database does, and Fly restarts machines that fail health checks.
That is intended. The check is one write and one read with a five second timeout.

Litestream is a client repo decision, not a hackathon one. The database opens in WAL mode, so
nothing here blocks adding it later.

## Alternatives considered

A plain `Bun.serve` with our own `/health`. Full control of startup, at the cost of Mastra's
routes, the Studio playground, and any similarity to the one deployment we have already
proven working. Not worth it on a sixteen hour clock.

Proving the volume by hand over `fly ssh console`. Proves the volume and nothing about the
app.
