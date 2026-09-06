# Portal Molins

Sitio público de Molins Negocios Inmobiliarios. **HTML estático, un solo archivo**, sin build.

Las propiedades no viven acá: se leen del CRM por `GET /api/publico/propiedades?cartera=propia,alquileres`
y las consultas entran por `POST /api/publico/consultas` con la clave del sitio. Lo que
Francisco carga en el sistema aparece publicado; lo que retira, desaparece.

## Configuración

Tres valores al principio de `index.html`, en `window.MOLINS_*`:

| Variable | Qué es | Valor |
|---|---|---|
| `MOLINS_API` | URL del CRM | `https://crm-molins-app-production.up.railway.app` |
| `MOLINS_CARTERA` | carteras que se publican, separadas por coma | `propia,alquileres` |
| `MOLINS_CLAVE` | clave del sitio (header `x-sitio-clave`) | la genera el CRM en Admin → Carteras → Sitios |

La clave no es un secreto: viaja en el navegador. Solo sirve para decir *a qué cartera* entra
la consulta, y se puede rotar desde el CRM sin tocar este repo.

## Deploy

GitHub Pages desde `main`. `git push` es el deploy. Dominio propio: pendiente (ver `CNAME`).

## Qué no hay

- Fotos: se sirven desde el CRM (`/api/publico/fotos/<id>`). No hay carpeta `fotos/`.
- Datos: no hay ninguna propiedad escrita a mano. Si hace falta una, se carga en el sistema.

## Videos y renders de los emprendimientos

- `video/torre-render.mp4` (y su `torre-render.jpg`) se arma con ffmpeg a partir de cinco renders de
  `molins-torres/img` (paneo lento y fundidos, 960×540, ~1 MB). No es un video del desarrollador: si
  llega uno real, se reemplaza el archivo y listo.
- `video/aires-duplex.mp4` y `video/aires-calle.mp4` son copias de `BERNI/aires_sanlorenzo/assets/video`.
- `img/torre/render-N.webp` y `plano-N.webp` son las cuatro tipologías de La Torre (1 Horizonte,
  2 Evolución, 3 Esencia, 4 Cúspide), a 1400 px, para la previa de cada unidad.
- `img/og-molins.jpg` es la vista previa al compartir (escudo sobre verde noche), generada con PIL.

Los videos llevan `preload="none"` y `data-src`: se cargan y arrancan recién cuando se ven.

