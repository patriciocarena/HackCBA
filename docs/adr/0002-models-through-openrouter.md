# 2. Models reach Claude through OpenRouter

Date: 2026-09-11

## Status

Accepted.

## Context

Extraction is the load bearing half of the design. If it degrades, every rule downstream is
guarding a wrong `Intent`. It runs as `structuredOutput` with no tools, so the provider has to
support structured outputs properly, not approximately.

Two routes were open. Direct Anthropic, which has the newest model ids the day they ship. Or
OpenRouter, as in the precedent, which adds a hop.

The precedent routes to `anthropic/claude-sonnet-4.6`, the previous generation.

## Decision

OpenRouter, on `openrouter/anthropic/claude-opus-5`, for both the extraction turn and the
writing turn.

`OPENROUTER_API_KEY` is the only model credential. `ANTHROPIC_API_KEY` does not appear in this
repo.

## Consequences

Checked before deciding, on 2026-09-11: OpenRouter serves `anthropic/claude-opus-5` at $5 and
$25 per million tokens, identical to first party, with a one million token context,
`structured_outputs: true` and `response_format: true`. There is no price penalty and no
capability gap on the extraction path.

OpenRouter gives one dashboard with a spend limit on it, which matters more during a
hackathon than a saved network hop.

If a turn is too slow in the demo, the lever is `output_config.effort` set to `low` on
extraction, not a cheaper model. Lower effort on the current generation generally beats high
effort on the previous one, and one model means one cache namespace.

## Alternatives considered

Direct Anthropic. Fewer moving parts and first party features the day they ship, but no spend
limit of its own and one more key to rotate.

A cheaper model for extraction, Haiku 4.5 at a fifth the price. Rejected for now: the volume
here is a handful of short Spanish messages, so the saving is cents, and extraction accuracy
is the thing the whole product rests on.
