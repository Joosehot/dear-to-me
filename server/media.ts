// Where uploaded media lives: Cloudflare R2 when it is configured, the server's own disk otherwise.
//
// An upload always lands on disk first (FFmpeg reads a vlog's length and makes its smaller copy
// there); then `offload` moves the file to R2 in the background and the post's address changes from
// /uploads/<file> to /media/<file>. The bucket stays private: /media/<file> answers with a redirect
// to a short-lived signed address, which <img> and <video> follow (seeking in a video included).
//
// Configured by .env in the project folder (never committed):
//   R2_URL=https://<account>.r2.cloudflarestorage.com/<bucket>
//   R2_ACCESS_KEY_ID=...
//   R2_SECRET_ACCESS_KEY=...
// `npm run r2` checks that the bucket answers with them.
//
// A vlog goes the other way when R2 is there: the browser uploads it straight into the bucket in
// parts (signed addresses from the server, no size limit of the server's, a broken upload goes on
// where it stopped), and FFmpeg reads it from the bucket.

import fs from 'node:fs';
import path from 'node:path';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const root = path.resolve(import.meta.dirname, '..');
if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4',
};

/** A bucket by its address (https://<account>.r2.cloudflarestorage.com/<bucket>[/<prefix>]) and keys:
 * its client, its name, and the prefix its keys go under ('' or 'prefix/'). The backups use it too. */
export function bucketAt(address: string, accessKeyId: string, secretAccessKey: string) {
  const url = new URL(address);
  const [bucket, ...rest] = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  const client = new S3Client({ region: 'auto', endpoint: url.origin, credentials: { accessKeyId, secretAccessKey } });
  return { client, bucket, prefix: rest.length ? `${rest.join('/')}/` : '' };
}

/** The R2 bucket, or null: media stays on disk. */
function r2() {
  const { R2_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  // the checks run on disk, so they never write into the real bucket
  if (process.env.D2M_MEDIA === 'disk') return null;
  if (!R2_URL || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;
  const { client, bucket } = bucketAt(R2_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY);
  return { client, bucket };
}

const bucket = r2();
export const onR2 = !!bucket;

/** Move an uploaded file (/uploads/<file>) to R2; its new address, or the old one if it stays on disk. */
export async function offload(url: string, uploads: string): Promise<string> {
  if (!bucket || !url.startsWith('/uploads/')) return url;
  const name = url.slice('/uploads/'.length);
  const file = path.join(uploads, name);
  if (!fs.existsSync(file)) return url;
  try {
    await bucket.client.send(
      new PutObjectCommand({
        Bucket: bucket.bucket,
        Key: name,
        Body: fs.createReadStream(file),
        ContentLength: fs.statSync(file).size,
        ContentType: TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream',
      }),
    );
  } catch (e) {
    console.error(`R2: ${name} stays on disk (${(e as Error).message})`);
    return url;
  }
  fs.rmSync(file, { force: true });
  return `/media/${name}`;
}

/** A short-lived signed address for /media/<name>. */
export function signed(name: string) {
  if (!bucket) return Promise.resolve(null);
  return getSignedUrl(bucket.client, new GetObjectCommand({ Bucket: bucket.bucket, Key: name }), { expiresIn: 60 * 60 });
}

/** Remove a file wherever it is: on disk (/uploads/) or in R2 (/media/). */
export async function remove(url: string | undefined, uploads: string) {
  if (url?.startsWith('/uploads/')) fs.rmSync(path.join(uploads, url.slice('/uploads/'.length)), { force: true });
  else if (url?.startsWith('/media/') && bucket) {
    await bucket.client.send(new DeleteObjectCommand({ Bucket: bucket.bucket, Key: url.slice('/media/'.length) })).catch(() => {});
  }
}

/** Write, read back and delete one small object: does the bucket answer with these keys? */
export async function selfTest() {
  if (!bucket) return 'R2 is not configured (.env: R2_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)';
  const Key = `_check-${Date.now()}.txt`;
  await bucket.client.send(new PutObjectCommand({ Bucket: bucket.bucket, Key, Body: 'Dear to Me', ContentType: 'text/plain' }));
  const head = await bucket.client.send(new HeadObjectCommand({ Bucket: bucket.bucket, Key }));
  const read = await fetch(await getSignedUrl(bucket.client, new GetObjectCommand({ Bucket: bucket.bucket, Key }), { expiresIn: 60 })).then((r) => r.text());
  await bucket.client.send(new DeleteObjectCommand({ Bucket: bucket.bucket, Key }));
  if (head.ContentLength !== 10 || read !== 'Dear to Me') throw new Error('the object did not come back as it was written');
  return `R2 works: bucket "${bucket.bucket}" written, read through a signed address, and cleaned`;
}

// ---------------- videos uploaded straight from the browser, in parts ----------------

/** The size of one part: 16 MB (R2 allows 10 000 parts: a video up to 160 GB). */
export const PART_SIZE = 16 * 1024 * 1024;

function need() {
  if (!bucket) throw new Error('R2 is not configured');
  return bucket;
}

/** Begin a multipart upload into the bucket under this name. */
export async function startParts(name: string) {
  const b = need();
  const r = await b.client.send(new CreateMultipartUploadCommand({ Bucket: b.bucket, Key: name, ContentType: TYPES[path.extname(name).toLowerCase()] ?? 'video/mp4' }));
  if (!r.UploadId) throw new Error('R2 gave no upload id');
  return r.UploadId;
}

/** The parts already in the bucket (to go on after a broken upload). */
export async function partsDone(name: string, uploadId: string) {
  const b = need();
  const done: { PartNumber: number; ETag: string }[] = [];
  let marker: string | undefined;
  do {
    const r = await b.client.send(new ListPartsCommand({ Bucket: b.bucket, Key: name, UploadId: uploadId, PartNumberMarker: marker }));
    for (const p of r.Parts ?? []) if (p.PartNumber && p.ETag) done.push({ PartNumber: p.PartNumber, ETag: p.ETag });
    marker = r.IsTruncated ? r.NextPartNumberMarker : undefined;
  } while (marker);
  return done;
}

/** Signed addresses the browser PUTs the parts to (an hour each). */
export function partAddresses(name: string, uploadId: string, parts: number[]) {
  const b = need();
  return Promise.all(parts.map((n) => getSignedUrl(b.client, new UploadPartCommand({ Bucket: b.bucket, Key: name, UploadId: uploadId, PartNumber: n }), { expiresIn: 60 * 60 })));
}

/** Put the parts together into one object; its size in bytes. */
export async function finishParts(name: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]) {
  const b = need();
  await b.client.send(
    new CompleteMultipartUploadCommand({ Bucket: b.bucket, Key: name, UploadId: uploadId, MultipartUpload: { Parts: [...parts].sort((x, y) => x.PartNumber - y.PartNumber) } }),
  );
  return size(name);
}

export async function abortParts(name: string, uploadId: string) {
  const b = need();
  await b.client.send(new AbortMultipartUploadCommand({ Bucket: b.bucket, Key: name, UploadId: uploadId })).catch(() => {});
}

/** An object's size in bytes (undefined: it is not there). */
export async function size(name: string) {
  const b = need();
  return b.client.send(new HeadObjectCommand({ Bucket: b.bucket, Key: name })).then((r) => r.ContentLength, () => undefined);
}
