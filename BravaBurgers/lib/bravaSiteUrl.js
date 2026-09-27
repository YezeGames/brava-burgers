function getPublicSiteUrl() {
  const raw = process.env.BRAVA_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
  if (raw && String(raw).trim()) return String(raw).trim().replace(/\/$/, '');
  // WhatsApp / clientes: URL estable, no preview aleatorio (*.vercel.app de deploy).
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_URL) {
    return 'https://' + String(process.env.VERCEL_URL).replace(/\/$/, '');
  }
  return 'https://brava-burgers.vercel.app';
}

module.exports = { getPublicSiteUrl };
