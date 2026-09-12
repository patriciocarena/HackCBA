# 21. Dante does not announce itself as software

Date: 2026-09-12

## Status

Accepted. Reverses the first half of README rule 7 and leaves the second half standing.

## Context

Javier read Dante's first message to a customer and did not like it. It said:

> Soy Dante, el agente automático de Multimpresos.

Two words are wrong and one of them is ours. "Agente" in rioplatense is a salesperson working
on commission, which is not what the shop calls the person who answers the phone. "Automático"
beside it reads as a robot that also wants to sell you something. He asked for the sentence the
counter says:

> Soy Dante, asesoro y tomo los pedidos de Multimpresos, ¿en qué te puedo ayudar?

He also asked that Dante stop telling customers it is handing them to a human. The escalation
sentence was "te delego con un humano", and it went out on every escalation.

Rule 7 was "Dante introduces itself as automated and never pretends to be a person". Its two
halves are separable and only one of them is what the rule is for. Never pretending to be a
person is about not deceiving anyone. Volunteering that it is software is about disclosure, and
disclosure is the owner's call about his own shop's voice, not a safety property of this repo.

The disclosure was also load bearing in two places that assert it rather than describe it:
`test/conversation/prompt.test.ts` required the word `automático` in both prompt constants, and
`scripts/eval-demo.ts` required `/automátic/` in the live first reply. Those tests were the rule
written down twice, which is why this is an ADR and not a commit: the tests were right to pin it,
and they are now pinning a decision that has been reversed.

## Decision

Dante introduces itself by name and by what it does, and does not say it is software.

It never claims to be a person. Asked directly, it does not deny being software: it has no fact
loaded that says it is human, and rule 3 means what is not a loaded fact it does not state. So
the deception the rule existed to prevent is still prevented, by the mechanism that prevents
every other invention rather than by a sentence in a prompt.

The escalation sentence loses the word too. Two sentences, in `src/domain/handoff.ts`:

> eso lo confirmo con el local y te contestamos en un rato
> eso no lo tengo a mano, lo confirmo con el local y te contestamos en un rato

They were five copies in four files before this, which is why a rewording was a four file
change. `NO_MEDIA` in `src/conversation/turn.ts` is the third sentence and it carries its own
greeting, because an escalation on the first message never reaches `INTRODUCTION`.

Both new sentences still promise an answer. That is not politeness. ADR 0011 makes the first
escalation the last thing Dante ever says in that conversation, so a customer told nothing waits
for a reply that will not come. "Te contestamos" is true because a person does answer.

`WRITING_SYSTEM` forbids `humano`, `te delego`, `te derivo` and `te paso con`. This is the part
that is easy to miss: an escalation is not sent raw. The detail goes into the `<respuesta:...>`
block and the writer paraphrases it, so removing the words from the constants and not from the
prompt puts them straight back in the model's voice. `scripts/eval-demo.ts` is the check that
can see it, because `bun test` stubs the writer.

## Consequences

README rule 7 becomes "Dante never pretends to be a person", and the rules are one clause
shorter.

A customer can now hold a conversation with Dante without being told they are talking to
software. Javier accepts that; it is his shop and his brand, and he picked the name. What he does
not accept is the previous greeting, which he saw in the field.

The handoff is less legible to the owner. `src/conversation/customer-turn.ts` notifies him only
on `unsupported_media`, deliberately, because the escalation rate is high while the catalog is
thin and notifying on all of them would bury him. Until now the sentence "te delego con un
humano" was how he spotted, scrolling a chat, that the bot had stopped. The new sentence is
softer on purpose and therefore easier to miss.

That cost is real and this ADR does not pay it. It is mitigated only by the sentence staying
fixed, which ADR 0012 already guarantees by making the reason audit metadata rather than a
branch: there is exactly one sentence to learn. The honest fix is an escalation notification, and
`notify` is already the seam for it. Whoever wires that should read this paragraph first.

`scripts/eval-demo.ts` and `scripts/eval-flows.ts` detect a handoff by regex, and each regex is
used both to require one and to forbid one. Both now match the new wording **and** the old, and
they must stay supersets: narrowing them to the new sentence alone would make the check that an
unloaded fact *was* handed off pass on a reply that handed nothing off.

## Alternatives considered

Keeping the disclosure and only dropping "agente": "Soy Dante, el asistente automático de
Multimpresos". It satisfies the letter of what he complained about and not the substance, and he
was asked directly and chose the version without it.

Disclosing once on the first message and never again. That is what `INTRODUCTION` already does,
and it is the thing he objected to.

Keeping "te delego con un humano" and changing only the greeting. It is defensible and it is
what makes the handoff visible to the owner. He was asked as a separate question and said to
change both.
