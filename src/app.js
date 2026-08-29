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
  var ZONA_DE_BARRIO = { "Centro": "Centro", "El Encón": "El Encón · Rosario de Lerma", "Rosario de Lerma": "El Encón · Rosario de Lerma", "San Lorenzo": "San Lorenzo", "Villa San Lorenzo": "San Lorenzo", "San Lorenzo Chico": "San Lorenzo", "Vaqueros": "Vaqueros", "La Caldera": "Vaqueros", "Cerrillos": "Cerrillos", "Chicoana": "Chicoana", "El Portezuelo": "El Portezuelo", "San Antonio": "San Antonio" };
  var ZONA_DESC = {
    "Centro": "El casco céntrico de Salta. Departamentos para vivir o alquilar, locales sobre calle y casas antiguas de buena superficie.",
    "El Encón · Rosario de Lerma": "Al oeste, camino a Campo Quijano. Club de campo, fincas y lotes grandes con parque.",
    "San Lorenzo": "La zona verde de la ciudad, a unos 11 km del centro. Casas con terreno y clima de quebrada.",
    "Vaqueros": "Al norte, sobre la ruta 9. Barrio abierto a pocos minutos del centro.",
    "Cerrillos": "Valle de Lerma, al sur. Superficies grandes y suelo productivo.",
    "Chicoana": "Valle de Lerma, camino a Cafayate. Terreno en zona de fincas.",
    "El Portezuelo": "Sobre la ladera del cerro, con vista alta a la ciudad.",
    "San Antonio": "Barrio residencial consolidado, cerca de las avenidas de acceso.",
    "Otras zonas de Salta": "Casas y terrenos en distintos puntos de la ciudad. Consultá por ubicación exacta."
  };
  var ZONA_ORDEN = ["Centro", "El Encón · Rosario de Lerma", "San Lorenzo", "Vaqueros", "Cerrillos", "Chicoana", "El Portezuelo", "San Antonio", "Otras zonas de Salta"];
  /* El punto es el de la ZONA, no el de la propiedad, y es a propósito: la
     dirección exacta se pasa al coordinar la visita. El portal en vivo hacía
     lo mismo aunque el API devuelva `geo` con la coordenada fina. */
  var ZONA_GEO = { "Centro": [-24.7889, -65.4103], "San Lorenzo": [-24.7338, -65.4859], "Vaqueros": [-24.6927, -65.4106], "Cerrillos": [-24.8996, -65.4867], "El Portezuelo": [-24.7998, -65.3838], "San Antonio": [-24.8035, -65.4005], "Chicoana": [-25.1078, -65.5375], "El Encón · Rosario de Lerma": [-24.9847, -65.5806] };

  var S = {
    props: [], cargando: true, muestra: false,
    seg: "todo", fTipo: "", fZona: "", fDorm: "", fPrecio: "",
    bOper: "todo", bZona: "",
    menuOpen: false, ancho: 1200,
    ficha: null, fotoN: 1,
    formNombre: "", formWa: "", formMail: "", formBusca: "Para vivir",
    formError: "", enviado: false, enviando: false, okMsg: "", ctx: "", ctxProp: null,
    calcPrecio: 75000, calcAnt: 30, calcCuotas: 60
  };
  var mapa = null;

  function set(cambios) { for (var k in cambios) S[k] = cambios[k]; pintar(); }
  function pintar() { window.Pintor.pintar(vista()); }

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

  function desdeApi(x) {
    var p = {};
    p.codigo = x.codigo;
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
      })
      .catch(function (e) {
        if (window.console) console.warn("portal: no se pudo cargar", e);
        set({ props: muestra(), cargando: false, muestra: true });
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
    if (S.seg !== "todo" && segDe(p) !== S.seg) return false;
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

  function scrollA(id) {
    var el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 92, behavior: "smooth" });
  }

  function prop(codigo) { for (var i = 0; i < S.props.length; i++) if (S.props[i].codigo === codigo) return S.props[i]; return null; }

  /* ── ficha ───────────────────────────────────────────────────────────── */
  function abrirFicha(codigo) {
    set({ ficha: codigo, fotoN: 1 });
    document.body.style.overflow = "hidden";
    urlFicha(codigo);
    if (window.VISITAS) VISITAS.anotar("ficha", codigo, codigo);
    setTimeout(montarMapa, 80);
    setTimeout(montarMapa, 400);
    setTimeout(function () { var c = document.getElementById("fichaCaja"); if (c) c.scrollTop = 0; }, 30);
  }
  function cerrarFicha() {
    set({ ficha: null });
    document.body.style.overflow = "";
    urlFicha(null);
    if (mapa) { try { mapa.remove(); } catch (e) {} mapa = null; }
  }
  function moverFoto(d) {
    var p = prop(S.ficha);
    if (!p || p.fotos.length < 2) return;
    var total = p.fotos.length;
    var n = ((S.fotoN + d - 1) % total + total) % total + 1;
    set({ fotoN: n });
  }
  function montarMapa() {
    var p = prop(S.ficha), cont = document.getElementById("fichaMapa");
    if (!p || !cont || !window.L) return;
    var geo = ZONA_GEO[p.zona];
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
    if (prop(cod)) abrirFicha(cod); else urlFicha(null);
  }
  function compartir() {
    var p = prop(S.ficha);
    if (!p) return;
    var url = location.origin + location.pathname + "?ficha=" + encodeURIComponent(p.codigo);
    var texto = p.titulo + " · " + ubicCorta(p) + " · " + (p.precio > 0 ? money(p.moneda, p.precio) : "Consultar") + (p.operacion === "Alquiler" && p.precio > 0 ? " por mes" : "") + "\n" + url;
    if (navigator.share) navigator.share({ title: p.titulo, text: texto, url: url }).catch(function () {});
    else window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener");
  }

  function descripcionDe(p) {
    if (p.descripcion && p.descripcion.trim().length >= 40)
      return p.descripcion.trim().split(/\n{2,}|\r\n\r\n/).map(function (t) { return t.trim().replace(/\n/g, " "); });
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

  function similaresDe(p) {
    return S.props.filter(function (x) { return x.codigo !== p.codigo; }).map(function (x) {
      var s = 0;
      if (x.zona === p.zona) s += 3.5;
      if (x.tipo === p.tipo) s += 2.5;
      if (x.operacion === p.operacion) s += 2;
      return { p: x, s: s };
    }).sort(function (a, b) { return b.s - a.s; }).slice(0, 3).map(function (o) { return o.p; });
  }

  function irAConsultar(ctx, busca, p) {
    set({ ctx: ctx, ctxProp: p || null, formBusca: busca || S.formBusca, enviado: false, formError: "" });
    if (window.VISITAS) VISITAS.anotar("form_abierto", ctx || "contacto", p ? p.codigo : null);
    scrollA("contacto");
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
      mensaje: "Busca: " + S.formBusca + (p ? ". Consultó por la ficha " + p.codigo + "." : ""),
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
    var visibles = S.props.filter(pasaFiltros);
    var cuenta = function (k) { return S.props.filter(function (p) { return segDe(p) === k; }).length; };
    var nVenta = cuenta("venta"), nTerreno = cuenta("terreno"), nAlquiler = cuenta("alquiler");

    var chipBase = "border:1.5px solid var(--borde-fuerte);background:#fff;color:var(--verde-claro);font-size:13.5px;font-weight:600;padding:9px 16px;border-radius:100px;cursor:pointer;min-height:42px;display:inline-flex;align-items:center;transition:border-color .2s,background .2s,color .2s";
    var chipOn = "border:1.5px solid var(--verde);background:var(--verde);color:#fff;font-size:13.5px;font-weight:600;padding:9px 16px;border-radius:100px;cursor:pointer;min-height:42px;display:inline-flex;align-items:center;box-shadow:0 5px 14px rgba(17,60,61,.22)";
    var segmentos = [
      { k: "todo", t: "Todas", n: S.props.length },
      { k: "venta", t: "Venta", n: nVenta },
      { k: "terreno", t: "Terrenos", n: nTerreno },
      { k: "alquiler", t: "Alquiler", n: nAlquiler }
    ].map(function (c) {
      return { k: c.k, t: c.t, n: c.n, estilo: S.seg === c.k ? chipOn : chipBase, elegir: function () { set({ seg: c.k }); } };
    });

    var conteoZona = {};
    S.props.forEach(function (p) { conteoZona[p.zona] = (conteoZona[p.zona] || 0) + 1; });
    var zonasSelect = ZONA_ORDEN.filter(function (z) { return conteoZona[z]; }).map(function (z) { return { v: z, t: z + " (" + conteoZona[z] + ")" }; });
    var tipos = Object.keys(S.props.reduce(function (a, p) { a[p.tipo] = 1; return a; }, {})).sort(function (a, b) { return a.localeCompare(b, "es"); });

    function badgeDe(p) {
      if (p.estado === "reservada") return { t: (p.tipo === "Casa" || p.tipo === "Finca" || p.tipo === "Oficina") ? "Reservada" : "Reservado", bg: "rgba(9,30,31,.72)" };
      if (p.operacion === "Alquiler") return { t: "En alquiler", bg: "var(--verde-claro)" };
      return { t: "Disponible", bg: "var(--ok-fuerte)" };
    }

    var tarjetas = visibles.map(function (p, i) {
      var b = badgeDe(p), cuota = cuotaRef(p);
      return {
        codigo: p.codigo, titulo: p.titulo, ubicacion: ubicCorta(p),
        tipoLinea: p.tipo + (p.sinDireccion ? "" : " · " + p.zona),
        operacion: p.operacion,
        foto: p.fotos[0] || "", sinFoto: !p.fotos.length,
        badge: b.t,
        badgeEstilo: "position:absolute;top:11px;left:11px;font-size:11px;font-weight:700;padding:5px 10px;border-radius:100px;color:#fff;background:" + b.bg,
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
        delay: Math.min(i, 8) * 45 + "ms",
        abrir: function () { abrirFicha(p.codigo); }
      };
    });

    var zonasGrilla = ZONA_ORDEN.filter(function (z) { return conteoZona[z]; }).map(function (z) {
      return { n: conteoZona[z], nombre: z, desc: ZONA_DESC[z] || "", elegir: function () { set({ fZona: z, seg: "todo" }); scrollA("propiedades"); } };
    });

    var hayFiltros = S.seg !== "todo" || S.fTipo || S.fZona || S.fDorm || S.fPrecio;
    var segNombre = { venta: "en venta", terreno: "de terrenos", alquiler: "en alquiler" }[S.seg];
    var anticipo = S.calcPrecio * S.calcAnt / 100, saldo = S.calcPrecio - anticipo;

    var fp = S.ficha ? prop(S.ficha) : null;
    var ficha = {};
    if (fp) {
      var b = badgeDe(fp), geo = ZONA_GEO[fp.zona], cuota = cuotaRef(fp), sim = similaresDe(fp);
      ficha = {
        mFoto: fp.fotos[S.fotoN - 1] || "", mSinFoto: !fp.fotos.length,
        mVariasFotos: fp.fotos.length > 1, mFotoCuenta: S.fotoN + " de " + fp.fotos.length,
        mThumbs: fp.fotos.map(function (src, i) {
          return {
            src: src,
            estilo: "width:78px;height:56px;flex:none;border-radius:8px;overflow:hidden;border:2px solid " + (i + 1 === S.fotoN ? "var(--naranja-claro)" : "transparent") + ";padding:0;cursor:pointer;background:none;opacity:" + (i + 1 === S.fotoN ? "1" : ".6"),
            ver: function () { set({ fotoN: i + 1 }); }
          };
        }),
        mUbicacion: ubicCorta(fp), mTitulo: fp.titulo, mOperacion: fp.operacion, mTipo: fp.tipo, mCodigo: fp.codigo,
        mBadge: b.t,
        mBadgeEstilo: "position:absolute;right:12px;bottom:12px;font-size:11.5px;font-weight:700;color:#fff;padding:5px 11px;border-radius:100px;background:" + b.bg,
        mPrecio: fp.precio > 0 ? money(fp.moneda, fp.precio) : "Consultar",
        mPrecioSufijo: fp.operacion === "Alquiler" && fp.precio > 0 ? "por mes" : "",
        mCuota: cuota ? "Referencia " + cuota + " por mes con 30% de anticipo" : "",
        mWa: waLink(fp),
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
          fp.caracteristicas.length ? { k: "Tiene", v: fp.caracteristicas.join(", ") } : null,
          fp.barrio ? { k: "Barrio", v: fp.barrio } : null,
          { k: "Zona", v: fp.zona },
          { k: "Corredor a cargo", v: "Francisco Molins" },
          { k: "Matrícula", v: "CUCIS MP 251" }
        ].filter(Boolean),
        mDescParrafos: descripcionDe(fp),
        mSimilares: sim.map(function (x) {
          return {
            foto: x.fotos[0] || "", zona: zonaCorta(x), titulo: x.titulo,
            precio: x.precio > 0 ? money(x.moneda, x.precio) : "Consultar",
            abrir: function () { abrirFicha(x.codigo); }
          };
        }),
        mHaySimilares: sim.length > 0,
        compartirFicha: compartir
      };
    }

    var campoBase = "width:100%;box-sizing:border-box;padding:12px 13px;border:1.5px solid var(--borde-fuerte);border-radius:10px;font-size:15px;color:var(--tinta);background:var(--hueso);min-height:47px";
    var campoErr = campoBase.replace("var(--borde-fuerte)", "var(--alerta)");
    var faltaNombre = S.formError && !S.formNombre.trim();
    var faltaWa = S.formError && !S.formWa.trim();

    var v = {
      esMovil: esMovil, noEsMovil: !esMovil,
      menuAbierto: S.menuOpen && esMovil,
      alternarMenu: function () { set({ menuOpen: !S.menuOpen }); },
      cerrarMenu: function () { set({ menuOpen: false }); },

      heroInstitucional: true, heroPanel: false, heroBuscador: false,
      heroFoto: "img/hero-MOL-209940.jpg",
      resumenCartera: S.cargando ? "Cargando la cartera desde el sistema…"
        : "Hoy: " + nVenta + " en venta · " + nTerreno + " terrenos · " + nAlquiler + " en alquiler",

      bOper: S.bOper, bZona: S.bZona,
      cambiarBOper: function (ev) { set({ bOper: ev.target.value }); },
      cambiarBZona: function (ev) { set({ bZona: ev.target.value }); },
      buscarDesdeHero: function () { set({ seg: S.bOper, fZona: S.bZona }); scrollA("propiedades"); },
      zonasSelect: zonasSelect, tipos: tipos,

      segmentos: segmentos,
      fTipo: S.fTipo, fZona: S.fZona, fDorm: S.fDorm, fPrecio: S.fPrecio,
      cambiarTipo: function (ev) { set({ fTipo: ev.target.value }); },
      cambiarZona: function (ev) { set({ fZona: ev.target.value }); },
      cambiarDorm: function (ev) { set({ fDorm: ev.target.value }); },
      cambiarPrecio: function (ev) { set({ fPrecio: ev.target.value }); },
      limpiarFiltros: function () { set({ seg: "todo", fTipo: "", fZona: "", fDorm: "", fPrecio: "" }); },
      hayFiltros: hayFiltros,
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
      escribirNombre: function (ev) { S.formNombre = ev.target.value; },
      escribirWa: function (ev) { S.formWa = ev.target.value; },
      escribirMail: function (ev) { S.formMail = ev.target.value; },
      escribirBusca: function (ev) { set({ formBusca: ev.target.value }); },
      estiloCampoNombre: faltaNombre ? campoErr : campoBase,
      estiloCampoWa: faltaWa ? campoErr : campoBase,
      enviarConsulta: enviarForm,
      notaForm: S.formError || (S.enviando ? "Enviando…" : "Sin compromiso. Usamos tus datos solo para responderte."),
      estiloNotaForm: "font-size:12px;text-align:center;margin:11px 0 0;" + (S.formError ? "color:var(--alerta);font-weight:600" : "color:var(--gris)"),
      okMsg: S.okMsg, ctxConsulta: S.ctx,

      // Embebido en la vista previa del CRM no hay cartel: ahí no hay nada
      // que consentir porque no se mide nada (ver medicion.js).
      ckVisible: !window.MOLINS_EMBEBIDO && (window.CK ? CK.estado() === "sin_responder" : false),
      ckSi: function () { CK.decidir(true); if (window.VISITAS) VISITAS.alAceptar(); pintar(); },
      ckNo: function () { CK.decidir(false); pintar(); },

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
    { q: "Cuánto se paga de seña y qué pasa si me arrepiento", a: "La reserva suele ser un porcentaje chico del precio, se firma un recibo con plazo, y si el vendedor no cumple se devuelve. Si el que se arrepiente es el comprador, la seña se pierde. Cada operación lo deja por escrito antes de pagar." },
    { q: "Quién paga los honorarios del corredor", a: "En una venta, cada parte paga los de su corredor. El porcentaje se acuerda antes y figura en la autorización y en el boleto. No hay sorpresas al final." },
    { q: "Qué es el informe de dominio y por qué importa", a: "Es el certificado del Registro que dice quién es el dueño y si la propiedad tiene hipotecas, embargos o inhibiciones. Se pide antes del boleto. Una propiedad sin informe no se firma." },
    { q: "Puedo pagar en cuotas", a: "En terrenos y en Aires de San Lorenzo, sí: anticipo y cuotas en pesos ajustadas por el índice de la construcción (CAC). En casas y departamentos de la cartera, depende del vendedor." },
    { q: "Cuánto tarda una escritura", a: "Entre el boleto y la escritura pasan normalmente de 30 a 60 días: el escribano pide certificados, se liquidan impuestos y se coordina la firma. Si hay hipoteca bancaria, un poco más." },
    { q: "La dirección exacta de una propiedad", a: "Algunas fichas muestran solo el barrio, por pedido del propietario. La dirección se pasa al coordinar la visita." }
  ];

  /* ── arranque y medición ─────────────────────────────────────────────── */
  function arrancar() {
    S.ancho = window.innerWidth;
    pintar();
    cargar();

    window.addEventListener("resize", function () {
      set({ ancho: window.innerWidth, menuOpen: window.innerWidth > 1060 ? false : S.menuOpen });
    });
    document.addEventListener("keydown", function (ev) {
      if (!S.ficha) return;
      if (ev.key === "Escape") cerrarFicha();
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
