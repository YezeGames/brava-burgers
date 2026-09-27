#!/usr/bin/env node
/**
 * Sube FIREBASE_SERVICE_ACCOUNT_JSON a Vercel (usa sesión `vercel login`).
 * Uso: node scripts/upload-firebase-vercel-env.mjs
 */
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const saPath = join(root, 'secrets', 'firebase-admin.json');
const raw = readFileSync(saPath, 'utf8');
const oneLine = JSON.stringify(JSON.parse(raw));

const vercelArgs = [
  '--yes',
  'vercel@60.1.3',
  'env',
  'add',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'production,preview,development',
  '--project',
  'brava-burgers',
  '--scope',
  'bravaburgers',
  '--sensitive',
  '--force',
  '--yes',
];

const r = spawnSync('npx', vercelArgs, {
  cwd: root,
  input: oneLine,
  encoding: 'utf8',
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: true,
});

if (r.status !== 0) process.exit(r.status ?? 1);
console.log('OK: FIREBASE_SERVICE_ACCOUNT_JSON en Vercel (production, preview, development).');
