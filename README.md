# Portal Molins

Sitio público de Molins Negocios Inmobiliarios. **HTML estático, un solo archivo**, sin build.

Las propiedades no viven acá: se leen del CRM por `GET /api/publico/propiedades?cartera=propia`
y las consultas entran por `POST /api/publico/consultas` con la clave del sitio. Lo que
Francisco carga en el sistema aparece publicado; lo que retira, desaparece.

## Configuración

Tres valores al principio de `index.html`, en `window.MOLINS_*`:

| Variable | Qué es | Valor |
|---|---|---|
| `MOLINS_API` | URL del CRM | `https://crm-molins-app-production.up.railway.app` |
| `MOLINS_CARTERA` | slug de la cartera que se publica | `propia` |
| `MOLINS_CLAVE` | clave del sitio (header `x-sitio-clave`) | la genera el CRM en Admin → Carteras → Sitios |

La clave no es un secreto: viaja en el navegador. Solo sirve para decir *a qué cartera* entra
la consulta, y se puede rotar desde el CRM sin tocar este repo.

## Deploy

GitHub Pages desde `main`. `git push` es el deploy. Dominio propio: pendiente (ver `CNAME`).

## Qué no hay

- Fotos: se sirven desde el CRM (`/api/publico/fotos/<id>`). No hay carpeta `fotos/`.
- Datos: no hay ninguna propiedad escrita a mano. Si hace falta una, se carga en el sistema.
