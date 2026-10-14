// `npm run backup:r2`: the newest backup (npm run backup writes it) copied off the server, into an R2
// bucket of its own (or a prefix of one): a server that is lost takes its own backups with it.
//
//   D2M_BACKUP_URL=https://<account>.r2.cloudflarestorage.com/<bucket>[/<prefix>]
//   D2M_BACKUP_ACCESS_KEY_ID, D2M_BACKUP_SECRET_ACCESS_KEY (none: the media's R2_ACCESS_KEY_ID and
//   R2_SECRET_ACCESS_KEY, if that key may write the backup bucket)
//
// `npm run backup:r2 -- list`: the copies in the bucket. `npm run backup:r2 -- get <name>`: one back
// into <data>/backups (to restore it as backup.mjs says). Old copies: an R2 lifecycle rule removes them.
import fs from 'node:fs';
import path from 'node:path';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { bucketAt } from '../server/media.ts';

const root = path.resolve(import.meta.dirname, '..');
if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
const dataDir = process.env.D2M_DATA ? path.resolve(process.env.D2M_DATA) : path.join(root, 'data');
const dir = path.join(dataDir, 'backups');

const { D2M_BACKUP_URL } = process.env;
const keyId = process.env.D2M_BACKUP_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
const secret = process.env.D2M_BACKUP_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
if (!D2M_BACKUP_URL || !keyId || !secret) {
  console.error('backup:r2: set D2M_BACKUP_URL and a key (D2M_BACKUP_ACCESS_KEY_ID and D2M_BACKUP_SECRET_ACCESS_KEY, or R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY)');
  process.exit(1);
}
const { client, bucket, prefix } = bucketAt(D2M_BACKUP_URL, keyId, secret);
const [command, name] = process.argv.slice(2);

if (command === 'list') {
  const found: string[] = [];
  let token: string | undefined;
  do {
    const r = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of r.Contents ?? []) found.push(`${o.Key?.slice(prefix.length)}  ${((o.Size ?? 0) / 1024).toFixed(0)} kB  ${o.LastModified?.toISOString()}`);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  console.log(found.sort().join('\n') || '(no backups in the bucket)');
} else if (command === 'get') {
  if (!name || !/^db-[\w.-]+\.sqlite$/.test(name)) throw new Error('get: the name of a backup (db-<time>.sqlite), as list shows it');
  const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: prefix + name }));
  fs.mkdirSync(dir, { recursive: true });
  const to = path.join(dir, name);
  fs.writeFileSync(to, await r.Body!.transformToByteArray());
  console.log(`backup:r2: ${name} fetched into ${to}`);
} else {
  const newest = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^db-.*\.sqlite$/.test(f)).sort().pop() : undefined;
  if (!newest) {
    console.error(`backup:r2: no backup in ${dir} (npm run backup first)`);
    process.exit(1);
  }
  const file = path.join(dir, newest);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: prefix + newest, Body: fs.createReadStream(file), ContentLength: fs.statSync(file).size, ContentType: 'application/vnd.sqlite3' }));
  console.log(`backup:r2: ${newest} copied to ${bucket}/${prefix}${newest}`);
}
