#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const apiBase = (process.env.BRAVA_PUBLIC_URL || 'https://www.bravaburgers.com.ar').replace(/\/$/, '');

function parseArgs() {
  const a = process.argv.slice(2);
  let versionCode = 0;
  let versionName = '';
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--version-code' && a[i + 1]) versionCode = parseInt(a[++i], 10) || 0;
    else if (a[i] === '--version-name' && a[i + 1]) versionName = a[++i];
  }
  return { versionCode, versionName };
}

function readHookSecret() {
  if ((process.env.REPARTIDOR_OTA_HOOK_SECRET || '').trim()) {
    return process.env.REPARTIDOR_OTA_HOOK_SECRET.trim();
  }
  const p = path.join(root, 'secrets', 'repartidor-ota-hook.txt');
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8').trim();
}

async function main() {
  const hook = readHookSecret();
  if (!hook) {
    console.error('Falta secrets/repartidor-ota-hook.txt o REPARTIDOR_OTA_HOOK_SECRET');
    process.exit(1);
  }
  const opts = parseArgs();
  const res = await fetch(apiBase + '/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'notifyRepartidorNativeUpdate',
      hookSecret: hook,
      version_code: opts.versionCode,
      version_name: opts.versionName,
    }),
  });
  const data = await res.json().catch(function () {
    return { ok: false, error: 'invalid_json' };
  });
  console.log(JSON.stringify(data, null, 2));
  process.exit(res.ok && data.ok ? 0 : 1);
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
