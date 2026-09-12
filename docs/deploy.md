# Deploy, from a clean machine to a bot that answers

Companion to `docs/demo.md`, which assumes the bot is reachable. This is how it gets
reachable. Verified on 2026-09-12 by building the image and running it, except where a step
is marked as needing a real secret.

## What was actually verified, and what was not

Everything below the container line was run with **dummy values for every key**: a bot token
of `000:dummy`, an OpenRouter key of `dummy`, a webhook secret of `dummy-secret-long-enough`.
That proves the image builds, the server boots, the routes answer and an update crosses the
whole turn. It cannot prove the two outbound calls, because both are authenticated by a real
secret:

| Step | Verified with dummies | Needs a real secret |
|---|---|---|
| Image builds | yes | |
| Server boots, `/health/db` 200 | yes | |
| `POST /telegram/webhook` 401 without the header, 200 with it | yes | |
| An update reaches the turn | yes | |
| The reply reaches the customer | no | `TELEGRAM_BOT_TOKEN`, for `sendMessage` |
| Extraction and writing answer | no | `OPENROUTER_API_KEY` |
| `bun run set-webhook` registers the URL | no | `TELEGRAM_BOT_TOKEN` |

With dummies the turn runs end to end and then fails on the last hop, which is the shape you
should expect:

```
telegram sendMessage 401: {"ok":false,"error_code":401,"description":"Unauthorized: invalid token specified"}
```

## The sequence

```bash
git clone <repo> && cd hackaton
bun install
bun test && bunx tsc --noEmit          # both, always
docker build -t dante .
```

Boot it locally with dummy values to prove the image before it goes anywhere:

```bash
docker run --rm -p 4111:4111 \
  -e TELEGRAM_WEBHOOK_SECRET=dummy-secret-long-enough \
  -e TELEGRAM_BOT_TOKEN=000:dummy \
  -e TELEGRAM_WEBHOOK_URL=https://example.invalid/telegram/webhook \
  -e OPENROUTER_API_KEY=dummy -e OPENROUTER_MODEL=dummy/model \
  -e DEPOSIT_ALIAS=dante.imprenta.mp -e TELEGRAM_ADMIN_IDS=7 \
  -e DATA_DIR=/data -e MASTRA_HOST=0.0.0.0 \
  dante

curl -s -o /dev/null -w '%{http_code}\n' localhost:4111/health/db          # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:4111/telegram/webhook   # 401
```

A `401` on the second is the right answer: the secret header is missing. A `404` means the
image predates the route and the build did not pick up `src/mastra/index.ts`.

Then deploy. **One command**, and it is the user's call, not an agent's:

```bash
fly deploy
```

What it changes: it builds this `Dockerfile` on Fly, replaces the machine running
`dante-multimpresos`, and the new machine serves `POST /telegram/webhook` instead of
returning 404. It does not touch secrets, the volume, or the Telegram webhook registration.
`fly.toml` already points the health check at `/health/db`, which the image answers.

Secrets must exist on Fly before that, once, and they are not in this repo:

```bash
fly secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
  OPENROUTER_API_KEY=... OPENROUTER_MODEL=... DEPOSIT_ALIAS=... TELEGRAM_ADMIN_IDS=... \
  FENCE_SECRET=...
```

`fly.toml` supplies `DATA_DIR`, `MASTRA_HOST`, `NODE_ENV`, `TZ` and `TELEGRAM_WEBHOOK_URL`
already. Every key is read at boot on purpose, so a missing one kills the machine at startup
instead of acknowledging customers it can never answer. That is the behaviour, not a bug.

## Registering the webhook

```bash
bun run set-webhook
```

It is **not** part of the container's `CMD` and should not be. It calls Telegram, and gating
the server's boot on that call means a Telegram hiccup takes the whole app down: the backoff
runs 112 seconds and the process exits 1 having never opened a port.

Run it when the URL changes, or when the registered secret may not match
`TELEGRAM_WEBHOOK_SECRET`. It sends `url` and `secret_token` together, both from the
environment, and `secret_token` is what Telegram then echoes in the
`X-Telegram-Bot-Api-Secret-Token` header that `src/telegram/webhook.ts` compares in constant
time. Both sides read the same variable, so they cannot disagree unless the registration is
older than the variable.

`getWebhookInfo` never returns `secret_token`, so there is no way to check the registered
secret from outside. If updates start coming back `401` after a deploy, that is the answer:
re-run it.

It does not pass `drop_pending_updates`, so updates Telegram queued while the URL was
returning errors are delivered after the fix rather than discarded.

## When the bot is up but not answering

`https://dante-multimpresos.fly.dev/` returning 200 only proves Mastra is serving. It serves
a splash page with no routes registered. Check the route itself:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://dante-multimpresos.fly.dev/telegram/webhook
```

`404` is a stale image: the deployed build predates `telegramWebhookRoute` in
`src/mastra/index.ts`. `fly deploy` is the fix. `401` is the route working and refusing an
unsigned request, which is what you want to see.
