const { migrateWaMessageStatus } = require('./dbMigrate');

let schemaReady = null;
let schemaRunning = null;

async function ensureWaDeliverySchema() {
  if (schemaReady === true) return { ok: true, cached: true };
  if (schemaRunning) return schemaRunning;
  schemaRunning = migrateWaMessageStatus()
    .then(function (r) {
      schemaReady = !!(r && r.ok);
      schemaRunning = null;
      if (!schemaReady) {
        console.warn('[wa-delivery-schema] migrate failed', r && (r.error || r.detail || r.hint));
      }
      return r;
    })
    .catch(function (e) {
      schemaReady = false;
      schemaRunning = null;
      console.warn('[wa-delivery-schema] migrate error', e.message || e);
      return { ok: false, error: String(e.message || e) };
    });
  return schemaRunning;
}

module.exports = { ensureWaDeliverySchema };
