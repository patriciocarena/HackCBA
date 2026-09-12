# 26. An admin conversation does not end

Date: 2026-09-12

## Status

Accepted. Scopes ADR 0011 to customers. Carries an exception to ADR 0021 for the owner's own
channel.

## Context

Javier typed `hola` and read this back:

> ¡Hola! Soy Dante, asesoro y tomo los pedidos de Multimpresos. Eso lo confirma el local y ya te
> contestamos en un rato.

The second sentence is the customer's handoff, and he is not a customer. The first is the
counter's greeting, and he is not at the counter. He asked for a greeting of his own.

The greeting was the symptom. Probed on a bench, the two messages he sent after that one got no
reply at all:

```
OWNER: hola                  -> "...Eso lo confirma el local y ya te contestamos en un rato"
OWNER: ¿cómo estás?          -> (silence)
OWNER: ¿qué horario tenemos? -> (silence)
```

`adminTurn` reads his voice notes and hands everything else to the customer turn. A greeting
extracts as `kind: 'other'`, which is `escalate('ambiguous')`, and ADR 0011 makes the first
escalation the last thing said in that conversation. One `hola` took down the only text channel
the shop is run from, until the process restarted. His voice notes survived by luck of ordering:
`adminTurn` intercepts them before the fallback, so the demo would have run anyway and nobody
would have known why he had stopped answering.

ADR 0011 exists so a customer who was told a person will answer stops talking to a bot that has
stopped answering. The owner is that person. Escalating him buys nothing and costs the channel.

He read the first pair of sentences and reported two things. The offer lands twice in the
greeting, "estoy a tu servicio" and then "en qué te puedo servir", and the sentence after it is
that same offer a third time, which tells him nothing about what the channel is for.

## Decision

An admin conversation never escalates. Every escalation the engine raises for an admin becomes
an `instruct`, and an `instruct` is said as written rather than handed to the writer.

`Resolution.instruct` already existed for exactly one case, the owner typing a price change, and
its comment in `src/domain/types.ts` already gave this reason: *"escalating him would end his own
conversation"*. This is that decision applied to every case instead of one.

Three sentences, in `src/conversation/admin-turn.ts` beside `ONLY_AUDIO`:

| Reason | What he reads |
|---|---|
| `ambiguous`, first message | `¡Hola! ¿Cómo estás? Soy Dante, tu agente de administración del negocio y atención al cliente, estoy a tu servicio. ¿Qué necesitás?` |
| `ambiguous`, later | `Te cambio un precio si me mandás un audio, te paso un precio de la lista y te doy los datos del local. ¿Qué necesitás?` |
| every other reason | `Eso no lo tengo cargado. Si lo pregunta un cliente, se lo paso al local.` |

The later sentence names the three things his channel does and nothing else: a voice note
becomes a price proposal, a family the list carries gets priced, and a fact in
`seed/facts.json` gets answered. It is pinned to those in `test/conversation/prompt.test.ts`,
because a sentence offering a fourth is the invention this repo exists to prevent.

One sentence for everything else is ADR 0012's rule kept: the reason is audit metadata, not a
branch, and there is exactly one sentence to learn. His version reports the coverage gap to the
person who can close it, instead of promising an answer he would be the one to give.

It does not say "cargámelo". Facts come from `seed/facts.json` and not from a message, and a
sentence offering what Dante cannot do is the invention this repo exists to prevent.

The conversion happens once, on the settled resolution, rather than at each `escalate` call.
That is what makes it hold for all of them: the greeting, a fact nobody loaded, a family the
list does not carry, an attribute asked twice, the five reasons extraction states, and the catch
around `resolve`. The two writer-failure branches take the same guard, so a bad minute at
OpenRouter cannot lock him out by the other route.

## Consequences

`ONLY_AUDIO` becomes verbatim too, because it is an `instruct`. It was paraphrased by the writer
before. Verbatim is the better trade: the wording cannot drift, and a greeting costs no model
call, which on stage is the difference between instant and three seconds.

`amountsHold` is untouched. A reply that states an amount it was not given is still refused and
still sends nothing, for the owner as much as for anyone. He only gets to try again instead of
being locked out. That guard is what the whole repo rests on and this ADR does not weaken it.

`agente` is back, on his channel only. ADR 0021 took it out of the customer greeting because he
heard it on a customer's phone and objected: in rioplatense it is a salesperson on commission.
On his own channel it means what he means by it, and he wrote this sentence himself.
`test/conversation/prompt.test.ts` still pins the word out of `INTRODUCTION`, which is the half
that faces customers.

The owner's channel now answers. That is a larger surface than it was: he can ask a price and a
fact and get a real reply rather than silence, and everything he is told is still either the
engine's number or a fixed sentence.

His first message is not always a greeting. A price question or a loaded fact on message one
settles as an answer, which goes to the writer, and the writer was handed the customer's
`INTRODUCTION`: he read "asesoro y tomo los pedidos de Multimpresos" on his own phone, which is
what the counter says to a customer. `writingSystem` now takes the role and appends
`ADMIN_INTRODUCTION_PROMPT` instead. The writer says it rather than a constant because that
message also carries a price or a fact, and the shop answers in one message.

What this still does not fix: the writer answers him in the counter's voice ("¡Te esperamos!",
first person plural for the shop). That is `WRITING_SYSTEM` itself, it is the voice every
customer reply depends on, and splitting it by role is a larger change than the wording earns.

## Alternatives considered

Answering only a greeting and leaving the rest escalating. It fixes the sentence he complained
about and leaves the defect he ran into, which is that his next message got nothing back.

Letting the writer phrase the owner's greeting. It is the consistent thing, and it loses the
exact wording he picked, which is the only reason the sentence exists.

Clearing `escalated` for admins on the way in, instead of never setting it. Same effect by a
worse route: the flag would be written and then undone, and every reader of the state would have
to know that an admin's flag means nothing.
