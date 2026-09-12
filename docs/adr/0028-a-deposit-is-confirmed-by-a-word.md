# 28. A deposit is confirmed by a word, not a button

Date: 2026-09-12

## Status

Accepted. Sits beside ADR 0014, which put the owner's price edits behind a button.

## Context

Javier typed `confirmado` in his own chat and read the introduction back. Two defects met there.

`Sale.confirmDeposit` had no caller. The comment in `src/telegram/route.ts` said so plainly:
"Nothing in src/ confirms a deposit yet". The only way into `deposit_confirmed` was
`confirmFromReceipt`, the vision path, which confirms on an exact match of amount and alias. A
receipt it refuses leaves the customer reading "lo estamos revisando en el local, te
confirmamos en breve" and nobody in the shop able to do it. The money path had one end.

The word then fell through to the customer turn, extracted as `other`, and came back as the
owner's fallback sentence. On his channel that is the greeting, so the answer to "confirmado"
was "¡Hola! ¿Cómo estás?".

ADR 0014 gives the price edits a button because a proposal is read back before it lands: Dante
computed the new prices, so the owner has to see them and press. A deposit is the other shape.
What he is agreeing to is a bank statement Dante never sees, so there is nothing to read back
and nothing to mint a button from. ADR 0013 already settled who reads it: the person confirming
reads the bank, never the photo.

## Decision

The owner's own words confirm a deposit. `claimsConfirmation` in
`src/conversation/owner-confirm.ts` reads "confirmado", "confirmo", "ya cobré", "entró la
plata"; `adminTurn` checks it before the customer turn, so the word never reaches extraction.

His chat carries no customer's conversation, so the order comes off `Sale.awaitingDeposit`,
derived from the orders the port already holds. One waiting is the one he means. More than one
is not a guess worth making with money: both ids are named and he says which, and an id that
matches nothing pending confirms nothing.

`printingSale` already wraps `confirmDeposit`, so the work order reaches him without this path
asking for one, and the customer is told on their own chat, read off the order's conversation
id. The customer's line goes after the owner's and a chat that refuses it does not undo the
confirmation, the same trade the receipt path makes.

The introduction now answers a greeting only. `introduced` lives in memory, so every deploy
makes his next message look like his first, and that is what turned one typed word into a
greeting.

## Consequences

Two roles reach `deposit_confirmed` and both print: the reader when the numbers match, the
owner when they do not. The allowlist is still what decides he may: `confirmDeposit` takes
`isAdmin` and the actor is the sender's Telegram id, never a word in the message.

A word is looser than a button. "confirmame el precio" matches nothing, because the alternation
names the endings and not the stem, but the class of mistake is real and a button does not have
it. What it buys is the step existing at all, on the channel he already types in, the night of
a demo.

The same message also stopped being eaten by the receipt path. While an order waited for its
deposit, `readReceipt` claimed any message carrying text: "quiero mil tarjetas más, serían
54450?" was recorded as a comprobante, answered "¡Gracias por mandar el comprobante!", and the
turn never ran. A photo is the transfer; typed, only a message that says the money moved is,
which is `claimsPayment` in `src/domain/deposit.ts`.

Both readers are regexes over the customer's and the owner's own words, which is the kind of
rule this repo otherwise refuses to invent. They are in `src/domain` and `src/conversation`
beside what they gate, with the phrases pinned by name in the tests, so a wrong reading is a
sentence and never a price or a state change.
