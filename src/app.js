import { buildIndex, planTrip, resolvePlace, search, PERFILES, operaEn } from './router.js';
import { parseAddress } from './geo.js';
import { loadData } from './store.js';

/** @typedef {import('./types').Indice} Indice */
/** @typedef {import('./types').Lugar} Lugar */
/** @typedef {import('./types').LugarResuelto} LugarResuelto */
/** @typedef {import('./types').Tramo} Tramo */
/** @typedef {import('./types').ResultadoViaje} ResultadoViaje */
/** @typedef {import('./types').Nodo} Nodo */
/** @typedef {import('./types').Muni} Muni */
/** @typedef {import('./types').PerfilId} PerfilId */
/** @typedef {'origen' | 'destino'} Rol */
/** @typedef {{ o: Lugar, d: Lugar, perfil: PerfilId }} Viaje */

/**
 * querySelector que falla si el elemento no existe (siempre existe en index.html).
 * @template {Element} [T=HTMLElement]
 * @param {string} s @param {ParentNode} [el] @returns {T}
 */
const $ = (s, el = document) => {
  const e = el.querySelector(s);
  if (!e) throw new Error(`No existe ${s}`);
  return /** @type {T} */ (e);
};
/** @param {string} s @param {ParentNode} [el] */
const $input = (s, el) => /** @type {HTMLInputElement} */ ($(s, el));
/** @param {string} s @param {ParentNode} [el] */
const $select = (s, el) => /** @type {HTMLSelectElement} */ ($(s, el));
/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** @type {Record<Muni, string>} */
const MUNI = { barranquilla: 'Barranquilla', soledad: 'Soledad', malambo: 'Malambo' };

/** @type {Indice | null} */
let index = null;
/** @type {Record<Rol, Lugar | null>} */
const chosen = { origen: null, destino: null };

// ---------- Recientes (solo en este dispositivo) ----------
// Cada búsqueda guarda el viaje completo (origen y destino). Si el origen
// es la ubicación del GPS, no se guarda, porque cambia cada vez.
const LS_RECIENTES = 'moviliz.recientes';
const MAX_VIAJES = 4;
try { localStorage.removeItem('moviliz.lugares'); } catch { /* sin almacenamiento */ }

/** @returns {{ viajes: Viaje[] }} */
function leerRecientes() {
  try {
    const r = JSON.parse(localStorage.getItem(LS_RECIENTES) || '{}');
    // Los barrios ya no se usan como origen o destino.
    /** @type {Viaje[]} */
    const viajes = Array.isArray(r.viajes) ? r.viajes.filter((/** @type {any} */ v) => v.o?.kind !== 'barrio' && v.d?.kind !== 'barrio') : [];
    return { viajes };
  } catch { return { viajes: [] }; }
}
/** @param {{ viajes: Viaje[] }} r */
function escribirRecientes(r) {
  try { localStorage.setItem(LS_RECIENTES, JSON.stringify(r)); } catch { /* sin almacenamiento */ }
  renderRecientes();
}
// Solo lo necesario para volver a usar el lugar.
/** @param {Lugar | null} p @returns {Lugar | null} */
function compacto(p) {
  if (!p || p.kind === 'gps') return null;
  if (p.kind === 'direccion') return { kind: 'direccion', name: p.name || p.text, text: p.text, muni: p.muni };
  /** @type {Lugar} */
  const c = { kind: p.kind, name: p.name, node: p.node };
  if (p.label) c.label = p.label;
  return c;
}
/** @param {Lugar} p */
const claveLugar = (p) => p.kind + '|' + ('node' in p ? p.node : 'text' in p ? p.text : p.name || '').toLowerCase() + '|' + (p.muni || '');
/** @param {Lugar} o @param {Lugar} d @param {PerfilId} perfil */
function recordar(o, d, perfil) {
  const r = leerRecientes();
  const co = compacto(o), cd = compacto(d);
  if (co && cd) {
    const k = claveLugar(co) + '>' + claveLugar(cd);
    r.viajes = [{ o: co, d: cd, perfil }, ...r.viajes.filter((v) => claveLugar(v.o) + '>' + claveLugar(v.d) !== k)].slice(0, MAX_VIAJES);
  }
  escribirRecientes(r);
}
function renderRecientes() {
  const r = leerRecientes();
  const box = $('#recientes');
  if (!r.viajes.length) { box.hidden = true; return; }
  box.hidden = false;
  $('#viajes-recientes').innerHTML = r.viajes.map((v, i) => `<li><button type="button" class="viaje" data-v="${i}"><span aria-hidden="true">↻</span> ${esc(v.o.name)} <span class="muted">→</span> ${esc(v.d.name)}</button></li>`).join('');
}
$('#viajes-recientes').addEventListener('click', (e) => {
  const boton = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('.viaje'));
  const i = boton?.dataset.v;
  if (i == null) return;
  const v = leerRecientes().viajes[+i];
  if (!v) return;
  setChosen('origen', v.o);
  setChosen('destino', v.d);
  const radio = /** @type {HTMLInputElement | null} */ (document.querySelector(`input[name=perfil][value="${v.perfil}"]`));
  if (radio) radio.checked = true;
  $input('#hora').value = toLocalInput(new Date());
  /** @type {HTMLFormElement} */ ($('#plan')).requestSubmit();
});
$('#borrar-recientes').addEventListener('click', () => {
  try { localStorage.removeItem(LS_RECIENTES); } catch { /* sin almacenamiento */ }
  renderRecientes();
});

/** @param {string} msg */
function alertInline(msg) {
  $('#resultado').innerHTML = `<div class="card aviso">${esc(msg)}</div>`;
}

// ---------- Campos de origen y destino ----------
/** @type {Record<Lugar['kind'], string>} */
const TIPO_LUGAR = { direccion: 'Dirección', estacion: 'Estación', lugar: 'Lugar', gps: 'Tu ubicación' };
/** Sugerencias que se muestran en cada campo. @type {Record<Rol, Lugar[]>} */
const sugerencias = { origen: [], destino: [] };

/** @param {Rol} role */
const campo = (role) => $(`.field[data-role="${role}"]`);

/** @param {Lugar} p */
function textoElegido(p) {
  if (p.kind === 'direccion') return `${p.text}, ${MUNI[p.muni || 'barranquilla']}`;
  if (p.kind === 'gps') return p.detalle || '';
  return p.name;
}

/** @param {Rol} role @param {Lugar | null} place */
function setChosen(role, place) {
  const field = campo(role);
  chosen[role] = place;
  const input = $input('input', field);
  input.value = place ? (place.name || ('text' in place ? place.text : '') || '') : input.value;
  if (place?.muni) $select('select.muni', field).value = place.muni;
  const info = $('.elegido', field);
  if (place) {
    info.textContent = `${TIPO_LUGAR[place.kind]}: ${textoElegido(place)}`;
    info.hidden = false;
  } else info.hidden = true;
  $('.sugerencias', field).hidden = true;
}

/** @param {Rol} role */
function suggestionsFor(role) {
  const field = campo(role);
  const q = $input('input', field).value;
  const list = $('.sugerencias', field);
  chosen[role] = null;
  sugerencias[role] = [];
  $('.elegido', field).hidden = true;
  if (!index || q.trim().length < 2) { list.hidden = true; return; }
  /** @type {Lugar[]} */
  const items = [];
  const muni = /** @type {Muni} */ ($select('select.muni', field).value);
  if (parseAddress(q)) items.push({ kind: 'direccion', text: q.trim(), muni, name: q.trim() });
  const vistos = new Set(items.map((p) => p.kind + '|' + (p.name || '').toLowerCase()));
  items.push(...search(index, q, 8).filter((p) => !vistos.has(p.kind + '|' + p.name.toLowerCase())));
  if (!items.length) {
    list.innerHTML = '<li class="muted">Sin resultados. Prueba con una dirección como "Calle 72 # 46-20".</li>';
    list.hidden = false;
    return;
  }
  list.innerHTML = items.map((p, i) => `<li role="option" data-i="${i}"><span class="tag">${TIPO_LUGAR[p.kind]}</span><span>${esc(p.name)}${p.kind === 'lugar' ? `<br><small class="muted">${esc(p.label)}</small>` : ''}</span></li>`).join('');
  sugerencias[role] = items;
  list.hidden = false;
}

for (const role of /** @type {Rol[]} */ (['origen', 'destino'])) {
  const field = campo(role);
  const input = $input('input', field);
  const select = $select('select.muni', field);
  input.addEventListener('input', () => suggestionsFor(role));
  select.addEventListener('change', () => {
    const actual = chosen[role];
    if (actual?.kind === 'direccion') actual.muni = /** @type {Muni} */ (select.value);
  });
  $('.sugerencias', field).addEventListener('click', (e) => {
    const li = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('li[data-i]'));
    if (!li) return;
    setChosen(role, sugerencias[role][Number(li.dataset.i)]);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const list = $('.sugerencias', field);
      if (!list.hidden && sugerencias[role].length) { e.preventDefault(); setChosen(role, sugerencias[role][0]); }
    }
  });
}
document.addEventListener('click', (e) => {
  if (!/** @type {Element} */ (e.target).closest('.field')) document.querySelectorAll('.sugerencias').forEach((l) => { /** @type {HTMLElement} */ (l).hidden = true; });
});

$('#invertir').addEventListener('click', () => {
  const [o, d] = [chosen.origen, chosen.destino];
  const [ov, dv] = [$input('#origen').value, $input('#destino').value];
  chosen.origen = null; chosen.destino = null;
  $input('#origen').value = dv; $input('#destino').value = ov;
  if (d) setChosen('origen', d); else $('.elegido', campo('origen')).hidden = true;
  if (o) setChosen('destino', o); else $('.elegido', campo('destino')).hidden = true;
});

// ---------- Mi ubicación ----------
// El GPS funciona sin internet. La posición se convierte en la esquina más
// cercana y no se envía a ningún servicio.
// La posición es aproximada, así que se muestra la calle o carrera entera más cercana.
/** @param {number} v */
function nombreVia(v) {
  return `${Math.max(1, Math.round(Math.abs(v)))}${v < 0 ? ' Sur' : ''}`;
}
const btnUbicacion = /** @type {HTMLButtonElement} */ ($('#mi-ubicacion'));
if ('geolocation' in navigator) btnUbicacion.hidden = false;
btnUbicacion.addEventListener('click', () => {
  if (!index) return;
  const idx = index;
  btnUbicacion.disabled = true;
  btnUbicacion.textContent = '📍 Buscando tu ubicación…';
  const listo = () => { btnUbicacion.disabled = false; btnUbicacion.textContent = '📍 Usar mi ubicación'; };
  navigator.geolocation.getCurrentPosition((pos) => {
    listo();
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    const point = resolvePlace(idx, { kind: 'gps', lat, lon })?.point;
    if (!point || point.calle == null || point.carrera == null) {
      alertInline('Tu ubicación queda fuera de las calles y carreras de Barranquilla, Soledad o Malambo. Escribe la dirección de origen.');
      return;
    }
    const esquina = `Calle ${nombreVia(point.calle)} con Carrera ${nombreVia(point.carrera)}`;
    const name = 'Mi ubicación';
    const detalle = `cerca de ${esquina}, ${MUNI[point.muni]}${accuracy > 150 ? ` (precisión de unos ${Math.round(accuracy / 10) * 10} m)` : ''}`;
    setChosen('origen', { kind: 'gps', lat, lon, name, detalle, muni: point.muni });
    if (accuracy > 400) alertInline('El GPS da una ubicación poco precisa. Revisa que la esquina sea correcta o escribe la dirección.');
    else if (document.querySelector('#resultado .aviso') && !document.querySelector('#resultado .card:not(.aviso)')) $('#resultado').innerHTML = '';
  }, (err) => {
    listo();
    alertInline(err.code === 1
      ? 'No diste permiso para usar tu ubicación. Puedes activarlo en los ajustes del navegador o escribir la dirección.'
      : 'No pude obtener tu ubicación. Revisa que el GPS esté activo o escribe la dirección.');
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
});

// ---------- Hora ----------
/** @param {Date} d */
function toLocalInput(d) {
  /** @param {number} n */
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
$('#ahora').addEventListener('click', () => { $input('#hora').value = toLocalInput(new Date()); });
$input('#hora').value = toLocalInput(new Date());

// ---------- Buscar ----------
/** @param {Indice} idx @param {Rol} role @returns {Lugar | null} */
function placeFromField(idx, role) {
  const elegido = chosen[role];
  if (elegido) return elegido;
  const field = campo(role);
  const q = $input('input', field).value.trim();
  if (!q) return null;
  const muni = /** @type {Muni} */ ($select('select.muni', field).value);
  if (parseAddress(q)) return { kind: 'direccion', text: q, muni, name: q };
  return search(idx, q, 1)[0] || null;
}

$('#plan').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!index) return;
  const o = placeFromField(index, 'origen');
  const d = placeFromField(index, 'destino');
  if (!o || !d) { alertInline(!o ? 'No encontré el origen. Escribe una dirección, una estación o un paradero.' : 'No encontré el destino. Escribe una dirección, una estación o un paradero.'); return; }
  const from = resolvePlace(index, o);
  const to = resolvePlace(index, d);
  if (!from || !to) { alertInline(`No pude ubicar ${!from ? 'el origen' : 'el destino'}. Escribe la dirección.`); return; }
  const hora = $input('#hora').value;
  const date = hora ? new Date(hora) : new Date();
  const perfil = /** @type {PerfilId} */ (new FormData(/** @type {HTMLFormElement} */ ($('#plan'))).get('perfil') || 'caminar');
  const res = planTrip(index, from, to, { perfil, date });
  const otro = planTrip(index, from, to, { perfil: perfil === 'caminar' ? 'transbordos' : 'caminar', date });
  if (!res.error) recordar(o, d, perfil);
  renderResult(res, otro, from, to, date, perfil);
});

// ---------- Resultado ----------
/** @param {number} n */
function cuadras(n) {
  const r = Math.round(n);
  return r <= 0 ? 'menos de 1 cuadra' : r === 1 ? '1 cuadra' : `${r} cuadras`;
}
/** @param {string} fromText @param {string} toText */
function mapsWalk(fromText, toText) {
  const u = new URL('https://www.google.com/maps/dir/');
  u.searchParams.set('api', '1');
  u.searchParams.set('origin', fromText);
  u.searchParams.set('destination', toText);
  u.searchParams.set('travelmode', 'walking');
  return u.toString();
}
/** @param {Nodo | null} n */
function nodeText(n) {
  if (!n) return '';
  if (n.station) return `Estación Transmetro ${n.label.replace(/^Estación /, '').replace(' (retorno)', '')}, ${MUNI[n.muni]}`;
  return `${n.label.replace(/\s*\((?:lado|nado)[^)]*\)|\s+(?:lado|nado)\s+\w+/gi, '')}, ${MUNI[n.muni] || 'Barranquilla'}`;
}
/** @param {LugarResuelto} p */
function placeText(p) {
  if (p.kind === 'direccion') return `${p.text}, ${MUNI[p.point?.muni || p.muni || 'barranquilla']}`;
  if (p.kind === 'gps') return `${p.lat},${p.lon}`;
  return null;
}

/** @param {Tramo[]} legs @param {LugarResuelto} from @param {LugarResuelto} to */
function legsHtml(legs, from, to) {
  return legs.map((l, i) => {
    if (l.type === 'walk') {
      const isFirst = i === 0;
      const isLast = i === legs.length - 1;
      const a = isFirst ? (from.name || 'tu origen') : l.from?.label;
      const b = isLast ? (to.name || 'tu destino') : l.to?.label;
      const title = `Camina ${cuadras(l.blocks)} hasta ${esc(b)}`;
      let detail = `Desde ${esc(a)} · ${l.minutes <= 1 ? '1 min' : 'unos ' + l.minutes + ' min'}`;
      const ta = isFirst ? placeText(from) : nodeText(l.from);
      const tb = isLast ? placeText(to) : nodeText(l.to);
      if (ta && tb && Math.round(l.blocks) > 0) detail += ` · <a href="${esc(mapsWalk(ta, tb))}" target="_blank" rel="noopener">Ver caminata en Google Maps</a>`;
      return `<li class="paso"><span class="badge walk" aria-hidden="true">🚶</span><div><h3>${title}</h3><p>${detail}</p></div></li>`;
    }
    const r = l.route;
    const tipo = r.type === 'troncal' ? (/expres/i.test(r.tipo || '') ? 'Expreso' : 'Troncal') : 'Alimentadora';
    const hacia = r.type === 'troncal' ? ` hacia ${esc(r.name.split('→')[1]?.trim())}` : '';
    const notas = [];
    if (r.nota) notas.push(esc(r.nota));
    if (/desv/i.test(r.estado || '')) notas.push('Opera con desvío.');
    return `<li class="paso"><span class="badge ${r.type}">${esc(r.code)}</span><div>
      <h3>Toma la ${esc(r.code)}${r.type === 'alimentadora' ? ' ' + esc(r.name) : ''}${hacia}</h3>
      <p>${tipo} · Sube en ${esc(l.from.label)} · Baja en <b>${esc(l.to.label)}</b> (${l.stops} ${l.stops === 1 ? 'parada' : 'paradas'})</p>
      ${notas.length ? `<p>${notas.join(' ')}</p>` : ''}
      <p><a href="${esc(r.fuente)}" target="_blank" rel="noopener">Horario y recorrido oficial</a></p>
    </div></li>`;
  }).join('');
}

/** @param {Tramo[]} legs */
function stats(legs) {
  const rides = legs.flatMap((l) => (l.type === 'ride' ? [l] : []));
  const walk = legs.reduce((n, l) => n + (l.type === 'walk' ? l.blocks : 0), 0);
  return { transbordos: Math.max(0, rides.length - 1), walk, paradas: rides.reduce((n, l) => n + l.stops, 0), codes: rides.map((l) => l.routeCode).join(' → ') };
}

/** @param {ReturnType<typeof stats>} s */
function resumenHtml(s) {
  return `<p class="resumen"><span><b>${s.transbordos}</b> ${s.transbordos === 1 ? 'transbordo' : 'transbordos'}</span><span><b>${cuadras(s.walk)}</b> a pie</span><span><b>${s.paradas}</b> paradas</span></p>`;
}

const ERRORES = {
  origen: 'No hay paraderos ni estaciones a menos de 12 cuadras del origen. Revisa la dirección y el municipio.',
  destino: 'No hay paraderos ni estaciones a menos de 12 cuadras del destino. Revisa la dirección y el municipio.',
  'sin-ruta': 'No encontré una ruta con hasta 2 transbordos a esa hora. Prueba con otra hora de salida.',
};

/**
 * @param {ResultadoViaje} res @param {ResultadoViaje} otro
 * @param {LugarResuelto} from @param {LugarResuelto} to @param {Date} date @param {PerfilId} perfil
 */
function renderResult(res, otro, from, to, date, perfil) {
  if (res.error) {
    alertInline(ERRORES[res.error]);
    return;
  }
  const s = stats(res.legs);
  let html = `<div class="card"><h2 class="titulo-ruta">${esc(s.codes || 'A pie')}</h2>${resumenHtml(s)}<ol class="pasos">${legsHtml(res.legs, from, to)}</ol>`;
  const dudosas = res.legs.flatMap((l) => (l.type === 'ride' && operaEn(l.route, date) === null ? [l.routeCode] : []));
  if (dudosas.length) html += `<div class="aviso">No pude confirmar el horario de ${dudosas.join(', ')} para esa hora. Revisa el enlace oficial.</div>`;
  if (s.transbordos > 0) html += '<p class="muted nota-transbordo">Los transbordos son gratis si los haces dentro de 105 minutos desde que validas la tarjeta.</p>';
  html += '</div>';
  if (!otro.error) {
    const so = stats(otro.legs);
    if (so.codes !== s.codes) {
      html += `<details class="card alt"><summary>Alternativa: ${esc(PERFILES[perfil === 'caminar' ? 'transbordos' : 'caminar'].label.toLowerCase())} · ${esc(so.codes)}</summary>${resumenHtml(so)}<ol class="pasos">${legsHtml(otro.legs, from, to)}</ol></details>`;
    }
  }
  const box = $('#resultado');
  box.innerHTML = html;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Inicio ----------
renderRecientes();
loadData().then(({ data, origen }) => {
  index = buildIndex(data);
  const n = data.routes.filter((r) => r.activa).length;
  $('#info-datos').textContent = `Datos del ${data.version} (${n} rutas activas, ${data.stations.length} estaciones). Cargados desde ${origen === 'red' ? 'internet' : 'este dispositivo'}.`;
}).catch((err) => {
  alertInline('No pude cargar los datos de rutas. Abre la app una vez con internet para descargarlos.');
  console.error(err);
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // updateViaCache: 'none' hace que el navegador siempre revise si hay un sw.js nuevo.
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    // Al volver a la app (por ejemplo, desde otra app del celular) se busca actualización.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch((e) => console.warn('SW', e));
  // Cuando se instala una versión nueva, se recarga una sola vez para usarla.
  const habiaControlador = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador || recargando) return;
    recargando = true;
    location.reload();
  });
}
