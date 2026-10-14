// The legal pages' shared parts: the draft switch, the operator's details (placeholders until the
// owner fills them), the shape of a page, and the plan figures read from shared/ so the texts never
// drift from what the app charges.

import { PLANS, POST_PRICE, STORAGE_PACKS } from '../../shared/plans';
import { MAX_PRICE, PLATFORM_FEE, VAT, split } from '../../shared/pricing';
import { AUDIT_MONTHS, COMPLAINT_MONTHS, REFUND_DAYS, REPORT_MONTHS, WITHDRAWAL_DAYS } from '../../shared/terms';

/** While true, every legal page says it is a draft for a lawyer. Set to false once they have read them. */
export const LEGAL_DRAFT = true;

/** The operator. Everything in [brackets] is a placeholder the owner must fill before launch. */
export const OPERATOR = {
  /** the company's registered name (also how the payee shows on payment pages and bank statements) */
  name: '[yrityksen virallinen nimi / company name]',
  businessId: '[Y-tunnus]',
  vatId: '[ALV-numero / VAT number]',
  address: '[osoite / address]',
  email: '[sähköposti / email]',
  phone: '[puhelin / phone]',
  /** the server the app and its data run on */
  host: '[palvelintarjoaja / hosting provider]',
  hostLocation: '[palvelimen sijaintimaa / server country]',
  /** when these terms take effect */
  effective: '[voimaantulopäivä / effective date]',
};

/** The legal pages, by their path (/terms ...). */
export const LEGAL_PAGES = ['terms', 'privacy', 'refunds', 'rules', 'contact'] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];
export const isLegalPage = (s: string | undefined): s is LegalPage => LEGAL_PAGES.includes(s as LegalPage);

/** A block of text: a paragraph, or a list. */
export type Block = string | string[];
export interface Section {
  title: string;
  body: Block[];
}
export interface LegalDoc {
  title: string;
  /** one plain sentence on what the page is */
  lead: string;
  sections: Section[];
}
export interface LegalTexts {
  draft: string;
  effective: string;
  /** the link labels, short */
  labels: Record<LegalPage, string>;
  back: string;
  docs: Record<LegalPage, LegalDoc>;
}

/** The figures the texts quote, from the app's own constants. */
export const FIGURES = {
  lite: PLANS.lite,
  unlimitedPrice: PLANS.pro.price,
  exclusivePrice: PLANS.exclusive.price,
  storage: { lite: PLANS.lite.storage, unlimited: PLANS.pro.storage, exclusive: PLANS.exclusive.storage },
  packs: STORAGE_PACKS,
  post: POST_PRICE,
  maxSubscription: MAX_PRICE,
  vat: VAT,
  fee: PLATFORM_FEE,
  /** an example sale of 10 EUR, split */
  example: split(10_00),
  /** the right of withdrawal, the refund of a deleted post, how long reports are kept */
  withdrawalDays: WITHDRAWAL_DAYS,
  refundDays: REFUND_DAYS,
  reportMonths: REPORT_MONTHS,
  /** how long a moderation decision can be complained about (and its record kept), and the moderation log kept */
  complaintMonths: COMPLAINT_MONTHS,
  auditMonths: AUDIT_MONTHS,
};

/** Cents as euros, in the Finnish way (9,99 €) or the English way (€9.99). */
export function euros(cents: number, lang: 'fi' | 'en') {
  const n = (cents / 100).toLocaleString(lang === 'fi' ? 'fi-FI' : 'en-IE', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
  return lang === 'fi' ? `${n} €` : `€${n}`;
}

/** A share as a percentage (0.255 -> 25,5 % / 25.5%). */
export function percent(x: number, lang: 'fi' | 'en') {
  const n = (x * 100).toLocaleString(lang === 'fi' ? 'fi-FI' : 'en-IE', { maximumFractionDigits: 1 });
  return lang === 'fi' ? `${n} %` : `${n}%`;
}

/** Bytes as gigabytes (0.5 -> 0,5 Gt / 0.5 GB). */
export function gigas(bytes: number, lang: 'fi' | 'en') {
  const n = (bytes / 1024 ** 3).toLocaleString(lang === 'fi' ? 'fi-FI' : 'en-IE', { maximumFractionDigits: 1 });
  return lang === 'fi' ? `${n} Gt` : `${n} GB`;
}
