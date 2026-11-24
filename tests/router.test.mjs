import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAddress, blocks } from '../src/geo.js';
import { buildIndex, planTrip, resolvePlace, search, parseHorario, operaEn } from '../src/router.js';

const data = JSON.parse(readFileSync(new URL('../data/transmetro.json', import.meta.url)));
const index = buildIndex(data);
// Martes 10:00 a. m.
const date = new Date(2026, 10, 24, 10, 0);
const codes = (r) => r.legs.filter((l) => l.type === 'ride').map((l) => l.routeCode);
const est = (q) => search(index, q, 5).find((p) => p.kind === 'estacion');

test('lee direcciones con calle y carrera', () => {
  assert.deepEqual(parseAddress('Carrera 43 No. 70-15'), { calle: 70, carrera: 43 });
  assert.deepEqual(parseAddress('Calle 45 con carrera 8'), { calle: 45, carrera: 8 });
  assert.equal(parseAddress('hola'), null);
  assert.equal(blocks({ muni: 'barranquilla', calle: 70, carrera: 43 }, { muni: 'soledad', calle: 70, carrera: 43 }), Infinity);
});

test('lee horarios', () => {
  assert.deepEqual(parseHorario('5:00 a.m. a 10:30 p.m.'), [[300, 1350]]);
});

test('la base tiene todas las troncales y alimentadoras', () => {
  assert.equal(data.stations.length, 17);
  assert.equal(data.routes.filter((r) => r.type === 'troncal').length, 12);
  assert.equal(data.routes.filter((r) => r.type === 'alimentadora').length, 28);
  for (const r of data.routes) assert.ok(r.stops.length >= 2, r.code);
});

test('entre dos estaciones de la troncal sale una ruta directa', () => {
  const r = planTrip(index, resolvePlace(index, est('La Ocho')), resolvePlace(index, est('Joe Arroyo')), { date });
  assert.ok(!r.error, r.error);
  assert.equal(codes(r).length, 1);
});

test('desde un barrio de Soledad llega a Parque Cultural', () => {
  const from = resolvePlace(index, search(index, 'Villa Katanga', 3)[0]);
  const r = planTrip(index, from, resolvePlace(index, est('Parque Cultural')), { date });
  assert.ok(!r.error, r.error);
  assert.ok(codes(r).length <= 3);
  assert.ok(r.legs.every((l) => l.type !== 'ride' || l.stops > 0));
});

test('de una dirección a otra con el perfil de caminar menos', () => {
  const from = resolvePlace(index, { kind: 'direccion', text: 'Carrera 46 con calle 72', muni: 'barranquilla' });
  const to = resolvePlace(index, { kind: 'direccion', text: 'Calle 45 con carrera 8', muni: 'barranquilla' });
  const r = planTrip(index, from, to, { perfil: 'caminar', date });
  assert.ok(!r.error, r.error);
  const walk = r.legs.filter((l) => l.type === 'walk').reduce((n, l) => n + l.blocks, 0);
  assert.ok(walk <= 6, `camina ${walk} cuadras`);
});

test('fuera del horario no usa rutas cerradas', () => {
  const tarde = new Date(2026, 10, 24, 3, 0);
  for (const r of data.routes) if (operaEn(r, tarde) === true) assert.fail(`${r.code} figura abierta a las 3 a. m.`);
});

test('convierte coordenadas del GPS a calle y carrera', async () => {
  const { latLonToGrid } = await import('../src/geo.js');
  // Esquina de la calle 48 con carrera 45 (Barranquilla) según OpenStreetMap.
  const p = latLonToGrid(data.anclas, 10.987, -74.78712);
  assert.equal(p.muni, 'barranquilla');
  assert.ok(Math.abs(p.calle - 48) + Math.abs(p.carrera - 45) <= 1, JSON.stringify(p));
  // Soledad: calle 49 con carrera 10.
  assert.equal(latLonToGrid(data.anclas, 10.90442, -74.78597).muni, 'soledad');
  // En el mar no hay calles.
  assert.equal(latLonToGrid(data.anclas, 11.1, -74.85), null);
});

test('la ubicación del celular sirve como origen', () => {
  const from = resolvePlace(index, { kind: 'gps', lat: 10.987, lon: -74.78712 });
  assert.ok(from?.point);
  const r = planTrip(index, from, resolvePlace(index, est('Joe Arroyo')), { date });
  assert.ok(!r.error, r.error);
  assert.equal(resolvePlace(index, { kind: 'gps', lat: 11.1, lon: -74.85 }), null);
});
