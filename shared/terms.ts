// The time limits the legal texts promise, read here by the server that keeps them and by the texts.

export const DAY = 24 * 60 * 60 * 1000;
/** The consumer's right of withdrawal from a monthly contract, from the day of purchase. */
export const WITHDRAWAL_DAYS = 14;
/** A bought post its author deletes within this many days of the purchase is refunded. */
export const REFUND_DAYS = 30;
/** Reports are kept this many months, then they go. */
export const REPORT_MONTHS = 6;
/** A moderation decision can be complained about this many months after it; its record is kept as long. */
export const COMPLAINT_MONTHS = 6;
/** The moderation log (who did what, when, and why) is kept this many months. */
export const AUDIT_MONTHS = 12;
