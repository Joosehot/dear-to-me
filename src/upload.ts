// A vlog's video straight into the R2 bucket, in parts: four at a time, each tried again if it
// fails, and an upload broken off (the page closed, the connection lost) goes on where it stopped
// when the same file is chosen again. Without R2 the server says so, and the video goes with the
// post as before.

import { api } from './api';

const PARALLEL = 4;
const TRIES = 4;

const remembered = (file: File) => `d2m.upload:${file.name}:${file.size}:${file.lastModified}`;

function recall(file: File): { key: string; uploadId: string } | undefined {
  try {
    return JSON.parse(localStorage.getItem(remembered(file)) ?? 'null') ?? undefined;
  } catch {
    return undefined;
  }
}

function keep(file: File, value: { key: string; uploadId: string } | null) {
  try {
    if (value) localStorage.setItem(remembered(file), JSON.stringify(value));
    else localStorage.removeItem(remembered(file));
  } catch {
    // no storage: a broken upload starts again from the beginning
  }
}

/** PUT one part; its ETag. Progress in bytes as it goes. */
function put(url: string, part: Blob, onBytes: (n: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = (e) => onBytes(e.loaded);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader('ETag');
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
      else reject(new Error(`part upload failed (${xhr.status}${etag ? '' : ', no ETag'})`));
    };
    xhr.onerror = () => reject(new Error('the connection broke'));
    xhr.send(part);
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Upload the video into the bucket; its key there, or null when uploads go with the post (no R2). */
export async function uploadVideo(file: File, onProgress: (fraction: number) => void): Promise<string | null> {
  const { direct, partSize } = await api.uploads();
  if (!direct) return null;
  const { key, uploadId, done } = await api.uploadStart(file.name, file.size, recall(file));
  keep(file, { key, uploadId });
  const total = Math.max(1, Math.ceil(file.size / partSize));
  const finished = new Map<number, string>(done.map((p) => [p.PartNumber, p.ETag]));
  const sent = new Map<number, number>();
  const report = () => {
    let bytes = 0;
    for (const n of finished.keys()) bytes += Math.min(partSize, file.size - (n - 1) * partSize);
    for (const b of sent.values()) bytes += b;
    onProgress(Math.min(1, bytes / file.size));
  };
  report();
  const queue = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !finished.has(n));
  const worker = async () => {
    for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
      const part = file.slice((n - 1) * partSize, n * partSize);
      for (let attempt = 1; ; attempt++) {
        try {
          const [url] = (await api.uploadParts(key, uploadId, [n])).urls;
          const etag = await put(url, part, (b) => {
            sent.set(n!, b);
            report();
          });
          sent.delete(n);
          finished.set(n, etag);
          report();
          break;
        } catch (e) {
          sent.delete(n);
          if (attempt >= TRIES) throw e;
          await wait(1000 * 2 ** attempt);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
  await api.uploadFinish(key, uploadId, [...finished].map(([PartNumber, ETag]) => ({ PartNumber, ETag })));
  keep(file, null);
  return key;
}
