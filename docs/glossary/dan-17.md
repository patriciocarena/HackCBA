# Glossary, DAN-17

Terms this ticket decides. They belong in `CONTEXT.md`; they live here because four lanes
editing that file is four conflicts.

**Extraction**:
The first phase of a turn. One model call with a structured output and no tools, which reads
one fenced message into an `Intent`. It reports what it heard and never what a family
requires.
_Avoid_: Parsing, understanding, NLU

**Resolution phase**:
The middle phase of a turn. Pure, no model, no clock, no network: it switches on the intent
kind and calls `priceFor` or `answerFromFacts`. Every amount Dante says is born here.
_Avoid_: Business logic, processing

**Writing**:
The last phase of a turn. One model call that turns a `Resolution` into Spanish. It receives
the amount already computed and already formatted, and is checked against it.
_Avoid_: Generation, response, rendering

**Allowed amount**:
The set of pesos amounts a reply is permitted to contain, decided by the resolution before
the writer runs. Exactly one for a price, empty for everything else. A reply carrying any
other amount is not sent.
_Avoid_: Validation, sanity check
