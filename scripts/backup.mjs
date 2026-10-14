// `npm run backup`: a consistent copy of the database, taken while the server runs.
//
// SQLite's VACUUM INTO writes the database as it is at one moment (a transaction of its own, so a
// write halfway is never in it) into <data>/backups/db-<UTC time>.sqlite, compacted. The newest 14
// copies are kept and older ones removed. The data folder is $D2M_DATA, or data/ beside the app.
// Run it daily (Task Scheduler or cron); copy the backups folder off the machine as well.
//
// To restore: stop the server, move db.sqlite (and any db.sqlite-wal and db.sqlite-shm beside it)
// away, copy a backup in as db.sqlite, and start the server.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const KEEP = 14;
const root = path.resolve(import.meta.dirname, '..');
const dataDir = process.env.D2M_DATA ? path.resolve(process.env.D2M_DATA) : path.join(root, 'data');
const file = path.join(dataDir, 'db.sqlite');
if (!fs.existsSync(file)) {
  console.error(`backup: no database at ${file}`);
  process.exit(1);
}

const dir = path.join(dataDir, 'backups');
fs.mkdirSync(dir, { recursive: true });
// 2026-10-14T05-30-00Z: sorts by time, and is a valid file name everywhere
const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
const to = path.join(dir, `db-${stamp}.sqlite`);

const db = new DatabaseSync(file);
try {
  // the server may be writing: wait for it rather than fail
  db.exec('PRAGMA busy_timeout = 10000');
  db.prepare('VACUUM INTO ?').run(to);
} finally {
  db.close();
}
console.log(`backup: ${to} (${(fs.statSync(to).size / 1024).toFixed(0)} kB)`);

// the newest KEEP stay
const copies = fs.readdirSync(dir).filter((f) => /^db-.*\.sqlite$/.test(f)).sort();
for (const old of copies.slice(0, -KEEP)) {
  fs.rmSync(path.join(dir, old));
  console.log(`backup: removed ${old}`);
}
