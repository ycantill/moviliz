# CLAUDE.md

Guía para trabajar en este repositorio. Moviliz es una PWA para planear viajes en
Transmetro Barranquilla. Lee también el `README.md`.

## Reglas del producto (acordadas con la dueña del proyecto)

- **100 % offline y sin servidor.** Todo corre en el navegador: el cálculo de rutas
  (Dijkstra en `src/router.js`) y los datos (IndexedDB en `src/store.js`). No agregues
  backend, APIs externas ni modelos de lenguaje.
- **Sin búsqueda en línea por nombre.** Se probó resolver nombres de lugares con un
  servicio en línea y se revirtió. No volver a agregarlo sin que lo pidan.
- **Sin barrios en el buscador.** Solo puntos exactos: direcciones (calle/carrera),
  estaciones y paraderos con nombre. Un barrio no es un punto y producía rutas de
  "solo caminata". Hay una prueba que lo verifica.
- **Recientes = viajes completos.** Se guardan los últimos 4 viajes (origen + destino +
  perfil) en `localStorage` (`moviliz.recientes`), nunca lugares sueltos. Un viaje que
  sale del GPS no se guarda.
- **Ubicación por GPS** se convierte a la esquina más cercana con las anclas de
  OpenStreetMap (`data/raw/anclas.txt`) dentro del celular. La ubicación no sale del
  dispositivo.
- **La hora** solo filtra rutas por horario de operación; no hay tiempos de espera reales.
- **No hay indicador "En línea / Sin conexión"** en pantalla; la lógica de conexión de
  `store.js` sí se mantiene.

## Privacidad

- Ningún dato personal en el repositorio: ni direcciones reales, ni documentos, ni
  correos, ni valores por defecto personales en el código o en ejemplos (usa ejemplos
  genéricos como "Cra 43 # 70-15").
- Los datos del usuario (recientes) viven solo en su navegador.

## Estructura

- `index.html`, `styles.css`, `src/app.js`: interfaz.
- `src/router.js`: índice de búsqueda, resolución de lugares y planificador (perfiles
  `caminar` y `transbordos`, máximo 3 abordajes, máximo 12 cuadras caminando en los extremos).
- `src/geo.js`: nomenclatura de direcciones, distancias en cuadras y GPS → calle/carrera.
- `src/store.js`: carga de `data/transmetro.json` con copia en IndexedDB.
- `sw.js`: service worker, primero la red y copia guardada sin conexión.
- `data/raw/`: fuentes (rutas, paraderos, anclas). `data/transmetro.json` se genera.

## Comandos

```bash
npm run build:data   # regenera data/transmetro.json desde data/raw/
npm test             # pruebas (node --test), deben pasar antes de cada PR
npm start            # sirve la app en http://localhost:8080
```

Si cambias `data/raw/` o `scripts/build-data.mjs`, regenera y sube `data/transmetro.json`.

## Despliegue y caché

- Cada push a `main` publica en GitHub Pages con `.github/workflows/pages.yml`
  (datos, pruebas, `_site`, despliegue): https://ycantill.github.io/moviliz/
- `sw.js` tiene `VERSION = 'moviliz-__VERSION__'`; el workflow lo reemplaza por el commit.
  No pongas la versión a mano ni quites ese placeholder.
- El service worker es "primero la red" (`cache: 'no-cache'`, copia tras 4 s o sin
  conexión). La app registra el SW con `updateViaCache: 'none'` y se recarga una vez al
  cambiar de versión. Si agregas un archivo a la app, súmalo a `SHELL` en `sw.js`.

## Forma de trabajo

- Ramas `claude/<tema>`, un PR por cambio, en español. La dueña fusiona.
- **Actualiza el `README.md` en cada cambio** que afecte lo que hace la app o cómo se usa,
  y este archivo si cambia una regla o convención.
- Textos de la interfaz en español de Colombia, sencillos.
- Revisa que la app no tenga scroll horizontal en un celular de 390 px.
