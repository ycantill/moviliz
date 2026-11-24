// Genera data/transmetro.json a partir de data/raw/.
// Uso: node scripts/build-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseAddress, detectMuni, norm } from '../src/geo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kb = JSON.parse(readFileSync(join(root, 'data/raw/rutas_transmetro.json'), 'utf8'));
const rawPar = readFileSync(join(root, 'data/raw/paraderos.txt'), 'utf8');

// Estaciones: posición aproximada en la cuadrícula de su municipio.
const STATIONS = [
  { id: 'portal-soledad', name: 'Portal de Soledad', muni: 'soledad', calle: 65, carrera: 13, alias: ['portal'] },
  { id: 'pacho-galan', name: 'Pacho Galán', muni: 'soledad', calle: 64, carrera: 16.5 },
  { id: 'pedro-ramaya', name: 'Pedro Ramayá Beltrán', muni: 'soledad', calle: 63, carrera: 23.5, alias: ['pedro ramaya'] },
  { id: 'joaquin-barrios-polo', name: 'Joaquín Barrios Polo', muni: 'barranquilla', calle: 45, carrera: 1.5, alias: ['estadio metropolitano', 'metropolitano', 'gases del caribe', 'barrios polo'] },
  { id: 'buenos-aires', name: 'Buenos Aires', muni: 'barranquilla', calle: 45, carrera: 7.3 },
  { id: 'la-ocho', name: 'La Ocho', muni: 'barranquilla', calle: 45, carrera: 8.4 },
  { id: 'la-catorce', name: 'La Catorce', muni: 'barranquilla', calle: 45, carrera: 15.5 },
  { id: 'la-veintiuna', name: 'La Veintiuna', muni: 'barranquilla', calle: 45, carrera: 20.5 },
  { id: 'atlantico', name: 'Atlántico', muni: 'barranquilla', calle: 45, carrera: 26.5 },
  { id: 'chiquinquira', name: 'Chiquinquirá', muni: 'barranquilla', calle: 45, carrera: 34.5 },
  { id: 'la-arenosa', name: 'La Arenosa', muni: 'barranquilla', calle: 45, carrera: 42 },
  { id: 'la-catedral', name: 'La Catedral', muni: 'barranquilla', calle: 51.5, carrera: 46 },
  { id: 'alfredo-correa', name: 'Alfredo Correa de Andréis', muni: 'barranquilla', calle: 61, carrera: 46, alias: ['alfredo correa'] },
  { id: 'esthercita-forero', name: 'Esthercita Forero', muni: 'barranquilla', calle: 69.5, carrera: 46, alias: ['estercita forero'] },
  { id: 'joe-arroyo', name: 'Joe Arroyo (retorno)', muni: 'barranquilla', calle: 74, carrera: 46, alias: ['joe arroyo', 'retorno'] },
  { id: 'barrio-abajo', name: 'Barrio Abajo', muni: 'barranquilla', calle: 44, carrera: 46 },
  { id: 'parque-cultural', name: 'Parque Cultural del Caribe', muni: 'barranquilla', calle: 37.5, carrera: 46, alias: ['parque cultural'] },
];

const kbSt = Object.fromEntries((kb.estaciones || []).map((e) => [norm(e.nombre), e.ubicacion]));
for (const s of STATIONS) {
  const key = Object.keys(kbSt).find((k) => k.startsWith(norm(s.name).split(' (')[0]) || norm(s.name).startsWith(k.split(' /')[0]));
  s.ubicacion = key ? kbSt[key] : '';
}

function stationFromLabel(label) {
  const t = norm(label);
  if (/^portal de soledad$/.test(t)) return 'portal-soledad';
  const m = /^(?:estacion(?: de)?(?: retorno)?)\s+(.*)$/.exec(t);
  if (!m) return null;
  const rest = m[1];
  for (const s of STATIONS) {
    const names = [s.name, ...(s.alias || [])].map(norm);
    if (names.some((n) => rest.startsWith(n.replace(/ \(retorno\)/, '')))) return s.id;
  }
  return null;
}

function stationByKbName(name) {
  const t = norm(name);
  for (const s of STATIONS) {
    const names = [s.name, ...(s.alias || [])].map((n) => norm(n).replace(/ \(retorno\)/, ''));
    if (names.some((n) => t.includes(n))) return s.id;
  }
  throw new Error('Estación desconocida: ' + name);
}

// Municipio por defecto de cada alimentadora.
const SOLEDAD = /^(a3-|a4-|a5-|a2-1)/;
function muniFor(slug, label) {
  if (slug === 'a2-1-hipodromo' && /las torres|metrocentro|calle 45|45h|45d|carrera 1e/i.test(norm(label))) return 'barranquilla';
  if (slug.startsWith('a4-1')) return 'malambo';
  return detectMuni(label, SOLEDAD.test(slug) ? 'soledad' : 'barranquilla');
}

function cleanLabel(l) {
  return l.replace(/\s*\((?:omitido por desv[ií]o)\)\s*/i, '').trim();
}

const parLines = rawPar.split('\n').filter((l) => l && !l.startsWith('#'));
const paraderos = Object.fromEntries(parLines.map((l) => {
  const i = l.indexOf('=');
  return [l.slice(0, i), l.slice(i + 1).split('|')];
}));

const routes = [];
const stById = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

function isActive(estado) {
  return !/suspendida/i.test(estado) || /^activa/i.test(estado);
}

for (const r of kb.rutas_troncales) {
  routes.push({
    id: r.codigo,
    code: r.codigo,
    name: `${r.desde} → ${r.hasta}`,
    type: 'troncal',
    tipo: r.tipo,
    activa: isActive(r.estado),
    estado: r.estado,
    horario: r.horario || {},
    nota: r.nota || '',
    fuente: r.fuente,
    stops: r.paradas.map((p) => ({ station: stationByKbName(p) })),
  });
}

for (const a of kb.rutas_alimentadoras) {
  const slug = a.fuente.replace(/\/$/, '').split('/').pop();
  const labels = paraderos[slug];
  if (!labels) throw new Error('Sin paraderos: ' + slug);
  const stops = [];
  for (const raw of labels) {
    const omitted = /omitido por desv/i.test(raw);
    if (omitted) continue; // el bus no para ahí mientras dure el desvío
    const label = cleanLabel(raw);
    const station = stationFromLabel(label);
    if (station) { stops.push({ station }); continue; }
    const muni = muniFor(slug, label);
    const pos = parseAddress(label.split(' / ')[0]);
    stops.push({ label, muni, calle: pos?.calle ?? null, carrera: pos?.carrera ?? null, approx: !pos });
  }
  // Paraderos sin dirección (p. ej. "Terminal de Transportes"): se ubican
  // entre el paradero anterior y el siguiente que sí tengan dirección.
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (s.station || s.calle != null) continue;
    const near = (dir) => {
      for (let j = i + dir; j >= 0 && j < stops.length; j += dir) {
        const o = stops[j];
        const p = o.station ? stById[o.station] : o;
        if (p.calle != null && p.muni === s.muni) return p;
      }
      return null;
    };
    const a1 = near(-1), b1 = near(1);
    const ref = a1 && b1 ? { calle: (a1.calle + b1.calle) / 2, carrera: (a1.carrera + b1.carrera) / 2 } : a1 || b1;
    if (ref) { s.calle = ref.calle; s.carrera = ref.carrera; }
  }
  routes.push({
    id: a.codigo,
    code: a.codigo,
    name: a.nombre,
    type: 'alimentadora',
    activa: isActive(a.estado),
    estado: a.estado,
    horario: a.horario || {},
    nota: a.nota || '',
    barrios: (a.barrios || '').replace(/^[^:]*:\s*/, '').split(/,|\by\b/).map((b) => b.replace(/\(.*?\)/g, '').trim()).filter((b) => b.length > 2 && b.length < 35 && !/\b(hasta|por la|llega)\b/i.test(b)),
    conecta: a.conecta_con_troncal_en,
    fuente: a.fuente,
    stops,
  });
}

// Esquinas de OpenStreetMap para pasar coordenadas a calle y carrera.
const MUNI_CODE = { b: 'barranquilla', s: 'soledad', m: 'malambo' };
const anclas = {};
for (const line of readFileSync(join(root, 'data/raw/anclas.txt'), 'utf8').split('\n')) {
  const m = /^([bsm])=(.*)$/.exec(line.trim());
  if (!m) continue;
  anclas[MUNI_CODE[m[1]]] = m[2].trim().split(/\s+/).map((p) => p.split(',').map(Number));
}

const out = {
  version: kb.fecha,
  fuente: 'https://transmetro.gov.co',
  generado: new Date().toISOString().slice(0, 10),
  reglas: kb.reglas_transbordo,
  stations: STATIONS.map(({ alias, ...s }) => ({ ...s, alias: alias || [] })),
  routes,
  anclas: { lat0: 10.85, lon0: -74.92, escala: 10000, fuente: 'OpenStreetMap (ODbL)', puntos: anclas },
};
writeFileSync(join(root, 'data/transmetro.json'), JSON.stringify(out));
const approx = routes.flatMap((r) => r.stops.filter((s) => s.approx).map((s) => `${r.code}: ${s.label}`));
console.log(`OK: ${STATIONS.length} estaciones, ${routes.length} rutas, ${routes.reduce((n, r) => n + r.stops.length, 0)} paradas. Sin dirección exacta: ${approx.length}. Esquinas: ${Object.values(anclas).reduce((n, a) => n + a.length, 0)}`);
if (process.argv.includes('-v')) console.log(approx.join('\n'));
