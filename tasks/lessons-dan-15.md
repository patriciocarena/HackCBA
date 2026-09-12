# Lessons, DAN-15

`git add -A` inside a worktree staged the `node_modules` symlink. `.gitignore` carries
`node_modules/` with a trailing slash, which matches a directory and not a symlink, so the
symlink every worktree gets is untracked rather than ignored. Stage explicit paths in a
worktree. The trailing slash is the repo's to fix, not a lane's.

`requireEnv` throws when a variable is unset, which is right for a credential and wrong for an
allowlist. A guard that crashes the process when it is not configured is a guard that has an
outage where it should have a denial. Read the variable directly and let absent mean empty.
