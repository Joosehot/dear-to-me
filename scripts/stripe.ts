// `npm run stripe`: does the Stripe key in .env work? Reads the account only: creates and charges nothing.
import fs from 'node:fs';
import Stripe from 'stripe';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.log('No STRIPE_SECRET_KEY in .env');
  process.exit(1);
}
const stripe = new Stripe(key);
const account = await stripe.accounts.retrieve();
console.log(`Stripe works (${key.startsWith('sk_live_') ? 'LIVE: real money' : 'test mode'})`);
console.log(`account: ${account.settings?.dashboard?.display_name ?? account.business_profile?.name ?? '?'}, country ${account.country}, currency ${account.default_currency}`);
console.log(`charges enabled: ${account.charges_enabled}, payouts enabled: ${account.payouts_enabled}`);
const connect = await stripe.accounts.list({ limit: 1 }).then(() => 'on', (e) => `not available (${e.message.split('.')[0]})`);
console.log(`Connect (paying authors): ${connect}`);
