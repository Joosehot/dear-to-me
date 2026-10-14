# Putting Dear to Me on a server

A step-by-step guide for running Dear to Me on one rented Linux server, written for someone who has
not run a server before. The setup is:

- **a Hetzner Cloud server** (Ubuntu 24.04), with
- **Docker**, running two containers (see `docker-compose.yml`):
  - **app**: Dear to Me itself, Node 24 with FFmpeg. Its data lives in the `d2m-data` volume:
    `db.sqlite`, `uploads/` and `backups/`.
  - **caddy**: the web server in front. It gets the HTTPS certificate by itself, redirects HTTP to
    HTTPS, compresses, and passes websockets through.
- **Cloudflare** for the DNS, R2 for media and off-site backups, and **Stripe** for payments.

Commands in `grey boxes` are typed on the server unless the step says "on your own computer".
Replace `deartome.fi` with your domain and `203.0.113.10` with your server's IP address throughout.

---

## 1. Create the server (Hetzner Cloud)

1. Sign up at <https://console.hetzner.cloud> and create a project ("Dear to Me").
2. **Add Server**:
   - **Location**: Helsinki (or Falkenstein/Nuremberg; anywhere in the EU keeps the data in the EU).
   - **Image**: Ubuntu 24.04.
   - **Type**: Shared vCPU, x86 (Intel/AMD), **CX22** (2 vCPU, 4 GB RAM, 40 GB disk) is enough
     to start. (If the newer CX23 or CPX22 is offered instead, either is fine.) FFmpeg compressing
     vlogs is the heaviest work; resize later if it is slow.
   - **Networking**: public IPv4 and IPv6 on.
   - **SSH key**: add yours. On your own computer (Windows PowerShell), if you have none:
     `ssh-keygen -t ed25519`, then paste the contents of `C:\Users\<you>\.ssh\id_ed25519.pub`.
   - **Backups**: worth ticking (about 20 % of the server's price): Hetzner then keeps daily images
     of the whole disk, the uploads included.
   - **Name**: `d2m`.
3. Note the server's **IPv4 address**.
4. Log in from your own computer: `ssh root@203.0.113.10`.
5. Update the system and turn on the firewall (SSH, HTTP and HTTPS only):

   ```sh
   apt update && apt -y upgrade
   ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
   ufw --force enable
   ```

   (Docker's published ports bypass ufw, but only Caddy's 80 and 443 are published; the app is not.)
   You can also add a Hetzner Cloud Firewall with the same three rules in the console.
6. Turn on automatic security updates: `apt -y install unattended-upgrades` (it is on by default
   on Ubuntu 24.04; this makes sure).

## 2. Point the domain to the server (Cloudflare DNS)

In Cloudflare: your domain > **DNS** > **Records** > **Add record**:

| Type | Name  | Content                   | Proxy status           |
|------|-------|---------------------------|------------------------|
| A    | `@`   | `203.0.113.10`            | **DNS only** (grey cloud) |
| AAAA | `@`   | the server's IPv6 address | **DNS only**           |
| CNAME| `www` | `deartome.fi`             | **DNS only**           |

**DNS only is the simple, recommended setup**: visitors talk to Caddy directly, Caddy gets the
certificate from Let's Encrypt by itself, and the app sees each visitor's real address (the sign-in
brake works per visitor).

**The alternative, Cloudflare's proxy (orange cloud), "Full (strict)":** traffic goes through
Cloudflare first (hiding the server's IP, Cloudflare's caching and DDoS protection). If you choose it:

1. First bring the site up with **DNS only** (steps 3-6), so Caddy gets its certificate.
2. Then switch the records to **Proxied**, and in Cloudflare set **SSL/TLS > Overview > Full
   (strict)** (never "Flexible": that loops forever with Caddy's redirect to HTTPS).
3. In `deploy/Caddyfile` uncomment the `servers { trusted_proxies ... }` block (check the list
   against <https://www.cloudflare.com/ips/>), and in `deploy/.env` set `D2M_TRUST_PROXY=2`.
   Without these the app sees every visitor as a Cloudflare address.
4. `docker compose up -d` again (step 11's last command).

Caddy keeps renewing its certificate through the proxy (the HTTP challenge passes through
Cloudflare). Wait until `dig +short deartome.fi` (or <https://dnschecker.org>) shows your IP before step 6.

## 3. Install Docker

Docker's own packages (not Ubuntu's older `docker.io`):

```sh
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

## 4. Copy the code to the server

The code goes into `/opt/d2m`. **On your own computer**, in the D2M folder, pack the branch to
deploy (only files in git: never `.env`, `data/` or `node_modules`):

```powershell
git archive --format=tar.gz -o d2m.tar.gz HEAD
scp d2m.tar.gz root@203.0.113.10:/root/
```

**On the server:**

```sh
mkdir -p /opt/d2m && tar -xzf /root/d2m.tar.gz -C /opt/d2m && rm /root/d2m.tar.gz
cd /opt/d2m/deploy
```

(If the code is later in a private Git repository, `git clone` it into `/opt/d2m` instead, with a
deploy key; updates are then `git pull` in step 11.)

## 5. Fill in `.env`

```sh
cd /opt/d2m/deploy
cp .env.example .env
chmod 600 .env
nano .env
```

Every variable is explained in `.env.example`. For launch you need at least:

- `D2M_DOMAIN=deartome.fi` and `ACME_EMAIL=you@example.com`;
- `STRIPE_SECRET_KEY` (step 7 adds `STRIPE_WEBHOOK_SECRET`);
- `R2_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` for media in R2 (recommended: the server's
  disk is small, and R2 is where vlogs upload straight into);
- `D2M_BACKUP_URL` (and its key) for backups off the server (step 10);
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_TOKEN` and `MAIL_FROM` for email (step 13), and for a
  closed beta `D2M_BETA=1` and `D2M_INVITE_CODES` (step 14);
- `D2M_MODERATORS`: the usernames that moderate (step 15).

Never put `D2M_DEMO` in it: the server refuses to start with it in production.
(Save in nano: Ctrl+O, Enter; quit: Ctrl+X.)

## 6. Start it

```sh
cd /opt/d2m/deploy
docker compose up -d --build
```

The first build takes a few minutes. Then:

```sh
docker compose ps                 # both "running"; app "healthy"
docker compose logs app           # the features line: production, origin, payments, webhook, media
curl -s https://deartome.fi/api/health    # {"ok":true}
```

Open <https://deartome.fi> in a browser: the landing page, with a padlock. The first account you
sign up is an ordinary one (there are no admin accounts).

## 7. The Stripe webhook

Stripe tells the app what happens at Stripe: a payment finished by a buyer who closed the tab before
coming back, and subscriptions renewed, failed and ended there (a plan whose payments Stripe gave up
on goes back to Lite).

1. Stripe Dashboard (in **live** mode for real money; test mode to try first, with test keys) >
   **Developers > Webhooks > Add destination** (older dashboards: **Add endpoint**).
2. **Events from**: *Your account* (the plans, packs and readers' subscriptions are all D2M's own
   Checkout sessions, also those paid to authors).
3. **Endpoint URL**: `https://deartome.fi/api/stripe/webhook`
4. **Events to send** — select exactly these six:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Save, open the endpoint, **Signing secret > Reveal**, and copy it (`whsec_...`) into
   `deploy/.env` as `STRIPE_WEBHOOK_SECRET=whsec_...`.
6. Restart the app: `docker compose up -d` (it re-reads `.env`). The log line says `Stripe webhook: on`.
7. In the endpoint's page, **Send test event** (`invoice.payment_failed` is harmless): it should
   answer 200. A 400 means the secret is wrong.

Test mode and live mode have separate endpoints and secrets: the secret must match the key's mode.

## 8. R2: let the browser upload videos into the bucket

Vlogs are uploaded from the browser straight into the R2 bucket. The bucket must allow that from
your domain (CORS):

```sh
cd /opt/d2m/deploy
docker compose exec app npm run r2:cors
```

It allows `https://deartome.fi` (the site's own address) and whatever is in `D2M_ORIGINS` (add
`https://www.deartome.fi` there if you keep www without the redirect), plus localhost for
development. If the key may not change the bucket's settings, it prints the policy to paste in
Cloudflare: **R2 > your bucket > Settings > CORS Policy**. `docker compose exec app npm run r2`
checks that the bucket answers with the keys.

## 9. Google Search Console

1. <https://search.google.com/search-console> > **Add property** > **Domain** > `deartome.fi`.
2. Google shows a TXT record (`google-site-verification=...`). In Cloudflare DNS add a **TXT**
   record, name `@`, content that value. Back in Search Console, **Verify** (it may take a few minutes).
3. **Sitemaps** > add `https://deartome.fi/sitemap.xml` > **Submit**. The app makes it from the
   public profiles and public posts each time; `robots.txt` points to it too.

## 10. Backups and restore

**What is backed up:** the database. `npm run backup` writes a consistent copy (while the app runs)
into `/data/backups/` in the volume, and keeps the newest 14. `npm run backup:r2` copies the newest
one into the R2 bucket in `D2M_BACKUP_URL`, off the server. Pictures and videos in R2 are already
off the server; if media stays on the server's disk (no R2), only Hetzner's server backups (step 1)
cover `uploads/`.

**Off-site bucket (once):** Cloudflare > R2 > **Create bucket** `deartome-backups` (private). Make an
R2 API token with *Object Read & Write* on it (or on both buckets) and put into `.env`:
`D2M_BACKUP_URL=https://<account id>.r2.cloudflarestorage.com/deartome-backups` and the key as
`D2M_BACKUP_ACCESS_KEY_ID` / `D2M_BACKUP_SECRET_ACCESS_KEY`. In the bucket's **Settings > Object
lifecycle rules**, add a rule deleting objects after 30 days. Then `docker compose up -d`.

**Daily, automatically (once):**

```sh
chmod +x /opt/d2m/deploy/backup/d2m-backup.sh
/opt/d2m/deploy/backup/d2m-backup.sh          # try it now: "backup: /data/backups/db-....sqlite"
cp /opt/d2m/deploy/backup/d2m-backup.service /opt/d2m/deploy/backup/d2m-backup.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now d2m-backup.timer
systemctl list-timers d2m-backup.timer        # when it runs next
journalctl -u d2m-backup.service              # what it said
```

**By hand, any time:**

```sh
cd /opt/d2m/deploy
docker compose exec app npm run backup
docker compose exec app npm run backup:r2
docker compose exec app ls -l /data/backups
```

**A copy on your own computer:**

```sh
docker compose cp app:/data/backups ./backups-copy        # on the server
```

then on your own computer `scp -r root@203.0.113.10:/opt/d2m/deploy/backups-copy .`

**Restore** (the app stops for a minute; `db-2026-10-14T03-30-00Z.sqlite` stands for the copy chosen):

```sh
cd /opt/d2m/deploy
docker compose exec app ls /data/backups                  # the copies on the server
docker compose exec app npm run backup:r2 -- list         # the copies in R2
docker compose exec app npm run backup:r2 -- get db-2026-10-14T03-30-00Z.sqlite   # one from R2 into /data/backups
docker compose stop app
# the current database aside (kept, not deleted), the copy in its place
docker compose run --rm --no-deps --entrypoint sh app -c \
  'mkdir -p /data/replaced && mv /data/db.sqlite* /data/replaced/ && cp /data/backups/db-2026-10-14T03-30-00Z.sqlite /data/db.sqlite'
docker compose start app
docker compose logs --tail 20 app
```

(`docker compose run` works while the app is stopped; `exec` needs it running.)

## 11. Updates

On your own computer, pack the new version and copy it over as in step 4. On the server:

```sh
cd /opt/d2m/deploy
docker compose exec app npm run backup                    # a copy first
cp .env /root/d2m.env.keep                                # .env is not in the archive; keep it safe
tar -xzf /root/d2m.tar.gz -C /opt/d2m && rm /root/d2m.tar.gz
docker compose up -d --build                              # rebuilds and replaces the app
docker image prune -f                                     # old images away
```

(Unpacking over `/opt/d2m` replaces the code and leaves `deploy/.env` alone, since it is not in
the archive.) The database is migrated by the app on start when the new version needs it. A
restart takes a few seconds: the app shuts down cleanly (open conversations reconnect by themselves).

## 12. Logs

```sh
cd /opt/d2m/deploy
docker compose logs -f app          # the app (Ctrl+C stops watching, not the app)
docker compose logs -f caddy        # requests and certificates
docker compose logs --since 1h app  # the last hour
docker compose ps                   # running and healthy?
docker stats --no-stream            # memory and CPU
```

Logs are rotated (5 files of 10 MB per container). For an outside uptime check (UptimeRobot,
Better Stack and the like), watch `https://deartome.fi/api/health`.

## 13. Email: Cloudflare Email Service

The app sends three kinds of email, Finnish first and English below: the link that confirms an
address after sign-up (valid 24 hours), a password reset link (1 hour, once), and when someone
changes their email, a confirmation link to the new address and a notice to the old one. Until the
address is confirmed, a person can use the app but not buy, subscribe, sell or make their profile
public. It goes through **Cloudflare Email Service** (Email Sending), over its REST API.

Before you start: the domain's DNS must be on Cloudflare (step 2), and **sending to anyone (not only
to your own verified addresses) needs the Workers Paid plan** (3,000 emails a month included, then
$0.35 per 1,000, as Cloudflare's pricing page said in October 2026; *not confirmed* where the
dashboard sells the plan today: look under Workers & Pages > Plans).
Email Sending was a public beta when this was written; the names in the dashboard may move.

1. **Onboard the domain.** Cloudflare dashboard > **Compute** > **Email Service** > **Email
   Sending** > **Onboard Domain** > choose `deartome.fi` > review the DNS records > **Done**.
   Cloudflare adds them itself, on the `cf-bounce` subdomain of your domain:
   - **MX** records, so bounces come back to Cloudflare;
   - a **TXT** record for **SPF** (who may send for the domain);
   - a **TXT** record for **DKIM** (the signature on each message);
   - and a **TXT** record for **DMARC** on `_dmarc.deartome.fi`.

   DNS usually settles in 5-15 minutes. *Not confirmed:* what happens if the domain already has a
   DMARC record (for example from Email Routing or another mail provider); look at the records the
   dashboard proposes before you select Done, and keep only one `_dmarc` record.
2. **Copy the account id.** Dashboard > **Account home** > **Search** (Ctrl+K) > type
   `Copy account ID` > select it. Put it in `deploy/.env` as `CLOUDFLARE_ACCOUNT_ID=...`.
3. **Create the API token.** Dashboard > **Manage Account** > **API Tokens** > **Create Token** (an
   account-owned token, recommended; a user token from **My Profile** > **API Tokens** works too) >
   **Create Custom Token**. Name it `d2m email`, and give it one permission: **Account** >
   **Email Sending** > **Edit**, for this account only. **Continue to summary** > **Create Token**,
   and copy the token (shown only once) into `deploy/.env` as `CLOUDFLARE_EMAIL_TOKEN=...`.
   *Not confirmed:* the permission is named "Email Sending: Edit" in Cloudflare's docs; the general
   list of token permissions did not show it yet when this was written, so its place in the
   dashboard's permission picker may differ.
4. In `deploy/.env` also set `MAIL_FROM=Dear to Me <noreply@deartome.fi>` (an address on the
   onboarded domain; it needs no mailbox) and, if you want replies somewhere, `MAIL_REPLY_TO`.
5. Restart: `docker compose up -d`. The log line says `email: Cloudflare Email Service`. (With
   `MAIL_PROVIDER=cloudflare` and a setting missing, the app refuses to start and says which.)

**Test a password reset after deploy:**

1. Sign up on <https://deartome.fi> with an address you can read (or use your own account).
2. The confirmation email should arrive within a minute (look in spam too); open its link: "Your
   email address is confirmed", and the pink banner at the top of the app is gone.
3. Sign out, select **Unohditko salasanan?** on the sign-in form, type the address: the page says a
   link was sent if the address has an account (it says the same for any address, on purpose).
4. Open the link in the email (within an hour), set a new password: you are signed in. Sessions on
   other devices have ended; the old password no longer works.
5. If nothing arrives: `docker compose logs app | grep mail` shows Cloudflare's refusal with its
   code (for example `10102 ... forbidden`: the token lacks Email Sending: Edit; `10105 ...
   not_entitled`: the account cannot send yet, check the plan; `10001 ... invalid_request_schema`:
   check `MAIL_FROM`). Cloudflare's own log: **Email Service** > **Email Sending** > your domain
   (*not confirmed* where exactly the dashboard shows it).

## 14. A closed beta: `D2M_BETA` and invite codes

- `D2M_BETA=1` in `deploy/.env` puts a slim banner at the top of every page: "Beta: Dear to Me on
  testikäytössä." with how payments stand: off ("Maksut eivät ole käytössä"), Stripe test mode
  (`sk_test_` key: "käytä testikorttia 4242 4242 4242 4242") or live (no card hint). The landing page
  says "Beta" beside the brand.
- `D2M_INVITE_CODES=KEVAT-2026,ystavat` (with `D2M_BETA=1`) makes sign-up ask for a code. Any of
  them works, for any number of people, in any case; each account keeps the code it used (the
  `accounts.invite_code` column), so you can see who came through which. Empty: open sign-up.
- Change them in `.env` and `docker compose up -d`: no rebuild needed. Ending the beta: empty both.

## 15. Moderators: `D2M_MODERATORS`

- `D2M_MODERATORS=joose` (comma-separated usernames, an @ before one is fine) in `deploy/.env`, then
  `docker compose up -d`. A moderator sees **Moderointi** in My place (`/mod`): reported posts (the
  post whole, even friends-only), complaints, notices from the `/report-content` form, suspensions and
  the log. Every decision needs a written reason and emails the people concerned.
- Name only accounts that exist (the server warns at start about a name with no account: whoever signs
  up with it would moderate). A moderator cannot change their username; if a moderator deletes their
  account, take them off the list.

---

## Before launch checklist

- [ ] **Legal pages:** fill every `[placeholder]` in `src/legal/common.ts` (`OPERATOR`: company name,
      Y-tunnus, VAT number, address, email, phone, the hosting provider (Hetzner Online GmbH) and
      server country, the effective date), and the server-log line in the privacy policy. Set
      `LEGAL_DRAFT` to `false` **only after a lawyer has reviewed the texts**. Then rebuild (step 11).
- [ ] **Stripe receipts:** Dashboard > Settings > Customer emails: *Successful payments* and
      *Refunds* on.
- [ ] **Stripe Connect:** Settings > Connect: check who covers **negative balances** of the
      authors' accounts (refunds and disputes after a payout) and that the platform's settings fit;
      the Connect branding (name, icon, colour) for the onboarding page.
- [ ] **Stripe live mode:** `sk_live_...` key and the **live** webhook secret (step 7); one real
      small purchase and a refund, end to end.
- [ ] **Link previews and icons:** an `og:image` for the landing page (today the heart icon,
      `/icons/heart.png`; a 1200x630 picture is better), and a full icon set (favicon.ico, 192 and
      512 px, apple-touch-icon 180 px).
- [ ] **No demo:** `D2M_DEMO` absent from `deploy/.env` (the server refuses to start with it in
      production anyway).
- [ ] **Backups:** the timer enabled, one copy seen in the R2 bucket, and one restore tried.
- [ ] **R2 CORS** set (step 8), and one vlog uploaded from the real site.
- [ ] **Search Console** verified and the sitemap submitted (step 9).
- [ ] **Email:** the domain onboarded in Email Sending, the token and `MAIL_FROM` set, and one
      sign-up confirmation and one password reset tried end to end (step 13).
- [ ] **Beta:** `D2M_BETA` and `D2M_INVITE_CODES` as you mean them (step 14); empty both at launch.
- [ ] **Moderators:** `D2M_MODERATORS` names at least one existing account (step 15), and someone reads
      the queue at `/mod` regularly (notices must be handled without undue delay).
