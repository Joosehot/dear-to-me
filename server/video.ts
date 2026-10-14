// Vlogs through FFmpeg (open source): the real length from the file, and a smaller copy for
// streaming (H.264 at most 720p, AAC sound, the index at the front so playing starts at once).
// Without FFmpeg on the machine both step aside: no length is known and the upload is kept as it is.

import { spawn } from 'node:child_process';

function run(cmd: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    let out = '';
    const p = spawn(cmd, args, { windowsHide: true });
    p.stdout.on('data', (d) => (out += d));
    p.on('error', () => resolve({ code: -1, out: '' }));
    p.on('close', (code) => resolve({ code: code ?? -1, out }));
  });
}

/** The video's length in seconds, read from the file (undefined: FFmpeg is not there, or the file is not a video). */
export async function duration(file: string): Promise<number | undefined> {
  const r = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  const s = Number(r.out.trim());
  return r.code === 0 && Number.isFinite(s) && s > 0 ? s : undefined;
}

/** A smaller copy for streaming; true if it was made. */
export async function compress(input: string, output: string): Promise<boolean> {
  const r = await run('ffmpeg', [
    '-y', '-v', 'error', '-i', input,
    '-vf', "scale='min(1280,iw)':-2",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
    '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+faststart',
    output,
  ]);
  return r.code === 0;
}
