// Payments through Stripe: the plans and storage packs (monthly, to D2M), a reader's monthly
// subscription to an Unlimited author, and an Exclusive post bought once.
//
// Money for authors goes through Stripe Connect: an author links a Stripe account (Express) once,
// and each sale is a destination charge: the buyer pays the price (VAT included), D2M keeps the VAT
// and its 10 % fee as the application fee, and the rest is transferred to the author.
//
// A payment is confirmed when the buyer comes back from Checkout: the server reads the Checkout
// session from Stripe itself (never trusting the browser) and grants what was paid for, once.
// Stripe's webhook (POST /api/stripe/webhook, signed with STRIPE_WEBHOOK_SECRET) says the same for a
// buyer who never came back, and tells what happens later at Stripe: renewals, failed payments, and
// subscriptions that end there (Stripe gave up, or cancelled in the Dashboard).
//
// Before Checkout the buyer gives express consent in the app (access at once); its time goes with the
// payment, into D2M's purchases log. A monthly contract can be withdrawn from within 14 days: it ends
// at once and the unused part is refunded. A reader who cancels keeps access to the period's end.
//
// Off without STRIPE_SECRET_KEY in .env, and always off in the checks (D2M_PAY=off): then
// everything is free, as in the prototype before.

import fs from 'node:fs';
import path from 'node:path';
import { validBack } from './seo.js';
import Stripe from 'stripe';
import { PLANS, STORAGE_PACKS, type PlanName, type Space } from '../shared/plans.js';
import { split } from '../shared/pricing.js';

const root = path.resolve(import.meta.dirname, '..');
if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

const key = process.env.D2M_PAY === 'off' ? '' : process.env.STRIPE_SECRET_KEY ?? '';
export const stripe = key ? new Stripe(key) : null;
export const live = key.startsWith('sk_live_');
/** Payments as a visitor is told of them (the beta banner): off, Stripe's test mode, or real money. */
export const mode: 'off' | 'test' | 'live' = !key ? 'off' : key.startsWith('sk_test_') ? 'test' : 'live';

/** What a Checkout session pays for (kept in its metadata, read back from Stripe). */
export type Purchase =
  | { kind: 'plan'; plan: PlanName }
  | { kind: 'pack'; space: Space }
  | { kind: 'author'; authorId: string }
  | { kind: 'post'; postId: string };

const month = { interval: 'month' as const };

/** A Checkout page for a purchase; its address. `back` is the app's page to return to (a path
 * on this site, as validBack says).
 * `consentAt`: when the buyer gave their express consent in the app (access at once), kept with the payment. */
export async function checkout(
  origin: string,
  back: string,
  userId: string,
  what: Purchase,
  consentAt: number,
  sale?: { name: string; price: number; account: string },
): Promise<string> {
  if (!stripe) throw new Error('payments are off');
  if (!validBack(back)) throw new Error('a way back on this site is needed');
  const metadata = { d2m: '1', userId, consentAt: String(consentAt), ...Object.fromEntries(Object.entries(what).map(([k, v]) => [k, String(v)])) };
  const urls = {
    success_url: `${origin}${back}?paid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${back}`,
    client_reference_id: userId,
    metadata,
  };
  let session: Stripe.Checkout.Session;
  if (what.kind === 'plan' || what.kind === 'pack') {
    const name = what.kind === 'plan' ? `Dear to Me ${PLANS[what.plan].name}` : `Dear to Me: ${what.space === 'video' ? 'video' : 'text and pictures'} storage +${STORAGE_PACKS[what.space].bytes / 1024 ** 3} GB`;
    const amount = what.kind === 'plan' ? PLANS[what.plan].price : STORAGE_PACKS[what.space].price;
    session = await stripe.checkout.sessions.create({
      ...urls,
      mode: 'subscription',
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: amount, recurring: month, product_data: { name } } }],
      subscription_data: { metadata },
    });
  } else {
    if (!sale) throw new Error('nothing to sell');
    // D2M keeps the VAT and its fee; the author gets the rest
    const s = split(sale.price);
    const kept = s.vat + s.fee;
    if (what.kind === 'author') {
      session = await stripe.checkout.sessions.create({
        ...urls,
        mode: 'subscription',
        line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: sale.price, recurring: month, product_data: { name: sale.name } } }],
        subscription_data: { metadata, application_fee_percent: Math.round((kept / sale.price) * 10000) / 100, transfer_data: { destination: sale.account } },
      });
    } else {
      session = await stripe.checkout.sessions.create({
        ...urls,
        mode: 'payment',
        line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: sale.price, product_data: { name: sale.name } } }],
        payment_intent_data: { metadata, application_fee_amount: kept, transfer_data: { destination: sale.account } },
      });
    }
  }
  if (!session.url) throw new Error('Stripe gave no Checkout address');
  return session.url;
}

/** A finished Checkout session, read from Stripe: what it paid for, for whom, and its subscription. */
export async function paidSession(sessionId: string) {
  if (!stripe) return null;
  return fromSession(await stripe.checkout.sessions.retrieve(sessionId));
}

export type PaidSession = NonNullable<ReturnType<typeof fromSession>>;

/** What a Checkout session paid for, if it is one of D2M's and paid (from Stripe's API or a signed webhook event). */
export function fromSession(s: Stripe.Checkout.Session) {
  if (s.metadata?.d2m !== '1' || s.status !== 'complete' || s.payment_status !== 'paid') return null;
  const m = s.metadata;
  const what: Purchase | null =
    m.kind === 'plan' ? { kind: 'plan', plan: m.plan as PlanName }
    : m.kind === 'pack' ? { kind: 'pack', space: m.space as Space }
    : m.kind === 'author' ? { kind: 'author', authorId: m.authorId }
    : m.kind === 'post' ? { kind: 'post', postId: m.postId }
    : null;
  if (!what) return null;
  const subscription = typeof s.subscription === 'string' ? s.subscription : s.subscription?.id;
  const payment = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id;
  return { userId: m.userId, what, subscription, payment, amount: s.amount_total ?? 0, consentAt: Number(m.consentAt) || undefined };
}

/** The webhook's signing secret (Stripe Dashboard > Webhooks); none: the webhook is off. */
export const webhookSecret = stripe ? process.env.STRIPE_WEBHOOK_SECRET ?? '' : '';

/** A webhook event, if its signature is Stripe's (it throws otherwise). `raw`: the body exactly as it came. */
export function webhookEvent(raw: Buffer, signature: string): Stripe.Event {
  if (!stripe || !webhookSecret) throw new Error('the webhook is off');
  return stripe.webhooks.constructEvent(raw, signature, webhookSecret);
}

/** The subscription an invoice is for (in this API version the invoice names it under its parent). */
export function invoiceSubscription(invoice: Stripe.Invoice) {
  const sub = invoice.parent?.subscription_details?.subscription;
  return typeof sub === 'string' ? sub : sub?.id;
}

/** When a subscription set to end at Stripe ends (ms), or undefined: it goes on. */
export function endsAt(sub: Stripe.Subscription) {
  if (sub.cancel_at) return sub.cancel_at * 1000;
  const end = sub.items.data[0]?.current_period_end;
  return sub.cancel_at_period_end && end ? end * 1000 : undefined;
}

/** End a monthly payment at once (going back to Lite, or to another plan; an author who stops selling). */
export async function cancel(subscriptionId: string | undefined) {
  if (stripe && subscriptionId) await stripe.subscriptions.cancel(subscriptionId).catch((e) => console.error(`Stripe: could not cancel ${subscriptionId}: ${e.message}`));
}

/** A reader cancels: the subscription renews no more and ends with the period paid for; when (ms). */
export async function endAtPeriodEnd(subscriptionId: string) {
  if (!stripe) return undefined;
  const s = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  const end = s.items.data[0]?.current_period_end;
  return end ? end * 1000 : undefined;
}

/** The part of a payment for a period not yet used, in cents. */
export function unusedPart(amount: number, start: number, end: number, now = Date.now()) {
  if (end <= start) return 0;
  const left = Math.min(end - start, Math.max(0, end - now));
  return Math.round((amount * left) / (end - start));
}

/** Withdrawal from a monthly contract (the right of withdrawal): the subscription ends at once, and the
 * unused part of its latest payment is refunded. An author's share of a reader's subscription
 * (`connect`) is taken back from them with it, and D2M's fee too. The cents refunded. */
export async function withdraw(subscriptionId: string | undefined, connect: boolean, now = Date.now()) {
  if (!stripe || !subscriptionId) return 0;
  // in this API version the invoice no longer names its payment intent: its payments do
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice.payments'] });
  if (sub.status !== 'canceled') await stripe.subscriptions.cancel(subscriptionId);
  const invoice = sub.latest_invoice as Stripe.Invoice | null;
  const item = sub.items.data[0];
  const paid = invoice?.payments?.data.find((p) => p.status === 'paid')?.payment;
  const amount = item ? unusedPart(invoice?.amount_paid ?? 0, item.current_period_start * 1000, item.current_period_end * 1000, now) : 0;
  const id = (x: string | { id: string } | undefined) => (typeof x === 'string' ? x : x?.id);
  const target = paid?.payment_intent ? { payment_intent: id(paid.payment_intent) } : paid?.charge ? { charge: id(paid.charge) } : null;
  if (!target || amount <= 0) return 0;
  const refund = await stripe.refunds.create({ ...target, amount, ...(connect ? { reverse_transfer: true, refund_application_fee: true } : {}) });
  return refund.amount;
}

/** A single post's payment back, whole (its author deleted the post soon after the purchase). The cents. */
export async function refund(paymentIntent: string | undefined) {
  if (!stripe || !paymentIntent) return 0;
  const r = await stripe.refunds.create({ payment_intent: paymentIntent, reverse_transfer: true, refund_application_fee: true });
  return r.amount;
}

/** An author's Stripe account for being paid (made on first use), and the Stripe page to finish it. */
export async function payoutLink(origin: string, account: string | undefined, email?: string) {
  if (!stripe) throw new Error('payments are off');
  const id =
    account ??
    (
      await stripe.accounts.create({
        type: 'express',
        country: 'FI',
        email,
        capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      })
    ).id;
  const link = await stripe.accountLinks.create({ account: id, type: 'account_onboarding', refresh_url: `${origin}/me`, return_url: `${origin}/me` });
  return { account: id, url: link.url };
}

/** Can money be sent to this account yet? */
export async function payoutReady(account: string | undefined) {
  if (!stripe || !account) return false;
  const a = await stripe.accounts.retrieve(account);
  return a.capabilities?.transfers === 'active';
}
