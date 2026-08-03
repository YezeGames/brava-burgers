async function gasPost(payload) {
  const url = (process.env.BRAVA_GAS_URL || '').trim();
  if (!url) {
    return { ok: false, error: 'gas_not_configured', status: 503 };
  }
  const body = JSON.stringify(payload);
  let res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    redirect: 'manual',
  });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    if (loc) {
      res = await fetch(loc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        redirect: 'follow',
      });
    }
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { ok: false, error: 'invalid_gas_response', raw: text.slice(0, 200) };
  }
  return { ...data, httpStatus: res.status };
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = { gasPost, cors };
