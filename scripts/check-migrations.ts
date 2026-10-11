import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const root = process.cwd();
const journalPath = path.join(root, "drizzle", "meta", "_journal.json");

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

type Entry = { idx: number; when: number; tag: string };
type Snapshot = { id: string; prevId?: string };

let journal: { entries: Entry[] };
try {
  journal = JSON.parse(readFileSync(journalPath, "utf8"));
} catch (e) {
  console.error(`check-migrations: cannot read ${journalPath}: ${e}`);
  process.exit(1);
}

const entries = journal.entries;

entries.forEach((entry, i) => {
  if (entry.idx !== i) fail(`journal idx ${entry.idx} at position ${i} — entries must be 0..N-1 in order`);

  if (i > 0 && entry.when <= entries[i - 1].when) {
    fail(`journal 'when' not strictly increasing at idx ${entry.idx} (${entry.when} <= ${entries[i - 1].when})`);
  }

  const prefix = entry.tag.split("_")[0];
  if (prefix !== String(i).padStart(4, "0")) {
    fail(`tag '${entry.tag}' prefix '${prefix}' does not match its journal position ${i} — collision/rename left behind`);
  }

  const sqlPath = path.join(root, "drizzle", `${entry.tag}.sql`);
  if (!existsSync(sqlPath)) fail(`missing migration file ${sqlPath}`);

  const snapPath = path.join(root, "drizzle", "meta", `${String(i).padStart(4, "0")}_snapshot.json`);
  if (!existsSync(snapPath)) {
    fail(`missing snapshot ${snapPath}`);
    return;
  }

  const snap: Snapshot = JSON.parse(readFileSync(snapPath, "utf8"));
  if (!snap.id) fail(`${snapPath}: snapshot has no id`);
  if (i === 0) {
    if (snap.prevId && snap.prevId !== NIL_UUID) {
      fail(`${snapPath}: first snapshot prevId must be absent or the nil UUID (drizzle convention)`);
    }
  } else {
    const prevPath = path.join(root, "drizzle", "meta", `${String(i - 1).padStart(4, "0")}_snapshot.json`);
    const prev: Snapshot = JSON.parse(readFileSync(prevPath, "utf8"));
    if (snap.prevId !== prev.id) {
      fail(`${snapPath}: prevId ${snap.prevId} does not chain to ${prevPath} id ${prev.id}`);
    }
  }
});

if (errors.length > 0) {
  console.error(`check-migrations: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error("\nFix: renumber the migration + its snapshot, append to _journal.json with 'when' greater than the last entry, and chain prevId to the previous snapshot's id.");
  process.exit(1);
}

console.log(`check-migrations: OK — ${entries.length} migrations, journal + snapshots consistent`);
