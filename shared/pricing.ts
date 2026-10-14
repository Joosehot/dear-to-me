// How a sale is split: a monthly subscription (Unlimited) or a single post (Exclusive), the same way.
// The price the author sets is what the buyer pays,
// VAT included (as consumer prices in the EU are). From the price without VAT, the platform
// keeps its fee; the rest is the author's (before their own income tax).
//
// The rates are assumptions for the prototype: Finnish VAT on digital services (25.5 % since
// 2024-09-01) and a 10 % platform fee (on Unlimited's subscriptions and Exclusive's posts alike). In the real app the payment provider handles VAT by the
// subscriber's country; check the figures with an accountant before charging anyone.

export const VAT = 0.255;
export const PLATFORM_FEE = 0.1;
/** The highest monthly price, in cents: a cap against money laundering through subscriptions. */
export const MAX_PRICE = 50_00;

export interface Split {
  /** what the subscriber pays, VAT included */
  price: number;
  vat: number;
  fee: number;
  /** what the author gets */
  author: number;
}

/** A monthly price in cents, split into VAT, the platform fee and the author's share (cents, rounded). */
export function split(price: number): Split {
  const net = price / (1 + VAT);
  const vat = Math.round(price - net);
  const fee = Math.round(net * PLATFORM_FEE);
  return { price, vat, fee, author: price - vat - fee };
}
