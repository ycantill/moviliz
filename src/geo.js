// Utilidades de texto y de "geocodificación" sin conexión.
//
// Barranquilla y Soledad usan una cuadrícula de calles y carreras numeradas.
// Una dirección como "Cra 43 # 70-15" queda en la carrera 50 con calle 76.
// Con eso se estima la distancia en cuadras sin GPS ni servicios externos.
// Cada municipio tiene su propia numeración, así que solo se comparan
// puntos del mismo municipio.

export function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// "45B" -> 45.3, "26C7" -> 26.45, "42B1" -> 42.3, "7" -> 7
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

function val(tok, sur) {
  const v = numValue(tok.replace(/\s+/g, ''));
  if (v == null) return null;
  return sur ? -v : v;
}

// Devuelve {calle, carrera} o null.
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

export function blocks(a, b) {
  if (!a || !b || a.muni !== b.muni) return Infinity;
  if (a.calle == null || b.calle == null) return Infinity;
  return Math.abs(a.calle - b.calle) + Math.abs(a.carrera - b.carrera);
}

// Aproximación: una cuadra ~ 100 m, se camina a ~ 80 m por minuto.
export const METROS_POR_CUADRA = 100;
export function walkMinutes(nBlocks) {
  return Math.max(1, Math.round((nBlocks * METROS_POR_CUADRA) / 80));
}

export function detectMuni(text, fallback = 'barranquilla') {
  const t = norm(text);
  if (/\bsoledad\b|\bsol$/.test(t)) return 'soledad';
  if (/\bbaq\b|barranquilla/.test(t)) return 'barranquilla';
  if (/\bmalambo\b/.test(t)) return 'malambo';
  return fallback;
}
