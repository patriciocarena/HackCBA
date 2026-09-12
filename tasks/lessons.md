
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
