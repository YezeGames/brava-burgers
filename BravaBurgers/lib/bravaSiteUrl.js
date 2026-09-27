function getPublicSiteUrl() {
  const raw = process.env.BRAVA_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
  if (raw && String(raw).trim()) return String(raw).trim().replace(/\/$/, '');
  const vercel = process.env.VERCEL_URL;
  if (vercel) return 'https://' + String(vercel).replace(/\/$/, '');
  return 'https://brava-burgers.vercel.app';
}

module.exports = { getPublicSiteUrl };
