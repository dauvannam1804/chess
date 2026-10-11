# chess

## Agent skills

### Issue tracker

Issues live in GitHub Issues, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role triage vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Working agreements

- `npm test` green before reporting work done. CI enforces test + typecheck + build + `npm run check:migrations` on main.
- Max 3 subagents in parallel — rate limits.
- Review-time rules live in `CODING_STANDARDS.md`.
