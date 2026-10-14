# A demo for friends from your own machine

No server and no costs: the site runs on this computer and a Cloudflare Tunnel (free) gives it an
https address on your own domain, e.g. `https://demo.example.fi`. Friends can use it while the
computer is on and `scripts\demo.cmd` is running.

What the demo is:
- its own database (`data\demo`), apart from the development data;
- payments off: every plan and purchase is free, and the beta banner says so;
- sign-up by invite code (only those you give the code to can join);
- no email is sent: password reset links show up in the demo's window, and new accounts count as
  verified;
- pictures and videos go to your R2 bucket as on the real site (R2's free tier is 10 GB).

## Once

1. Install the tunnel: `winget install Cloudflare.cloudflared` (then open a new terminal).
2. Sign in to Cloudflare and pick your domain: `cloudflared tunnel login` (a browser opens).
3. Make the tunnel: `cloudflared tunnel create d2m-demo`.
4. Give it the address: `cloudflared tunnel route dns d2m-demo demo.example.fi` (your domain).
5. In `.env` in the project folder add:
   ```
   DEMO_HOST=demo.example.fi
   DEMO_INVITE_CODES=ystavat2026
   DEMO_MODERATORS=
   ```

## Each time

Double-click `scripts\demo.cmd`. It builds the site, starts it, and opens the tunnel in a second
window. Give friends the address and the invite code.

- Sign up first yourself, then put your username into `DEMO_MODERATORS` and start again: you get
  the moderation page.
- Stop: Ctrl+C in the demo window, and close the tunnel's window.
- The development version (`npm run dev`) can run at the same time; the demo uses port 5180 and its
  own data.
