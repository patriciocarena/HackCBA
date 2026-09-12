# Corrections, lane A3

## The scope of a ticket is its Done when line, not its brief

A3's Done when is the DDL running twice. I built a Litestream replica, a sidecar and a test
that downloaded a binary, on the strength of one line in the lane brief. The orchestrator cut
all of it: replication is A1's deployment, and the three lanes blocked behind A3 needed the
schema and the storage functions, not a second copy of the database.

Read the tracker's Done when first, and when a brief adds to it, ask what the lanes waiting on
you actually cannot compile without.

## A worktree's node_modules is a symlink, and `node_modules/` does not match it

The ignore rule ended in a slash, so it matched a directory and not the link a worktree gets.
`git add -A` committed the symlink. Worse, a later commit deleting it made the rebase delete
the link from disk, and every command that needed a dependency failed until it was recreated.

Ignore rules meant for both shapes carry no trailing slash.

## Check what the siblings wrote before naming your seam

Two ports were already declared and defaulted closed, with `ponytail:` comments naming A3 as
the owner of the table. Grepping for those comments found the exact signatures to implement.
A seam designed without reading them would have been a second one.
