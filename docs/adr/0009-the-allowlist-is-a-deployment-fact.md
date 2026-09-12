# 9. The admin allowlist is a deployment fact, and a list we cannot read denies everyone

Date: 2026-09-12

## Status

Accepted.

## Context

`TICKETS.md` blocks D2 on A3, the storage seam, which reads as the allowlist being a table
the owner edits. It is the wrong place for it on three counts.

It is a deployment fact, not shop data. Items, facts and orders are what the shop sells and
knows; who may command the bot is what the deployment grants. They change on different days
for different reasons.

It has to answer before the database exists, because the allowlist is what decides who may
write to the database. A check that depends on the thing it guards has no answer during boot,
during a migration, or during the failure where it matters most.

And a table the owner can edit is a table an attacker who reaches the database can edit. One
compromise would become admin. `docs/amenazas.md` case 2 is exactly that attacker, arriving
from a number that is not Javier's.

The usual bug in this shape is not a wrong list. It is an unset variable parsing to an empty
list and an empty list being read as no restriction, which turns the guard into a pass.

## Decision

`TELEGRAM_ADMIN_IDS` is a comma separated list of Telegram user ids, read once into a set when
the predicate is built. `adminAllowlist` returns `(telegramUserId: string) => boolean`, the
type A4 injects. There is no `src/security/index.ts`, because D1 is writing `fence.ts` in the
same directory and a barrel is the one file both lanes would edit.

Absent is empty, and empty allows nobody. Unset, empty and whitespace all produce a predicate
that answers false to every sender.

Entries are trimmed and empty segments are dropped, because a trailing comma is punctuation
and not intent. An entry that survives trimming and is not a positive decimal integer, with no
leading zero and at most the nineteen digits Telegram reserves, voids the whole list. Partial
trust in a security list is not trust, and a typo that silently drops one admin looks like a
list that worked.

Membership is set equality against the string the caller passed. We trim what the owner typed
because it is configuration. We never trim, pad or otherwise normalise what arrives from
outside, so `" 123 "` denies, and `"123"` denies against an allowed `"1234"` because a set is
not a substring search.

Recording a denial is a required field of the config, not an option, so no construction site
can quietly skip the Done when line that asks for it. The record carries the id when the id is
a well formed Telegram id and null when it is not. Digits cannot carry an instruction, and an
operator needs them to tell one prober from many. Anything that is not digits is attacker
authored text and never reaches the record, not truncated and not escaped, because the log is
read by a person and by whatever reads the log next.

## Consequences

The list changes with `fly secrets set` and a restart, with no deploy and no migration, which
is the Done when line.

C4 gets a predicate it can trust before A3 lands, so the two tickets stop being a chain.

The cost is that the owner cannot add an admin from Telegram. That is the point: adding an
admin is a deployment action and it leaves a trace outside the system it grants power over.

Who a denial belongs to stays with the caller. This module reports that a check failed and
what is safe to say about the sender; C4 decides that the failed check was an edit attempt and
writes it where edit attempts live.
