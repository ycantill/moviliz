# Moviliz

App web (PWA) para planear viajes en **Transmetro Barranquilla** sin conexión.
Escribes un origen y un destino (dirección, estación o paradero) y la app
te dice qué rutas tomar, dónde subir, dónde bajar y cuánto caminar.

El buscador acepta solo puntos exactos: direcciones ("Cra 43 # 70-15"),
estaciones y paraderos con nombre. No incluye barrios (un barrio no es un punto
y daba rutas equivocadas) ni busca nombres de lugares en internet.

- **Funciona offline.** La primera vez que abres la app se guardan la app y la base de rutas en el teléfono (service worker + IndexedDB). Después ya no necesita internet.
- **El cálculo se hace en el dispositivo.** No hay servidor ni modelo de lenguaje: es un buscador de caminos (Dijkstra) sobre la red de estaciones y paraderos.
- **Dos perfiles:** *Caminar menos* (por defecto) y *Menos transbordos*. Si el otro perfil da una ruta distinta, se muestra como alternativa.
- **Caminatas en Google Maps.** Cada tramo a pie trae un enlace para verlo en Google Maps.
- **Origen por ubicación.** El botón "Usar mi ubicación" toma el GPS del celular (funciona sin internet) y lo convierte en la esquina más cercana usando 1.111 esquinas de calles y carreras de OpenStreetMap (`data/raw/anclas.txt`), con un error típico de media cuadra. La ubicación no sale del celular. Fuera de las calles numeradas de Barranquilla, Soledad y Malambo no se puede usar.
- **Recientes.** Los últimos 4 viajes completos buscados (origen y destino juntos, no lugares sueltos); un toque repite la búsqueda con la hora actual. Se guardan solo en tu navegador (localStorage) y se pueden borrar. Un viaje que sale de la ubicación del GPS no se guarda.

## Datos

La base sale del sitio oficial de Transmetro (transmetro.gov.co): 17 estaciones,
12 rutas troncales y 28 alimentadoras, con sus paraderos, barrios y horarios.

- `data/raw/rutas_transmetro.json`: base de conocimiento (estaciones, rutas, matriz oficial de transbordos, reglas y dudas pendientes).
- `data/raw/paraderos.txt`: paraderos en orden de cada alimentadora.
- `data/transmetro.json`: archivo que usa la app. Se genera con `npm run build:data`.

Las direcciones se ubican con la nomenclatura de calles y carreras de cada
municipio (Barranquilla y Soledad), así que las distancias son aproximadas y se
miden en cuadras (≈100 m). 149 paraderos sin dirección exacta se ubican entre
sus vecinos.

## Uso local

```bash
npm ci               # herramientas de desarrollo (ESLint, TypeScript)
npm run build:data   # regenera data/transmetro.json
npm run check        # lint, tipos (JSDoc + tsc) y pruebas del buscador de rutas
npm run test:e2e     # pruebas E2E con Playwright (requiere npx playwright install chromium)
npm start            # sirve la app en http://localhost:8080
```

Para instalarla en el teléfono hay que publicarla con HTTPS (por ejemplo, GitHub
Pages) y elegir "Agregar a la pantalla de inicio".

## Limitaciones

- No hay tiempos de espera ni frecuencias reales: el tiempo del viaje no se calcula.
- El sitio oficial y Moovit no coinciden en algunos paraderos de S10, R40 y S40.
- No incluye rutas complementarias (el sitio oficial no publica ninguna).
- Los transbordos son gratis dentro de 105 minutos; entre troncales solo dentro del sistema.

## Publicación

Cada cambio en `main` se publica en GitHub Pages con `.github/workflows/pages.yml`
(genera los datos, corre lint, tipos y pruebas, y sube la app). Cada PR pasa antes por `.github/workflows/ci.yml`. La dirección queda en
https://ycantill.github.io/moviliz/. En el repositorio, *Settings → Pages →
Source* debe estar en **GitHub Actions**.

No hace falta cambiar nada para actualizar: en cada publicación el workflow pone el commit como versión de `sw.js`. Con internet la app siempre pide primero la versión más reciente de cada archivo y, sin conexión, usa la copia guardada. Al publicarse una versión nueva, la app se recarga sola una vez.
