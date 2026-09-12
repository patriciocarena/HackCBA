# Live demo, five minutes, two accounts

Five live actions: three from the client, two from the owner. Everything else is narration.

The arc is one sentence: the client buys and pays without a person, the owner moves his
price list by talking to it, and the order that was already sold does not move with it.

`docs/demo.md` is the six step recorded version and it is stale in two places: the webhook
route is deployed (`POST /telegram/webhook` answers 401, not 404), and dan-34 and dan-37
are merged, so step 6 completes. Read this file for the live run.

## The two chats

| Chat | Who | Actions |
|---|---|---|
| C | The client account, private chat with the bot | 1, 2 and 5 |
| O | The owner account, private chat with the bot | 3 and 4 |

C and O are different Telegram accounts. An account on `TELEGRAM_ADMIN_IDS` is `admin` in
every private chat it opens, so the owner cannot play the client
(`src/telegram/webhook.ts:48`).

Both screens have to be visible at once. Two phones side by side, or two Telegram Web
windows. Action 2 and action 4 both pay off on the other person's screen.

## The five actions

### 1. C asks for a price, 40 seconds

Paste in C:

```
hola, cuánto 1000 tarjetas
```

Then, after the reply:

```
1000, ilustración 350, frente full color y dorso en escala de grises, sin terminación
```

Dante introduces itself by name, asks for the three missing attributes in one message, and
quotes `$54.450` final with VAT included, valid 15 days. Per ADR 0021 the greeting names
Dante and the shop and does not say it is automated.

The second paste repeats `1000` on purpose. Without it Dante asks for the quantity again
and the action spends a turn it does not have.

Say: the number comes out of a pure function over rows the owner typed. The model gets the
amount as data and writes the sentence around it. It has no tool that could invent one.

### 2. C accepts and pays, 50 seconds

Paste in C:

```
dale, la quiero
```

Dante creates the order at `$54.450`, names the deposit alias and asks for the receipt.
Send the prepared receipt photo from C.

On C's screen: Dante thanks them, says the seña is confirmed and that the order is in
production. It is a fixed sentence from `src/conversation/receipt-path.ts`, not a model, so
it cannot invent an amount or a delivery date on camera.

On O's screen: the receipt notice and the work order with `Cobrado: $54.450, seña
confirmada.` Either can land first. The job is sent from a confirm the domain makes
synchronously and the notice is awaited after it, so the order is the runtime's, not a
promise. Do not narrate one as following the other.

The two screens read differently on purpose. The owner is told what was checked and what
was decided, because he is the one who acts on it. The customer is thanked. A refusal is
one sentence to them either way, with no reason, because the reasons name what the image
claimed and the image is a stranger's.

Say: nobody pressed anything. The agent read the photo, checked the amount against what
the order owes and the destination against the alias it gave, and confirmed. The amount it
prints is the order's own breakdown, never the number in the image.

Both screens move. The client's line is a fixed sentence, sent after the owner's and never
instead of it (`src/conversation/receipt-path.ts`, `reply`). A chat that refuses the message
still leaves a recorded receipt and an owner who was told.

### 3. O raises prices by voice, 60 seconds

From O, send `fixtures/raise-cards.opus` as a voice note. Play it from the laptop and hold
the Telegram voice button while it plays. Do not attach the file: a document never reaches
the turn.

Dante answers with a proposal, not a change: 14 rows, each with its old and new price. The
row from action 1 reads `$45.000 → $54.000`. Those are list prices, net: the diff is the
owner's list and not a quote. Nothing has moved yet.

This action spends about 20 seconds waiting. Five on the audio, two on the upload, two
fetching the file back, three to six transcribing, three extracting. Fill it: this is the
one thing the owner could never do before. The price list is 40 pages and every update was
done by hand, product by product. That is why he killed the old bot.

### 4. O confirms, 30 seconds

Press `Lo aplico`.

The catalog moves. A version is written with who confirmed, when, and the Telegram media
id of the audio.

Say: six months from now, the answer to who raised this price is a recording of him saying
it.

Then point at the work order still on O's screen. The list went up 20% thirty seconds ago
and the sold order still reads `$54.450`. The breakdown was copied when the price was
agreed.

### 5. C asks what the shop is, 25 seconds

Last, and last on purpose. Read the warning under it before you move it.

Paste in C:

```
¿qué horario tienen?
```

Dante answers with the hours, because the owner confirmed them on 2026-09-10 and they are
loaded (`seed/facts.json`).

```
¿y tienen sucursal en el norte?
```

Dante hands the conversation to a person, and says so as the shop rather than as a bot: it
confirms with the local and answers in a while. The fact exists in the seed with no value,
because nobody confirmed it, and a value nobody confirmed is never filled in with something that
sounds right.

Say: the bot before this one answered that question. It invented branches, and customers
drove to them. This one knows the difference between a fact it was given and a sentence that
sounds right, and the second one is always a person.

Why it is last: an escalated conversation is over (ADR 0011), so the second paste kills chat
C. Run this before action 2 and "dale, la quiero" gets silence, the order is never born and
the receipt has nothing to confirm. Rehearsed in that position it took ten checks down with
it. It goes after action 4 or it does not go.

Extraction can only name a key the shop loaded (`extractionSchema`), so "horario" and "hours"
are not two answers to the same question. Without that the hours missed on one run in two.

## The 80 seconds around the actions

Open, 40 seconds. Three people answer WhatsApp all day. The AI before us lasted five
months: it invented branches in the north, it quoted a 1.500.000 job at 14.000, and
customers walked into the shop holding a phone with the fake quote on screen. It did not
fail at selling. It failed by speaking with confidence about what it did not know.

Close, 40 seconds. Dante has no tools. A turn is three phases and the middle one never
sees a model: extraction, then SQL plus `priceFor`, then writing. Exact match or escalate.
What is not loaded as a fact, Dante does not know, and not knowing it means handing the
conversation to a person. Escalation rate is the honest measure of catalog coverage, and
it is high on purpose at the start.

If there is a terminal on screen, run `bun test test/security/adversarial.test.ts` while
you say it. Five injections through a real turn. That is the cheapest way to show the
"does not invent" pillar without spending a live action on a chat that goes quiet.

## Timing

| Beat | Open | 1 | 2 | 3 | 4 | 5 | Close |
|---|---|---|---|---|---|---|---|
| Seconds | 40 | 40 | 50 | 60 | 30 | 25 | 40 |

Total 4:45. The 15 seconds left are thin, so action 5 is the first thing the clock takes
back, and it is also the one that leads straight into the close.

## Before you start

### The receipt photo

```
bun scripts/make-receipt.ts
```

It renders `fixtures/receipt.jpg` from `DEPOSIT_ALIAS`, so the image cannot drift from the
alias the app is configured with. Re-run it if the alias changes.

The vision path confirms only on an exact match: the amount has to equal what the order
owes and the destination has to equal the alias, compared case insensitively after trimming
(`src/domain/deposit.ts`, `sameDestination`). A different amount is `wrong_amount`, a
different alias is `wrong_destination`, and either prints "no lo confirmé" on the owner's
screen instead of the work order.

`DEPOSIT_ALIAS` is a 22 digit CBU. The model read it back exactly in every eval run against
the generated image, and a photograph of a phone screen is a harder read than that file. If
there is an alias like `dante.imprenta.mp` available, it is the safer thing to demo on.

Three photos per order is the ceiling and the fourth is kept but never read
(`src/conversation/receipt-path.ts`, `MAX_READINGS`), so do not burn the budget rehearsing
on the order you will demo.

Send the image from C's gallery as a photo, not as a file. A document is not a photo and
the route reads only photos (`src/telegram/update.ts`, `mediaOf`).

### Environment

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ADMIN_IDS` (O's numeric id, not
C's), `FENCE_SECRET`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `DEPOSIT_ALIAS`,
`OWNER_CHAT_ID`, `ELEVENLABS_API_KEY`, `ELEVENLABS_MODEL_ID`, `TRANSCRIPTION_LANGUAGE`.

A malformed admin id throws at boot and the route is built at module load, so a typo is a
service that does not start.

In BotFather, `/setprivacy` Disable is only needed for group chats. This run uses two
private chats, so it is not required.

### Fifteen minutes before, off camera

```
bun run eval:demo
curl https://dante-multimpresos.fly.dev/health/db
```

`bun run eval:demo` is these five actions, in this order, against one bench: the two
pastes, the acceptance, the receipt, the voice note and the press, with real OpenRouter,
real ElevenLabs and real pricing, and only Telegram stubbed. It prints every reply it got,
so a rehearsal is reading its output rather than holding two phones. `bun run eval` is the
older pair of flows, on the same bench, and `bun run eval:families` is the other two loaded
families on it.

`health/db` returns a beat counter. If it does not climb, the deploy is not live.

Two things the eval cannot check. It stubs Telegram, so nothing it prints proves what a
phone renders. And it serves `fixtures/receipt.jpg`, not a photo taken of a screen, so it
proves the vision path reads a clean render and not a glare.

`bun test` is the wiring, not the models.

The writing model still wraps the amount in markdown sometimes. Replies are sent with no
`parse_mode`, so the markers used to reach the phone; `plainText` in `src/telegram/send.ts`
takes them off now. A lone asterisk is left alone on purpose, so a multiplication sign in
somebody's text survives.

Every chat gets the "escribiendo..." indicator before the turn runs
(`src/telegram/webhook.ts`). Telegram clears it after five seconds, so on the voice path it
goes dark well before the proposal lands. Do not narrate it as a progress bar.

### The reset

```
fly apps restart -a dante-multimpresos
```

Every conversation, every held quote and every order is in memory
(`src/conversation/customer-turn.ts:14`, `src/conversation/sale.ts`). Restart once before
action 1 and never again. A restart between actions loses the quote, and action 2 needs
it.

Do not deploy after this point. A deploy is a restart.

## What to cut if the clock runs out

Cut action 5 first. It is the last thing on the clock and the close says its argument
anyway, in words.

Then cut action 2, not action 3. Action 3 is the owner running his own price list by talking
to it, and action 4 means nothing without it. Action 2 is the strongest beat for the judging
question about autonomy, so cut it only if the receipt photo failed in rehearsal, and say in
one sentence what it does.

Never cut the close. The architecture line is the reason the demo is believable.
