# Live demo, five minutes, two accounts

Four live actions: two from the client, two from the owner. Everything else is narration.

The arc is one sentence: the client buys and pays without a person, the owner moves his
price list by talking to it, and the order that was already sold does not move with it.

`docs/demo.md` is the six step recorded version and it is stale in two places: the webhook
route is deployed (`POST /telegram/webhook` answers 401, not 404), and dan-34 and dan-37
are merged, so step 6 completes. Read this file for the live run.

## The two chats

| Chat | Who | Actions |
|---|---|---|
| C | The client account, private chat with the bot | 1 and 2 |
| O | The owner account, private chat with the bot | 3 and 4 |

C and O are different Telegram accounts. An account on `TELEGRAM_ADMIN_IDS` is `admin` in
every private chat it opens, so the owner cannot play the client
(`src/telegram/webhook.ts:48`).

Both screens have to be visible at once. Two phones side by side, or two Telegram Web
windows. Action 2 and action 4 both pay off on the other person's screen.

## The four actions

### 1. C asks for a price, 40 seconds

Paste in C:

```
hola, cuánto 1000 tarjetas
```

Then, after the reply:

```
1000, ilustración 350, frente full color y dorso en escala de grises, sin terminación
```

Dante introduces itself as automated, asks for the three missing attributes in one
message, and quotes `$45.000` final with VAT included, valid 15 days.

The second paste repeats `1000` on purpose. Without it Dante asks for the quantity again
and the action spends a turn it does not have.

Say: the number comes out of a pure function over rows the owner typed. The model gets the
amount as data and writes the sentence around it. It has no tool that could invent one.

### 2. C accepts and pays, 50 seconds

Paste in C:

```
dale, la quiero
```

Dante creates the order at `$45.000`, names the deposit alias and asks for the receipt.
Send the prepared receipt photo from C.

On O's screen: the receipt notice, then the work order with `Cobrado: $45.000, seña
confirmada.`

Say: nobody pressed anything. The agent read the photo, checked the amount against what
the order owes and the destination against the alias it gave, and confirmed. The amount it
prints is the order's own breakdown, never the number in the image.

Warning for the narration: the client gets no reply after the photo. Only the owner's
screen moves (`src/conversation/receipt-path.ts`, `receiptTurn` returns before the turn).
Either say so out loud, or land a one line acknowledgement to the client before the demo.

### 3. O raises prices by voice, 60 seconds

From O, send `fixtures/raise-cards.opus` as a voice note. Play it from the laptop and hold
the Telegram voice button while it plays. Do not attach the file: a document never reaches
the turn.

Dante answers with a proposal, not a change: 14 rows, each with its old and new price. The
row from action 1 reads `$45.000 → $54.000`. Nothing has moved yet.

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
and the sold order still reads `$45.000`. The breakdown was copied when the price was
agreed.

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

| Beat | Open | 1 | 2 | 3 | 4 | Close |
|---|---|---|---|---|---|---|
| Seconds | 40 | 40 | 50 | 60 | 30 | 40 |

Total 4:20. The 40 seconds left are for one thing going slower than it did in rehearsal.

## Before you start

### The receipt photo, the one thing to prepare

The vision path confirms only on an exact match. The image has to show the amount `45.000`
and the destination alias exactly as `DEPOSIT_ALIAS` is set, compared case insensitively
after trimming (`src/domain/deposit.ts:207`, `sameDestination`). A different amount is
`wrong_amount`, a different alias is `wrong_destination`, and either one prints "no lo
confirmé" on the owner's screen instead of the work order.

Make the image now and send it through the real path once. Three photos per order is the
ceiling and the fourth is kept but never read
(`src/conversation/receipt-path.ts`, `MAX_READINGS`), so do not burn the budget rehearsing
on the order you will demo.

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
bun run eval
curl https://dante-multimpresos.fly.dev/health/db
```

`bun run eval` drives the real route with real OpenRouter and real ElevenLabs, Telegram
stubbed. It is the only pre-flight that proves the models answer. `health/db` returns a
beat counter; if it does not climb, the deploy is not live.

`bun test` is the wiring, not the models. Rate limiting is mid-TDD locally, so four tests
in `test/telegram/webhook.test.ts` fail on an unclean tree. That does not affect the demo.

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

Cut action 2, not action 3. Action 3 is the owner running his own price list by talking to
it, and action 4 means nothing without it. Action 2 is the strongest beat for the judging
question about autonomy, so cut it only if the receipt photo failed in rehearsal, and say
in one sentence what it does.

Never cut the close. The architecture line is the reason the demo is believable.
