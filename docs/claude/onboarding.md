# Claude Cross-Surface Onboarding & Interconnectivity Runbook

This runbook makes Claude chat (claude.ai), Claude Cowork (desktop app), and Claude Code
(web / CLI / desktop) behave like one system for ReversR. The core idea:

> **The GitHub repo is the shared brain.** Every surface can read it, so context that
> matters gets written here — `CLAUDE.md` for durable project knowledge,
> `docs/claude/handoff/` for in-flight work.

## The three surfaces and what each is for

| Surface | Best at | Context source |
|---|---|---|
| **Claude Code on the web** (claude.ai/code) — *home base* | Implementation: features, fixes, PRs. Runs in a remote sandbox with the repo cloned. | Auto-loads `CLAUDE.md`; account connectors available automatically |
| **Claude chat** (claude.ai) | Thinking: specs, product decisions, research, drafting | claude.ai **Project** (see below) + GitHub connector |
| **Cowork** (Claude desktop) | Mixed work: local files, docs, email/calendar alongside code review | Local clone of this repo → reads `CLAUDE.md` |

## One-time setup per surface

### 1. Claude Code on the web (home base) — ✅ mostly done
- Repo already connected (`vsillah/reversr-rebuild`); sessions clone fresh and auto-load `CLAUDE.md`.
- Connectors (Gmail, Slack, Supabase, n8n, GitHub, Stripe, etc.) come from your
  claude.ai account and are available in every remote session — no per-repo config.
- Optional: add a SessionStart hook so remote sessions pre-install deps
  (`npm ci`) — ask Claude Code to run the `session-start-hook` setup if sessions
  keep hitting missing `node_modules`.

### 2. Claude chat (claude.ai)
1. Create a **Project** named "ReversR".
2. Paste the contents of `CLAUDE.md` into the Project's custom instructions
   (or link it: "Project context lives in CLAUDE.md of vsillah/ReversR-Rebuild — read it first").
3. Enable the **GitHub connector** for the project so chats can read live repo state.
4. When a chat produces a decision or spec worth keeping: end the chat by asking Claude
   to draft a handoff file (format in `docs/claude/handoff/README.md`), then start a
   Claude Code session with "implement docs/claude/handoff/<file>".

### 3. Cowork (Claude desktop app)
1. Install the Claude desktop app and sign in with the same account (vsillah@gmail.com) —
   connectors are account-level, so they carry over automatically.
2. Clone the repo locally: `git clone https://github.com/vsillah/ReversR-Rebuild.git`
3. Point Cowork sessions at that folder — it reads `CLAUDE.md` on its own.
4. If a connector that works on claude.ai is missing in Cowork: Settings → Connectors →
   enable it for desktop. Auth is per-surface even though the account is shared —
   this is the usual cause of "it works in chat but not Cowork".

### 4. Claude Code CLI (optional, for local dev)
1. `npm install -g @anthropic-ai/claude-code`, then run `claude` in the repo and
   log in with the same account.
2. `CLAUDE.md` is auto-loaded. For MCP servers, copy the example:
   `cp docs/claude/mcp.example.json .mcp.json` — it contains only OAuth server URLs
   (no secrets), and the CLI will prompt you to approve each server and authenticate
   in the browser on first use.
3. Add more servers with `claude mcp add` — prefer OAuth-based remote servers over
   pasting API keys.

## Connector parity checklist

Account-level connectors (configured at claude.ai → Settings → Connectors) are shared,
but each **surface** may need its own enable/auth pass. Verify each row once:

| Connector | claude.ai chat | Cowork | Claude Code web | Claude Code CLI |
|---|---|---|---|---|
| GitHub | ☐ | ☐ | ✅ (built-in) | via mcp.example.json |
| Supabase | ☐ | ☐ | ✅ | via mcp.example.json |
| Gmail / Google Calendar / Drive | ☐ | ☐ | ✅ | usually not needed |
| Slack | ☐ | ☐ | ✅ | usually not needed |
| Stripe / n8n / Canva / Gamma / Calendly / Read.AI | ☐ | ☐ | ✅ | as needed |

(✅ = verified working as of 2026-07-03 in the remote Claude Code environment.)

Troubleshooting a broken connector: disconnect and reconnect it at claude.ai →
Settings → Connectors (this refreshes OAuth), then restart the surface. Connector auth
tokens expire independently per surface; re-auth on the surface that's failing.

## The handoff loop (fixes "can't move work between surfaces")

```
 Claude chat / Cowork                     Claude Code (web)
 ────────────────────                     ─────────────────
 1. Discuss / decide / spec
 2. Write docs/claude/handoff/<topic>.md ──▶ 3. "Implement the handoff doc
    (commit via GitHub connector,               docs/claude/handoff/<topic>.md"
     or paste for Code to commit)            4. Branch → implement → PR
                                             5. Mark handoff doc ✅ Done in the PR
 6. Review PR in chat/Cowork  ◀──────────────┘
```

Rules that make it work:
- One handoff file per unit of work; template in `docs/claude/handoff/TEMPLATE.md`.
- The **implementing** session updates the handoff file's status — the doc always
  reflects reality.
- Durable knowledge graduates from handoff docs into `CLAUDE.md`; handoff docs are
  ephemeral and get deleted in the PR that completes them.
