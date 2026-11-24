import { buildIndex, planTrip, resolvePlace, search, PERFILES, operaEn } from './router.js';
import { parseAddress } from './geo.js';
import { loadData } from './store.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MUNI = { barranquilla: 'Barranquilla', soledad: 'Soledad', malambo: 'Malambo' };

let index = null;
const chosen = { origen: null, destino: null };

// ---------- Estado de red ----------
function updateNet() {
  $('#estado-red').textContent = navigator.onLine ? 'En línea' : 'Sin conexión';
}
addEventListener('online', updateNet);
addEventListener('offline', updateNet);
updateNet();

// ---------- Lugares guardados (solo en este dispositivo) ----------
const LS_KEY = 'moviliz.lugares';
function getLugares() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function setLugares(l) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(l)); } catch { /* almacenamiento no disponible */ }
  renderLugares();
}
function renderLugares() {
  const l = getLugares();
  $('#mis-lugares').innerHTML = l.map((p, i) => `<button type="button" class="chip" data-i="${i}">★ ${esc(p.nombre)}</button>`).join('');
  $('#lugares-lista').innerHTML = l.map((p, i) => `<li><span><b>${esc(p.nombre)}</b> · ${esc(p.dir)} (${MUNI[p.muni]})</span><button type="button" data-del="${i}" aria-label="Borrar ${esc(p.nombre)}">Borrar</button></li>`).join('') || '<li class="muted">Aún no tienes lugares guardados.</li>';
}
$('#lugar-guardar').addEventListener('click', () => {
  const nombre = $('#lugar-nombre').value.trim();
  const dir = $('#lugar-dir').value.trim();
  if (!nombre || !dir) return;
  if (!parseAddress(dir)) { alertInline('No entendí esa dirección. Escríbela como "Cra 43 # 70-15" o "Calle 45 con Carrera 8".'); return; }
  setLugares([...getLugares(), { nombre, dir, muni: $('#lugar-muni').value }]);
  $('#lugar-nombre').value = ''; $('#lugar-dir').value = '';
});
$('#lugares-lista').addEventListener('click', (e) => {
  const i = e.target.dataset.del;
  if (i == null) return;
  const l = getLugares(); l.splice(+i, 1); setLugares(l);
});
let lastFocused = 'origen';
$('#mis-lugares').addEventListener('click', (e) => {
  const i = e.target.closest('.chip')?.dataset.i;
  if (i == null) return;
  const p = getLugares()[+i];
  const role = !chosen.origen && !$('#origen').value ? 'origen' : (!chosen.destino && !$('#destino').value ? 'destino' : lastFocused);
  setChosen(role, { kind: 'direccion', text: p.dir, muni: p.muni, name: p.nombre });
});

function alertInline(msg) {
  $('#resultado').innerHTML = `<div class="card aviso">${esc(msg)}</div>`;
}

// ---------- Campos de origen y destino ----------
function setChosen(role, place) {
  const field = $(`.field[data-role="${role}"]`);
  chosen[role] = place;
  const input = $('input', field);
  input.value = place ? (place.name || place.text || '') : input.value;
  if (place?.muni) $('select.muni', field).value = place.muni;
  const info = $('.elegido', field);
  if (place) {
    const tipo = { direccion: 'Dirección', estacion: 'Estación', barrio: 'Barrio', lugar: 'Lugar' }[place.kind];
    info.textContent = `${tipo}: ${place.kind === 'direccion' ? place.text + ', ' + MUNI[place.muni] : place.name}`;
    info.hidden = false;
  } else info.hidden = true;
  $('.sugerencias', field).hidden = true;
}

function suggestionsFor(role) {
  const field = $(`.field[data-role="${role}"]`);
  const q = $('input', field).value;
  const list = $('.sugerencias', field);
  chosen[role] = null;
  $('.elegido', field).hidden = true;
  if (!index || q.trim().length < 2) { list.hidden = true; return; }
  const items = [];
  const muni = $('select.muni', field).value;
  if (parseAddress(q)) items.push({ kind: 'direccion', text: q.trim(), muni, name: q.trim() });
  for (const p of getLugares()) if (p.nombre.toLowerCase().includes(q.toLowerCase())) items.push({ kind: 'direccion', text: p.dir, muni: p.muni, name: p.nombre });
  items.push(...search(index, q, 8));
  if (!items.length) {
    list.innerHTML = '<li class="muted">Sin resultados. Prueba con una dirección como "Calle 72 # 46-20".</li>';
    list.hidden = false;
    return;
  }
  list.innerHTML = items.map((p, i) => `<li role="option" data-i="${i}"><span class="tag">${{ direccion: 'Dirección', estacion: 'Estación', barrio: 'Barrio', lugar: 'Lugar' }[p.kind]}</span><span>${esc(p.name)}${p.kind === 'lugar' ? `<br><small class="muted">${esc(p.label)}</small>` : ''}</span></li>`).join('');
  list._items = items;
  list.hidden = false;
}

for (const role of ['origen', 'destino']) {
  const field = $(`.field[data-role="${role}"]`);
  const input = $('input', field);
  input.addEventListener('input', () => suggestionsFor(role));
  input.addEventListener('focus', () => { lastFocused = role; });
  $('select.muni', field).addEventListener('change', () => {
    if (chosen[role]?.kind === 'direccion') chosen[role].muni = $('select.muni', field).value;
  });
  $('.sugerencias', field).addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    setChosen(role, $('.sugerencias', field)._items[+li.dataset.i]);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const list = $('.sugerencias', field);
      if (!list.hidden && list._items?.length) { e.preventDefault(); setChosen(role, list._items[0]); }
    }
  });
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.field')) document.querySelectorAll('.sugerencias').forEach((l) => { l.hidden = true; });
});

$('#invertir').addEventListener('click', () => {
  const [o, d] = [chosen.origen, chosen.destino];
  const [ov, dv] = [$('#origen').value, $('#destino').value];
  chosen.origen = null; chosen.destino = null;
  $('#origen').value = dv; $('#destino').value = ov;
  if (d) setChosen('origen', d); else $('.field[data-role="origen"] .elegido').hidden = true;
  if (o) setChosen('destino', o); else $('.field[data-role="destino"] .elegido').hidden = true;
});

// ---------- Hora ----------
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
$('#ahora').addEventListener('click', () => { $('#hora').value = toLocalInput(new Date()); });
$('#hora').value = toLocalInput(new Date());

// ---------- Buscar ----------
function placeFromField(role) {
  if (chosen[role]) return chosen[role];
  const field = $(`.field[data-role="${role}"]`);
  const q = $('input', field).value.trim();
  if (!q) return null;
  const muni = $('select.muni', field).value;
  if (parseAddress(q)) return { kind: 'direccion', text: q, muni, name: q };
  const saved = getLugares().find((p) => p.nombre.toLowerCase() === q.toLowerCase());
  if (saved) return { kind: 'direccion', text: saved.dir, muni: saved.muni, name: saved.nombre };
  return search(index, q, 1)[0] || null;
}

$('#plan').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!index) return;
  const o = placeFromField('origen');
  const d = placeFromField('destino');
  if (!o || !d) { alertInline(!o ? 'No encontré el origen. Escribe una dirección, un barrio o una estación.' : 'No encontré el destino. Escribe una dirección, un barrio o una estación.'); return; }
  const from = resolvePlace(index, o);
  const to = resolvePlace(index, d);
  const date = $('#hora').value ? new Date($('#hora').value) : new Date();
  const perfil = new FormData($('#plan')).get('perfil');
  const res = planTrip(index, from, to, { perfil, date });
  const otro = planTrip(index, from, to, { perfil: perfil === 'caminar' ? 'transbordos' : 'caminar', date });
  renderResult(res, otro, from, to, date, perfil);
});

// ---------- Resultado ----------
function cuadras(n) {
  const r = Math.round(n);
  return r <= 0 ? 'menos de 1 cuadra' : r === 1 ? '1 cuadra' : `${r} cuadras`;
}
function mapsWalk(fromText, toText) {
  const u = new URL('https://www.google.com/maps/dir/');
  u.searchParams.set('api', '1');
  u.searchParams.set('origin', fromText);
  u.searchParams.set('destination', toText);
  u.searchParams.set('travelmode', 'walking');
  return u.toString();
}
function nodeText(n) {
  if (!n) return '';
  if (n.station) return `Estación Transmetro ${n.label.replace(/^Estación /, '').replace(' (retorno)', '')}, ${MUNI[n.muni]}`;
  return `${n.label.replace(/\s*\((?:lado|nado)[^)]*\)|\s+(?:lado|nado)\s+\w+/gi, '')}, ${MUNI[n.muni] || 'Barranquilla'}`;
}
function placeText(p) {
  if (p.kind === 'direccion') return `${p.text}, ${MUNI[p.point?.muni || p.muni]}`;
  return null;
}

function legsHtml(legs, from, to) {
  return legs.map((l, i) => {
    if (l.type === 'walk') {
      const isFirst = i === 0;
      const isLast = i === legs.length - 1;
      let title, detail = '';
      if (isFirst && from.kind === 'barrio') {
        title = `En ${esc(from.name)}, ve al paradero más cercano de la ruta ${esc(legs[i + 1]?.routeCode || '')}`;
      } else {
        const a = isFirst ? (from.name || 'tu origen') : l.from?.label;
        const b = isLast ? (to.name || 'tu destino') : l.to?.label;
        title = `Camina ${cuadras(l.blocks)} hasta ${esc(b)}`;
        detail = `Desde ${esc(a)} · ${l.minutes <= 1 ? "1 min" : "unos " + l.minutes + " min"}`;
        const ta = isFirst ? placeText(from) : nodeText(l.from);
        const tb = isLast ? placeText(to) : nodeText(l.to);
        if (ta && tb && Math.round(l.blocks) > 0) detail += ` · <a href="${esc(mapsWalk(ta, tb))}" target="_blank" rel="noopener">Ver caminata en Google Maps</a>`;
      }
      return `<li class="paso"><span class="badge walk" aria-hidden="true">🚶</span><div><h3>${title}</h3>${detail ? `<p>${detail}</p>` : ''}</div></li>`;
    }
    const r = l.route;
    const tipo = r.type === 'troncal' ? (/expres/i.test(r.tipo) ? 'Expreso' : 'Troncal') : 'Alimentadora';
    const fromLabel = i === 0 && from.kind === 'barrio' ? `un paradero en ${from.name}` : l.from.label;
    const hacia = r.type === 'troncal' ? ` hacia ${esc(r.name.split('→')[1]?.trim())}` : '';
    const notas = [];
    if (r.nota) notas.push(esc(r.nota));
    if (/desv/i.test(r.estado)) notas.push('Opera con desvío.');
    return `<li class="paso"><span class="badge ${r.type}">${esc(r.code)}</span><div>
      <h3>Toma la ${esc(r.code)}${r.type === 'alimentadora' ? ' ' + esc(r.name) : ''}${hacia}</h3>
      <p>${tipo} · Sube en ${esc(fromLabel)} · Baja en <b>${esc(l.to.label)}</b> (${l.stops} ${l.stops === 1 ? 'parada' : 'paradas'})</p>
      ${notas.length ? `<p>${notas.join(' ')}</p>` : ''}
      <p><a href="${esc(r.fuente)}" target="_blank" rel="noopener">Horario y recorrido oficial</a></p>
    </div></li>`;
  }).join('');
}

function stats(legs) {
  const rides = legs.filter((l) => l.type === 'ride');
  const walk = legs.filter((l) => l.type === 'walk').reduce((n, l) => n + l.blocks, 0);
  return { transbordos: Math.max(0, rides.length - 1), walk, paradas: rides.reduce((n, l) => n + l.stops, 0), codes: rides.map((l) => l.routeCode).join(' → ') };
}

function resumenHtml(s) {
  return `<p class="resumen"><span><b>${s.transbordos}</b> ${s.transbordos === 1 ? 'transbordo' : 'transbordos'}</span><span><b>${cuadras(s.walk)}</b> a pie</span><span><b>${s.paradas}</b> paradas</span></p>`;
}

function renderResult(res, otro, from, to, date, perfil) {
  if (res.error) {
    const msg = {
      origen: 'No hay paraderos ni estaciones a menos de 12 cuadras del origen. Revisa la dirección y el municipio.',
      destino: 'No hay paraderos ni estaciones a menos de 12 cuadras del destino. Revisa la dirección y el municipio.',
      'sin-ruta': 'No encontré una ruta con hasta 2 transbordos a esa hora. Prueba con otra hora de salida.',
    }[res.error];
    alertInline(msg);
    return;
  }
  const s = stats(res.legs);
  let html = `<div class="card"><h2 style="margin:0 0 4px;font-size:1.1rem">${esc(s.codes || 'A pie')}</h2>${resumenHtml(s)}<ol class="pasos">${legsHtml(res.legs, from, to)}</ol>`;
  const rides = res.legs.filter((l) => l.type === 'ride');
  const dudosas = rides.filter((l) => operaEn(l.route, date) === null).map((l) => l.routeCode);
  if (dudosas.length) html += `<div class="aviso">No pude confirmar el horario de ${dudosas.join(', ')} para esa hora. Revisa el enlace oficial.</div>`;
  if (s.transbordos > 0) html += `<p class="muted" style="margin:10px 0 0">Los transbordos son gratis si los haces dentro de 105 minutos desde que validas la tarjeta.</p>`;
  html += '</div>';
  if (!otro.error) {
    const so = stats(otro.legs);
    if (so.codes !== s.codes) {
      html += `<details class="card alt"><summary>Alternativa: ${esc(PERFILES[perfil === 'caminar' ? 'transbordos' : 'caminar'].label.toLowerCase())} · ${esc(so.codes)}</summary>${resumenHtml(so)}<ol class="pasos">${legsHtml(otro.legs, from, to)}</ol></details>`;
    }
  }
  $('#resultado').innerHTML = html;
  $('#resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Inicio ----------
renderLugares();
loadData().then(({ data, origen }) => {
  index = buildIndex(data);
  const n = data.routes.filter((r) => r.activa).length;
  $('#info-datos').textContent = `Datos del ${data.version} (${n} rutas activas, ${data.stations.length} estaciones). Cargados desde ${origen === 'red' ? 'internet' : 'este dispositivo'}.`;
}).catch((err) => {
  alertInline('No pude cargar los datos de rutas. Abre la app una vez con internet para descargarlos.');
  console.error(err);
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
}
