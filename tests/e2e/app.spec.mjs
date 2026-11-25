import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Abre la app y espera a que cargue la base de rutas. */
async function abrir(page) {
  await page.goto('/');
  await expect(page.locator('#info-datos')).toContainText('rutas activas');
}

/** Elige una sugerencia usando solo el teclado. */
async function elegir(page, campo, texto, opcion) {
  const input = page.getByRole('combobox', { name: campo });
  await input.fill(texto);
  const lista = page.getByRole('listbox', { name: `Sugerencias para el ${campo === 'Desde' ? 'origen' : 'destino'}` });
  await expect(lista).toBeVisible();
  const opciones = lista.getByRole('option');
  const n = await opciones.count();
  for (let i = 0; i < n; i++) {
    await input.press('ArrowDown');
    if ((await opciones.nth(i).textContent()).includes(opcion)) break;
  }
  await input.press('Enter');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
}

test('planea un viaje entre dos estaciones con el teclado', async ({ page }) => {
  await abrir(page);
  await elegir(page, 'Desde', 'la ocho', 'La Ocho');
  await elegir(page, 'Hasta', 'joe', 'Joe Arroyo');
  await page.getByRole('button', { name: 'Buscar ruta' }).click();
  const resultado = page.locator('#resultado');
  await expect(resultado.locator('.pasos .paso').first()).toBeVisible();
  await expect(resultado).toContainText('Sube en Estación La Ocho');
  await expect(resultado).toContainText('Baja en Estación Joe Arroyo');
});

test('el combobox expone su estado a lectores de pantalla', async ({ page }) => {
  await abrir(page);
  const input = page.getByRole('combobox', { name: 'Desde' });
  await input.fill('la');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#anuncio')).toContainText('sugerencias');
  await input.press('ArrowDown');
  const activa = await input.getAttribute('aria-activedescendant');
  await expect(page.locator(`#${activa}`)).toHaveAttribute('aria-selected', 'true');
  await input.press('Escape');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(input).not.toHaveAttribute('aria-activedescendant');
});

test('acepta direcciones y guarda el viaje en recientes', async ({ page }) => {
  await abrir(page);
  await page.getByRole('combobox', { name: 'Desde' }).fill('Carrera 46 con calle 72');
  await page.getByRole('combobox', { name: 'Hasta' }).fill('Calle 45 con carrera 8');
  await page.getByRole('button', { name: 'Buscar ruta' }).click();
  await expect(page.locator('#resultado .pasos')).toBeVisible();

  await page.reload();
  const reciente = page.locator('#viajes-recientes .viaje').first();
  await expect(reciente).toContainText('Carrera 46 con calle 72');
  await reciente.click();
  await expect(page.locator('#resultado .pasos')).toBeVisible();
});

test('funciona sin conexión después de la primera visita', async ({ page, context }) => {
  await abrir(page);
  // Espera a que el service worker controle la página (ya guardó la app y los datos).
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#info-datos')).toContainText('este dispositivo');
  await elegir(page, 'Desde', 'portal', 'Portal de Soledad');
  await elegir(page, 'Hasta', 'parque cultural', 'Parque Cultural');
  await page.getByRole('button', { name: 'Buscar ruta' }).click();
  await expect(page.locator('#resultado .pasos .paso').first()).toBeVisible();
});

test('no tiene scroll horizontal en un celular de 390 px', async ({ page }) => {
  await abrir(page);
  await elegir(page, 'Desde', 'la ocho', 'La Ocho');
  await page.getByRole('combobox', { name: 'Hasta' }).fill('Calle 72 # 46-20');
  await page.getByRole('combobox', { name: 'Hasta' }).press('Enter');
  await page.getByRole('button', { name: 'Buscar ruta' }).click();
  await expect(page.locator('#resultado .pasos')).toBeVisible();
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(ancho).toBeLessThanOrEqual(390);
});

test('no tiene errores de accesibilidad (WCAG 2.1 AA)', async ({ page }) => {
  await abrir(page);
  const inicio = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(inicio.violations).toEqual([]);

  await elegir(page, 'Desde', 'la ocho', 'La Ocho');
  await elegir(page, 'Hasta', 'joe', 'Joe Arroyo');
  await page.getByRole('button', { name: 'Buscar ruta' }).click();
  await expect(page.locator('#resultado .pasos')).toBeVisible();
  const conResultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(conResultado.violations).toEqual([]);
});

test('respeta la Content Security Policy', async ({ page }) => {
  const violaciones = [];
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) violaciones.push(m.text()); });
  page.on('pageerror', (e) => violaciones.push(e.message));
  await abrir(page);
  await elegir(page, 'Desde', 'la ocho', 'La Ocho');
  await elegir(page, 'Hasta', 'joe', 'Joe Arroyo');
  await page.getByRole('button', { name: 'Buscar ruta' }).click();
  await expect(page.locator('#resultado .pasos')).toBeVisible();
  expect(violaciones).toEqual([]);
});

test('muestra el viaje con placas de ruta y la letra de la app', async ({ page }) => {
  await abrir(page);
  await elegir(page, 'Desde', 'la ocho', 'La Ocho');
  await elegir(page, 'Hasta', 'joe', 'Joe Arroyo');
  await page.getByRole('button', { name: 'Buscar ruta' }).click();
  const titulo = page.locator('#resultado .titulo-ruta');
  await expect(titulo.locator('.placa').first()).toBeVisible();
  // Cada placa toma el color de su tipo de ruta.
  const fondo = await titulo.locator('.placa').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(fondo).not.toBe('rgba(0, 0, 0, 0)');
  // La letra Nunito viene de la misma app (sirve sin conexión).
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('800 16px Nunito'))).toBe(true);
});

test('sale ahora por defecto y deja elegir otra hora', async ({ page }) => {
  await abrir(page);
  const hora = page.locator('#hora');
  await expect(hora).toBeHidden();
  await page.getByRole('button', { name: /Cambiar hora/ }).click();
  await expect(hora).toBeVisible();
  await expect(hora).toBeFocused();
  await page.getByRole('button', { name: 'Salir ahora' }).click();
  await expect(hora).toBeHidden();
});

test('pide el municipio solo para direcciones', async ({ page }) => {
  await abrir(page);
  const muni = page.getByRole('combobox', { name: 'Municipio del origen' });
  await expect(muni).toBeHidden();
  await page.getByRole('combobox', { name: 'Desde' }).fill('Calle 30 # 20-10');
  await expect(muni).toBeVisible();
  await page.getByRole('combobox', { name: 'Desde' }).fill('la ocho');
  await expect(muni).toBeHidden();
});
