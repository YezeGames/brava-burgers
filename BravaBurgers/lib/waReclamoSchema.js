const { migrateWaReclamos } = require('./dbMigrate');

let schemaReady = null;
let schemaRunning = null;

/** Una vez por instancia serverless: crea wa_reclamos si faltan (usa SUPABASE_DB_PASSWORD en Vercel). */
async function ensureWaReclamoSchema() {
  if (schemaReady === true) return { ok: true, cached: true };
  if (schemaRunning) return schemaRunning;
  schemaRunning = migrateWaReclamos()
    .then(function (r) {
      schemaReady = !!(r && r.ok);
      schemaRunning = null;
      if (!schemaReady) {
        console.warn('[wa-reclamo-schema] migrate failed', r && (r.error || r.detail || r.hint));
      }
      return r;
    })
    .catch(function (e) {
      schemaReady = false;
      schemaRunning = null;
      console.warn('[wa-reclamo-schema] migrate error', e.message || e);
      return { ok: false, error: String(e.message || e) };
    });
  return schemaRunning;
}

module.exports = { ensureWaReclamoSchema };
