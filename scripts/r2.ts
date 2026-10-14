// `npm run r2`: does the Cloudflare R2 bucket in .env answer? Writes, reads back and deletes one small object.
import { selfTest } from '../server/media.js';

selfTest().then(
  (said) => console.log(said),
  (e) => {
    console.log(`R2 does not work yet: ${e.message}`);
    process.exitCode = 1;
  },
);
