# Lessons, DAN-15

`git add -A` inside a worktree staged the `node_modules` symlink. `.gitignore` carries
`node_modules/` with a trailing slash, which matches a directory and not a symlink, so the
symlink every worktree gets is untracked rather than ignored. Stage explicit paths in a
worktree. The trailing slash is the repo's to fix, not a lane's.

`requireEnv` throws when a variable is unset, which is right for a credential and wrong for an
allowlist. A guard that crashes the process when it is not configured is a guard that has an
outage where it should have a denial. Read the variable directly and let absent mean empty.

A required callback is not a guarantee that the right thing gets recorded. It is a guarantee
that every construction site records, including the ones that must not. `isAdmin` decides the
role of every inbound sender, so false is the normal answer and a mandatory sink on it recorded
every customer message as a denial. Put a side effect where the event it describes is known,
not where the boolean is computed.

Do not state a platform guarantee as the reason for a bound. Nineteen digits is the range of a
signed 64 bit integer; the Telegram Bot API only promises 52 significant bits. The bound was
right and the sentence justifying it was not.
