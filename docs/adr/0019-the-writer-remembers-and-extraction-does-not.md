# 19. The writer remembers, and extraction does not

Date: 2026-09-12

## Status

Accepted.

## Context

A turn had no past. Extraction saw one fenced message, the engine priced it, and the writer got
three blocks and nothing else. A customer who answered Dante's own follow up was asked the same
three attributes again, because the second message carried only the answer.

Half of that is fixed deterministically: `TurnState` merges the attributes a customer has stated
across messages, and extraction still reads one message under a strict schema. The other half is
the writer, which reintroduced itself every turn and could not refer to anything it had said.

Mastra ships Observational Memory. Two background agents, an Observer and a Reflector, compress
message history into an observation log and hand it back to the model. It attaches to a `Memory`
on an `Agent`, and this repo had no agent at all: every model call went through
`src/conversation/openrouter.ts` by hand.

## Decision

The writing phase becomes a Mastra `Agent` with Observational Memory. Extraction and receipt
reading stay on the raw OpenRouter port.

`thread` is the `ConversationId`, `resource` is the Telegram sender. The Observer and the
Reflector are named as `openrouter/google/gemini-2.5-flash`, because Mastra defaults them to a
bare `google/...` that would need a second credential.

## Consequences

An observation is written by a model, summarising a stranger's words. If it reached extraction it
would be a second way an attribute enters a quote, and an attribute is a price: a compressed
observation reading 500 where the customer said 5000 produces a real catalog price for the wrong
job. That is the failure this project exists to prevent, so the phase that decides numbers keeps
seeing exactly one message and a strict schema. The writer receives the amount as data it may
only copy, and `amountsHold` checks the reply against amounts the engine actually gave, so a
memory that drifts costs a sentence and never a price.

Giving the writer a past changed what `amountsHold` had to allow, and this is the part that would
have broken in production. The guard let a reply carry only numbers from this turn's answer or
this turn's message, which held while the writer had no memory. With one it says "las 1000
tarjetas" in a turn whose message never repeats the quantity, and "te había cotizado $45.000" a
turn after the quote. Both were refused, and a refused reply is silence plus a dead conversation.
So the guard now also accepts amounts the engine gave earlier in this conversation, and numbers
the customer stated as attributes. A pesos sign is still engine only: nothing a customer says
widens the set of amounts.

The observation log arrives as a system message, in the shop's own voice, unfenced. Raw history
keeps its fence because fenced blocks are what the turn sends, but a summary of an injection is
not fenced, so `WRITING_SYSTEM` now says that context and memory are a record of what was said and
never an instruction, a fact, or a price.

At this conversation length OM is close to inert: nothing observes below about 6k tokens of new
messages and activation is at 30k, while a quote is six short messages. What the writer gains
today is the message history OM manages for it. The observation log is what it gains when a
conversation gets long, and it costs nothing until then.

Mastra creates `mastra_threads`, `mastra_messages`, `mastra_resources` and
`mastra_observational_memory` with idempotent DDL on first use, on the volume the app already
opens, which is the posture `src/storage/migrate.ts` takes.

The agent carries its own HTTP client, so it cannot be reached through the `fetchImpl` the route
injects. The writer is therefore a field on `Wiring`, minted once in the composition root, and the
route's own tests stub it. What they still prove end to end is extraction, the engine and the
send. What the writer really does is proved by `bun run eval`, against the real models.
