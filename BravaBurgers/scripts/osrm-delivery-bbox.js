'use strict';
/** Bbox de reparto (zonas-entrega.geojson) para recortar OSRM en la PC. */
const pad = Number(process.env.OSRM_BBOX_PAD || '0.08');
const { getDeliveryBbox } = require('../lib/deliveryZone');
const b = getDeliveryBbox(pad);
process.stdout.write(
  JSON.stringify({
    minLng: b.minLng,
    minLat: b.minLat,
    maxLng: b.maxLng,
    maxLat: b.maxLat,
    padRatio: pad,
  })
);
