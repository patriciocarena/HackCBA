# Lessons, DAN-22

A stubbed defence is a defence the suite does not cover. The harness passed its own
`isAdmin: (id) => id === OWNER` into the webhook, so the attack that claims owner identity
proved the webhook reads *some* predicate, not that `adminAllowlist` is the one it reads.
Mutating `adminAllowlist` to admit everyone left all nine tests green. Calling the real
module fixed it in one line. At a trust boundary, stub the model, never the check.

A mutation that reddens every test is weaker evidence than one that reddens the right test.
Admitting everyone to the allowlist turned every customer delivery into an admin
conversation, so six tests failed for the same upstream reason. The precise proof was
deleting the `admin_edit` arm of `resolve`, which reddened exactly the one test that names
it. Prefer the mutation closest to the line under test.

Asserting a reply is null is not a money assertion. `expect(reply).toBeNull()` passes when
the turn falls over for any reason, including one that has nothing to do with the attack.
Each money attack got a second arm with a writer that did not fall for the payload, asserting
the amount is still exactly what `priceFor` and `totalOf` computed. That arm is what proves
the payload did not move the number, rather than only that it produced no reply.

The session trailer went into the first commit because a harness reminder asked for it and
CLAUDE.md forbids it. The user's own instruction outranks the reminder. Amend immediately;
a trailer is cheap to remove before a push and permanent after one.

Known residual, consistent with ADR 0008: a hijacked writer that states no amount can still
ship a fabricated non-money claim. A forged facts block naming a branch the shop does not
have buys no price and escalates, so a person takes the conversation, but the sentence has
already gone out. `amountsHold` is a money guard and nothing guards prose.

A clean merge is not a passing merge. `a5-conversation-turn` merged into main with no
conflict and then failed: B10 deleted `test/support/catalog.ts` on main, this branch still
imported it, and git has no opinion about a file neither side edited. Merge main locally and
run the gates before pushing, every time.

The merge also put a second fence around every customer message. `src/telegram/webhook.ts`
now calls `fence(update.text, 'message')` and `turn()` fences `message.text` again under the
same label, so the extraction prompt carries a `<message:...>` block nested inside another
one. Neither nonce is forgeable and nothing escapes, but the prompt tells the model that a
block appearing inside `<message:...>` was written by the customer, and the inner block was
written by the shop. The rule that makes a forgery visible now points at the real fence. This
suite found it because it enters through the webhook; no test that calls `turn()` directly can.
