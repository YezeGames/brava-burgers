/** URL pública para clientes (WhatsApp, seguimiento). Nunca usar VERCEL_URL (previews piden login). */
/** Canonical cliente (WhatsApp, seguimiento). Apex redirige a www en Vercel. */
const DEFAULT_PUBLIC_SITE = 'https://www.bravaburgers.com.ar';

function getPublicSiteUrl() {
  const raw = process.env.BRAVA_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
  if (raw && String(raw).trim()) return String(raw).trim().replace(/\/$/, '');
  return DEFAULT_PUBLIC_SITE;
}

module.exports = { getPublicSiteUrl, DEFAULT_PUBLIC_SITE };
