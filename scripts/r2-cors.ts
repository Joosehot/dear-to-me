// `npm run r2:cors`: let the browser upload videos straight into the R2 bucket from D2M's own
// addresses (PUT with a signed address; the ETag header readable, so the parts can be put together).
// More addresses (the real site, later): D2M_ORIGINS=https://deartome.fi,... in .env; D2M_ORIGIN, the
// site's own, is always among them. In the container the variables come from the environment (no .env).
import fs from 'node:fs';
import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
const url = new URL(process.env.R2_URL!);
const client = new S3Client({ region: 'auto', endpoint: url.origin, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } });
const extra = [process.env.D2M_ORIGIN ?? '', ...(process.env.D2M_ORIGINS ?? '').split(',')].map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
const origins = [...new Set(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174', ...extra])];
await client.send(
  new PutBucketCorsCommand({
    Bucket: url.pathname.replace(/^\/+|\/+$/g, ''),
    CORSConfiguration: { CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ['PUT', 'GET', 'HEAD'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3600 }] },
  }),
).then(
  () => console.log(`R2 CORS set: the browser may upload from ${origins.join(', ')}`),
  (e) => {
    console.log(`R2 CORS could not be set with this key (${e.name}). Set it in Cloudflare: R2 > deartome > Settings > CORS Policy:`);
    console.log(JSON.stringify([{ AllowedOrigins: origins, AllowedMethods: ['PUT', 'GET', 'HEAD'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3600 }], null, 2));
    process.exitCode = 1;
  },
);
