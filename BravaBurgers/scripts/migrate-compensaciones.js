#!/usr/bin/env node
/** Ejecuta migración compensaciones si hay POSTGRES_URL o SUPABASE_DB_PASSWORD + SUPABASE_URL */
const { migrateCompensacionesSchema } = require('../lib/dbMigrate');

migrateCompensacionesSchema()
  .then(function (r) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  })
  .catch(function (e) {
    console.error(e);
    process.exit(1);
  });
