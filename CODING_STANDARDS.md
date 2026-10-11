# Coding Standards

Rules the reviewer enforces on every diff. Each entry records the build failure that earned it — don't relitigate without new evidence.

## chess.js: `move()` throws, never returns null

`chess.js` 1.x `game.move(x)` **throws** on illegal moves. A `=== null` check after it is dead code and hides the failure mode. Wrap the call in try/catch (or a shared safe wrapper) and handle the error path explicitly.

## Every queue/query method needs an empty-DB test

Beside the seeded tests, each TrainerService query that feeds a user-facing entry point must have a test on a **fresh, empty database**. The drill cold-start bug (new lines could never enter the drill queue because only pre-seeded schedule rows were selected) shipped through TDD and was caught only at review — the seeded tests could not see it.

## Timestamp conventions are per-table, by design

- `drill_schedule`, `endgame_schedule`: drizzle `integer` with `mode: "timestamp"` (unix seconds)
- `games.played_at`: SQLite `text` with `strftime('%Y-%m-%dT%H:%M:%fZ','now')` default

These are deliberate; each module's tests and backup round-trips depend on its own convention. Do not "normalize" them.

## Third-party data tables cite their source and carry a test

Any hardcoded mapping of external conventions (PGN NAG symbols, dump column orders, tablebase FENs) must link its source in a comment and have a correctness test. The NAG map shipped with `$6 = "!!"` (correct: "±") because nothing tied it to the standard table.
