# Glossary, DAN-14

Terms this ticket decides. The central glossary is `CONTEXT.md` and it stays central.

**Update**:
One delivery from Telegram, carrying an `update_id` and at most one message. It is the
wire shape, not the domain: the webhook reads it once and turns it into an inbound
message.
_Avoid_: Event, webhook payload, notification

**Inbound message**:
What Dante received, after the update has been read: the conversation it belongs to, the
role of whoever sent it, its fenced text and its media id. It is what the turn is handed
and what is recorded.
_Avoid_: Incoming message, request, payload

**Claim**:
Marking an `update_id` as handled. The claim and the question "was it already handled" are
one call, so two concurrent deliveries of one update cannot both find it free. A claimed
update is acknowledged and runs nothing.
_Avoid_: Dedupe, idempotency check, lock

**Secret header**:
`X-Telegram-Bot-Api-Secret-Token`, which Telegram echoes back from `setWebhook`. It is the
only authentication the route has, so it is compared in constant time and before anything
else reads the body.
_Avoid_: Token, api key, signature
