# Glossary, DAN-15

Terms this ticket decides. The orchestrator promotes them into `CONTEXT.md`.

**Allowlist**:
The closed set of Telegram user ids a deployment trusts as the owner. It is configuration, not
shop data, and it is read before anything it guards. A sender outside it is a customer, whatever
the message says.
_Avoid_: Whitelist, admin list, ACL, permissions

**Fail closed**:
The property that every way of not having an allowlist denies every sender. Unset, empty,
whitespace and unreadable all mean nobody, and none of them means everybody. Absent is empty,
and empty is not "no restriction".
_Avoid_: Fail safe, default deny, safe default

**Admin**:
A sender whose id is in the allowlist. The role the sender claims is not it, and neither is the
content of the message. `ROLES` carries the name; the allowlist decides who holds it.
_Avoid_: Owner, superuser, operator
