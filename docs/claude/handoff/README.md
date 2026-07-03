# Cross-surface handoff docs

This folder is the mailbox between Claude surfaces (chat ⇄ Cowork ⇄ Claude Code).
A handoff doc captures a decision or spec made on one surface so another surface can
pick it up with zero re-explaining.

## How to use

1. **Author** (usually chat/Cowork): copy `TEMPLATE.md` → `<short-topic>.md`, fill it in,
   commit it (via the GitHub connector, a quick Claude Code session, or paste it to
   whoever commits next).
2. **Implementer** (usually Claude Code): read the doc, do the work on a `claude/*`
   branch, and update the doc's `Status` line in the same PR.
3. **Completion**: when the PR merges, the handoff doc is deleted in that PR (or a
   follow-up). Anything worth keeping permanently moves to `CLAUDE.md` or `docs/`.

## Rules

- One doc = one unit of work. Split big efforts.
- `Status` must always be accurate: `Draft` → `Ready` → `In progress (<branch>)` → `Done (PR #N)`.
- Keep it under a page. Link to chats/designs rather than pasting walls of text.
- Never put secrets in a handoff doc — reference `.env.example` names instead.
