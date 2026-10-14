// The legal pages: terms, privacy, withdrawal and refunds, content rules, contact. All their texts
// and link labels live here (not in src/text.ts), in the app's current language.

import { lang } from '../text';
import type { LegalTexts } from './common';
import { en } from './en';
import { fi } from './fi';

export { LEGAL_DRAFT, LEGAL_PAGES, isLegalPage, type LegalPage } from './common';

/** The legal texts in the language in use. */
export const legal = (): LegalTexts => (lang() === 'fi' ? fi : en);
