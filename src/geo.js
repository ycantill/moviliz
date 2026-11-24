// Utilidades de texto y de "geocodificación" sin conexión.
//
// Barranquilla y Soledad usan una cuadrícula de calles y carreras numeradas.
// Una dirección como "Cra 43 # 70-15" queda en la carrera 43 con calle 70.
// Con eso se estima la distancia en cuadras sin GPS ni servicios externos.
// Cada municipio tiene su propia numeración, así que solo se comparan
// puntos del mismo municipio.

/** @typedef {import('./types').Anclas} Anclas */
/** @typedef {import('./types').Muni} Muni */
/** @typedef {import('./types').PuntoGrid} PuntoGrid */

/** Minúsculas, sin tildes y con espacios simples. @param {unknown} s */
export function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// "45B" -> 45.3, "26C7" -> 26.45, "42B1" -> 42.3, "7" -> 7
/** @param {string | number} tok @returns {number | null} */
export function numValue(tok) {
  const m = /^(\d+)\s*([a-z])?\s*(\d)?$/i.exec(String(tok).trim());
  if (!m) return null;
  let v = parseInt(m[1], 10);
  if (m[2]) {
    const idx = m[2].toLowerCase().charCodeAt(0) - 96; // a=1
    v += Math.min(idx, 6) * 0.15;
  }
  return v;
}

const CALLE = '(?:calle|cll|cl|clle|diagonal|diag|dg)';
const CARRERA = '(?:carrera|cra|kra|kr|cr|carr|transversal|tv|trans)';
const NUM = '(\\d+\\s?[a-z]?\\d?)';
const SUR = '(\\s*sur)?';
const SEP = '\\s*(?:#|no\\.?|n°|nº|n\\.|numero|número)?\\s*';

/** @param {string} tok @param {string | undefined} sur */
function val(tok, sur) {
  const v = numValue(tok.replace(/\s+/g, ''));
  if (v == null) return null;
  return sur ? -v : v;
}

// Devuelve {calle, carrera} o null.
/** @param {string} text @returns {{ calle: number | null, carrera: number | null } | null} */
export function parseAddress(text) {
  const t = norm(text).replace(/\bbis\b/g, '');
  let m;
  // Carrera 46 No. 76-68  /  Cra 43 # 70-15  /  Carrera 18 Sur No. 46C-04
  m = new RegExp(`\\b${CARRERA}\\.?\\s*${NUM}${SUR}${SEP}${NUM}${SUR}\\s*[-–]\\s*\\d+`, 'i').exec(t);
  if (m) return { carrera: val(m[1], m[2]), calle: val(m[3], m[4]) };
  // Calle 76 No. 47-57  /  Calle 45B # 7H-34
  m = new RegExp(`\\b${CALLE}\\.?\\s*${NUM}${SUR}${SEP}${NUM}${SUR}\\s*[-–]\\s*\\d+`, 'i').exec(t);
  if (m) return { calle: val(m[1], m[2]), carrera: val(m[3], m[4]) };
  // Carrera 8 con calle 30  /  Carrera 4 calle 36
  m = new RegExp(`\\b${CARRERA}\\.?\\s*${NUM}${SUR}\\s*(?:con|y|x)?\\s*${CALLE}\\.?\\s*${NUM}${SUR}`, 'i').exec(t);
  if (m) return { carrera: val(m[1], m[2]), calle: val(m[3], m[4]) };
  // Calle 45 con carrera 5B  /  Calle 37C carrera 2
  m = new RegExp(`\\b${CALLE}\\.?\\s*${NUM}${SUR}\\s*(?:con|y|x)?\\s*${CARRERA}\\.?\\s*${NUM}${SUR}`, 'i').exec(t);
  if (m) return { calle: val(m[1], m[2]), carrera: val(m[3], m[4]) };
  return null;
}

/** Distancia en cuadras (Manhattan); Infinity entre municipios distintos. @param {PuntoGrid | null | undefined} a @param {PuntoGrid | null | undefined} b */
export function blocks(a, b) {
  if (!a || !b || a.muni !== b.muni) return Infinity;
  if (a.calle == null || b.calle == null || a.carrera == null || b.carrera == null) return Infinity;
  return Math.abs(a.calle - b.calle) + Math.abs(a.carrera - b.carrera);
}

// Aproximación: una cuadra ~ 100 m, se camina a ~ 80 m por minuto.
export const METROS_POR_CUADRA = 100;
/** @param {number} nBlocks */
export function walkMinutes(nBlocks) {
  return Math.max(1, Math.round((nBlocks * METROS_POR_CUADRA) / 80));
}

/** @param {string} text @param {Muni} [fallback] @returns {Muni} */
export function detectMuni(text, fallback = 'barranquilla') {
  const t = norm(text);
  if (/\bsoledad\b|\bsol$/.test(t)) return 'soledad';
  if (/\bbaq\b|barranquilla/.test(t)) return 'barranquilla';
  if (/\bmalambo\b/.test(t)) return 'malambo';
  return fallback;
}

// ---------- Coordenadas → calle y carrera ----------
// Usa esquinas conocidas de OpenStreetMap (data.anclas). Con las 8 más
// cercanas ajusta un plano local para calle y otro para carrera.
// Devuelve {muni, calle, carrera, error} o null si el punto está lejos de
// cualquier esquina conocida (fuera del área metropolitana).
const K_ANCLAS = 8;
const MAX_DIST2 = 60 * 60; // ~650 m, en unidades de 1/10000 de grado al cuadrado

/**
 * @param {Anclas | undefined} anclas
 * @param {number} lat
 * @param {number} lon
 * @param {Muni | null} [muniPreferido]
 * @returns {{ muni: Muni, calle: number, carrera: number } | null}
 */
export function latLonToGrid(anclas, lat, lon, muniPreferido = null) {
  if (!anclas?.puntos) return null;
  const a = (lat - anclas.lat0) * anclas.escala;
  const b = (lon - anclas.lon0) * anclas.escala;
  /** @type {{ muni: Muni, near: [[number, number, number, number], number][], score: number } | null} */
  let best = null;
  for (const [muniKey, pts] of Object.entries(anclas.puntos)) {
    const muni = /** @type {Muni} */ (muniKey);
    /** @type {[[number, number, number, number], number][]} */
    const near = (pts || []).map((p) => /** @type {[[number, number, number, number], number]} */ ([p, (p[0] - a) ** 2 + (p[1] - b) ** 2])).sort((x, y) => x[1] - y[1]).slice(0, K_ANCLAS);
    if (!near.length || near[0][1] > MAX_DIST2) continue;
    const score = near[0][1] - (muni === muniPreferido ? 400 : 0);
    if (!best || score < best.score) best = { muni, near, score };
  }
  if (!best) return null;
  const { near } = best;
  if (near[0][1] === 0) return { muni: best.muni, calle: near[0][0][2], carrera: near[0][0][3] };
  const w = near.map(([, d]) => 1 / (d + 4));
  /** Ajuste por mínimos cuadrados ponderados de un plano local. @param {2 | 3} k */
  const fit = (k) => {
    const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const r = [0, 0, 0];
    near.forEach(([p], i) => {
      const t = [1, p[0] - a, p[1] - b];
      for (let u = 0; u < 3; u++) { r[u] += w[i] * t[u] * p[k]; for (let v = 0; v < 3; v++) S[u][v] += w[i] * t[u] * t[v]; }
    });
    /** @param {number[][]} M */
    const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const D = det(S);
    // Puntos casi alineados: se usa el promedio ponderado.
    if (Math.abs(D) < 1e-6) return near.reduce((s, [p], i) => s + w[i] * p[k], 0) / w.reduce((s, x) => s + x, 0);
    return det(S.map((row, i) => [r[i], row[1], row[2]])) / D;
  };
  /** @param {number} v */
  const round = (v) => Math.round(v * 10) / 10;
  return { muni: best.muni, calle: round(fit(2)), carrera: round(fit(3)) };
}
