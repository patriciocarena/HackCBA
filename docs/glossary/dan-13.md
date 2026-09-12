# Glossary, D1

Terms this lane decides. They belong in `CONTEXT.md`; they live here because four lanes
editing that file is four conflicts. The orchestrator promotes them.

**Fence**:
The block a piece of untrusted text is wrapped in before any model reads it. `fence()` is
the only thing that builds one, and the only thing that builds an `UntrustedText`. See
ADR 0008.
_Avoid_: Wrap, escape, sanitise, quote

**Nonce**:
The keyed digest of the label and the text, carried by both delimiters of a fence. The key
is what makes it unforgeable: without it a customer can compute the delimiter of any block
they like, including one labelled `facts`. A wrong nonce is a visible forgery, a right one
is not a forgery at all.
_Avoid_: Token, salt, marker

**Fence secret**:
The process key the nonce is derived under, `FENCE_SECRET` or thirty two random bytes when
it is unset. It never appears in a block, only in the digest of one.
_Avoid_: Password, token

**Label**:
The word a fence names its contents with, such as `message`, `transcript` or `facts`. One
prompt carries several blocks and the label is how the model tells them apart.
_Avoid_: Tag, kind, type

**Splice**:
Manufacturing a delimiter by deleting one, because removing a substring joins the halves
around it into a new one. It is the reason a fence sanitises nothing.
_Avoid_: Injection, escape bug
