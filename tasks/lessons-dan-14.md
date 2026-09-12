# Lessons, DAN-14

**`git add -A` in this worktree commits the `node_modules` symlink.** The repo ignores
`node_modules/`, with a trailing slash, and the worktree's `node_modules` is a symlink to
the main checkout, which that pattern does not match. Stage paths, or check
`git diff --stat` before pushing. It reached the branch once and was removed in a follow
up commit.

**No session id or URL in a commit message.** The harness offers a `Claude-Session:`
trailer; the brief and `CLAUDE.md` both forbid it, and the brief wins. Eleven commits
carried one before a push caught it. Write the trailer nowhere, not strip it later.

**A fence brands, it never edits.** Stripping characters from untrusted text corrupts what
it carries: "tarjetas <5cm y >2cm" became its opposite, in the audit record too.

**Bound a retry window by time, not by count.** Telegram retries for 24 hours, so a claim
set capped at N entries drops a claim while its retry is still in flight.
