#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function loadDotEnv(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.charAt(0) === '#') continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') ||
      (v.charAt(0) === "'" && v.charAt(v.length - 1) === "'")
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function loadFirebaseServiceAccount() {
  if ((process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim()) return;
  const candidates = [
    path.join(root, 'secrets', 'firebase-admin.json'),
    path.join(root, '..', 'secrets', 'firebase-admin.json'),
  ];
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];
    if (fs.existsSync(p)) {
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(p, 'utf8');
      return;
    }
  }
}

function parseArgs() {
  const a = process.argv.slice(2);
  let versionCode = 0;
  let versionName = '';
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--version-code' && a[i + 1]) {
      versionCode = parseInt(a[++i], 10) || 0;
    } else if (a[i] === '--version-name' && a[i + 1]) {
      versionName = a[++i];
    }
  }
  return { versionCode: versionCode, versionName: versionName };
}

loadDotEnv('.env.local');
loadDotEnv('.env');
loadFirebaseServiceAccount();

const { notifyRepartidorAppUpdate } = require('../lib/repartidorRoutePush');
const opts = parseArgs();

notifyRepartidorAppUpdate(opts)
  .then(function (r) {
    console.log(JSON.stringify(r, null, 2));
    if (r.skipped && r.error === 'firebase_not_configured') {
      process.exit(2);
    }
    process.exit(r.ok || r.skipped ? 0 : 1);
  })
  .catch(function (e) {
    console.error(e);
    process.exit(1);
  });
