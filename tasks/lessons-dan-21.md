# Lessons, C4

Corrections from this lane, kept out of `tasks/lessons.md` because that file is central
and four lanes editing one file is four conflicts.

## A boundary that discards a distinction makes every consumer guess

`readUpdate` set `mediaId` from `message.voice?.file_id ?? message.photo?.at(-1)?.file_id`.
Two different things, one field, and the one place that could still tell them apart threw
the answer away. My audio guard then read `mediaId !== null` as "there is audio", which is
approximately true and wrong for a photo: the JPEG was fetched and handed to a transcriber.

I wrote the guard by looking at the field, not at what produced it. The field name was
honest, `mediaId` really is a media id; it was the nullability I read as a discriminant.
When a guard asks "which kind is this", check that the kind survived the parse. If the
answer is a union, the boundary should carry the union.

The cost of not fixing it at the boundary is that every later turn re-derives the same
wrong answer. A5 would have written the same guard.

## Failing closed means refusing, not discarding

Two dependencies defaulted to something harmless-looking: `save` to an in-memory store
nobody holds a reference to, `fetchAudio` to a function returning `null`. Both read as
fail-closed and neither was. A forgotten `save` transcribes, extracts, pays two providers
and drops the result. A forgotten `fetchAudio` reports itself forever as `failed`, which
this lane's own glossary defines as a provider outage.

A default is fail-closed when the missing dependency causes nothing to happen. It is not
fail-closed when it causes work to happen and vanish, or when it disguises a wiring bug as
a runtime condition the code already has a meaning for. The fix was deletion both times:
required dependencies turn both into a type error at the wiring site.

`denyEveryone` is the real pattern. Nothing happens, and nothing pretends to.

## A review's reasoning and a review's patch are two things to judge

A reviewer flagged the bare `catch` in `telegramAudio` and proposed rethrowing `TypeError`
to let programming errors surface. The concern was fair. The patch was wrong here: Bun's
`fetch` throws `TypeError` on network failure, so it would have rethrown the exact case the
catch exists for, and my own test only proved otherwise because the stub threw a plain
`Error`.

Running the two-line check cost less than arguing about it. Do that before accepting or
refusing a fix that rests on a claim about the runtime.

## Collapsing test helpers can collapse the thing under test

Merging `privateDelivery` into `delivery` moved `update_id` into the shared body, so two
deliveries in one test carried the same id and A4's dedup swallowed the second. The
assertion failed for a reason unrelated to what it asserted.

A test helper's duplicated fields are not all incidental. The ones the system keys on are
the test. Check what is a key before sharing a fixture that carries it.
