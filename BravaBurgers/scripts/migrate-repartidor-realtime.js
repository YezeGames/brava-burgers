#!/usr/bin/env node
/** Ejecuta migración Realtime repartidor si hay POSTGRES_URL o SUPABASE_DB_PASSWORD + SUPABASE_URL */
const { migrateRepartidorRealtimeEventsSchema } = require('../lib/dbMigrate');

migrateRepartidorRealtimeEventsSchema()
  .then(function (r) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  })
  .catch(function (e) {
    console.error(e);
    process.exit(1);
  });
