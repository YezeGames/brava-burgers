#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  migrateRepartidorSignupSchema,
  migrateRepartidorSupportSchema,
} = require('../lib/dbMigrate');

const root = path.join(__dirname, '..');

function readVercelToken() {
  if ((process.env.VERCEL_TOKEN || '').trim()) return process.env.VERCEL_TOKEN.trim();
  const p = path.join(root, 'secrets', 'vercel-token.txt');
  if (!fs.existsSync(p)) return '';
  const first =
    fs
      .readFileSync(p, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) || '';
  return first.startsWith('vcp_') ? first : '';
}

async function loadEnvFromVercel(keys) {
  const token = readVercelToken();
  if (!token) throw new Error('Falta VERCEL_TOKEN o secrets/vercel-token.txt');
  const headers = { Authorization: 'Bearer ' + token };
  const teams = await (await fetch('https://api.vercel.com/v2/teams', { headers })).json();
  const team = (teams.teams || []).find((t) => t.slug === 'bravaburgers');
  const tq = team ? '?teamId=' + encodeURIComponent(team.id) : '';
  const proj = await (await fetch('https://api.vercel.com/v9/projects/brava-burgers' + tq, { headers })).json();
  if (!proj || !proj.id) throw new Error('Proyecto brava-burgers no encontrado');
  const listQs =
    (tq ? tq + '&' : '?') + 'decrypt=true&source=' + encodeURIComponent('vercel-cli:pull');
  const list = await (
    await fetch('https://api.vercel.com/v9/projects/' + proj.id + '/env' + listQs, { headers })
  ).json();
  async function readEnvValue(row) {
    if (!row) return '';
    let val = row.value || row.legacyValue || '';
    if (val) return val;
    if (row.type !== 'encrypted' && row.type !== 'secret') return '';
    const detail = await (
      await fetch(
        'https://api.vercel.com/v9/projects/' +
          proj.id +
          '/env/' +
          encodeURIComponent(row.id) +
          (tq ? tq + '&' : '?') +
          'decrypt=true',
        { headers }
      )
    ).json();
    return detail.value || detail.legacyValue || '';
  }

  for (const key of keys) {
    const row = (list.envs || []).find(function (e) {
      if (e.key !== key) return false;
      const targets = e.target;
      if (!targets) return true;
      if (Array.isArray(targets)) return targets.includes('production');
      return targets === 'production';
    });
    if (!row) throw new Error('Falta en Vercel: ' + key);
    const val = await readEnvValue(row);
    if (!val) throw new Error('No se pudo leer ' + key);
    process.env[key] = val;
  }
}

async function main() {
  await loadEnvFromVercel(['SUPABASE_URL', 'SUPABASE_DB_PASSWORD']);
  if (!process.env.POSTGRES_URL) {
    try {
      await loadEnvFromVercel(['POSTGRES_URL']);
    } catch (e) {
      /* optional */
    }
  }
  const signup = await migrateRepartidorSignupSchema();
  console.log('signup:', JSON.stringify(signup));
  const support = await migrateRepartidorSupportSchema();
  console.log('support:', JSON.stringify(support));
  if (!signup.ok || !support.ok) process.exit(1);
}

main().catch(function (e) {
  console.error(e.message || e);
  process.exit(1);
});
