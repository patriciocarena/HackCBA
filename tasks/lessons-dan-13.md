# Lessons, D1

Corrections from this lane, kept out of `tasks/lessons.md` because that file is central
and four lanes editing one file is four conflicts.

## A branded return type makes `bun test` and `bun run typecheck` disagree

Adding a golden value test, `expect(fence(text, label)).toBe('<message:...>')`, passed
`bun test` and failed `tsc`: `toBe` infers its expected type from the actual, so a raw
string literal is not assignable to `UntrustedText`. The brand was doing its job.

Two things follow. Run `bun run typecheck` in the same breath as `bun test` whenever a
test touches a branded type, because the suite alone is green and CI is not. And compare
through a widened local, `const block: string = fence(...)`, rather than casting the
expectation, so the test still reads as a string comparison and the brand stays strict
everywhere else.

## An invariant is only as good as the thing it quantifies over

The first fence derived its delimiter from an unkeyed digest of the label and the text,
and the ADR defended this: "a message cannot contain the delimiter this fence will choose
for it". That was true, and it was not the attack. The attack is a message carrying a
valid block for some OTHER label, which a customer computes for free because every input
to the digest is public. The fence emits it verbatim and the prompt then holds a forged
facts block that is byte identical to a real one.

The tell was in the wording and I wrote it myself without hearing it. "For it" is a
quantifier, and narrowing an invariant to the text in hand is exactly how you end up
proving something adjacent to the property you need. When a security claim has to name
which instance it holds for, check what it does not hold for.

The twelve adversarial payloads hid it rather than catching it. Every one used a made up
nonce, so all twelve passed for one trivial reason and the count read as coverage. A
payload that carries a CORRECT digest is the only kind that tests a fence, and writing
twelve that cannot is a suite that grows without getting stronger.

Unforgeability needs a secret. A digest over public inputs authenticates nothing, however
long it is.
