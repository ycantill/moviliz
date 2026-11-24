# Moviliz

App web (PWA) para planear viajes en **Transmetro Barranquilla** sin conexión.
Escribes un origen y un destino (dirección, barrio, estación o lugar) y la app
te dice qué rutas tomar, dónde subir, dónde bajar y cuánto caminar.

- **Funciona offline.** La primera vez que abres la app se guardan la app y la base de rutas en el teléfono (service worker + IndexedDB). Después ya no necesita internet.
- **El cálculo se hace en el dispositivo.** No hay servidor ni modelo de lenguaje: es un buscador de caminos (Dijkstra) sobre la red de estaciones y paraderos.
- **Dos perfiles:** *Caminar menos* (por defecto) y *Menos transbordos*. Si el otro perfil da una ruta distinta, se muestra como alternativa.
- **Caminatas en Google Maps.** Cada tramo a pie trae un enlace para verlo en Google Maps.
- **Lugares por nombre (con internet).** Si hay conexión, al escribir un nombre ("Clínica General del Norte", "Buenavista") la app sugiere lugares de [Photon](https://photon.komoot.io) y, al oprimir *Buscar*, usa [Nominatim](https://nominatim.openstreetmap.org) de respaldo. Las coordenadas se convierten a calle y carrera con 1.111 esquinas de OpenStreetMap (`data/raw/anclas.txt`), con un error típico de media cuadra. Solo se envía el texto de la búsqueda. Sin conexión, la app sigue funcionando con direcciones, barrios, estaciones y paraderos.
- **Mis lugares.** Puedes guardar direcciones (Casa, Trabajo…). Se guardan solo en tu navegador (localStorage), nunca en el repositorio.

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
npm run build:data   # regenera data/transmetro.json
npm test             # pruebas del buscador de rutas
npm start            # sirve la app en http://localhost:8080
```

Para instalarla en el teléfono hay que publicarla con HTTPS (por ejemplo, GitHub
Pages) y elegir "Agregar a la pantalla de inicio".

## Limitaciones

- No hay tiempos de espera ni frecuencias reales: el tiempo del viaje no se calcula.
- El sitio oficial y Moovit no coinciden en algunos paraderos de S10, R40 y S40.
- No incluye rutas complementarias (el sitio oficial no publica ninguna).
- Los transbordos son gratis dentro de 105 minutos; entre troncales solo dentro del sistema.

Al cambiar la base, sube `VERSION` en `sw.js` para que los teléfonos descarguen la nueva app.

## Publicación

Cada cambio en `main` se publica en GitHub Pages con `.github/workflows/pages.yml`
(corre las pruebas, genera los datos y sube la app). La dirección queda en
https://ycantill.github.io/moviliz/. En el repositorio, *Settings → Pages →
Source* debe estar en **GitHub Actions**.
