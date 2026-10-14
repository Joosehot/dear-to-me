// The security headers every response carries, and the Content-Security-Policy in one place.
//
// What the site loads, and so what the policy allows:
// - its own scripts and styles (Vite's build), and the inline style attributes React sets;
// - Google Fonts: the stylesheet from fonts.googleapis.com, the font files from fonts.gstatic.com;
// - pictures and videos from this site, from R2 (/media/<file> redirects to a signed address on the
//   bucket's host), and the previews of chosen files (blob:, data:);
// - the API and the live channel (/ws) on this site, and a vlog's parts PUT straight into R2;
// - Stripe only as a page gone to (Checkout, Connect onboarding): no Stripe.js, no frames.
// Nothing may frame the site.

import type express from 'express';

/** The R2 hosts media comes from and videos go to: the R2_URL's host and its subdomains (the signed
 * addresses name the bucket as a subdomain). Without R2, any R2 account's (the policy still fits once
 * R2 is set up, and nothing else is allowed). */
function r2Sources() {
  try {
    const host = new URL(process.env.R2_URL ?? '').host;
    if (host) return [`https://${host}`, `https://*.${host}`];
  } catch {}
  return ['https://*.r2.cloudflarestorage.com'];
}

/** The live channel's address, when the site's own is known (older browsers do not read 'self' as wss:). */
function socketSource() {
  try {
    const url = new URL(process.env.D2M_ORIGIN ?? '');
    return [`${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}`];
  } catch {
    return [];
  }
}

export function contentSecurityPolicy() {
  const r2 = r2Sources();
  const policy: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'img-src': ["'self'", 'data:', 'blob:', ...r2],
    'media-src': ["'self'", 'blob:', ...r2],
    'connect-src': ["'self'", ...socketSource(), ...r2],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(policy)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
}

/** The headers, on every response. HSTS only over https (behind the proxy: D2M_TRUST_PROXY). */
export function securityHeaders(): express.RequestHandler {
  const csp = contentSecurityPolicy();
  return (req, res, next) => {
    res.set({
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    });
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  };
}
