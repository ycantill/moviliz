// Búsqueda de lugares por nombre cuando hay internet.
// Photon (komoot) para sugerir mientras se escribe y Nominatim (OpenStreetMap)
// de respaldo al oprimir "Buscar". Ambos son gratis y sin clave.
// Solo se envía el texto que la persona escribe en la búsqueda.

const BBOX = { minLon: -74.92, minLat: 10.85, maxLon: -74.72, maxLat: 11.06 };
const CENTRO = { lat: 10.97, lon: -74.80 };
const MUNIS = { barranquilla: 'barranquilla', soledad: 'soledad', malambo: 'malambo' };

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function muniDe(...textos) {
  for (const t of textos) {
    const n = norm(t);
    for (const k of Object.keys(MUNIS)) if (n.includes(k)) return MUNIS[k];
  }
  return null;
}

function dentro(lat, lon) {
  return lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon;
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((p) => {
    const k = norm(p.name) + '|' + p.lat.toFixed(3) + '|' + p.lon.toFixed(3);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function enLinea() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

// Sugerencias mientras se escribe.
export async function buscarPhoton(q, { signal, limit = 6 } = {}) {
  const u = new URL('https://photon.komoot.io/api/');
  u.searchParams.set('q', q);
  u.searchParams.set('limit', String(limit + 4));
  u.searchParams.set('lat', String(CENTRO.lat));
  u.searchParams.set('lon', String(CENTRO.lon));
  u.searchParams.set('bbox', [BBOX.minLon, BBOX.minLat, BBOX.maxLon, BBOX.maxLat].join(','));
  const res = await fetch(u, { signal });
  if (!res.ok) throw new Error('Photon ' + res.status);
  const j = await res.json();
  const out = [];
  for (const f of j.features || []) {
    const [lon, lat] = f.geometry?.coordinates || [];
    const p = f.properties || {};
    if (!dentro(lat, lon) || !p.name) continue;
    const zona = [p.street && (p.street + (p.housenumber ? ' ' + p.housenumber : '')), p.district || p.locality, p.city].filter(Boolean);
    out.push({
      kind: 'mapa',
      name: p.name,
      label: [...new Set(zona)].join(', '),
      lat, lon,
      muni: muniDe(p.city, p.county, p.district),
      fuente: 'photon',
    });
  }
  return dedupe(out).slice(0, limit);
}

// Respaldo al oprimir "Buscar". Las reglas de Nominatim piden no usarlo
// para sugerir mientras se escribe y máximo una consulta por segundo.
let ultimaNominatim = 0;
export async function buscarNominatim(q, { signal, limit = 5 } = {}) {
  const espera = 1100 - (Date.now() - ultimaNominatim);
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaNominatim = Date.now();
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('q', q);
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('countrycodes', 'co');
  u.searchParams.set('accept-language', 'es');
  u.searchParams.set('viewbox', [BBOX.minLon, BBOX.maxLat, BBOX.maxLon, BBOX.minLat].join(','));
  u.searchParams.set('bounded', '1');
  u.searchParams.set('addressdetails', '1');
  const res = await fetch(u, { signal });
  if (!res.ok) throw new Error('Nominatim ' + res.status);
  const j = await res.json();
  const out = [];
  for (const r of j) {
    const lat = +r.lat, lon = +r.lon;
    if (!dentro(lat, lon)) continue;
    const a = r.address || {};
    out.push({
      kind: 'mapa',
      name: r.name || String(r.display_name).split(',')[0],
      label: [a.road, a.suburb || a.neighbourhood, a.city || a.town].filter(Boolean).join(', '),
      lat, lon,
      muni: muniDe(a.city, a.town, a.county, r.display_name),
      fuente: 'nominatim',
    });
  }
  return dedupe(out);
}
