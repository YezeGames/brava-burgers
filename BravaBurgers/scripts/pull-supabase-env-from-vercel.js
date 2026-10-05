#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outPath = path.join(root, 'secrets', 'supabase.env');

function readVercelToken() {
  if ((process.env.VERCEL_TOKEN || '').trim()) {
    return process.env.VERCEL_TOKEN.trim();
  }
  const p = path.join(root, 'secrets', 'vercel-token.txt');
  if (!fs.existsSync(p)) return '';
  const first = fs.readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
  return first.startsWith('vcp_') ? first : '';
}

async function main() {
  const token = readVercelToken();
  if (!token) {
    console.error('Falta VERCEL_TOKEN o secrets/vercel-token.txt (línea 1: vcp_...)');
    process.exit(1);
  }
  const headers = { Authorization: 'Bearer ' + token };
  const teams = await (await fetch('https://api.vercel.com/v2/teams', { headers })).json();
  const team = (teams.teams || []).find((t) => t.slug === 'bravaburgers');
  const tq = team ? '?teamId=' + encodeURIComponent(team.id) : '';
  const proj = await (await fetch('https://api.vercel.com/v9/projects/brava-burgers' + tq, { headers })).json();
  if (!proj || !proj.id) {
    console.error('Proyecto brava-burgers no encontrado', proj);
    process.exit(1);
  }
  const listQs =
    (tq ? tq + '&' : '?') + 'decrypt=true&source=' + encodeURIComponent('vercel-cli:pull');
  const list = await (
    await fetch('https://api.vercel.com/v9/projects/' + proj.id + '/env' + listQs, { headers })
  ).json();
  const want = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const lines = ['# generado por pull-supabase-env-from-vercel.js — no commitear'];
  for (let i = 0; i < want.length; i++) {
    const key = want[i];
    const row = (list.envs || []).find(function (e) {
      if (e.key !== key) return false;
      const targets = e.target;
      if (!targets) return true;
      if (Array.isArray(targets)) return targets.includes('production');
      return targets === 'production';
    });
    if (!row) {
      console.error('Falta en Vercel:', key);
      process.exit(1);
    }
    const val = row.value || row.legacyValue;
    if (!val) {
      console.error('No se pudo leer', key, '(type=' + row.type + ')');
      process.exit(1);
    }
    lines.push(key + '=' + val);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  console.log('OK:', outPath);
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
