// Cálculo de rutas sin conexión.
//
// El sistema se modela como un grafo: estaciones y paraderos son nodos,
// cada ruta une sus paradas en orden, y caminar une puntos cercanos.
// Dijkstra busca el viaje de menor "costo", donde el costo pondera
// caminar, subirse a un bus (cada transbordo) y las paradas recorridas.
import { blocks, latLonToGrid, norm, parseAddress, walkMinutes } from './geo.js';

/** @typedef {import('./types').Datos} Datos */
/** @typedef {import('./types').Ruta} Ruta */
/** @typedef {import('./types').Nodo} Nodo */
/** @typedef {import('./types').Indice} Indice */
/** @typedef {import('./types').LugarBuscable} LugarBuscable */
/** @typedef {import('./types').Lugar} Lugar */
/** @typedef {import('./types').LugarResuelto} LugarResuelto */
/** @typedef {import('./types').OpcionesViaje} OpcionesViaje */
/** @typedef {import('./types').ResultadoViaje} ResultadoViaje */
/** @typedef {import('./types').Tramo} Tramo */
/** @typedef {import('./types').DiaKey} DiaKey */
/** @typedef {import('./types').PerfilId} PerfilId */
/** @typedef {{ walk: number, board: number, ride: number, label: string }} Perfil */

/** @type {Record<PerfilId, Perfil>} */
export const PERFILES = {
  caminar: { walk: 10, board: 25, ride: 1.5, label: 'Caminar menos' },
  transbordos: { walk: 4, board: 60, ride: 1.5, label: 'Menos transbordos' },
};
const MAX_BOARDINGS = 3; // hasta 2 transbordos con un solo pasaje
const MAX_WALK_ENDS = 12; // cuadras máximas caminando al inicio o al final
const MAX_WALK_TRANSFER = 3; // cuadras máximas caminando en un transbordo

// ---------- Horarios ----------
// "5:37-9:37 a.m. y 3:30-8:00 p.m." -> [[337, 577], [930, 1200]] (minutos)
/** @param {string | undefined} txt @returns {[number, number][] | null} */
export function parseHorario(txt) {
  if (!txt) return null;
  const t = norm(txt).replace(/\./g, '').replace(/\bm\b(?!\w)/g, 'pm');
  if (/no opera|n\/a/.test(t)) return [];
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a m|p m)?/g;
  /** @type {{ h: number, min: number, ap: string | null }[]} */
  const toks = [];
  let m;
  while ((m = re.exec(t))) {
    const h = parseInt(m[1], 10);
    if (h > 24) continue;
    toks.push({ h, min: parseInt(m[2] || '0', 10), ap: m[3] ? m[3].replace(' ', '') : null });
  }
  if (toks.length < 2) return null;
  for (let i = toks.length - 2; i >= 0; i--) if (!toks[i].ap) toks[i].ap = toks[i + 1].ap;
  const mins = toks.map(({ h, min, ap }) => {
    let hh = h % 12;
    if (ap === 'pm') hh += 12;
    if (!ap && h >= 12) hh = h;
    return hh * 60 + min;
  });
  /** @type {[number, number][]} */
  const ranges = [];
  for (let i = 0; i + 1 < mins.length; i += 2) {
    const a = mins[i];
    let b = mins[i + 1];
    if (b < a) b += 12 * 60; // "11:57 ... 8:30 p.m." mal escrito
    ranges.push([a, b]);
  }
  return ranges;
}

/** @param {Date} date @returns {DiaKey} */
export function dayKey(date) {
  const d = date.getDay();
  return d === 0 ? 'dom_fest' : d === 6 ? 'sab' : 'lv';
}

// true = opera, false = no opera, null = no se sabe (se asume que opera)
/** @param {Ruta} route @param {Date | null | undefined} date @returns {boolean | null} */
export function operaEn(route, date) {
  if (!date) return true;
  const txt = route.horario?.[dayKey(date)];
  if (txt === undefined) return null;
  const ranges = parseHorario(txt);
  if (ranges === null) return null;
  const now = date.getHours() * 60 + date.getMinutes();
  return ranges.some(([a, b]) => now >= a - 5 && now <= b);
}

// ---------- Índices ----------
/** @param {Datos} data @returns {Indice} */
export function buildIndex(data) {
  const stations = Object.fromEntries(data.stations.map((s) => [s.id, s]));
  /** @type {Map<string, Nodo>} */
  const nodes = new Map();
  /** @param {Nodo} n */
  const addNode = (n) => { if (!nodes.has(n.id)) nodes.set(n.id, n); return n.id; };
  for (const s of data.stations) addNode({ id: 'S:' + s.id, label: 'Estación ' + s.name, muni: s.muni, calle: s.calle, carrera: s.carrera, station: s.id });

  const routes = data.routes.map((r) => {
    const seq = r.stops.map((s, i) => 'station' in s
      ? 'S:' + s.station
      : addNode({ id: `P:${r.code}:${i}`, label: s.label, muni: s.muni, calle: s.calle, carrera: s.carrera, approx: s.approx }));
    return { ...r, seq };
  });

  /** @type {Indice['servedBy']} */
  const servedBy = new Map();
  routes.forEach((r, ri) => r.seq.forEach((n, i) => {
    if (i === r.seq.length - 1 && r.type === 'alimentadora' && n === r.seq[0]) return; // fin del circuito
    const lista = servedBy.get(n) || [];
    lista.push([ri, i]);
    servedBy.set(n, lista);
  }));

  // Caminatas cortas entre nodos (transbordos a pie).
  const list = [...nodes.values()].filter((n) => n.calle != null);
  /** @type {Indice['walks']} */
  const walks = new Map();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const d = blocks(list[i], list[j]);
      if (d <= MAX_WALK_TRANSFER && d > 0) {
        for (const [a, b] of [[list[i], list[j]], [list[j], list[i]]]) {
          const lista = walks.get(a.id) || [];
          lista.push([b.id, d]);
          walks.set(a.id, lista);
        }
      }
    }
  }

  // Índice de búsqueda: estaciones y lugares (paraderos con nombre). Los barrios
  // no se incluyen: la web oficial no dice dónde quedan, solo qué rutas pasan cerca.
  /** @type {LugarBuscable[]} */
  const places = [];
  for (const s of data.stations) {
    places.push({ kind: 'estacion', name: 'Estación ' + s.name, keys: [s.name, ...(s.alias || [])].map(norm), node: 'S:' + s.id });
  }
  for (const n of nodes.values()) {
    if (n.station) continue;
    const extra = n.label.replace(/^(calle|carrera|cra|avenida|av\.|diagonal|transversal|v[ií]a)\s+[\w.#\s-]*?\d+\w*(\s*(con|no\.|#)\s*[\w\s-]*?\d+\w*(\s*-\s*\d+)?)?/i, '').replace(/\b(lado|frente a|esquina|esq)\b.*$/i, '').trim();
    if (extra.length > 3 && !/^\(/.test(extra)) places.push({ kind: 'lugar', name: extra, keys: [norm(extra)], node: n.id, label: n.label });
  }
  return { data, stations, nodes, routes, servedBy, walks, places };
}

/** @param {Indice} index @param {string} query @param {number} [limit] @returns {LugarBuscable[]} */
export function search(index, query, limit = 8) {
  const q = norm(query);
  if (q.length < 2) return [];
  const seen = new Set();
  /** @type {LugarBuscable[]} */
  const out = [];
  /** @param {LugarBuscable} p */
  const score = (p) => Math.min(...p.keys.map((k) => (k === q ? 0 : k.startsWith(q) ? 1 : k.includes(q) ? 2 : 9)));
  const ranked = index.places.map((p) => /** @type {[number, LugarBuscable]} */ ([score(p), p])).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length);
  for (const [, p] of ranked) {
    const key = p.kind + norm(p.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

// Convierte lo que escribe la persona en un punto de partida o llegada.
// place: {kind:'direccion', text, muni} | {kind:'gps', lat, lon} | {kind:'estacion'|'lugar', node}
/** @param {Indice} index @param {Lugar} place @returns {LugarResuelto | null} */
export function resolvePlace(index, place) {
  if (place.kind === 'direccion') {
    const pos = parseAddress(place.text);
    if (!pos) return null;
    return { kind: 'direccion', text: place.text, name: place.name || place.text, muni: place.muni, point: { ...pos, muni: place.muni || 'barranquilla' } };
  }
  if (place.kind === 'gps') {
    // Ubicación del celular: coordenadas que se pasan a calle y carrera.
    const pos = latLonToGrid(index.data.anclas, place.lat, place.lon);
    if (!pos) return null;
    return { ...place, point: pos };
  }
  return place;
}

// Enlaces del punto a nodos cercanos: [[nodeId, cuadras]]
/** @param {Indice} index @param {LugarResuelto} place @returns {[string, number][]} */
function attach(index, place) {
  if (place.node) return [[place.node, 0]];
  /** @type {[string, number][]} */
  const out = [];
  for (const n of index.nodes.values()) {
    const d = blocks(place.point, n);
    if (d <= MAX_WALK_ENDS) out.push([n.id, d]);
  }
  out.sort((a, b) => a[1] - b[1]);
  return out.slice(0, 80);
}

/** Heap binaria de mínimos sobre [costo, clave]. */
class Heap {
  constructor() {
    /** @type {[number, string][]} */
    this.a = [];
  }
  /** @param {[number, string]} x */
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  /** @returns {[number, string]} */
  pop() { const a = this.a; const top = a[0]; const last = /** @type {[number, string]} */ (a.pop()); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

/**
 * Dijkstra sobre estados "a pie en un nodo" y "a bordo de una ruta en una posición",
 * con el número de abordajes en la clave para limitar los transbordos.
 * @param {Indice} index @param {LugarResuelto} from @param {LugarResuelto} to
 * @param {OpcionesViaje} [opts] @returns {ResultadoViaje}
 */
export function planTrip(index, from, to, opts = {}) {
  const P = PERFILES[opts.perfil || 'caminar'];
  const date = opts.date ?? null;
  const usable = index.routes.map((r) => r.activa && !(opts.excluir && opts.excluir.has(r.code)) && operaEn(r, date) !== false);

  const starts = attach(index, from);
  const ends = new Map(attach(index, to));
  if (!starts.length) return { error: 'origen' };
  if (!ends.size) return { error: 'destino' };

  // Estado: "nodo|b" (a pie, b subidas hechas) o "R:ruta:pos|b" (a bordo)
  /** @type {Map<string, number>} */
  const dist = new Map();
  /** @type {Map<string, [string, Paso]>} */
  const prev = new Map();
  const heap = new Heap();
  /** @param {string} key @param {number} cost @param {string} from_ @param {Paso} how */
  const relax = (key, cost, from_, how) => {
    if (cost < (dist.get(key) ?? Infinity)) { dist.set(key, cost); prev.set(key, [from_, how]); heap.push([cost, key]); }
  };
  for (const [n, d] of starts) relax(`${n}|0`, d * P.walk, 'ORIGEN', { walk: d });

  let best = null;
  while (heap.size) {
    const [cost, key] = heap.pop();
    if (cost > (dist.get(key) ?? Infinity)) continue;
    if (key === 'DESTINO') { best = cost; break; }
    const [state, bStr] = key.split('|');
    const b = +bStr;
    if (state.startsWith('R:')) {
      const [, ri, pos] = state.split(':');
      const r = index.routes[+ri];
      const i = +pos;
      const node = r.seq[i];
      relax(`${node}|${b}`, cost, key, { alight: true });
      if (i + 1 < r.seq.length) relax(`R:${ri}:${i + 1}|${b}`, cost + P.ride, key, { ride: true });
      continue;
    }
    const node = state;
    const fin = ends.get(node);
    if (fin != null) relax('DESTINO', cost + fin * P.walk, key, { walk: fin });
    if (b < MAX_BOARDINGS) {
      // Al subir se avanza de una vez a la siguiente parada: no tiene sentido bajarse donde se subió.
      for (const [ri, i] of index.servedBy.get(node) || []) {
        if (usable[ri] && i + 1 < index.routes[ri].seq.length) relax(`R:${ri}:${i + 1}|${b + 1}`, cost + P.board + P.ride, key, { board: true, pos: i });
      }
    }
    if (b > 0) for (const [m, d] of index.walks.get(node) || []) relax(`${m}|${b}`, cost + d * P.walk + 2, key, { walk: d });
  }
  if (best == null) return { error: 'sin-ruta' };

  // Reconstruir el camino
  /** @type {{ key: string, how: Paso }[]} */
  const path = [];
  for (let k = 'DESTINO'; k !== 'ORIGEN';) { const [p, how] = /** @type {[string, Paso]} */ (prev.get(k)); path.unshift({ key: k, how }); k = p; }
  return { cost: best, legs: toLegs(index, path, from, to) };
}

/** @typedef {{ walk?: number, board?: boolean, pos?: number, ride?: boolean, alight?: boolean }} Paso */
/** @typedef {{ type: 'walk', from: string | null, to: string | null, blocks: number, minutes: number }} CaminataCruda */
/** @typedef {{ type: 'ride', route: import('./types').RutaIndexada, fromNode: string, fromPos: number, stops: number, toNode?: string }} BusCrudo */

/**
 * @param {Indice} index @param {{ key: string, how: Paso }[]} path
 * @param {LugarResuelto} from @param {LugarResuelto} to @returns {Tramo[]}
 */
function toLegs(index, path, from, to) {
  /** @type {(CaminataCruda | BusCrudo)[]} */
  const legs = [];
  /** @type {BusCrudo | null} */
  let cur = null;
  /** @type {string | null} */
  let lastNode = null;
  /** @param {string | null | undefined} id */
  const nodo = (id) => /** @type {Nodo} */ (id ? index.nodes.get(id) : null);
  for (const step of path) {
    const st = step.key.split('|')[0];
    if (step.how.walk != null && step.how.walk >= 0 && !step.how.board) {
      const toNode = st === 'DESTINO' ? null : st;
      if (step.how.walk > 0 || (!lastNode && toNode && !from.node) || (st === 'DESTINO' && !to.node)) {
        legs.push({ type: 'walk', from: lastNode, to: toNode, blocks: step.how.walk, minutes: walkMinutes(step.how.walk) });
      }
      if (toNode) lastNode = toNode;
    } else if (step.how.board) {
      const [, ri] = st.split(':');
      const r = index.routes[+ri];
      const pos = /** @type {number} */ (step.how.pos);
      cur = { type: 'ride', route: r, fromNode: r.seq[pos], fromPos: pos, stops: 1 };
    } else if (step.how.ride && cur) {
      cur.stops++;
    } else if (step.how.alight && cur) {
      cur.toNode = st;
      legs.push(cur);
      lastNode = st;
      cur = null;
    }
  }
  return legs.map((l) => {
    if (l.type === 'ride') {
      return { type: 'ride', route: l.route, routeCode: l.route.code, fromPos: l.fromPos, stops: l.stops, from: nodo(l.fromNode), to: nodo(l.toNode) };
    }
    return { ...l, from: l.from ? nodo(l.from) : null, to: l.to ? nodo(l.to) : null };
  });
}
