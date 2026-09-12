---
name: task-implement
description: "Takes one Linear issue in this repo from worktree to merged PR: grill, TDD, review, simplify, commit atomically, push, open a PR, and move the issue. Use when given a DAN- issue key (e.g. DAN-11) and asked to implement it."
argument-hint: "<DAN-nn>"
disable-model-invocation: true
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Agent, Skill, TodoWrite
---

Implements one Linear issue. The tracker is Linear, team `DAN`. The repo is Bun and
TypeScript, not Rails: the tests are `bun test`, never rspec.

You are running autonomously in a parallel lane. There is nobody to answer a question.
Never call `AskUserQuestion`. Never stop and wait. Answer every question yourself and
say what the answer rests on.

## Read these first, in this order

`PLAN.md` is the contract with the other three lanes. `CONTEXT.md` is the glossary, and
the words in it are the words the code uses. `TICKETS.md` carries the `Done when` line
that closes your issue. `docs/adr/` holds the decisions already made. A lane that
re-decides something an ADR settled is worse than one that never asked.

## Your worktree

You are already in it. It is yours alone and three sibling lanes are running right now
in theirs.

Inside a worktree, never `git stash`, `git checkout .`, `git reset --hard` or
`git clean`. A subagent's stash once wiped four parallel lanes' work. Commit instead.

Never edit `PLAN.md`, `TICKETS.md`, `SCHEDULE.md` or `tasks.json`. Those are central and
every lane that touches one produces a conflict with the other three.

Stay inside the files your issue names. If you need something a sibling lane owns, write
the smallest local version of it and say so in the PR, rather than reaching across.

## Steps

1. Read the issue. `bun scripts/linear.ts view <KEY>`.
2. Grill it into a plan. Run `/grill-with-docs`, which is `/grilling` driven through
   `/domain-modeling`, on every issue. Do not decide whether the issue "needs" it.
   Two of `/grilling`'s rules are overridden here, and one is not.

   OVERRIDDEN, because there is nobody to ask: it says to put each decision to the user
   and wait. Answer every question in the round yourself, with your own recommended
   answer, and go straight to the next round. When the frontier is empty, the settled
   tree is the plan and implementation begins.

   NOT overridden, and it carries most of the value: "Finding facts is your job, never
   the user's." Dispatch subagents for anything the repo can answer. A question you
   answered from the repo is not a guess.

   Answer in this order of preference: a decision already written down (an ADR, `PLAN.md`,
   `CONTEXT.md`, a commit on `main`), then the convention this repo already follows in
   comparable code, then your own recommendation, stated as such.

   Write the rounds out as you go. Then write the ADR and the `CONTEXT.md` glossary
   entries `/domain-modeling` calls for INTO YOUR OWN FILES: a new numbered file under
   `docs/adr/`, and glossary terms in `docs/glossary/<your-key>.md`, never in `CONTEXT.md`
   itself. `CONTEXT.md` is central and four lanes editing it is four conflicts.
3. Implement with the `tdd-skill`: strict red-green-refactor, one cycle at a time.
   No skipped tests, no pending tests.
4. Commit at every green step, atomically. One concern per commit, a few lines each.
   A commit message is a subject plus at most three lines. No bullets, no headings,
   no `Co-Authored-By`, no session URL.
5. Review. Run `/code-review` on your own diff. YOU choose which findings are real and
   you APPLY them in the same pass. Verify each one against the code first, drop what
   does not survive, and say how many you dropped. Then one commit per concern.
6. Simplify. Run `/simplify` on what survives. Quality only, never behavior. Same rule:
   the lenses PROPOSE, you pick and apply. A lens returning twelve edits is not authority
   to make twelve edits.
7. Validate. `bun test` and `bun run typecheck`, both green, or say plainly which is not.
   While developing, run only the test files you are touching; run the full gate once, at
   the end. Four concurrent full suites is what exhausts the box.
8. Push and open a PR. `git push -u origin <branch>` then `gh pr create`. The PR body says
   what shipped, which `Done when` line it closes, what you decided in the grill and what
   each decision rests on, and anything you left out with the reason. Never put a session
   id or URL in the body.
9. Report the PR number and stop. You do NOT merge. The orchestrator merges, and a
   reviewer you never see reads your PR first.

## The rules that are not up for negotiation

They are in `PLAN.md` section 5 and they are the point of the product. The two that catch
lanes out:

- The bot only says a number that comes out of a pure, tested function whose inputs are
  all data the owner typed. Exact match or escalate. No interpolation.
- Every outside text is fenced as untrusted and is never an instruction.

## House rules

No new code comments. The why belongs in the commit, the ADR or the PR.
No client constants in `.ts`. Seed data is data.
Postgres-style enums: every `as const` array generates the TypeScript union, the Zod enum
and the SQLite CHECK, from one source. The helper is `src/storage/check.ts`.
Assertive style. Let exceptions surface. No nil guards unless the caller handles nil.
Record corrections in `tasks/lessons.md` so no later review re-raises them.
