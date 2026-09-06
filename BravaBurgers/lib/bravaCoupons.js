/** Lógica compartida de cupones / compensaciones Brava */
const ITEM_PAPAS_DISCOUNT = 4500;

function telNorm(t) {
  return String(t || '').replace(/\D/g, '').slice(-10);
}

function genCouponCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'BRAVA-';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function couponLabel(c) {
  if (!c) return '';
  const tipo = String(c.tipo || '');
  const valor = Number(c.valor) || 0;
  if (tipo === 'pct') return valor + '% off';
  if (tipo === 'monto') return '$' + Math.round(valor).toLocaleString('es-AR') + ' off';
  if (tipo === 'envio') return 'Envío gratis';
  if (tipo === 'item') return 'Papas Brava gratis';
  return tipo;
}

function calcDiscount(c, subtotal, envio) {
  if (!c || c.usado) return 0;
  const valor = Number(c.valor) || 0;
  const sub = Number(subtotal) || 0;
  const env = Number(envio) || 0;
  const tipo = String(c.tipo || '');
  if (tipo === 'pct') return Math.round(sub * (valor / 100));
  if (tipo === 'monto') return Math.min(valor, sub + env);
  if (tipo === 'envio') return env;
  if (tipo === 'item') return ITEM_PAPAS_DISCOUNT;
  return 0;
}

function effectiveEnvio(c, envio) {
  if (c && !c.usado && String(c.tipo || '') === 'envio') return 0;
  return Number(envio) || 0;
}

function buildCompensationWaText(cliente, orn, codigo, c) {
  const nombre = String(cliente || 'Hola').split(/\s+/)[0];
  const beneficio = couponLabel(c);
  return (
    '¡' +
    nombre +
    '! Lamentamos lo de tu pedido ' +
    orn +
    '.\n\n' +
    'Te dejamos ' +
    beneficio +
    ' en tu próximo pedido.\n' +
    'Código: ' +
    codigo +
    '\n' +
    'Pedí acá: https://linktr.ee/bravaburgers\n\n' +
    'Válido 1 uso · próximo sábado. 🍔'
  );
}

function buildReenvioWaText(cliente, newOrn, origOrn) {
  const nombre = String(cliente || 'Hola').split(/\s+/)[0];
  return (
    '¡' +
    nombre +
    '! Armamos tu reenvío ' +
    newOrn +
    ' sin cargo por el inconveniente con ' +
    origOrn +
    '.\n' +
    'Misma dirección · lo preparamos en el próximo turno. 🍔'
  );
}

function orderTotalsWithCoupon(subtotal, envioOriginal, coupon) {
  const sub = Number(subtotal) || 0;
  const envOrig = Number(envioOriginal) || 0;
  if (!coupon) {
    return { envio: envOrig, descuento: 0, total: sub + envOrig };
  }
  const envio = effectiveEnvio(coupon, envOrig);
  const descuento = calcDiscount(coupon, sub, envOrig);
  const total = Math.max(0, sub + envio - descuento);
  return { envio, descuento, total };
}

module.exports = {
  ITEM_PAPAS_DISCOUNT,
  telNorm,
  genCouponCode,
  couponLabel,
  calcDiscount,
  effectiveEnvio,
  buildCompensationWaText,
  buildReenvioWaText,
  orderTotalsWithCoupon,
};
