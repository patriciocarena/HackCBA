# Lessons

## Verify a brief against the repo before building to it

2026-09-12, B10. The brief said the card rows were seeded in the database, then
corrected itself to say there was no seed at all. Both were wrong.
`seed/business-cards.json` was on main the whole time, and
`test/support/catalog.ts` was already mapping it into a `FamilyContract`. The
brief also filed the work under B9, which `TICKETS.md` lists as a cut ticket
about escalation rate.

Three wrong facts, and each one would have produced a second mapper on the money
path that drifts from the first. Read the paths the brief names, and the ticket
row it cites, before writing the first line.

## Check a claimed commit, and say what the check actually proves

Same lane. Three changes were reported as landed on main: a TICKETS.md row, a
Linear transition and a seed fix at b5d6117. `git cat-file -t b5d6117` said "Not
a valid object name" and origin/main had not moved, so I reported them missing.

They were real. I had fetched before the push landed, and all three were on main
minutes later. Checking rather than believing was still right, and it is what
caught three genuinely wrong facts earlier in the same lane. What was wrong was
the conclusion I drew from one fetch: absent from my clone means not visible yet,
not never pushed. Re-fetch before calling something missing, and report the
check, not the motive.

## A deleted file can hold two jobs

`test/support/catalog.ts` held the seed mapper and six test fixture builders.
Only the mapper belonged in `src/`. Splitting it that way kept `intent()` and
`withVat()` out of production code. Before moving a file wholesale, ask what
each export is for.

## A finding proved with the wrong gate is not proved

`bun test` does not typecheck. A green suite says nothing about whether the
code compiles, so any claim about a type — a field is unnecessary, a union can
be narrowed, a cast is redundant — needs `bun run typecheck` in the same run as
the evidence.

This is worse than an unproved claim, because the pass count reads as proof and
stops the reader asking. When a finding says "342 pass, 0 fail", check which gate
produced the number and whether that gate can see the thing being claimed.

## Expectations computed from the data are correct where the data is meant to move

A suite that derives its expected amounts from the seed cannot catch a change to
the seed, and that is the right trade where the seed is a price list a person
edits on purpose. Pinning the literal amounts instead would fail every legitimate
edit.

So a low mutation score on a data value is not automatically a coverage gap. Ask
what the value is for. The literals that must survive belong where the arithmetic
is hand-built and independent of the data, not where the data is read.

## Evidence that cannot separate a claim from its opposite is not weak, it is none

Git authorship in this repo records the identity the tooling commits under, not
who did the work: every lane runs as an agent in a worktree on a machine with one
configured identity. So "74 commits by one name, none by another" cannot show that
the second person wrote nothing. The same number cannot tell that person's commits
from the ones this session just made under the same name.

The test is not how much evidence there is. It is whether the measurement would
look different if the opposite were true. If it would not, more of it changes
nothing, and a precise count makes the hole harder to see rather than easier,
because the number invites checking the arithmetic instead of the premise.

Twice in one day: `bun test` counted passes and could not see types, and commit
counts counted commits and could not see people. Both arrived with real numbers.

## Read the prose around a table before editing the table

The same file already said it: "Juan Bautista left on 2026-09-12. PR #4 carries
B3, B4, B5, B6, B7, B8 and A7", sixty lines under the rows being rewritten. The
question being inferred from git was answered in the document being edited.

## A8, 2026-09-12. Two reviews agreeing is not evidence

Both the staff review and the ponytail review asked me to delete the same test as
redundant, with the same reasoning: the empty-receipt test proves only both-null is
refused, so any non-null combination passes. That does not follow. The empty test pins
(null, null) and the photo test pins (media, null); neither pins (null, text). A mutant
guard keeping only the mediaId clause refuses every typed transfer and stays green
except for the test they wanted cut.

Same shape as the D1 lesson: the property lived in the quantifier, and the test that
looked like a duplicate was the one holding the other half of an `&&`.

Rule: before deleting a test a reviewer calls redundant, mutate the line it covers and
run the suite. If nothing else goes red, it was not redundant. Two agents reaching the
same wrong conclusion is one wrong argument copied, not corroboration.

Corollary from the same review round: I nearly shipped prefix normalisation inside an
admin check, inferred from a single test fixture. Nothing in src/ constructed an Actor
at all. A convention seen only in test data is not a contract, and a security check is
the worst place to guess one.

## Resolve a ref against the authoritative remote, not against a working repo

A scratch clone taken from a local working copy inherits that copy's
remote-tracking refs. `origin/<branch>` inside it is as old as the last fetch the
source repo ran, which may be hours. Every command against it can be correct and
every one of them points at the wrong repository.

Clone from the authoritative remote, or fetch in the scratch copy before reading
anything. Then name the remote you checked inside the finding itself, so a reader
can tell which repository the claim is about. "Line 6 still reads localFence" is
not a fact until it says where line 6 was read.

## A defect that matches half of what the author described is a staleness signature

Tonight a branch was reported as missing a two part fix. Applying the described
fix to the reported tree left exactly one failure, and that failure was the second
half of the same description. A tree that is missing a change does not reproduce
half of it.

So when a report contradicts an author's account but lines up with part of it,
suspect the ref before the account. A wrong claim and a stale checkout look alike
from a distance; what separates them is that staleness reproduces the earlier
state exactly, including the parts nobody disputed.

## Read the commit, not a checkout

`git show <sha>:<path>` answers what a commit contains. A working tree answers
what a working tree contains, which is the commit plus whatever is uncommitted,
unpushed, or fetched at a different time. The second is what produced every
stale-ref mistake in this repo today, in both directions. See "Check a claimed
commit, and say what the check actually proves" above.

Cite the sha and the path. It is the cheaper check whoever turns out to be stale,
and it costs nothing when everyone is current.
## Two branches each doing the right thing can still be wrong together

2026-09-12, E1. A5's turn fenced the customer message. While it sat in review,
#15 landed on main and moved fencing to the webhook call site. Each branch was
green and each was correct alone. Merged, a customer message reached the writer
wrapped in two nonces, and no test on either branch could see it, because
neither ran both.

The integration ticket is the first place a pair like that is observable, so it
owns the decision about which side keeps the behaviour. Look for duplicated
responsibility at every seam the merge joins, not only for conflicts git
reports. Git had nothing to say about this one.

## Order the write after the effect it is supposed to record

Same lane. `customerTurn` stored the next conversation state and then sent the
reply. A Telegram refusal threw, so the reply was lost and the state had already
advanced: an escalation left `escalated: true` with the customer never told, and
the update id was claimed before the turn ran, so the retry was deduped and
dropped. Sending first costs nothing and leaves a refused reply recoverable on
the customer's next message.

## A wrong default is invisible in exactly the place it matters

Same lane, from the brief. `route.ts` defaulted `turn` to `silentTurn`, so
production acknowledged every customer and answered none. The repo had already
shipped this shape once, an identity-cast fence defaulting to a no-op. Tests
pass because tests always inject the real thing. Assert the default itself:
build the production seam with no arguments and prove it calls out.

## A test that names a behaviour is not a test that checks it

2026-09-12, E1 review. "The default turn is the real one, because a silent
default is a bot nobody notices is dead" asserted only that some call reached
openrouter.ai. A bot whose every model call returns 500 satisfies that: extraction
throws, the turn escalates, the writer throws, the reply is null, nothing is
sent. The last hop of the ticket had no test at all, and dropping the send's
transport argument survived the suite.

Assert the end of the path, not evidence that the path was entered. Where a name
promises reaching something, name the thing and assert that URL.

## Deriving an expectation from the code under test proves only that it agrees with itself

Same review. `vertical.test.ts` computed its expected price by calling `priceFor`
and `totalOf`, the two functions the test exists to pin. Doubling every price in
the seed left all five tests green. One written-out constant, 45000, kills it.

The paired trap: the fixture the whole suite leaned on was a `vatIncluded: true`
row, so the one end to end test for "comes back with a VAT inclusive price" never
once multiplied by the rate. Check that the fixture exercises the arithmetic the
test is named after.

## A stubbed model proves the wiring and nothing about the product

2026-09-12, the production silence. 699 tests were green while a customer who
answered Dante's own follow-up question was asked the same three attributes
again, forever. Every test fed extraction one message and read back one answer,
so no test ever ran a second turn with the state the first one produced.
`TurnState` carried `asked`, `escalated` and `introduced`, and not one of the
attributes the customer had already stated.

The bug was invisible to a stub because a stub answers the way the test asked.
Only a live model, handed the customer's second sentence, returns a quote intent
carrying the finish alone, which is the shape that loses the other three.

Write an eval that drives the real route with real models, and assert a whole
conversation rather than a turn: the customer reaches a price, within a bounded
number of replies, without being handed to a human. `bun run eval`.

## A role decides what a person may change, never whether they are answered

Same day. The owner's text reached `adminTurn`, `readAdminAudio` returned null
for anything that was not a voice note, and the turn returned without sending.
The only admin in production got silence for every message he ever typed, and
the dispatch had no fallback.

Gating the channel on the role gates the answer too. Gate the write instead: the
owner is quoted like anybody else, and a price change he types is pointed back
at the audio, which is the only route that can write. Escalating him there would
have ended the conversation he tests the shop from.

## Memory in one phase changes the guard in another

2026-09-12, Observational Memory. Giving the writer a past did not break the writer. It broke
`amountsHold`, three files away, which allowed a reply to carry only numbers from this turn's
answer or this turn's message. That held exactly as long as the writer had nothing to refer to.

With a memory the writer says "las 1000 tarjetas" in a turn whose message never repeats the
quantity, and "te había cotizado $45.000" a turn after the quote. Both were refused, and a
refused reply is silence and a dead conversation, which is the bug this same session had just
finished fixing.

`bun test` stayed green through all of it. The eval found it, twice, because it drives real
models over a real conversation. When you widen what a component knows, list what elsewhere was
narrow *because* it did not know that.

## When the user names a product feature, read its docs before designing

Same day. "We should have observational memory" read as three different things, and I asked
which. The answer was a URL: it was Mastra's own feature, with a name, a version, defaults and
a config shape. Nothing I would have designed from the phrase resembled it.

Install the vendor's skill or fetch the vendor's docs first, then ask the questions the docs
cannot answer. The two that mattered here were product decisions the docs never address: may an
LLM-written observation set an attribute that becomes a price, and what is the memory for.

## A new demo beat is a change to the demo, so the eval decides where it goes

2026-09-12. Loading the facts bought the demo an exchange that shows the "does not invent"
pillar instead of narrating it: the hours are answered, a branch in the north is not. I put it
between action 1 and action 2 because that is where it reads best.

`bun test` stayed green. `bun run eval:demo` failed ten checks. The second question escalates,
an escalated conversation is over (ADR 0011), and "dale, la quiero" got silence: no order, no
deposit, no receipt, no work order. On stage that is the whole money path gone, two minutes in.

Two patterns out of it.

A beat that escalates goes last, or it ends the demo. Write the placement argument into the
runbook next to the beat, not into a commit nobody opens at showtime.

And the eval is not a rehearsal of the code, it is the rehearsal of the run sheet. When the run
sheet grows a step, the eval grows the same step in the same position, or the next person
rehearses something the demo is not.

## A free string in a schema of enums is the field that guesses

Same beat, found by the same eval on the second run. `factKey` was the one open string in an
extraction schema where the family, the attributes and the add-ons are all enums built from
the loaded catalog. The model returned a key the seed did not have, so a loaded fact read as
unknown and the shop escalated its own opening hours. It answered correctly on the run before,
which is worse than failing: one run in two.

ADR 0005 already said an attribute no family declares cannot be extracted at all. The same rule
was never drawn for a fact key. When a lookup is keyed on a model's word, constrain the word to
the keys that exist, and fall back to the open string only when there are none.

## A premise a document in hand can settle is not a premise to argue

2026-09-12. ADR 0003 decided the price list is already gross and reasoned from a general fact:
"in Argentina a shop does not publish a price without tax". It closed by saying it needed one
confirmation from Javier. The confirmation had been sitting in the client repo since 2026-09-10:
`lista-precios.html` says "Los precios no incluyen IVA" in its header and repeats it in the
clarifications. This shop is one of the ones that does.

The cost was a quote 21% under the shop's own price, in every conversation, for two days,
behind a green suite. Nothing could catch it: every test asserted the number the seed declared.

When an ADR names a premise and says it needs confirming, go and get it before writing the
decision, especially when the client repo holds the document that settles it. And notice what
the reasoning is made of: "usually true about shops like this" is a guess with a citation voice.

## A recommendation about words needs the words in front of you

2026-09-12. `namesFamily` refused "subime las tarjetas full color" because the folletos label
carries "full" and "color". I proposed fixing it by dropping from each label any word another
label also has. No two of the three labels share a word, so the fix would have changed nothing.
The overlap was between the message and a label, never between labels.

I had read the three labels earlier in the same session and reasoned about them from memory.
Print the strings and run the comparison before recommending a rule over them: a rule about text
is cheap to test and the test is what tells you which strings actually collide.

## `cat > file` is not a way to create a file

2026-09-12. Writing a new test with `cat > test/storage/sqlite.test.ts` overwrote a file that
already held two foreign-key tests. The suite went green and the count went up, because the two
new tests outnumbered what they replaced, so nothing said anything was gone. Only `git diff
--stat` showing deletions on a file I believed was new caught it.

Check the path exists before writing to it, and read a diffstat for deletions in files you meant
only to add to. A passing suite does not prove you did not delete a test: it proves the tests
that are still there pass.

## "The demo runs" only covers the paths the runbook walks

2026-09-12. `eval:demo` came back 37/37 and I reported the demo was ready. Javier then typed
`hola` as the owner and got the customer's greeting plus the customer's handoff line. Worse,
his next two messages got nothing at all: the greeting extracted as `other`, escalated, and
ADR 0011 closed his conversation for the life of the process. One message bricked the channel
the shop is run from.

Nothing was wrong with the eval. It mirrors `docs/demo-live.md`, and in the runbook the owner
only ever sends a voice note and presses a button. So the owner's *text* path had no coverage
anywhere, and the suite was green because no test asked the question.

Before calling a demo ready, list the roles the system has and ask what each one can send that
the script does not. Here it was two roles times four message kinds, and the runbook exercised
five of the eight cells. A green eval says the rehearsed path works, never that the unrehearsed
one does, and the first thing anybody does with a chat bot is say hello to it.

Related: an escalation rule inherited by a second role is worth re-reading as that role. ADR
0011 is right for the customer it was written for and was never reconsidered for the owner, who
is the person it hands conversations to.

## A fixed sentence written for one turn reads as a stall on the next

2026-09-12. ADR 0026 gave the owner "¿En qué te puedo servir?" for every message the engine
cannot read. On the first message it is a greeting. On the second it is a bot with nothing to
say, and he said so: "Dante has to have conscience of what he can do." The same sentence also
offered twice inside the greeting, "estoy a tu servicio" then "en qué te puedo servir".

Two habits come out of it. Read a canned reply twice in a row before shipping it, because the
second reading is the one the user gets when their message does not parse. And when a fallback
has nothing to answer, spend it on what the channel *can* do instead of asking the question
again: the three clauses that replaced it are the three capabilities the code actually has, and
the test pins them so a fourth cannot be promised.

One offer per sentence. `servicio` and `servir` in the same breath is the same offer twice.

## The silence a guard produces is the failure nobody sees

2026-09-12. ADR 0010's amount guard refused any reply carrying a number the engine had not
given, and answered the refusal with silence. On the ask branch no amount is allowed at all, so
a writer offering "¿1000 o 2000?" lost the whole reply and a client's first message got nothing.
The guard was correct and the outcome was a dead bot in front of a customer.

A refusal needs a fallback, not an absence. The writer-failure branch two lines above it already
had one: DELEGATE, a constant with no number in it. Two branches of the same function disagreed
about what a customer is owed when the shop cannot answer, and only one of them was ever read.

Whenever a check can reject, ask what the user sees when it does. "Nothing" is an answer that
has to be chosen on purpose, and it almost never survives contact with a live demo.
