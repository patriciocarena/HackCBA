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
