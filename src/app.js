/**
 * portal/src/app.js — la lógica del portal de Molins.
 *
 * FUSIÓN, 2026-08-29. Junta dos cosas que venían separadas:
 *
 *  · la lógica del rediseño de Claude Design (`Portal Molins.dc.html`):
 *    segmentos con conteo, filtros, ficha con galería y similares, zonas,
 *    calculadora de cuotas y preguntas;
 *  · todo lo que el portal en vivo ya capturaba y medía, que el rediseño NO
 *    traía.
 *
 * POR QUÉ HIZO FALTA FUSIONAR Y NO REEMPLAZAR: el rediseño tiene un solo
 * fetch, el que lee las propiedades. Publicarlo tal cual dejaba a Francisco
 * sin ninguna consulta por la web y con las pantallas de Cookies y Campañas
 * del CRM en blanco. Su `enviarConsulta` sólo ponía el cartel de gracias, sin
 * mandar nada; y los dos botones del cartel de cookies hacían lo mismo:
 * esconder el cartel sin guardar la decisión.
 *
 * Lo que se recuperó del portal publicado, punto por punto:
 *   · el formulario que de verdad pega a `/api/publico/consultas`, con el
 *     campo trampa antispam y el manejo distinto del 429;
 *   · los clics de WhatsApp a `/api/publico/clics`;
 *   · las visitas con consentimiento, secciones y fichas;
 *   · los datos estructurados de schema.org;
 *   · el enlace directo a una ficha (`?ficha=MOL-…`) y el botón de compartir;
 *   · el código corto que viaja en el texto de WhatsApp.
 *
 * La medición no se reescribió: vive tal cual en `src/medicion.js`, movida
 * desde el portal publicado. Acá sólo se la llama.
 *
 * El renderizador es `src/pintor.js`, que lo emite el transpilador. Este
 * archivo sólo calcula `vista()`: un objeto plano con todo lo que el HTML
 * pide por sus atributos `data-`.
 */
(function () {
  "use strict";

  var CFG = window.MOLINS_CFG || {};
  var API = CFG.API;
  var CARTERA = CFG.CARTERA;
  var TEL = "5493874153669";

  var TIPO_LEGIBLE = { CASA: "Casa", DEPARTAMENTO: "Departamento", DUPLEX: "Dúplex", TERRENO: "Terreno", LOCAL: "Local comercial", OFICINA: "Oficina", GALPON: "Galpón", FINCA: "Finca", COCHERA: "Cochera", OTRO: "Propiedad" };
  var ZONA_DE_BARRIO = { "Grand Bourg": "Grand Bourg", "Tres Cerritos": "Tres Cerritos", "Centro": "Centro", "El Encón": "El Encón · Rosario de Lerma", "Rosario de Lerma": "El Encón · Rosario de Lerma", "San Lorenzo": "San Lorenzo", "Villa San Lorenzo": "San Lorenzo", "San Lorenzo Chico": "San Lorenzo", "Vaqueros": "Vaqueros", "La Caldera": "Vaqueros", "Cerrillos": "Cerrillos", "Chicoana": "Chicoana", "El Portezuelo": "El Portezuelo", "San Antonio": "San Antonio" };
  var ZONA_DESC = {
    "Centro": "El casco céntrico de Salta. Departamentos para vivir o alquilar, locales sobre calle y casas antiguas de buena superficie.",
    "El Encón · Rosario de Lerma": "Al oeste, camino a Campo Quijano. Club de campo, fincas y lotes grandes con parque.",
    "San Lorenzo": "La zona verde de la ciudad, a unos 11 km del centro. Casas con terreno y clima de quebrada.",
    "Vaqueros": "Al norte, sobre la ruta 9. Barrio abierto a pocos minutos del centro.",
    "Cerrillos": "Valle de Lerma, al sur. Superficies grandes y suelo productivo.",
    "Chicoana": "Valle de Lerma, camino a Cafayate. Terreno en zona de fincas.",
    "El Portezuelo": "Sobre la ladera del cerro, con vista alta a la ciudad.",
    "Grand Bourg": "Barrio residencial al este de la ciudad, a pocas cuadras de la Casa de Gobierno.",
    "Tres Cerritos": "Barrio residencial al este, al pie de los cerros.",
    "San Antonio": "Barrio residencial consolidado, cerca de las avenidas de acceso.",
    "Otras zonas de Salta": "Casas y terrenos en distintos puntos de la ciudad. Consultá por ubicación exacta."
  };
  var ZONA_ORDEN = ["Centro", "Grand Bourg", "Tres Cerritos", "El Encón · Rosario de Lerma", "San Lorenzo", "Vaqueros", "Cerrillos", "Chicoana", "El Portezuelo", "San Antonio", "Otras zonas de Salta"];
  /* El punto es el de la ZONA, no el de la propiedad, y es a propósito: la
     dirección exacta se pasa al coordinar la visita. El portal en vivo hacía
     lo mismo aunque el API devuelva `geo` con la coordenada fina. */
  var ZONA_GEO = { "Grand Bourg": [-24.7669, -65.4256], "Tres Cerritos": [-24.7716, -65.3929], "Centro": [-24.7889, -65.4103], "San Lorenzo": [-24.7338, -65.4859], "Vaqueros": [-24.6927, -65.4106], "Cerrillos": [-24.8996, -65.4867], "El Portezuelo": [-24.7998, -65.3838], "San Antonio": [-24.8035, -65.4005], "Chicoana": [-25.1078, -65.5375], "El Encón · Rosario de Lerma": [-24.9847, -65.5806] };

  var S = {
    props: [], cargando: true, muestra: false,
    seg: "todo", fTipo: "", fZona: "", fDorm: "", fPrecio: "", fTexto: "", fOrden: "destacadas",
    favs: leerLS("molins_favs", []), recientes: leerLS("molins_vistas", []),
    bOper: "todo", bZona: "",
    menuOpen: false, ancho: 1200,
    ficha: null, fotoN: 1, visor: false, mosaicoPaso: 0, visorZoom: false, visorFull: false, toast: "",
    vista: /^#(contacto|preguntas|buscar)$/.test(location.hash) ? location.hash.slice(1) : "inicio",
    fichaPendiente: (function () { var m = /[?&]ficha=([^&#]+)/.exec(location.search); try { return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; } })(),
    formNombre: "", formWa: "", formMail: "", formBusca: "Para vivir", formZona: "", formMensaje: "",
    formError: "", enviado: false, enviando: false, okMsg: "", ctx: "", ctxProp: null,
    calcPrecio: 75000, calcAnt: 30, calcCuotas: 60,
    torre: null, aires: null, filtros: false, descLarga: false,
    torrePrevia: null, tpVista: "render", menuProy: false
  };
  var mapa = null;

  /* Guardadas y vistas viven en el navegador de cada visitante, nunca en el
     sistema: no identifican a nadie y sirven para volver a lo que miró. */
  function leerLS(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : def; } catch (e) { return def; } }
  function guardarLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esFav(c) { return S.favs.indexOf(c) >= 0; }
  /* Un repintado que no se note: sin animaciones de entrada mientras dura. */
  var relojSuave = null;
  function suave(fn) {
    var h = document.documentElement; h.classList.add("sin-entrada"); clearTimeout(relojSuave);
    fn();
    relojSuave = setTimeout(function () { h.classList.remove("sin-entrada"); }, 450);
  }
  function alternarFav(c) {
    var f = S.favs.slice(), i = f.indexOf(c);
    if (i >= 0) f.splice(i, 1); else f.unshift(c);
    guardarLS("molins_favs", f);
    if (window.VISITAS) VISITAS.anotar(i >= 0 ? "quitar_guardada" : "guardar", c, c);
    suave(function () { set({ favs: f, seg: S.seg === "guardadas" && !f.length ? "todo" : S.seg }); });
  }
  function anotarVista(c) {
    var r = S.recientes.filter(function (x) { return x !== c; }); r.unshift(c);
    S.recientes = r.slice(0, 8); guardarLS("molins_vistas", S.recientes);
  }
  function norm(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

  function set(cambios) { for (var k in cambios) S[k] = cambios[k]; pintar(); }
  function pintar() {
    window.Pintor.pintar(vista());
    var capa = !!S.ficha || S.vista === "buscar" || !!S.fichaPendiente;
    document.documentElement.classList.toggle("con-capa", capa);
    document.body.style.overflow = (capa || S.vista !== "inicio" || S.torrePrevia) ? "hidden" : "";
    if (S.ficha) vigilarFicha();
    if (S.vista === "contacto" || S.vista === "preguntas") vigilarPaneles();
    if (window.observarTarjetas) observarTarjetas();
    if (window.observarSecciones) observarSecciones();
  }
  /* Las ventanas de contacto y preguntas: viven fuera del inicio. */
  function abrirVista(v) {
    if (S.vista === v) return;
    set({ vista: v, menuOpen: false });
    if (window.history && history.replaceState) try { history.replaceState(null, "", location.pathname + location.search + "#" + v); } catch (e) {}
    if (window.VISITAS) VISITAS.anotar("pagina", location.pathname + "#" + v);
    setTimeout(function () { var p = document.querySelector(".panel__caja, .buscar__scroll"); if (p) p.scrollTop = 0; }, 30);
  }
  function cerrarVista() {
    set({ vista: "inicio" });
    if (window.history && history.replaceState) try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }
  var relojToast = null;
  function avisar(t) { clearTimeout(relojToast); suave(function () { set({ toast: t }); }); relojToast = setTimeout(function () { suave(function () { set({ toast: "" }); }); }, 2400); }

  /* ── formato ─────────────────────────────────────────────────────────── */
  function tidy(s) { if (!s) return s; if (s === s.toUpperCase()) s = s.toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }
  function num(n) { return Math.round(n).toLocaleString("es-AR"); }
  function money(moneda, v) { return (moneda === "USD" ? "USD " : "$ ") + num(v); }
  function zonaCorta(p) { return p.zona === "Otras zonas de Salta" ? "Salta" : p.zona; }
  function ubicCorta(p) { var z = zonaCorta(p); return p.barrio && z.indexOf(p.barrio) < 0 ? p.barrio + " · " + z : z; }
  function cuotaRef(p) { if (p.operacion !== "Venta" || p.tipo !== "Terreno" || !p.precio) return null; return money(p.moneda, p.precio * 0.7 / 60); }
  function segDe(p) { if (p.tipo === "Terreno") return "terreno"; if (p.operacion === "Alquiler") return "alquiler"; return "venta"; }

  /* El código corto va al final y entre corchetes para que sobreviva: mucha
     gente borra el texto prellenado, y cuanto más largo, más lo borran. */
  function waLink(p) {
    /* Sin el código: lo sella el manejador de clic para TODOS los enlaces por
       igual, incluidos los estáticos de la barra y el pie. Una sola fuente. */
    return "https://wa.me/" + TEL + "?text=" + encodeURIComponent("Hola, quiero consultar por " + p.titulo + " (" + p.codigo + ")");
  }

  /* Hasta cuatro fotos por tarjeta: al pasar el mouse van rotando. */
  function fotosMini(p) { return p.fotos.slice(0, 4).map(function (src, i) { return { src: src, srcAhora: i === 0 ? src : "", clase: "minigal__foto" + (i === 0 ? " es-activa" : ""), punto: "minigal__punto" + (i === 0 ? " es-activa" : "") }; }); }
  function tarjetaMini(x) {
    return { codigo: x.codigo, foto: x.fotos[0] || "", sinFoto: !x.fotos.length, fotos: fotosMini(x), variasFotos: x.fotos.length > 1, zona: zonaCorta(x), ubicacion: ubicCorta(x), titulo: x.titulo,
      tipo: x.tipo + " · " + x.operacion, specs: [x.dorm > 0 ? x.dorm + " dorm." : null, x.m2 > 0 ? num(x.m2) + " m²" : null].filter(Boolean).join(" · "),
      precio: x.precio > 0 ? money(x.moneda, x.precio) + (x.operacion === "Alquiler" ? " /mes" : "") : "Consultar",
      reservada: x.estado === "reservada", abrir: function () { abrirFicha(x.codigo); } };
  }

  function desdeApi(x, i) {
    var p = {};
    p.codigo = x.codigo; p.orden = i || 0; p.destacada = !!x.destacada;
    p.publicadaEn = x.publicadaEn ? Date.parse(x.publicadaEn) : 0;
    p.nueva = p.publicadaEn > 0 && (Date.now() - p.publicadaEn) < 10 * 864e5;
    p.sinDireccion = !x.direccion;
    p.barrio = x.barrio || "";
    p.tipo = TIPO_LEGIBLE[x.tipo] || "Propiedad";
    p.operacion = x.operacion === "VENTA" ? "Venta" : "Alquiler";
    p.moneda = x.moneda; p.precio = x.precio || 0;
    p.dorm = x.dormitorios || 0; p.banos = x.banos || 0; p.m2 = x.supTotal || 0;
    p.cubierta = x.supCubierta || 0; p.ambientes = x.ambientes || 0; p.cocheras = x.cocheras || 0;
    p.antiguedad = x.antiguedad; p.expensas = x.expensas || 0; p.caracteristicas = x.caracteristicas || [];
    p.estado = x.estado === "RESERVADA" ? "reservada" : "activa";
    p.descripcion = x.descripcion || "";
    p.geo = x.geo && x.geo.lat && x.geo.lng ? [Math.round(x.geo.lat * 100) / 100, Math.round(x.geo.lng * 100) / 100] : null;
    p.zona = ZONA_DE_BARRIO[p.barrio] || (p.barrio === "Centro" ? "Centro" : "Otras zonas de Salta");
    p.titulo = p.sinDireccion ? x.titulo : tidy(x.direccion);
    p.fotos = (x.fotos || []).map(function (u) { return u.indexOf("http") === 0 ? u : API + u; });
    return p;
  }

  function cargar() {
    fetch(API + "/api/publico/propiedades?cartera=" + encodeURIComponent(CARTERA))
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        var lista = (j.propiedades || []).map(desdeApi);
        if (!lista.length) throw new Error("vacio");
        set({ props: lista, cargando: false, muestra: false });
        estructurados(lista);
        abrirDesdeUrl();
        avisarReel(lista);
        contarCartera(lista.length);
      })
      .catch(function (e) {
        if (window.console) console.warn("portal: no se pudo cargar", e);
        set({ props: muestra(), cargando: false, muestra: true });
      });
  }

  /* El número de propiedades sube de 0 al total la primera vez que se ve. */
  function contarCartera(total) {
    if (matchMedia("(prefers-reduced-motion:reduce)").matches || !("IntersectionObserver" in window)) return;
    var el = document.querySelector(".fila-solapas__n"); if (!el) return;
    var obs = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return; obs.disconnect();
      var t0 = null, dur = 900;
      (function paso(t) {
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3), n = Math.round(total * e);
        el.textContent = n === 1 ? "1 propiedad" : n + " propiedades";
        if (k < 1) requestAnimationFrame(paso);
      })(performance.now());
    }, { threshold: 0.5 });
    obs.observe(el);
  }

  /* La última búsqueda se recuerda en la pestaña: si vuelve de una ficha por
     enlace o recarga, encuentra el listado como lo dejó. */
  function guardarBusqueda() { try { sessionStorage.setItem("molins_busqueda", JSON.stringify({ fTexto: S.fTexto, bOper: S.bOper, bZona: S.bZona, seg: S.seg, fZona: S.fZona })); } catch (e) {} }
  function recordarBusqueda() {
    try {
      var b = JSON.parse(sessionStorage.getItem("molins_busqueda") || "null"); if (!b) return;
      ["fTexto", "bOper", "bZona", "seg", "fZona"].forEach(function (k) { if (typeof b[k] === "string") S[k] = b[k]; });
    } catch (e) {}
  }

  /* El reel de la portada rotula cada foto con lo que el sistema dice hoy. */
  function avisarReel(lista) {
    try {
      document.dispatchEvent(new CustomEvent("molins:propiedades", { detail: lista.map(function (p) {
        return { codigo: p.codigo, titulo: p.titulo, ubicacion: ubicCorta(p), operacion: p.operacion, precioTxt: p.precio > 0 ? money(p.moneda, p.precio) : "Consultar" };
      }) }));
    } catch (e) {}
  }

  /* Los dos emprendimientos, con lo que el sistema publica: cuántas unidades
     hay, cuántas quedan y desde cuánto. Si el CRM no contesta, el bloque se
     muestra igual, sin números. */
  function cargarProyectos() {
    function traer(slug) {
      return fetch(API + "/api/publico/propiedades?cartera=" + slug).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return j && j.propiedades ? j.propiedades : null; }).catch(function () { return null; });
    }
    traer("torre").then(function (u) {
      if (!u || !u.length) return;
      var libres = u.filter(function (x) { return x.estado === "ACTIVA"; });
      var precios = libres.map(function (x) { return x.precio; }).filter(function (n) { return n > 0; });
      var tipos = {};
      u.forEach(function (x) { var k = x.tipologia || "Unidad"; tipos[k] = tipos[k] || { n: 0, libres: 0 }; tipos[k].n++; if (x.estado === "ACTIVA") tipos[k].libres++; });
      /* La grilla: pisos de arriba a abajo, y en cada piso las dos torres. */
      var pisos = {};
      u.forEach(function (x) { var pi = x.piso || 0; pisos[pi] = pisos[pi] || []; pisos[pi].push(x); });
      var grilla = Object.keys(pisos).map(Number).sort(function (a, b) { return b - a; }).map(function (pi) {
        return { piso: pi + "º", unidades: pisos[pi].sort(function (a, b) { return String(a.unidad).localeCompare(String(b.unidad)); }).map(function (x) {
          return { codigo: x.codigo, k: (x.piso || "") + (x.unidad || ""), libre: x.estado === "ACTIVA", titulo: (x.tipologia ? x.tipologia + " · " : "") + (x.precio > 0 ? money(x.moneda, x.precio) : "consultar") + (x.estado === "ACTIVA" ? " · disponible" : " · reservada") };
        }) };
      });
      set({ torre: { unidades: u, total: u.length, libres: libres.length, reservadas: u.length - libres.length, desde: precios.length ? Math.min.apply(null, precios) : 0, moneda: (u[0] || {}).moneda || "USD",
        tipos: Object.keys(tipos).map(function (k) { return { k: k, n: tipos[k].n, libres: tipos[k].libres }; }), grilla: grilla } });
      if (window.medirHoja) setTimeout(medirHoja, 50);
    });
    traer("aires").then(function (u) {
      if (!u || !u.length) return;
      var NOMBRE = { OFICINA: ["Oficina", "Oficinas"], LOCAL: ["Local", "Locales"], DUPLEX: ["Dúplex", "Dúplex"], COCHERA: ["Cochera", "Cocheras"] };
      var ORDEN = ["DUPLEX", "OFICINA", "LOCAL", "COCHERA"];
      var tipos = {};
      u.forEach(function (x) { tipos[x.tipo] = tipos[x.tipo] || { n: 0, libres: 0 }; tipos[x.tipo].n++; if (x.estado === "ACTIVA") tipos[x.tipo].libres++; });
      var libres = u.filter(function (x) { return x.estado === "ACTIVA"; }).length;
      set({ aires: { total: u.length, libres: libres,
        tipos: ORDEN.filter(function (k) { return tipos[k]; }).map(function (k) { return { k: (NOMBRE[k] || [k, k])[tipos[k].n === 1 ? 0 : 1], n: tipos[k].n, libres: tipos[k].libres }; }) } });
      if (window.medirHoja) setTimeout(medirHoja, 50);
    });
  }

  /* Respaldo para cuando el CRM no contesta: seis fichas con las fotos que ya
     están en el repo y sin un solo precio, para no publicar un número viejo. */
  function muestra() {
    function m(codigo, titulo, tipo, zona, operacion, dorm, banos, foto) {
      return { codigo: codigo, titulo: titulo, tipo: tipo, zona: zona, barrio: zona, operacion: operacion, moneda: "USD", precio: 0, dorm: dorm, banos: banos, m2: 0, cubierta: 0, ambientes: 0, cocheras: 0, antiguedad: null, expensas: 0, caracteristicas: [], estado: "activa", descripcion: "", sinDireccion: true, fotos: foto ? [foto] : [] };
    }
    return [
      m("MOL-209940", "Casa en San Lorenzo", "Casa", "San Lorenzo", "Venta", 3, 2, "img/hero-MOL-209940.jpg"),
      m("MOL-213170", "Casa en San Lorenzo", "Casa", "San Lorenzo", "Venta", 4, 3, "img/hero-MOL-213170.jpg"),
      m("MOL-204329", "Casa en Vaqueros", "Casa", "Vaqueros", "Venta", 3, 2, "img/hero-MOL-204329.jpg"),
      m("MOL-215232", "Lote en El Encón", "Terreno", "El Encón · Rosario de Lerma", "Venta", 0, 0, "img/hero-MOL-215232.jpg"),
      m("MOL-220887", "Casa en Salta", "Casa", "Otras zonas de Salta", "Venta", 2, 1, "img/hero-MOL-220887.jpg"),
      m("MOL-213136", "Terreno en Chicoana", "Terreno", "Chicoana", "Venta", 0, 0, "")
    ];
  }

  /* ── datos estructurados ─────────────────────────────────────────────── */
  function estructurados(lista) {
    try {
      var base = location.origin + location.pathname;
      var agente = {
        "@context": "https://schema.org", "@type": "RealEstateAgent", "name": "Molins Negocios Inmobiliarios",
        "url": base, "telephone": "+54 387 415 3669",
        "address": { "@type": "PostalAddress", "streetAddress": "20 de Febrero 1705, Of. 7", "addressLocality": "Salta", "addressCountry": "AR" },
        "areaServed": "Salta, Argentina"
      };
      var items = lista.slice(0, 40).map(function (p, i) {
        return { "@type": "ListItem", "position": i + 1, "item": {
          "@type": "RealEstateListing", "name": p.titulo, "url": base + "?ficha=" + encodeURIComponent(p.codigo),
          "image": p.fotos[0] || undefined,
          "offers": p.precio > 0 ? { "@type": "Offer", "price": p.precio, "priceCurrency": p.moneda, "availability": p.estado === "reservada" ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock" } : undefined,
          "address": { "@type": "PostalAddress", "addressLocality": p.barrio || zonaCorta(p), "addressRegion": "Salta", "addressCountry": "AR" }
        } };
      });
      var col = { "@context": "https://schema.org", "@type": "ItemList", "name": "Propiedades en venta y alquiler en Salta", "numberOfItems": lista.length, "itemListElement": items };
      [agente, col].forEach(function (o) {
        var sc = document.createElement("script");
        sc.type = "application/ld+json";
        sc.textContent = JSON.stringify(o);
        document.head.appendChild(sc);
      });
    } catch (e) {}
  }

  /* ── filtros ─────────────────────────────────────────────────────────── */
  function pasaFiltros(p) {
    if (S.seg === "guardadas") { if (!esFav(p.codigo)) return false; }
    else if (S.seg !== "todo" && segDe(p) !== S.seg) return false;
    if (S.fTexto.trim()) {
      var q = norm(S.fTexto).trim().split(/\s+/);
      var pajar = norm([p.titulo, p.barrio, p.zona, p.tipo, p.codigo, p.operacion].join(" "));
      for (var i = 0; i < q.length; i++) if (pajar.indexOf(q[i]) < 0) return false;
    }
    if (S.fTipo && p.tipo !== S.fTipo) return false;
    if (S.fZona && p.zona !== S.fZona) return false;
    if (S.fDorm && p.dorm < +S.fDorm) return false;
    if (S.fPrecio) {
      if (p.moneda !== "USD" || !p.precio) return false;
      var r = { a: [0, 50000], b: [50000, 100000], c: [100000, 200000], d: [200000, Infinity] }[S.fPrecio];
      if (p.precio < r[0] || p.precio > r[1]) return false;
    }
    return true;
  }

  function ordenar(lista) {
    var k = S.fOrden, l = lista.slice();
    var precio = function (p) { return p.precio > 0 && p.moneda === "USD" ? p.precio : (p.precio > 0 ? p.precio / 1200 : 0); };
    if (k === "precio-asc") l.sort(function (a, b) { return (precio(a) || 1e12) - (precio(b) || 1e12); });
    else if (k === "precio-desc") l.sort(function (a, b) { return precio(b) - precio(a); });
    else if (k === "m2") l.sort(function (a, b) { return b.m2 - a.m2; });
    else if (k === "recientes") l.sort(function (a, b) { return b.publicadaEn - a.publicadaEn; });
    else l.sort(function (a, b) { return a.orden - b.orden; });
    return l;
  }

  function scrollA(id) {
    var el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 92, behavior: "smooth" });
  }

  function prop(codigo) { for (var i = 0; i < S.props.length; i++) if (S.props[i].codigo === codigo) return S.props[i]; return null; }

  /* ── ficha ───────────────────────────────────────────────────────────── */
  function abrirFicha(codigo) {
    anotarVista(codigo);
    set({ ficha: codigo, fotoN: 1, descLarga: false, visor: false, visorZoom: false, mosaicoPaso: 0, fichaPendiente: null });
    girarMosaico();
    precargarFotos(codigo, 1);
    urlFicha(codigo);
    if (window.VISITAS) VISITAS.anotar("ficha", codigo, codigo);
    setTimeout(montarMapa, 80);
    setTimeout(montarMapa, 400);
    setTimeout(function () { var c = document.getElementById("fichaCaja"); if (c) c.scrollTop = 0; var f = document.querySelector(".ficha"); if (f) f.classList.remove("es-baja"); }, 30);
  }
  function vigilarFicha() {
    var caja = document.getElementById("fichaCaja"), f = document.querySelector(".ficha");
    if (!caja || !f || caja.__vigilada) return;
    caja.__vigilada = true;
    caja.addEventListener("scroll", function () {
      var m = document.getElementById("fichaFotoCaja"), lim = (m ? m.offsetHeight : 300) - 72;
      f.classList.toggle("es-baja", caja.scrollTop > lim);
      if (m) { if (innerWidth < 900) cubrir(m, caja.scrollTop, m.offsetHeight); else { m.style.transform = ""; m.style.filter = ""; } }
    }, { passive: true });
  }
  function cerrarFicha() {
    if (document.fullscreenElement) try { document.exitFullscreen(); } catch (e) {}
    set({ ficha: null, visor: false, visorZoom: false, visorFull: false });
    clearTimeout(relojMosaico);
    urlFicha(null);
    if (mapa) { try { mapa.remove(); } catch (e) {} mapa = null; }
  }
  /* El visor abre con la foto "creciendo" desde donde estaba (la baldosa del
     mosaico o la miniatura de la tira): un FLIP con la Web Animations API. */
  var visorDesde = null;
  /* Las tres fotos chicas del mosaico van pasando solas mientras la ficha está abierta. */
  var relojMosaico = null;
  function girarMosaico() {
    clearTimeout(relojMosaico);
    if (matchMedia("(prefers-reduced-motion:reduce)").matches) return;
    relojMosaico = setTimeout(function () {
      if (!S.ficha || S.visor || document.hidden) { girarMosaico(); return; }
      var p = prop(S.ficha); if (!p || p.fotos.length < 6) return;
      set({ mosaicoPaso: (S.mosaicoPaso + 4) % p.fotos.length });
      girarMosaico();
    }, 4200);
  }
  function abrirVisor(n, rect) { visorDesde = rect || null; set({ visor: true, fotoN: n, visorZoom: false }); precargarFotos(S.ficha, n); animarVisor(); }
  function cerrarVisor() { if (document.fullscreenElement) try { document.exitFullscreen(); } catch (e) {} set({ visor: false, visorZoom: false, visorFull: false }); }
  function animarVisor() {
    var desde = visorDesde; visorDesde = null;
    if (!desde || matchMedia("(prefers-reduced-motion:reduce)").matches) return;
    requestAnimationFrame(function () {
      var f = document.getElementById("visorFoto"); if (!f || !f.animate) return;
      var listo = function () {
        var a = f.getBoundingClientRect(); if (!a.width) return;
        var sx = desde.width / a.width, sy = desde.height / a.height, dx = desde.left - a.left, dy = desde.top - a.top;
        f.animate([{ transform: "translate(" + dx + "px," + dy + "px) scale(" + sx + "," + sy + ")", borderRadius: "10px" }, { transform: "none", borderRadius: "8px" }], { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)" });
      };
      if (f.complete && f.naturalWidth) listo(); else f.addEventListener("load", listo, { once: true });
    });
  }
  function alternarZoom() { set({ visorZoom: !S.visorZoom }); }
  function alternarPantalla() {
    var v = document.querySelector(".visor"); if (!v) return;
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} set({ visorFull: false }); }
    else if (v.requestFullscreen) { v.requestFullscreen().then(function () { set({ visorFull: true }); }).catch(function () {}); }
  }
  function moverFoto(d) {
    var p = prop(S.ficha);
    if (!p || p.fotos.length < 2) return;
    var total = p.fotos.length;
    var n = ((S.fotoN + d - 1) % total + total) % total + 1;
    set({ fotoN: n });
    precargarFotos(p.codigo, n);
    var caja = document.getElementById("visorMarco");
    if (caja) { caja.classList.remove("foto-entra"); void caja.offsetWidth; caja.classList.add("foto-entra"); }
    var grande = document.querySelector(".mosaico__foto.es-grande img");
    if (grande) { grande.style.animation = "none"; void grande.offsetWidth; grande.style.animation = ""; }
    document.querySelectorAll(".ficha__nav span, .visor__titulo small").forEach(function (x) { x.classList.remove("cambia"); void x.offsetWidth; x.classList.add("cambia"); });
    var th = document.querySelector("#fichaThumbs [aria-current='true']");
    if (th && th.scrollIntoView) try { th.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); } catch (e) {}
  }
  /* La foto que sigue y la anterior ya están bajadas cuando se toca la flecha. */
  function precargarFotos(codigo, n) {
    var p = prop(codigo); if (!p || p.fotos.length < 2) return;
    [n, n - 2, n + 1].forEach(function (k) { var src = p.fotos[((k % p.fotos.length) + p.fotos.length) % p.fotos.length]; if (src) { var im = new Image(); im.src = src; } });
  }
  function montarMapa() {
    var p = prop(S.ficha), cont = document.getElementById("fichaMapa");
    if (!p || !cont || !window.L) return;
    var geo = ZONA_GEO[p.zona] || p.geo;
    if (!geo) return;
    if (mapa) { try { mapa.remove(); } catch (e) {} mapa = null; }
    mapa = L.map(cont, { scrollWheelZoom: false, dragging: S.ancho > 768 }).setView(geo, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(mapa);
    L.marker(geo, { icon: L.divIcon({ className: "", html: '<div style="width:26px;height:26px;background:var(--naranja);border:3px solid #fff;border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,.3)"></div>', iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(mapa);
    setTimeout(function () { if (mapa) mapa.invalidateSize(); }, 60);
  }

  /* El enlace directo a una ficha: se comparte y se abre en la ficha. Va con
     replaceState y no pushState para no llenarle el botón Atrás de pasos. */
  function urlFicha(cod) {
    if (!window.history || !history.replaceState) return;
    try { history.replaceState(null, "", location.pathname + (cod ? "?ficha=" + encodeURIComponent(cod) : "") + location.hash); } catch (e) {}
  }
  function abrirDesdeUrl() {
    var m = /[?&]ficha=([^&#]+)/.exec(location.search);
    if (!m) return;
    var cod = decodeURIComponent(m[1]);
    if (prop(cod)) abrirFicha(cod); else { urlFicha(null); set({ fichaPendiente: null }); }
  }
  /* Cuánto tapó la hoja al bloque de arriba (0 a 1): el de arriba se encoge y se oscurece. */
  function cubrir(el, tapado, visto) {
    var k = Math.min(1, Math.max(0, tapado / Math.max(1, visto)));
    el.style.transform = "scale(" + (1 - 0.06 * k).toFixed(3) + ")";
    el.style.filter = "brightness(" + (1 - 0.4 * k).toFixed(3) + ")";
    el.style.borderRadius = (k * 24).toFixed(1) + "px";
  }
  /* Preguntas y Contacto en el celular: la lista tapa la introducción, la tarjeta oscura tapa el formulario. */
  function vigilarPaneles() {
    document.querySelectorAll(".panel__cuerpo").forEach(function (c) {
      var pares = [[c.querySelector(".preguntas__intro"), c.querySelector(".preguntas__lista")], [c.querySelector(".contacto__form"), c.querySelector(".contacto__izq")]].filter(function (p) { return p[0] && p[1]; });
      if (!pares.length) return;
      var medir = function () { pares.forEach(function (p) { p[0].style.top = Math.min(0, c.clientHeight - p[0].offsetHeight) + "px"; }); };
      var mover = function () {
        if (innerWidth >= 900) { pares.forEach(function (p) { p[0].style.transform = ""; p[0].style.filter = ""; p[0].style.borderRadius = ""; }); return; }
        pares.forEach(function (p) {
          var ra = p[1].getBoundingClientRect(), rb = p[0].getBoundingClientRect();
          cubrir(p[0], rb.bottom - ra.top, Math.min(rb.height, c.clientHeight));
        });
      };
      if (!c.__vigilado) { c.__vigilado = true; c.addEventListener("scroll", mover, { passive: true }); }
      setTimeout(function () { medir(); mover(); }, 60);
    });
  }
  function cerrarPrevia() { set({ torrePrevia: null }); }
  function compartir() { var p = prop(S.ficha); if (p) compartirCodigo(p.codigo, p); }
  function compartirCodigo(codigo, p) {
    if (!p) return;
    var url = location.origin + location.pathname + "?ficha=" + encodeURIComponent(p.codigo);
    var texto = p.titulo + " · " + ubicCorta(p) + " · " + (p.precio > 0 ? money(p.moneda, p.precio) : "Consultar") + (p.operacion === "Alquiler" && p.precio > 0 ? " por mes" : "") + "\n" + url;
    var copiar = function () {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { avisar("Enlace copiado. Pegalo donde quieras."); }).catch(function () { window.prompt("Copiá el enlace:", url); });
      else window.prompt("Copiá el enlace:", url);
    };
    if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) navigator.share({ title: p.titulo, text: texto, url: url }).catch(function () {});
    else copiar();
  }

  function descripcionDe(p) {
    if (p.descripcion && p.descripcion.trim().length >= 40) {
      /* La coletilla «Comercializa Molins…» ya está en la ficha; y un bloque
         de diez oraciones se parte en párrafos de a tres para que se lea. */
      var t = p.descripcion.trim().replace(/\s*Comercializa\s+Molins[^.]*\.?\s*$/i, "").trim();
      var parrafos = t.split(/\n{2,}|\r\n\r\n/).map(function (x) { return x.trim().replace(/\n/g, " "); }).filter(Boolean);
      if (parrafos.length === 1) {
        /* Los puntos de los miles («$350.000») no cierran oración: se protegen antes de partir. */
        var protegido = parrafos[0].replace(/(\d)\.(?=\d)/g, "$1\u0001");
        var oraciones = (protegido.match(/[^.!?]+[.!?]+(\s|$)/g) || [protegido]).map(function (o) { return o.replace(/\u0001/g, "."); });
        parrafos = [];
        for (var i = 0; i < oraciones.length; i += 3) parrafos.push(oraciones.slice(i, i + 3).join("").trim());
      }
      return parrafos;
    }
    var comp = [];
    if (p.m2 > 0) comp.push(num(p.m2) + " m²");
    if (p.dorm > 0) comp.push(p.dorm + (p.dorm === 1 ? " dormitorio" : " dormitorios"));
    if (p.banos > 0) comp.push(p.banos + (p.banos === 1 ? " baño" : " baños"));
    var s1 = p.tipo + " en " + zonaCorta(p) + ".";
    var s2 = comp.length ? "Tiene " + comp.join(", ").replace(/, ([^,]*)$/, " y $1") + "." : "La superficie y la composición se confirman con el plano y la partida.";
    var s3 = p.precio > 0
      ? (p.operacion === "Alquiler" ? "Se ofrece en alquiler, a " + money(p.moneda, p.precio) + " por mes." : "Se ofrece en venta, a " + money(p.moneda, p.precio) + ".")
      : "El valor se pasa en la consulta.";
    return [s1 + " " + s2 + " " + s3, "Se muestra con turno coordinado. Escribinos con el código " + p.codigo + " y vemos qué día te queda cómodo. La operación se hace con corredor matriculado, y con escribano en la escritura."];
  }

  function similaresDe(p, n) {
    return S.props.filter(function (x) { return x.codigo !== p.codigo; }).map(function (x) {
      var s = 0;
      if (x.zona === p.zona) s += 3.5;
      if (x.tipo === p.tipo) s += 2.5;
      if (x.operacion === p.operacion) s += 2;
      return { p: x, s: s };
    }).sort(function (a, b) { return b.s - a.s; }).slice(0, n || 8).map(function (o) { return o.p; });
  }

  var relojSuave = null;
  function pintarSuave() { clearTimeout(relojSuave); relojSuave = setTimeout(pintar, 220); }
  var relojTexto = null;
  /* El pintor no toca un campo que tiene el foco (le movería el cursor), así
     que al vaciar el texto desde un chip hay que vaciar el campo a mano. */
  function vaciarTexto() { clearTimeout(relojTexto); ["fTexto", "fTexto2"].forEach(function (id) { var c = document.getElementById(id); if (c) c.value = ""; }); set({ fTexto: "" }); }
  function escribirTexto(ev) {
    var v = ev.target.value;
    clearTimeout(relojTexto);
    relojTexto = setTimeout(function () { if (S.fTexto !== v) { set({ fTexto: v }); guardarBusqueda(); } }, 160);
  }

  function irAConsultar(ctx, busca, p) {
    /* Viene de una ficha: el mensaje ya arranca escrito, con la propiedad y el código. */
    if (p && !S.formMensaje.trim()) S.formMensaje = "Hola, quiero consultar por " + p.titulo + " (" + p.codigo + ").";
    set({ ctx: ctx, ctxProp: p || null, formBusca: busca || S.formBusca, enviado: false, formError: "" });
    if (window.VISITAS) VISITAS.anotar("form_abierto", ctx || "contacto", p ? p.codigo : null);
    abrirVista("contacto");
  }

  /* ── el formulario, que ahora sí manda ───────────────────────────────── */
  function enviarForm() {
    if (S.enviando) return;
    if (!S.formNombre.trim() || !S.formWa.trim()) { set({ formError: "Falta tu nombre o tu WhatsApp." }); return; }
    if (S.formMail.trim() && S.formMail.indexOf("@") < 0) { set({ formError: "El correo no tiene forma de correo." }); return; }

    var trampa = document.getElementById("fEmpresa");
    var p = S.ctxProp;
    var cuerpo = {
      nombre: S.formNombre.trim(),
      telefono: S.formWa.trim(),
      email: S.formMail.trim() || null,
      interes: p ? p.codigo + " · " + p.tipo + " en " + p.zona : (S.ctx || S.formBusca),
      propiedadCodigo: p ? p.codigo : null,
      mensaje: "Busca: " + S.formBusca + (S.formZona ? " · Zona: " + S.formZona : "") + (p ? ". Consultó por la ficha " + p.codigo + "." : "") + (S.formMensaje.trim() ? "\n" + S.formMensaje.trim() : ""),
      canal: "PORTAL",
      codigo: window.codigoCorto ? window.codigoCorto() : null,
      empresa: trampa ? trampa.value : ""
    };
    set({ enviando: true, formError: "" });
    window.enviarConsulta(cuerpo).then(function () {
      set({ enviando: false, enviado: true, okMsg: "Gracias, " + cuerpo.nombre.split(" ")[0] + ". Te escribimos al " + cuerpo.telefono + " a la brevedad." });
    }).catch(function (e) {
      var t = e.status === 429 ? "Recibimos varias consultas seguidas desde tu conexión. Esperá unos minutos o escribinos por WhatsApp."
        : e.status === 400 ? "Revisá los datos: " + ((e.cuerpo && e.cuerpo.error) || "falta algo o tiene un formato raro") + "."
        : "No pudimos enviar la consulta. Escribinos directo por WhatsApp y te respondemos igual.";
      set({ enviando: false, formError: t });
      if (window.console) console.warn("portal: consulta no enviada", e);
    });
  }

  /* ── la vista ────────────────────────────────────────────────────────── */
  function vista() {
    var esMovil = S.ancho <= 1060;
    var visibles = ordenar(S.props.filter(pasaFiltros));
    var nReservadas = S.props.filter(function (p) { return p.estado === "reservada"; }).length;
    var cuenta = function (k) { return S.props.filter(function (p) { return segDe(p) === k; }).length; };
    var nVenta = cuenta("venta"), nTerreno = cuenta("terreno"), nAlquiler = cuenta("alquiler");

    var chipBase = "border:1.5px solid var(--borde-fuerte);background:#fff;color:var(--verde-claro);font-size:13.5px;font-weight:600;padding:9px 16px;border-radius:100px;cursor:pointer;min-height:42px;display:inline-flex;align-items:center;transition:border-color .2s,background .2s,color .2s";
    var chipOn = "border:1.5px solid var(--verde);background:var(--verde);color:#fff;font-size:13.5px;font-weight:600;padding:9px 16px;border-radius:100px;cursor:pointer;min-height:42px;display:inline-flex;align-items:center;box-shadow:0 5px 14px rgba(17,60,61,.22)";
    var segmentos = [
      { k: "todo", t: "Todas", n: S.props.length },
      { k: "venta", t: "Venta", n: nVenta },
      { k: "terreno", t: "Terrenos", n: nTerreno },
      { k: "alquiler", t: "Alquiler", n: nAlquiler },
      S.favs.length ? { k: "guardadas", t: "Guardadas", n: S.favs.length } : null
    ].filter(Boolean).map(function (c) {
      return { k: c.k, t: c.t, n: c.n, activo: S.seg === c.k ? "true" : "false", elegir: function () { set({ seg: c.k, bOper: c.k === "guardadas" ? S.bOper : c.k }); guardarBusqueda(); } };
    });

    var conteoZona = {};
    S.props.forEach(function (p) { conteoZona[p.zona] = (conteoZona[p.zona] || 0) + 1; });
    var zonasSelect = ZONA_ORDEN.filter(function (z) { return conteoZona[z]; }).map(function (z) { return { v: z, t: z + " (" + conteoZona[z] + ")" }; });
    var tipos = Object.keys(S.props.reduce(function (a, p) { a[p.tipo] = 1; return a; }, {})).sort(function (a, b) { return a.localeCompare(b, "es"); });

    function badgeDe(p) {
      if (p.estado === "reservada") return { t: (p.tipo === "Casa" || p.tipo === "Finca" || p.tipo === "Oficina") ? "Reservada" : "Reservado", bg: "rgba(9,30,31,.72)" };
      if (p.operacion === "Alquiler") return { t: "En alquiler", bg: "var(--verde-claro)" };
      return null;
    }

    var tarjetas = visibles.map(function (p, i) {
      var b = badgeDe(p) || { t: "", bg: "transparent" }, cuota = cuotaRef(p), fav = esFav(p.codigo);
      return {
        hayBadge: !!badgeDe(p),
        codigo: p.codigo, titulo: p.titulo, ubicacion: ubicCorta(p),
        fotos: fotosMini(p), variasFotos: p.fotos.length > 1,
        nueva: p.nueva && p.estado !== "reservada", nFotos: p.fotos.length > 1 ? p.fotos.length + " fotos" : "",
        reservada: p.estado === "reservada",
        fotoEstilo: "width:100%;height:100%;object-fit:cover;display:block;transition:transform .7s cubic-bezier(.22,.61,.36,1)" + (p.estado === "reservada" ? ";filter:saturate(.55)" : ""),
        esFav: fav ? "true" : "false", favFill: fav ? "currentColor" : "none", favAria: fav ? "Quitar de guardadas" : "Guardar",
        favEstilo: "",
        guardar: function (ev) { ev.stopPropagation(); alternarFav(p.codigo); var b = ev.currentTarget; if (b) { b.classList.remove("late"); void b.offsetWidth; b.classList.add("late"); } },
        tipoLinea: p.tipo + (p.sinDireccion ? "" : " · " + p.zona),
        linea: [p.tipo, p.dorm > 0 ? p.dorm + " dorm." : null, p.banos > 0 ? p.banos + (p.banos === 1 ? " baño" : " baños") : null, p.m2 > 0 ? num(p.m2) + " m²" : null].filter(Boolean).join(" · "),
        compartir: function (ev) { ev.stopPropagation(); compartirCodigo(p.codigo, p); },
        operacion: p.operacion,
        foto: p.fotos[0] || "", sinFoto: !p.fotos.length,
        badge: b.t,
        badgeEstilo: "font-size:11px;font-weight:700;padding:5px 10px;border-radius:100px;color:#fff;background:" + b.bg,
        haySpecs: p.dorm > 0 || p.banos > 0 || p.m2 > 0,
        specs: [
          p.dorm > 0 ? p.dorm + " dorm." : null,
          p.banos > 0 ? p.banos + (p.banos === 1 ? " baño" : " baños") : null,
          p.m2 > 0 ? num(p.m2) + " m²" : null
        ].filter(Boolean),
        precioTxt: p.precio > 0 ? money(p.moneda, p.precio) : "Consultar",
        precioSufijo: p.operacion === "Alquiler" && p.precio > 0 ? " por mes" : "",
        cuota: cuota ? "desde " + cuota + "/mes" : "",
        wa: waLink(p),
        aria: p.tipo + " en " + p.zona + ", " + p.codigo,
        delay: Math.min(i, 9) * 40 + "ms",
        abrir: function () { abrirFicha(p.codigo); }
      };
    });

    var zonasGrilla = ZONA_ORDEN.filter(function (z) { return conteoZona[z]; }).map(function (z) {
      return { n: conteoZona[z], nombre: z, desc: ZONA_DESC[z] || "", elegir: function () { set({ fZona: z, seg: "todo" }); scrollA("propiedades"); } };
    });

    var hayFiltros = S.seg !== "todo" || S.fTipo || S.fZona || S.fDorm || S.fPrecio || S.fTexto.trim();
    var PRECIO_TXT = { a: "Hasta USD 50.000", b: "USD 50.000 a 100.000", c: "USD 100.000 a 200.000", d: "Más de USD 200.000" };
    var chipsActivos = [
      S.fTexto.trim() ? { t: "“" + S.fTexto.trim() + "”", quitar: vaciarTexto } : null,
      S.fTipo ? { t: S.fTipo, quitar: function () { set({ fTipo: "" }); } } : null,
      S.fZona ? { t: S.fZona, quitar: function () { set({ fZona: "" }); } } : null,
      S.fDorm ? { t: S.fDorm + " o más dorm.", quitar: function () { set({ fDorm: "" }); } } : null,
      S.fPrecio ? { t: PRECIO_TXT[S.fPrecio], quitar: function () { set({ fPrecio: "" }); } } : null
    ].filter(Boolean);

    /* Recomendadas: parecidas a la última ficha que abrió; si no abrió
       ninguna, las más nuevas. Nunca las que ya están en pantalla filtradas. */
    var ultima = S.recientes.length ? prop(S.recientes[0]) : null;
    var recomendadas = (ultima ? similaresDe(ultima) : ordenar(S.props).slice(0, 3)).filter(function (x) { return x.estado !== "reservada"; }).slice(0, 3);
    var recomendadasTxt = ultima ? "Parecidas a " + ultima.titulo.toLowerCase() : "Las últimas que entraron";
    var segNombre = { venta: "en venta", terreno: "de terrenos", alquiler: "en alquiler" }[S.seg];
    var anticipo = S.calcPrecio * S.calcAnt / 100, saldo = S.calcPrecio - anticipo;

    /* La previa de una unidad de La Torre: el render y el plano son los de su tipología. */
    var TIPO_N = { "Horizonte": 1, "Evolución": 2, "Esencia": 3, "Cúspide": 4 };
    var tu = S.torrePrevia && S.torre ? S.torre.unidades.filter(function (x) { return x.codigo === S.torrePrevia; })[0] : null;
    var tpN = tu ? (TIPO_N[tu.tipologia] || 3) : 3;
    var fp = S.ficha ? prop(S.ficha) : null;
    var ficha = {};
    if (fp) {
      var b = badgeDe(fp), geo = ZONA_GEO[fp.zona] || fp.geo, cuota = cuotaRef(fp), sim = similaresDe(fp, S.ancho <= 699 ? 6 : 8);
      /* Para moverse sin cerrar: la lista es la que está filtrada en pantalla
         (o toda la cartera si la ficha vino por enlace y no está en ella). */
      var lista = visibles.some(function (x) { return x.codigo === fp.codigo; }) ? visibles : S.props;
      var pos = lista.findIndex(function (x) { return x.codigo === fp.codigo; });
      var vecinas = S.props.filter(function (x) { return x.codigo !== fp.codigo && x.zona === fp.zona && x.estado !== "reservada"; }).slice(0, 4);
      var desc = descripcionDe(fp), largo = desc.join(" ").length > 1800;
      ficha = {
        mPos: pos >= 0 ? (pos + 1) + " de " + lista.length : "",
        mHayNav: lista.length > 1,
        mAnterior: function () { if (pos < 0) return; abrirFicha(lista[(pos - 1 + lista.length) % lista.length].codigo); },
        mSiguiente: function () { if (pos < 0) return; abrirFicha(lista[(pos + 1) % lista.length].codigo); },
        mVecinas: vecinas.map(tarjetaMini), mHayVecinas: vecinas.length > 0,
        mVecinasTitulo: "Más en " + zonaCorta(fp),
        mVerZona: function () { cerrarFicha(); set({ fZona: fp.zona, seg: "todo", fTexto: "" }); scrollA("propiedades"); },
        mDescLead: desc[0] || "", mDescResto: desc.slice(1), mDescLarga: largo && !S.descLarga, mDescAbierta: !largo || S.descLarga,
        mLeerMas: function () { set({ descLarga: true }); },
        mFoto: fp.fotos[S.fotoN - 1] || "", mSinFoto: !fp.fotos.length,
        mVariasFotos: fp.fotos.length > 1, mFotoCuenta: S.fotoN + " de " + fp.fotos.length,
        mMosaico: (function () {
          var n = fp.fotos.length, out = [];
          for (var i = 0; i < Math.min(5, n); i++) {
            (function (idx, i) {
              out.push({ src: fp.fotos[idx], esGrande: i === 0, clase: "mosaico__foto" + (i === 0 ? " es-grande" : ""), carga: i === 0 ? "eager" : "lazy",
                ver: function (ev) { abrirVisor(idx + 1, ev && ev.currentTarget ? ev.currentTarget.getBoundingClientRect() : null); } });
            })(i === 0 ? S.fotoN - 1 : (S.fotoN - 1 + i + S.mosaicoPaso) % n, i);
          }
          return out;
        })(),
        visorClase: "visor" + (S.visorZoom ? " es-zoom" : ""),
        visorZoom: S.visorZoom ? "true" : "false", visorFull: S.visorFull ? "true" : "false",
        alternarZoom: alternarZoom, alternarPantalla: alternarPantalla,
        mFotosTxt: "Ver las " + fp.fotos.length + " fotos",
        verTodas: function (ev) { abrirVisor(S.fotoN, ev && ev.currentTarget ? document.querySelector(".mosaico__foto.es-grande") && document.querySelector(".mosaico__foto.es-grande").getBoundingClientRect() : null); },
        mVisor: S.visor,
        cerrarVisor: cerrarVisor,
        cerrarVisorFondo: function (ev) { if (ev.target === ev.currentTarget || ev.target.id === "visorMarco") cerrarVisor(); },
        mThumbs: fp.fotos.map(function (src, i) {
          return {
            src: src, activa: i + 1 === S.fotoN ? "true" : "false", clase: i + 1 === S.fotoN ? "es-activa" : "",
            ver: function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); visorDesde = ev && ev.currentTarget ? ev.currentTarget.getBoundingClientRect() : null; set({ fotoN: i + 1 }); precargarFotos(fp.codigo, i + 1); animarVisor(); },
            estilo: "width:78px;height:56px;flex:none;border-radius:8px;overflow:hidden;border:2px solid " + (i + 1 === S.fotoN ? "var(--naranja-claro)" : "transparent") + ";padding:0;cursor:pointer;background:none;opacity:" + (i + 1 === S.fotoN ? "1" : ".6"),
          };
        }),
        mUbicacion: ubicCorta(fp), mTitulo: fp.titulo, mOperacion: fp.operacion, mTipo: fp.tipo, mCodigo: fp.codigo,
        mHayBadge: !!b,
        mBadge: b ? b.t : "",
        mBadgeEstilo: b ? "background:" + b.bg : "",
        mPrecio: fp.precio > 0 ? money(fp.moneda, fp.precio) : "Consultar",
        mPrecioSufijo: fp.operacion === "Alquiler" && fp.precio > 0 ? "por mes" : "",
        mCuota: cuota ? "Referencia " + cuota + " por mes con 30% de anticipo" : "",
        mWa: waLink(fp),
        mEsFav: esFav(fp.codigo) ? "true" : "false", mFavFill: esFav(fp.codigo) ? "currentColor" : "none", mFavTxt: esFav(fp.codigo) ? "Guardada" : "Guardar",
        mFavEstilo: "display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:14.5px;padding:12px 18px;border-radius:10px;cursor:pointer;min-height:46px;transition:background .2s,border-color .2s;border:1.5px solid " + (esFav(fp.codigo) ? "var(--naranja)" : "var(--borde-fuerte)") + ";background:" + (esFav(fp.codigo) ? "var(--naranja-suave)" : "#fff") + ";color:" + (esFav(fp.codigo) ? "var(--naranja-oscuro)" : "var(--verde)"),
        guardarFicha: function (ev) { alternarFav(fp.codigo); var b = ev && ev.currentTarget; if (b) { b.classList.remove("late"); void b.offsetWidth; b.classList.add("late"); } },
        mEstadoEstilo: "margin:14px 0 0;font-size:13px;display:flex;gap:8px;align-items:center;color:" + (fp.estado === "reservada" ? "var(--naranja-oscuro)" : "var(--verde-claro)"),
        mPuntoEstilo: "width:8px;height:8px;border-radius:50%;flex:none;" + (fp.estado === "reservada" ? "background:var(--naranja);box-shadow:0 0 0 3px var(--naranja-suave)" : "background:var(--ok);box-shadow:0 0 0 3px var(--ok-suave)"),
        mEstadoTxt: fp.estado === "reservada" ? "Reservada: hay una oferta en curso. Podés dejar tus datos por si se libera." : "Disponible hoy. El estado sale del sistema en vivo: si se reserva, acá cambia.",
        mDatos: [
          fp.dorm > 0 ? { ico: "cama", v: String(fp.dorm), k: fp.dorm === 1 ? "Dormitorio" : "Dormitorios" } : null,
          fp.banos > 0 ? { ico: "bano", v: String(fp.banos), k: fp.banos === 1 ? "Baño" : "Baños" } : null,
          fp.m2 > 0 ? { ico: "area", v: num(fp.m2) + " m²", k: "Superficie" } : null,
          fp.cubierta > 0 && fp.cubierta !== fp.m2 ? { ico: "techo", v: num(fp.cubierta) + " m²", k: "Cubiertos" } : null,
          fp.ambientes > 0 ? { ico: "amb", v: String(fp.ambientes), k: "Ambientes" } : null,
          fp.cocheras > 0 ? { ico: "auto", v: String(fp.cocheras), k: fp.cocheras === 1 ? "Cochera" : "Cocheras" } : null,
          fp.antiguedad != null ? { ico: "tiempo", v: fp.antiguedad === 0 ? "A estrenar" : fp.antiguedad + " años", k: "Antigüedad" } : null
        ].filter(Boolean),
        mTiene: fp.caracteristicas.map(function (t) { return String(t).replace(/^(\w)/, function (c) { return c.toUpperCase(); }); }),
        mHayTiene: fp.caracteristicas.length > 0,
        mQuick: [
          { v: fp.dorm > 0 ? String(fp.dorm) : zonaCorta(fp), k: fp.dorm > 0 ? (fp.dorm === 1 ? "Dormitorio" : "Dormitorios") : "Zona" },
          { v: fp.banos > 0 ? String(fp.banos) : fp.operacion, k: fp.banos > 0 ? (fp.banos === 1 ? "Baño" : "Baños") : "Operación" },
          { v: fp.m2 > 0 ? num(fp.m2) + " m²" : "A confirmar", k: "Superficie" },
          { v: fp.codigo, k: "Código de ficha" }
        ],
        mMapaEstilo: geo ? "height:280px;border-radius:10px;overflow:hidden;border:1px solid var(--borde);background:var(--hueso-2)" : "display:none",
        mMapaNota: geo ? "El punto marca la zona, no la dirección exacta. La ubicación precisa se pasa al coordinar la visita." : "La zona de esta propiedad no está cargada con precisión en la ficha, así que no publicamos un punto en el mapa. Te la ubicamos exactamente cuando consultes.",
        mZonaDesc: ZONA_DESC[fp.zona] || "",
        mCarac: [
          { k: "Tipo de propiedad", v: fp.tipo }, { k: "Operación", v: fp.operacion },
          { k: "Superficie", v: fp.m2 > 0 ? num(fp.m2) + " m²" + (fp.cubierta > 0 ? " (" + num(fp.cubierta) + " m² cubiertos)" : "") : "A confirmar con el plano" },
          fp.ambientes > 0 ? { k: "Ambientes", v: String(fp.ambientes) } : null,
          fp.dorm > 0 ? { k: "Dormitorios", v: String(fp.dorm) } : null,
          fp.banos > 0 ? { k: "Baños", v: String(fp.banos) } : null,
          fp.cocheras > 0 ? { k: "Cocheras", v: String(fp.cocheras) } : null,
          fp.antiguedad != null ? { k: "Antigüedad", v: fp.antiguedad === 0 ? "A estrenar" : fp.antiguedad + " años" } : null,
          fp.expensas > 0 ? { k: "Expensas", v: "$ " + num(fp.expensas) + " por mes" } : null,
          fp.barrio ? { k: "Barrio", v: fp.barrio } : null,
          { k: "Zona", v: fp.zona },
          fp.expensas > 0 ? null : null
        ].filter(Boolean),
        mDescParrafos: descripcionDe(fp),
        mSimilares: sim.map(tarjetaMini),
        mHaySimilares: sim.length > 0,
        compartirFicha: compartir
      };
    }

    /* El estilo de los campos vive en el CSS (.campo-f); acá sólo va el borde rojo cuando falta algo. */
    var campoBase = "";
    var campoErr = "border-color:var(--alerta);box-shadow:0 0 0 4px rgba(220,60,60,.12)";
    var faltaNombre = S.formError && !S.formNombre.trim();
    var faltaWa = S.formError && !S.formWa.trim();

    var v = {
      esMovil: esMovil, noEsMovil: !esMovil,
      menuAbierto: S.menuOpen && esMovil,
      alternarMenu: function () { set({ menuOpen: !S.menuOpen }); },
      cerrarMenu: function () { set({ menuOpen: false, menuProy: false }); },
      menuProy: S.menuProy, menuProyAria: S.menuProy ? "true" : "false", alternarMenuProy: function () { set({ menuProy: !S.menuProy }); },

      heroInstitucional: true, heroPanel: false, heroBuscador: false,
      heroFoto: "img/hero-MOL-209940.jpg",
      resumenCartera: S.cargando ? "Cargando la cartera desde el sistema…"
        : "Hoy: " + nVenta + " en venta · " + nTerreno + " terrenos · " + nAlquiler + " en alquiler",

      bOper: S.bOper, bZona: S.bZona,
      cambiarBOper: function (ev) { set({ bOper: ev.target.value, seg: ev.target.value }); guardarBusqueda(); },
      cambiarBZona: function (ev) { set({ bZona: ev.target.value }); },
      buscarDesdeHero: function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); set({ seg: S.bOper, fZona: S.bZona }); guardarBusqueda(); scrollA("propiedades"); if (window.VISITAS) VISITAS.anotar("buscar", (S.fTexto || "") + "|" + S.bOper + "|" + S.bZona); },
      zonasSelect: zonasSelect, tipos: tipos,

      segmentos: segmentos,
      fTipo: S.fTipo, fZona: S.fZona, fDorm: S.fDorm, fPrecio: S.fPrecio,
      cambiarTipo: function (ev) { set({ fTipo: ev.target.value }); },
      cambiarZona: function (ev) { set({ fZona: ev.target.value }); },
      cambiarDorm: function (ev) { set({ fDorm: ev.target.value }); },
      cambiarPrecio: function (ev) { set({ fPrecio: ev.target.value }); },
      limpiarFiltros: function () { vaciarTexto(); set({ seg: "todo", fTipo: "", fZona: "", fDorm: "", fPrecio: "" }); },
      hayFiltros: hayFiltros,
      filtrosAbiertos: S.filtros || !!(S.fTipo || S.fZona || S.fDorm || S.fPrecio),
      filtrosTxt: (S.fTipo || S.fZona || S.fDorm || S.fPrecio) ? "Filtros · " + [S.fTipo, S.fZona, S.fDorm, S.fPrecio].filter(Boolean).length : "Filtros",
      filtrosEstilo: (S.filtros || S.fTipo || S.fZona || S.fDorm || S.fPrecio) ? chipOn : chipBase,
      alternarFiltros: function () { set({ filtros: !(S.filtros || !!(S.fTipo || S.fZona || S.fDorm || S.fPrecio)) }); if (S.filtros) return; if (S.fTipo || S.fZona || S.fDorm || S.fPrecio) set({ fTipo: "", fZona: "", fDorm: "", fPrecio: "" }); },
      chipsActivos: chipsActivos, hayChips: chipsActivos.length > 0,
      fTexto: S.fTexto, escribirTexto: escribirTexto, hayTexto: !!S.fTexto,
      limpiarTexto: function () { vaciarTexto(); var c = document.getElementById("fTexto"); if (c) c.focus(); },
      fOrden: S.fOrden, cambiarOrden: function (ev) { set({ fOrden: ev.target.value }); },
      disponibilidadTxt: S.cargando ? "" : (S.props.length - nReservadas) + " disponibles hoy" + (nReservadas ? " · " + nReservadas + (nReservadas === 1 ? " reservada" : " reservadas") : "") + " · actualizado desde el sistema",
      recomendadas: recomendadas.map(tarjetaMini),
      hayRecomendadas: !S.cargando && recomendadas.length > 0 && visibles.length > 0,
      recomendadasTxt: recomendadasTxt,
      resultadoTxt: S.cargando ? "" : (visibles.length === 1 ? "1 propiedad" : visibles.length + " propiedades"),
      cargando: S.cargando, modoMuestra: S.muestra,
      tarjetas: tarjetas,
      sinResultados: !S.cargando && visibles.length === 0,
      vacioTitulo: S.seg !== "todo" && !S.fTipo && !S.fZona && !S.fDorm && !S.fPrecio
        ? "Hoy no hay propiedades " + (segNombre || "") + " publicadas"
        : "No hay propiedades con esa combinación",
      vacioTexto: "El listado sale del sistema en vivo: apenas entre una que encaje, aparece acá. Dejanos el WhatsApp y te avisamos antes de publicarla.",
      avisarmeZona: function () { irAConsultar("Alerta de nueva propiedad." + (S.fZona ? " Zona: " + S.fZona + "." : ""), "Avisame cuando entre algo en mi zona"); },
      frenarBurbuja: function (ev) { ev.stopPropagation(); },

      torre: S.torre, hayTorre: !!S.torre,
      torreLinea: S.torre ? (S.torre.libres + " de " + S.torre.total + " unidades disponibles" + (S.torre.reservadas ? " · " + S.torre.reservadas + (S.torre.reservadas === 1 ? " reservada" : " reservadas") : "")) : "",
      torreDesde: S.torre && S.torre.desde ? "Desde " + money(S.torre.moneda, S.torre.desde) : "",
      torreTipos: S.torre ? S.torre.tipos.map(function (t) { return { k: t.k, n: t.libres + " de " + t.n }; }) : [],
      torreGrilla: S.torre ? S.torre.grilla.map(function (f) { return { piso: f.piso, unidades: f.unidades.map(function (x) { return { k: x.k, titulo: x.titulo, clase: "torre-u" + (x.libre ? "" : " es-reservada"), abrir: function () { set({ torrePrevia: x.codigo, tpVista: "render" }); if (window.VISITAS) VISITAS.anotar("torre_unidad", x.codigo); } }; }) }; }) : [],
      torrePrevia: !!tu,
      cerrarPrevia: cerrarPrevia,
      cerrarPreviaFondo: function (ev) { if (ev.target === ev.currentTarget) cerrarPrevia(); },
      tpVerRender: function () { set({ tpVista: "render" }); }, tpVerPlano: function () { set({ tpVista: "plano" }); },
      tpEsRender: S.tpVista === "render" ? "true" : "false", tpEsPlano: S.tpVista === "plano" ? "true" : "false",
      tpImg: tu ? "img/torre/" + S.tpVista + "-" + tpN + ".webp" : "", tpImgClase: S.tpVista === "plano" ? "es-plano" : "",
      tpEstado: tu ? (tu.estado === "ACTIVA" ? "Disponible" : "Reservada") : "",
      tpEstadoClase: "previa__estado" + (tu && tu.estado !== "ACTIVA" ? " es-reservada" : ""),
      tpRotulo: tu ? "Torre " + (tu.torre || "") + " · " + (tu.piso || "") + ".º piso" : "",
      tpTitulo: tu ? "Unidad " + (tu.piso || "") + (tu.unidad || "") + (tu.tipologia ? " · " + tu.tipologia : "") : "",
      tpPrecio: tu ? (tu.precio > 0 ? money(tu.moneda || "USD", tu.precio) : "Consultar") : "",
      tpPrecioNota: tu && tu.precio > 0 ? "en pozo, con financiación directa" : "",
      tpDatos: tu ? [
        tu.supTotal > 0 ? { v: num(tu.supTotal) + " m²", k: "Superficie" } : null,
        { v: tu.dormitorios > 0 ? String(tu.dormitorios) : "Mono", k: tu.dormitorios > 0 ? (tu.dormitorios === 1 ? "Dormitorio" : "Dormitorios") : "Ambiente" },
        tu.banos > 0 ? { v: String(tu.banos), k: tu.banos === 1 ? "Baño" : "Baños" } : null,
        { v: String(tu.piso || ""), k: "Piso" }
      ].filter(Boolean) : [],
      tpNota: tu ? (tu.estado === "ACTIVA" ? "El estado sale del sistema en vivo. Se vende en pozo, con financiación directa del desarrollo; el plan de pago se conversa al consultar." : "Está reservada. Podés dejar tus datos por si se libera, o mirar otra unidad de la misma tipología.") : "",
      tpWa: tu ? "https://wa.me/" + TEL + "?text=" + encodeURIComponent("Hola, quiero consultar por la unidad " + (tu.piso || "") + (tu.unidad || "") + " de La Torre (" + tu.codigo + ")") : "",
      aires: S.aires, hayAires: !!S.aires,
      airesLinea: S.aires ? S.aires.libres + " de " + S.aires.total + " unidades disponibles en la Etapa 1" : "",
      airesTipos: S.aires ? S.aires.tipos.map(function (t) { return { k: t.k, n: String(t.libres), de: t.libres === t.n ? "disponibles" : "de " + t.n }; }) : [],
      consultarTorre: function () { irAConsultar("Consulta por Edificio La Torre — unidades y plan de pago", "Para invertir"); },
      pedirPlanAires: function () { irAConsultar("Consulta por Aires de San Lorenzo — plan de pago y unidades disponibles", "Aires de San Lorenzo"); },

      zonasGrilla: zonasGrilla,

      calcPrecio: S.calcPrecio, calcAnt: S.calcAnt, calcCuotas: S.calcCuotas,
      calcPrecioTxt: "USD " + num(S.calcPrecio),
      calcAntTxt: S.calcAnt + "%",
      calcCuotasTxt: S.calcCuotas + " meses",
      calcCuotaMes: num(saldo / S.calcCuotas),
      calcAnticipoTxt: num(anticipo), calcSaldoTxt: num(saldo),
      calcLblAnt: "Anticipo (" + S.calcAnt + "%)",
      calcLblSaldo: "Saldo en " + S.calcCuotas + " cuotas",
      cambiarCalcPrecio: function (ev) { set({ calcPrecio: +ev.target.value }); },
      cambiarCalcAnt: function (ev) { set({ calcAnt: +ev.target.value }); },
      cambiarCalcCuotas: function (ev) { set({ calcCuotas: +ev.target.value }); },

      tramos: TRAMOS, faq: FAQ,

      formPendiente: !S.enviado, formEnviado: S.enviado,
      formNombre: S.formNombre, formWa: S.formWa, formMail: S.formMail, formBusca: S.formBusca,
      /* Repinta de a poco (los tildes de «bien» al lado del campo) sin mover el cursor: el pintor no toca el campo con foco. */
      escribirNombre: function (ev) { S.formNombre = ev.target.value; pintarSuave(); },
      escribirWa: function (ev) { S.formWa = ev.target.value; pintarSuave(); },
      escribirMail: function (ev) { S.formMail = ev.target.value; pintarSuave(); },
      escribirBusca: function (ev) { set({ formBusca: ev.target.value }); },
      buscaOpciones: [["Para vivir", "casa"], ["Para invertir", "inversion"], ["Alquilar", "llave"], ["Un terreno", "terreno"], ["Aires de San Lorenzo", "aires"], ["Edificio La Torre", "torre"], ["Vender mi propiedad", "vender"], ["Todavía estoy viendo", "ojo"]].map(function (o) {
        var t = o[0];
        return { t: t, ico: o[1], activa: S.formBusca === t ? "true" : "false", clase: "chip-busca" + (S.formBusca === t ? " es-activa" : ""), elegir: function () { set({ formBusca: t }); } };
      }),
      formZona: S.formZona, escribirZona: function (ev) { set({ formZona: ev.target.value }); },
      formMensaje: S.formMensaje, escribirMensaje: function (ev) { S.formMensaje = ev.target.value; },
      nombreOk: S.formNombre.trim().length >= 2,
      waOk: /\d{6,}/.test(S.formWa.replace(/\D/g, "")),
      mailOk: !!(S.formMail.trim() && S.formMail.indexOf("@") > 0),
      enviarTxt: S.enviando ? "Enviando…" : "Enviar la consulta",
      estiloCampoNombre: faltaNombre ? campoErr : campoBase,
      estiloCampoWa: faltaWa ? campoErr : campoBase,
      enviarConsulta: enviarForm,
      notaForm: S.formError || (S.enviando ? "Enviando…" : "Sin compromiso. Usamos tus datos solo para responderte."),
      estiloNotaForm: "font-size:12px;text-align:center;margin:11px 0 0;" + (S.formError ? "color:var(--alerta);font-weight:600" : "color:var(--gris)"),
      okMsg: S.okMsg, ctxConsulta: S.ctx, enviando: S.enviando,

      // Embebido en la vista previa del CRM no hay cartel: ahí no hay nada
      // que consentir porque no se mide nada (ver medicion.js).
      ckVisible: !window.MOLINS_EMBEBIDO && (window.CK ? CK.estado() === "sin_responder" : false),
      ckSi: function () { CK.decidir(true); if (window.VISITAS) VISITAS.alAceptar(); pintar(); },
      ckNo: function () { CK.decidir(false); pintar(); },

      vistaContacto: S.vista === "contacto", vistaPreguntas: S.vista === "preguntas",
      cerrarVista: cerrarVista, abrirContacto: function () { abrirVista("contacto"); }, abrirPreguntas: function () { abrirVista("preguntas"); },
      nGuardadas: S.favs.length ? String(S.favs.length) : "",
      guardadasActiva: S.seg === "guardadas" ? "true" : "false",
      guardadasClase: "buscador__fav btn-anim" + (S.seg === "guardadas" ? " es-activa" : ""),
      guardadasFill: S.seg === "guardadas" ? "currentColor" : "none",
      verGuardadas: function () { if (!S.favs.length) { avisar("Todavía no guardaste ninguna: tocá el corazón de una propiedad."); return; } set({ seg: S.seg === "guardadas" ? "todo" : "guardadas" }); },
      abrirBuscar: function () { abrirVista("buscar"); setTimeout(function () { var c = document.getElementById("fTexto2"); if (c && S.ancho > 900) c.focus(); }, 350); },
      vistaBuscar: S.vista === "buscar",
      fichaPendiente: !!S.fichaPendiente,
      cerrarVistaFondo: function (ev) { if (ev.target === ev.currentTarget) cerrarVista(); },
      toast: !!S.toast, toastTxt: S.toast,
      fichaAbierta: !!fp,
      cerrarFicha: cerrarFicha,
      cerrarFichaFondo: function (ev) { if (ev.target === ev.currentTarget) cerrarFicha(); },
      fotoAnterior: function (ev) { ev.stopPropagation(); moverFoto(-1); },
      fotoSiguiente: function (ev) { ev.stopPropagation(); moverFoto(1); },
      dejarDatos: function () {
        var p = fp;
        cerrarFicha();
        irAConsultar("Consulta por " + p.codigo + " — " + p.titulo + " (" + p.tipo + ", " + p.zona + ")",
          p.tipo === "Terreno" ? "Un terreno" : (p.operacion === "Alquiler" ? "Alquilar" : "Para vivir"), p);
      }
    };
    for (var k in ficha) v[k] = ficha[k];
    return v;
  }

  var TRAMOS = [
    { n: "1", titulo: "La visita", texto: "Coordinamos día y la recorremos juntos. Si no es la indicada, seguimos con otra: no hay compromiso hasta que hay algo firmado.", etiqueta: "QUÉ TE QUEDA", papel: "No se firma nada", detalle: "Todavía no hay obligación de ninguna de las dos partes" },
    { n: "2", titulo: "La reserva", texto: "Si te decidís, se hace una oferta por escrito con el monto, el plazo para que el propietario la acepte y la seña que entregás.", etiqueta: "QUÉ TE QUEDA", papel: "Reserva firmada", detalle: "Con el plazo de aceptación y qué pasa con la seña si no se acepta" },
    { n: "3", titulo: "El boleto", texto: "Aceptada la oferta, se firma el boleto de compraventa: precio final, forma de pago, plazo para escriturar y cuándo se entrega la posesión.", etiqueta: "QUÉ TE QUEDA", papel: "Boleto de compraventa", detalle: "Es el contrato. Desde acá la operación está cerrada entre las partes" },
    { n: "4", titulo: "La escritura", texto: "Ante escribano, con el informe de dominio y el de inhibición al día. Se verifica que la propiedad esté libre de gravámenes antes de firmar.", etiqueta: "QUÉ TE QUEDA", papel: "Escritura traslativa de dominio", detalle: "La propiedad pasa a tu nombre y se inscribe en el Registro" }
  ];

  var FAQ = [
    { n: "01", q: "¿Cómo coordino una visita?", a: "Escribinos por WhatsApp con el código de la ficha (el MOL-… que ves en cada propiedad) y proponé dos o tres horarios. Las visitas son con turno y las hace Francisco o Luis en persona. Si la propiedad no es la indicada, seguimos con otra: no hay compromiso hasta que hay algo firmado." },
    { n: "02", q: "¿Cuánto se paga de seña y qué pasa si me arrepiento?", a: "La reserva es un porcentaje chico del precio y se firma un recibo con plazo. Si el propietario no acepta la oferta, se devuelve. Si el que se arrepiente es el comprador, la seña se pierde. Todo queda por escrito antes de pagar." },
    { n: "03", q: "¿Quién paga los honorarios del corredor?", a: "En una venta, cada parte paga los honorarios de su corredor. El porcentaje se acuerda antes y figura en la autorización y en el boleto. No hay sorpresas al final." },
    { n: "04", q: "¿Qué es el informe de dominio y por qué importa?", a: "Es el certificado del Registro de la Propiedad que dice quién es el dueño y si hay hipotecas, embargos o inhibiciones. Se pide antes del boleto. Una propiedad sin informe no se firma." },
    { n: "05", q: "¿Puedo pagar en cuotas?", a: "En terrenos, en Aires de San Lorenzo y en La Torre, sí: anticipo y cuotas, con el detalle de cada plan en la consulta. En casas y departamentos de la cartera depende del propietario, y lo averiguamos antes de la visita." },
    { n: "06", q: "¿Cuánto tarda una escritura?", a: "Entre el boleto y la escritura pasan normalmente de 30 a 60 días: el escribano pide los certificados, se liquidan los impuestos y se coordina la firma. Con hipoteca bancaria, algo más." },
    { n: "07", q: "¿Por qué algunas fichas no muestran la dirección exacta?", a: "Por pedido del propietario. La ficha muestra el barrio y la zona; la dirección se pasa al coordinar la visita." },
    { n: "08", q: "Quiero vender o alquilar mi propiedad. ¿Cómo empiezo?", a: "Escribinos y coordinamos una tasación sin cargo. Después se firma la autorización de venta o de alquiler, se toman las fotos y la propiedad sale publicada acá y en los portales, con las consultas entrando al mismo sistema que ves en este sitio." }
  ];

  /* ── arranque y medición ─────────────────────────────────────────────── */
  function arrancar() {
    S.ancho = window.innerWidth;
    recordarBusqueda();
    pintar();
    cargar();
    cargarProyectos();

    /* Las tarjetas con varias fotos: al apoyar el mouse van pasando. Delegado,
       porque el pintor rehace las tarjetas en cada cambio. */
    var relojGal = null, galActiva = null;
    function galIr(g, n) {
      var fotos = g.querySelectorAll(".minigal__foto"), puntos = g.querySelectorAll(".minigal__punto");
      if (!fotos.length) return;
      n = ((n % fotos.length) + fotos.length) % fotos.length;
      fotos.forEach(function (f, i) { f.classList.toggle("es-previa", f.classList.contains("es-activa") && i !== n); });
      fotos.forEach(function (f, i) { f.classList.toggle("es-activa", i === n); if (i === n && f.dataset.lazy && !f.getAttribute("src")) f.setAttribute("src", f.dataset.lazy); });
      puntos.forEach(function (p, i) { p.classList.toggle("es-activa", i === n); });
      g.dataset.n = n;
    }
    function galParar() { clearTimeout(relojGal); relojGal = null; if (galActiva) { galIr(galActiva, 0); galActiva = null; } }
    var hayMouse = matchMedia("(hover:hover)").matches;
    document.addEventListener("mouseover", function (ev) {
      if (!hayMouse) return;
      var g = ev.target.closest && ev.target.closest(".minigal");
      if (!g || g === galActiva || g.querySelectorAll(".minigal__foto").length < 2) return;
      galParar(); galActiva = g;
      (function tic() { relojGal = setTimeout(function () { if (galActiva !== g) return; galIr(g, (+g.dataset.n || 0) + 1); tic(); }, 1100); })();
    });
    document.addEventListener("mouseout", function (ev) {
      if (!galActiva) return;
      var a = ev.relatedTarget;
      if (!a || !(a.closest && a.closest(".minigal") === galActiva)) galParar();
    });

    /* Preguntas: al abrir una se cierra la que estaba abierta. */
    document.addEventListener("toggle", function (ev) {
      var d = ev.target; if (!d || !d.matches || !d.matches("details.pregunta") || !d.open) return;
      d.parentNode.querySelectorAll("details.pregunta[open]").forEach(function (o) { if (o !== d) o.open = false; });
    }, true);

    /* Contacto y Preguntas viven en ventanas: cualquier enlace a #contacto o
       #preguntas las abre (barra, menú, pie, cierre), y el hash al entrar también. */
    document.addEventListener("click", function (ev) {
      var a = ev.target.closest && ev.target.closest('a[href="#contacto"], a[href="#preguntas"]');
      if (!a) return;
      ev.preventDefault();
      if (S.ficha) cerrarFicha();
      abrirVista(a.getAttribute("href").slice(1));
    });
    if (/^#(contacto|preguntas|buscar)$/.test(location.hash)) abrirVista(location.hash.slice(1));
    document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && S.visorFull) set({ visorFull: false }); });

    /* Las secciones de la ficha entran al aparecer dentro de su propio scroll. */
    if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion:reduce)").matches) {
      var obsS = null, raizS = null;
      window.observarSecciones = function () {
        var caja = document.getElementById("fichaCaja"); if (!caja) return;
        if (raizS !== caja) { if (obsS) obsS.disconnect(); raizS = caja; obsS = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("es-visto"); obsS.unobserve(e.target); } }); }, { root: caja, threshold: 0.12 }); }
        caja.querySelectorAll(".ficha__sec:not(.es-visto)").forEach(function (x) { if (!x.__obs) { x.__obs = true; obsS.observe(x); } });
        setTimeout(function () { caja.querySelectorAll(".ficha__sec:not(.es-visto)").forEach(function (x) { x.classList.add("es-visto"); }); }, 1800);
      };
    }

    /* La tira del visor como el Dock: cada miniatura crece según la distancia al mouse,
       las vecinas se corren para no pisarse, y el punto de mira sigue al mouse con
       inercia para que el cambio de una a otra se sienta fluido. */
    var tiraAuto = 0, tiraEl = null, tiraCola = false, miraX = null, miraObj = null, miraCola = false;
    function tiraDeslizar() {
      if (!tiraAuto || !tiraEl) { tiraCola = false; return; }
      tiraEl.scrollLeft += tiraAuto;
      requestAnimationFrame(tiraDeslizar);
    }
    function tiraPintar() {
      if (!tiraEl || miraObj === null) { miraCola = false; return; }
      miraX = miraX === null ? miraObj : miraX + (miraObj - miraX) * 0.35;
      var bs = tiraEl.querySelectorAll("button"), n = bs.length;
      if (!n) { miraCola = false; return; }
      var w = bs[0].offsetWidth || 98, base = new Array(n), esc = new Array(n), j;
      for (j = 0; j < n; j++) {
        /* El borde izquierdo sin corrimiento (el origen del escalado es abajo a la izquierda). */
        base[j] = bs[j].getBoundingClientRect().left - parseFloat(bs[j].dataset.dx || 0);
        var d = Math.abs(miraX - (base[j] + w / 2)), k = d < 300 ? 0.5 + 0.5 * Math.cos(Math.PI * d / 300) : 0;
        esc[j] = 1 + 0.8 * k * k;
      }
      /* La fila escalada se arma de izquierda a derecha, y después se corre entera para
         que el punto que está bajo el mouse no se mueva: así el cambio de una a otra es
         continuo, como en el Dock. */
      var L = new Array(n); L[0] = base[0];
      for (j = 1; j < n; j++) L[j] = L[j - 1] + w * esc[j - 1] + (base[j] - base[j - 1] - w);
      var S;
      if (miraX < base[0]) S = miraX;
      else {
        var c = 0; for (j = 0; j < n; j++) if (miraX >= base[j]) c = j;
        var dentro = miraX - base[c];
        S = dentro <= w ? L[c] + dentro * esc[c] : L[c] + w * esc[c] + (dentro - w);
      }
      var corr = miraX - S;
      /* En las puntas, si la primera o la última están a la vista, nada se sale de la tira. */
      var rt = tiraEl.getBoundingClientRect(), margen = 16;
      var izq = L[0] + corr, der = L[n - 1] + w * esc[n - 1] + corr;
      if (base[0] >= rt.left && izq < rt.left + margen) corr += rt.left + margen - izq;
      else if (base[n - 1] + w <= rt.right && der > rt.right - margen) corr -= der - (rt.right - margen);
      for (j = 0; j < n; j++) {
        var dx = L[j] + corr - base[j];
        bs[j].dataset.dx = dx.toFixed(2);
        bs[j].style.transform = "translateX(" + dx.toFixed(2) + "px) scale(" + esc[j].toFixed(3) + ")";
        bs[j].style.zIndex = esc[j] > 1.01 ? String(2 + Math.round(esc[j] * 10)) : "";
      }
      requestAnimationFrame(tiraPintar);
    }
    document.addEventListener("mousemove", function (ev) {
      var tira = ev.target.closest && ev.target.closest(".visor__tira"); if (!tira) { tiraAuto = 0; return; }
      var x = ev.clientX, rt = tira.getBoundingClientRect();
      /* Cerca del borde, la tira se desliza sola y muestra las que siguen. */
      var borde = 110;
      tiraAuto = x > rt.right - borde ? Math.min(9, (x - (rt.right - borde)) / 12 + 2) : x < rt.left + borde ? -Math.min(9, ((rt.left + borde) - x) / 12 + 2) : 0;
      tiraEl = tira; miraObj = x;
      tira.classList.add("es-viva");
      if (tiraAuto && !tiraCola) { tiraCola = true; requestAnimationFrame(tiraDeslizar); }
      if (!miraCola) { miraCola = true; requestAnimationFrame(tiraPintar); }
    });
    document.addEventListener("mouseout", function (ev) {
      var tira = ev.target.closest && ev.target.closest(".visor__tira");
      if (!tira || (ev.relatedTarget && tira.contains(ev.relatedTarget))) return;
      tiraAuto = 0; miraObj = null; miraX = null;
      tira.classList.remove("es-viva");
      tira.querySelectorAll("button").forEach(function (b) { b.style.transform = ""; b.style.zIndex = ""; delete b.dataset.dx; });
    });

    /* El reel pide abrir una ficha. */
    document.addEventListener("molins:ficha", function (ev) { if (prop(ev.detail)) abrirFicha(ev.detail); });

    /* El buscador flotante. Tres cosas: cuando queda pegado bajo la barra se
       achica (lo dice un centinela que queda en su lugar de origen, no una
       medida en cada scroll); al bajar rápido se esconde y apenas subís
       vuelve, como la barra de Safari, salvo que estés escribiendo; y la
       tecla «/» lo enfoca desde cualquier lado. */
    var busc = document.getElementById("buscador"), lugar = document.getElementById("buscador-lugar"), cab = document.querySelector("header");
    var quieto = matchMedia("(prefers-reduced-motion:reduce)").matches;
    function medirBarra() { if (cab) document.documentElement.style.setProperty("--barra", cab.offsetHeight + "px"); }
    medirBarra();
    /* La hoja de cierre (contacto + pie) mide lo que mide: ese es el recorrido en el que
       Aires queda fija abajo mientras la hoja la va tapando. */
    function medirHoja() {
      var raizE = document.documentElement, cierre = document.querySelector("main .cierre"), pie = document.querySelector('footer[data-screen-label="Pie"]');
      if (!cierre || !pie || !innerHeight) return;
      raizE.style.setProperty("--pie", pie.offsetHeight + "px");
      raizE.style.setProperty("--hoja", (cierre.offsetHeight + pie.offsetHeight) + "px");
      /* Un bloque más alto que la pantalla (el celular) queda fijo recién cuando se leyó
         entero: el `top` negativo lo clava con su pie al borde de abajo, y el que sigue lo tapa. */
      document.querySelectorAll("#proyectos .bloque").forEach(function (b) { b.style.top = Math.min(0, innerHeight - b.offsetHeight) + "px"; });
    }
    medirHoja(); setTimeout(medirHoja, 600); setTimeout(medirHoja, 2500); addEventListener("load", medirHoja);
    window.medirHoja = medirHoja;
    /* Los videos de los emprendimientos: se cargan y arrancan al verse, se frenan al irse. */
    (function () {
      var vs = document.querySelectorAll("video[data-src]"); if (!vs.length || !("IntersectionObserver" in window)) return;
      var sinMov = matchMedia("(prefers-reduced-motion:reduce)").matches;
      var ov = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var v = e.target;
          if (e.isIntersecting) { if (!v.getAttribute("src")) { v.src = v.dataset.src; v.load(); } if (!sinMov) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } }
          else if (!v.paused) v.pause();
        });
      }, { threshold: 0.25 });
      vs.forEach(function (v) { ov.observe(v); });
    })();
    if (busc) {
      var pegado = false;
      if (lugar && "IntersectionObserver" in window) {
        new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            /* El centinela sale por arriba cuando el buscador ya está pegado. */
            pegado = !e.isIntersecting && e.boundingClientRect.top < 0;
            busc.classList.toggle("es-pegado", pegado);
            if (!pegado) busc.classList.remove("es-oculto");
          });
        }, { rootMargin: "-" + ((cab ? cab.offsetHeight : 0) + 40) + "px 0px 0px 0px" }).observe(lugar);
      }
      var yAntes = window.scrollY, acum = 0, enCola = false, portadaEl = document.querySelector(".portada");
      var raizH = document.documentElement;
      function mirarBarra() {
        var y = window.scrollY, dy = y - yAntes; yAntes = y;
        var alto = portadaEl ? portadaEl.offsetHeight : 400;
        if (cab) { cab.classList.toggle("es-solida", y > alto - (cab.offsetHeight || 64)); cab.classList.toggle("es-arriba", y < 40 && !document.documentElement.classList.contains("con-capa")); }
        var proy = document.getElementById("proyectos");
        busc.classList.toggle("es-fuera", !!proy && proy.getBoundingClientRect().top < innerHeight * 0.45);
        if (quieto || y < 120) { raizH.classList.remove("es-bajando"); acum = 0; return; }
        if (document.activeElement && busc.contains(document.activeElement)) { raizH.classList.remove("es-bajando"); return; }
        acum = (dy > 0) === (acum > 0) ? acum + dy : dy;
        if (acum > 90) raizH.classList.add("es-bajando");
        else if (acum < -24) raizH.classList.remove("es-bajando");
      }
      addEventListener("scroll", function () {
        if (enCola) return; enCola = true;
        requestAnimationFrame(function () { enCola = false; mirarBarra(); });
      }, { passive: true });
      mirarBarra();
      setTimeout(function () { busc.classList.remove("buscador--entra"); }, 3200);
      document.addEventListener("keydown", function (ev) {
        if (ev.key !== "/" || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        var t = ev.target, tag = t && t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
        var c = document.getElementById("fTexto"); if (!c) return;
        ev.preventDefault(); document.documentElement.classList.remove("es-bajando"); c.focus();
        if (!pegado) c.scrollIntoView({ block: "center", behavior: quieto ? "auto" : "smooth" });
      });
    }

    /* Las tarjetas entran al aparecer (y la portada se mueve más lento que la
       página, con el rótulo desvaneciéndose: invita a seguir bajando). */
    if ("IntersectionObserver" in window && !quieto) {
      document.documentElement.classList.add("js-reveal");
      var obsT = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("es-visto"); obsT.unobserve(e.target); } });
      }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
      window.observarTarjetas = function () {
        var nuevas = document.querySelectorAll(".tarjeta:not(.es-visto)"), k = 0;
        nuevas.forEach(function (t) {
          if (t.__obs) return; t.__obs = true;
          t.style.transitionDelay = Math.min(k++, 8) * 55 + "ms";
          obsT.observe(t);
        });
        /* Red de seguridad: si el observador no llega a disparar (un navegador raro, la
           impresión), a los dos segundos se muestran igual. */
        setTimeout(function () { nuevas.forEach(function (t) { t.classList.add("es-visto"); }); }, 2000);
      };
      observarTarjetas();
      var portada = document.querySelector(".portada"), reelEl = document.getElementById("reel"), pieEl = document.querySelector(".reel__pie"), marcaEl = document.querySelector(".portada__marca");
      if (portada && reelEl) {
        var enColaH = false;
        /* Profundidad: la foto y el texto responden distinto al mouse (el texto,
           adelante, se mueve menos y en contra) y al scroll. */
        var mx = 0, my = 0;
        function paralajePortada() {
          var y = window.scrollY, h = portada.offsetHeight;
          var k = Math.min(1, Math.max(0, y / (h * 0.6)));
          document.documentElement.style.setProperty("--crece", k.toFixed(3));
          if (y > h * 1.2) return;
          /* Al bajar, la foto se encoge y se redondea como una tarjeta, y el rótulo se desvanece. */
          if (innerWidth < 900) { reelEl.style.transform = ""; reelEl.style.borderRadius = ""; return; }
          reelEl.style.transform = "translate3d(" + (mx * -12).toFixed(1) + "px," + (y * 0.16 + my * -8).toFixed(1) + "px,0) scale(" + (1 - 0.07 * k).toFixed(3) + ")";
          reelEl.style.borderRadius = (k * 28).toFixed(1) + "px";
          var op = Math.max(0, 1 - y / (h * 0.55)).toFixed(3);
          if (pieEl) { pieEl.style.opacity = op; pieEl.style.transform = "translate3d(" + (mx * 7).toFixed(1) + "px," + (y * -0.06 + my * 5).toFixed(1) + "px,0)"; }
          if (marcaEl) marcaEl.style.opacity = op;
        }
        /* El seguimiento del mouse se sacó (6/9): mareaba. Queda el paralaje del scroll. */
        addEventListener("scroll", function () { if (enColaH) return; enColaH = true; requestAnimationFrame(function () { enColaH = false; paralajePortada(); }); }, { passive: true });
        paralajePortada();
      }
    }

    /* Los bloques de La Torre y Aires entran cuando aparecen, y su foto se
       mueve apenas con el scroll (no con reduced-motion). */
    var quieto = matchMedia("(prefers-reduced-motion:reduce)").matches;
    var bloques = document.querySelectorAll(".bloque, .editorial");
    /* La bajada del título editorial se escribe letra por letra, con cursor, cuando el
       título ya subió. Las letras existen desde el principio: el alto no salta. */
    function prepararTipeo(p) {
      if (!p || p.dataset.tipeo) return;
      var texto = p.textContent.trim(); p.dataset.tipeo = texto; p.setAttribute("aria-label", texto);
      while (p.firstChild) p.removeChild(p.firstChild);
      texto.split("").forEach(function (ch) { var c = document.createElement("span"); c.className = "tipeo__c"; c.setAttribute("aria-hidden", "true"); c.textContent = ch; p.appendChild(c); });
    }
    function tipear(p) {
      if (!p || p.dataset.tipeado) return; p.dataset.tipeado = "1";
      var letras = p.querySelectorAll(".tipeo__c");
      if (quieto) { letras.forEach(function (c) { c.classList.add("es-visible"); }); return; }
      var cursor = document.createElement("span"); cursor.className = "tipeo__cursor"; cursor.setAttribute("aria-hidden", "true");
      p.insertBefore(cursor, letras[0] || null);
      var i = 0;
      (function paso() {
        if (i >= letras.length) { setTimeout(function () { cursor.classList.add("se-va"); }, 1400); return; }
        var c = letras[i++]; c.classList.add("es-visible");
        p.insertBefore(cursor, c.nextSibling);
        var ch = c.textContent, espera = ch === "." ? 260 : ch === "," ? 150 : 18 + Math.random() * 26;
        setTimeout(paso, espera);
      })();
    }
    document.querySelectorAll(".editorial__bajada").forEach(prepararTipeo);
    if (bloques.length && "IntersectionObserver" in window) {
      var obsB = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("es-visto"); obsB.unobserve(e.target); if (e.target.classList.contains("editorial")) setTimeout(function () { tipear(e.target.querySelector(".editorial__bajada")); }, 500); } }); }, { threshold: 0.18 });
      bloques.forEach(function (b) { obsB.observe(b); });
    } else bloques.forEach(function (b) { b.classList.add("es-visto"); tipear(b.querySelector(".editorial__bajada")); });
    if (!quieto && bloques.length) {
      var enColaP = false;
      var torreEl = document.querySelector(".bloque--torre"), airesEl = document.querySelector(".bloque--aires"), cierreEl = document.querySelector("main .cierre"), editorialEl = document.querySelector(".editorial-caja");
      function paralaje() {
        bloques.forEach(function (b) {
          var f = b.querySelector(".bloque__fondo"); if (!f) return;
          var r = b.getBoundingClientRect();
          if (r.bottom < 0 || r.top > innerHeight) return;
          var t = (r.top + r.height / 2 - innerHeight / 2) / innerHeight; // -1..1
          f.style.transform = "translate3d(0," + (t * -6).toFixed(2) + "%,0) scale(1.14)";
        });
        /* Aires se apila sobre La Torre, y la hoja de contacto sobre Aires: mientras lo cubre,
           el de abajo se encoge y se oscurece. Vale en todos los anchos: en el celular el
           bloque es más alto que la pantalla, así que se mide contra lo que se ve de él. */
        [[editorialEl, torreEl], [torreEl, airesEl], [airesEl, cierreEl]].forEach(function (par) {
          var abajo = par[0], arriba = par[1]; if (!abajo || !arriba) return;
          var ra = arriba.getBoundingClientRect(), rb = abajo.getBoundingClientRect();
          var visto = Math.max(1, Math.min(rb.height, innerHeight));
          var k = Math.min(1, Math.max(0, (rb.bottom - ra.top) / visto));
          abajo.style.transform = "scale(" + (1 - 0.06 * k).toFixed(3) + ")";
          abajo.style.filter = "brightness(" + (1 - 0.4 * k).toFixed(3) + ")";
          abajo.style.borderRadius = (k * 24).toFixed(1) + "px";
        });
      }
      addEventListener("scroll", function () { if (enColaP) return; enColaP = true; requestAnimationFrame(function () { enColaP = false; paralaje(); }); }, { passive: true });
      paralaje();
    }

    window.addEventListener("resize", function () {
      medirBarra(); medirHoja();
      set({ ancho: window.innerWidth, menuOpen: window.innerWidth > 1060 ? false : S.menuOpen });
    });
    /* Deslizar la foto de la ficha con el dedo. */
    var t0 = null;
    document.addEventListener("touchstart", function (ev) {
      if (!S.ficha || !ev.target.closest || !ev.target.closest("#visorMarco, #fichaFotoCaja")) { t0 = null; return; }
      t0 = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now() };
    }, { passive: true });
    document.addEventListener("touchend", function (ev) {
      if (!t0 || !S.ficha) return;
      var dx = ev.changedTouches[0].clientX - t0.x, dy = ev.changedTouches[0].clientY - t0.y;
      t0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (!S.visor) abrirVisor(S.fotoN); moverFoto(dx < 0 ? 1 : -1); }
    }, { passive: true });
    /* El reel de la portada pide un segmento ("Ver alquileres"). */
    document.addEventListener("molins:segmento", function (ev) { set({ seg: ev.detail, fTipo: "", fZona: "", fDorm: "", fPrecio: "", fTexto: "" }); });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && S.torrePrevia) { cerrarPrevia(); return; }
      if (ev.key === "Escape" && !S.ficha && S.vista !== "inicio") { cerrarVista(); return; }
      if (!S.ficha) return;
      if (ev.key === "Escape") { if (S.visor) cerrarVisor(); else cerrarFicha(); return; }
      if (ev.key === "ArrowLeft") moverFoto(-1);
      if (ev.key === "ArrowRight") moverFoto(1);
    });

    /* Todo WhatsApp del sitio —barra, hero, pie, tarjeta, ficha— registra el
       clic y se lleva el código corto al final del texto. Va delegado y en
       captura para alcanzar también a los enlaces que arma el pintor, y para
       correr antes de que la pestaña se vaya.

       El clic se manda en el instante y no cuando llega el mensaje: mucha
       gente borra el texto prellenado antes de enviar. El código queda como
       desempate cuando hay varios clics juntos. */
    document.addEventListener("click", function (ev) {
      var a = ev.target.closest && ev.target.closest('a[href^="https://wa.me"], a[href^="tel:"]');
      if (!a) return;
      // En la vista previa del CRM, WhatsApp abre en pestaña nueva: navegar el
      // iframe hacia wa.me lo dejaría en blanco (wa.me no se deja embeber).
      if (window.MOLINS_EMBEBIDO) a.target = "_blank";
      var esTel = a.getAttribute("href").indexOf("tel:") === 0;
      var m = /\((MOL-[0-9]+)\)/.exec(decodeURIComponent(a.getAttribute("href") || ""));
      var cod = m ? m[1] : (a.closest("[data-si='fichaAbierta']") ? S.ficha : null);
      if (window.registrarClic) registrarClic(esTel ? "llamar" : "whatsapp", cod ? { codigo: cod } : null);
      if (window.VISITAS) VISITAS.anotar(esTel ? "clic_whatsapp" : "clic_whatsapp", cod || (esTel ? "llamar" : "general"), cod);
      if (esTel) return;
      try {
        var u = new URL(a.href);
        var t = u.searchParams.get("text") || "Hola, vi el sitio y quiero consultar.";
        var c = window.codigoCorto ? codigoCorto() : "";
        if (c && t.indexOf("[" + c + "]") < 0) u.searchParams.set("text", t + " [" + c + "]");
        a.href = u.toString();
      } catch (e) {}
    }, true);

    if (window.VISITAS) {
      VISITAS.anotar("pagina", location.pathname + location.hash);
      VISITAS.enviar(false);

      /* Cada sección que entra en pantalla cuenta como "la miró", y de paso se
         le toma el tiempo: del entrar al salir. Los relojes corren en memoria y
         se vuelcan como eventos con `segundos` recién al esconderse la pestaña;
         el CRM junta los dos avisos de la misma sección en uno. El patrón vino
         del sitio de Cañada Húmeda (29/8), junto con los hitos de scroll. */
      var abiertas = {}; // id -> timestamp de apertura (0 = abierta, reloj parado)
      var relojSec = {}; // id -> milisegundos acumulados
      try {
        if ("IntersectionObserver" in window) {
          var vistas = {};
          var obs = new IntersectionObserver(function (es) {
            es.forEach(function (e) {
              var id = e.target.id;
              if (!id) return;
              if (e.isIntersecting) {
                abiertas[id] = Date.now();
                /* Se marca sólo si se pudo anotar: si no, lo que miró antes de
                   aceptar el cartel se perdería para siempre. */
                if (!vistas[id] && VISITAS.anotar("seccion", id)) vistas[id] = 1;
              } else if (abiertas[id]) {
                relojSec[id] = (relojSec[id] || 0) + (Date.now() - abiertas[id]);
                delete abiertas[id];
              }
            });
          }, { threshold: 0.5 });
          document.querySelectorAll("section[id]").forEach(function (x) { obs.observe(x); });
        }
      } catch (e) {}

      function volcarTiempos() {
        try {
          var ahora = Date.now();
          Object.keys(abiertas).forEach(function (id) {
            /* 0 = abierta con el reloj en pausa: si la pestaña queda escondida
               veinte minutos, esos veinte minutos no son lectura. */
            if (abiertas[id]) { relojSec[id] = (relojSec[id] || 0) + (ahora - abiertas[id]); abiertas[id] = 0; }
          });
          Object.keys(relojSec).forEach(function (id) {
            var seg = Math.round(relojSec[id] / 1000);
            if (seg >= 1 && VISITAS.anotar("seccion", id, null, seg)) relojSec[id] = 0;
          });
        } catch (e) {}
      }

      /* Hasta dónde baja: 25/50/75/100 por ciento, una sola vez cada marca. Si
         todavía no aceptó, la marca queda pendiente y se anota al aceptar. */
      var hitoScroll = {};
      function medirScroll() {
        try {
          var doc = document.documentElement;
          var alto = Math.max(1, (doc.scrollHeight || 1) - innerHeight);
          var pct = alto <= 1 ? 100 : Math.min(100, Math.round((window.scrollY || doc.scrollTop || 0) / alto * 100));
          [25, 50, 75, 100].forEach(function (h) {
            if (pct >= h && !hitoScroll[h] && VISITAS.anotar("scroll", String(h))) hitoScroll[h] = 1;
          });
        } catch (e) {}
      }
      var scrollEnCola = false;
      addEventListener("scroll", function () {
        if (scrollEnCola) return;
        scrollEnCola = true;
        setTimeout(function () { scrollEnCola = false; medirScroll(); }, 400);
      }, { passive: true });
      document.addEventListener("molins:acepto", medirScroll);

      addEventListener("hashchange", function () { VISITAS.anotar("pagina", location.pathname + location.hash); });
      /* Primero se vuelcan los relojes y después sale el beacon: al revés, los
         segundos quedarían para un envío que puede no llegar nunca. */
      addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") { volcarTiempos(); VISITAS.enviar(true); }
        else { var ahora = Date.now(); Object.keys(abiertas).forEach(function (id) { abiertas[id] = ahora; }); }
      });
      addEventListener("pagehide", function () { volcarTiempos(); VISITAS.enviar(true); });
    }

    var anio = document.getElementById("anio");
    if (anio) anio.textContent = new Date().getFullYear();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
