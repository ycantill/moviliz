// Genera docs/screenshot.png para el README: tres pantallas de celular
// (sugerencias, resultado y modo oscuro sin red).
// Uso: npm run screenshot  (requiere npx playwright install chromium)
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 4175;
const URL_APP = `http://localhost:${PUERTO}/`;
const D = mkdtempSync(join(tmpdir(), 'moviliz-')) + '/';
const salida = new URL('../docs/screenshot.png', import.meta.url).pathname;
const server = spawn(process.execPath, [new URL('./serve.mjs', import.meta.url).pathname, String(PUERTO)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));

const b = await chromium.launch();
async function shot(name, scheme, fn, offline = false) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, colorScheme: scheme, locale: 'es-CO', timezoneId: 'America/Bogota' });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date('2026-11-24T08:30:00-05:00'));
  await p.goto(URL_APP); await p.waitForFunction(() => document.querySelector('#info-datos').textContent.length > 0);
  if (offline) {
    await p.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true })); });
    await ctx.setOffline(true); await p.reload();
    await p.waitForFunction(() => document.querySelector('#info-datos').textContent.includes('este dispositivo'));
  }
  await fn(p); await p.waitForTimeout(300);
  if (p.clipTop) await p.screenshot({ path: D + name + '.png', fullPage: true, clip: { x: 0, y: p.clipTop, width: 390, height: 780 } });
  else await p.screenshot({ path: D + name + '.png' });
  await ctx.close();
}
const elegir = async (p, sel, txt, opt) => { await p.fill(sel, txt); await p.locator(`li[role=option]:has-text("${opt}")`).first().click(); };
await shot('s1', 'light', async (p) => { await elegir(p, '#origen', 'Carrera 46 con calle 72', 'Carrera 46'); await p.fill('#destino', 'la c'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); });
const plan = async (p) => {
  await p.fill('#origen', 'Carrera 18 con calle 59'); await p.selectOption('.field[data-role=origen] select', 'soledad'); await p.keyboard.press('Enter');
  await elegir(p, '#destino', 'parque cultural', 'Parque Cultural');
  await p.click('button[type=submit]'); await p.waitForSelector('#resultado .pasos');
  await p.evaluate(() => { document.body.style.paddingBottom = '400px'; window.scrollTo(0, 0); });
  p.clipTop = await p.evaluate(() => document.querySelector('#resultado').getBoundingClientRect().top - 14);
};
await shot('s2', 'light', plan);
await shot('s3', 'dark', plan, true);
const img = (n) => 'data:image/png;base64,' + readFileSync(D + n + '.png').toString('base64');
const html = `<html><body style="margin:0;background:linear-gradient(135deg,#1c2a41,#0b111c);font-family:system-ui;display:flex;flex-direction:column;align-items:center;padding:36px 40px 40px;gap:26px">
<div style="display:flex;gap:34px">${['s1','s2','s3'].map((n,i)=>`<figure style="margin:0;text-align:center;color:#e6f2ee;font-size:19px"><img src="${img(n)}" style="width:330px;border-radius:30px;box-shadow:0 18px 40px rgba(0,0,0,.35);border:7px solid #111"><figcaption style="margin-top:14px">${['Search with keyboard suggestions','Step-by-step trip','Dark mode, with the network off'][i]}</figcaption></figure>`).join('')}</div></body></html>`;
const p = await b.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1.5 });
await p.setContent(html); const h = await p.evaluate(() => document.body.scrollHeight);
await p.setViewportSize({ width: 1200, height: h });
await p.screenshot({ path: salida });
await b.close();
server.kill();
console.log(`Captura en ${salida}`);
