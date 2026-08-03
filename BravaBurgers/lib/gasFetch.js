function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function gasPost(payload) {
  const url = (process.env.BRAVA_GAS_URL || '').trim();
  if (!url) {
    return { ok: false, error: 'gas_not_configured', status: 503 };
  }
  const body = JSON.stringify(payload);
  let last = { ok: false, error: 'gas_failed' };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        redirect: 'follow',
        cache: 'no-store',
      });
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        return { ...data, httpStatus: res.status };
      } catch {
        last = {
          ok: false,
          error: 'invalid_gas_response',
          raw: text.slice(0, 200),
          httpStatus: res.status,
        };
      }
    } catch (e) {
      last = { ok: false, error: 'gas_network_error', message: String(e.message || e) };
    }
    if (attempt < 1) await sleep(200);
  }
  return last;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = { gasPost, cors };
