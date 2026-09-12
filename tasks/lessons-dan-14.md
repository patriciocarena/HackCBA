# Lessons, DAN-14

**`git add -A` in this worktree commits the `node_modules` symlink.** The repo ignores
`node_modules/`, with a trailing slash, and the worktree's `node_modules` is a symlink to
the main checkout, which that pattern does not match. Stage paths, or check
`git diff --stat` before pushing. It reached the branch once and was removed in a follow
up commit.
