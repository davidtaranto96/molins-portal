/**
 * portal/src/reel.js — la portada: las propiedades de Fran, a plena calidad.
 *
 * Pedido de David (5/9, segunda vuelta): nada de videos. Fotos de las
 * propiedades, en su tamaño original, con fundido encadenado y un paneo
 * apenas perceptible; el texto chico y a un costado para que la foto mande.
 *
 * Cada diapositiva es una propiedad por su código. El rótulo (título, zona,
 * operación, precio) lo actualiza app.js con lo que el sistema publica hoy:
 * acá sólo va el respaldo por si el CRM tarda. «Ver la ficha» abre la ficha
 * de esa propiedad en el portal.
 *
 * Reglas:
 *  · Dos capas apiladas; la que viene se carga por detrás y recién cuando
 *    está lista se funde encima. Nunca se ve un cuadro en blanco.
 *  · Una sola carga en vuelo: cada pedido lleva un número de serie y el que
 *    llega tarde se descarta. (La primera versión podía superponer dos
 *    cambios y dejar la foto de una diapositiva con el rótulo de otra.)
 *  · Con reduced-motion no hay reel: queda la primera foto quieta.
 *  · Se pausa con la pestaña escondida o la portada fuera de pantalla.
 */
(function () {
  "use strict";

  var REEL = [
    { codigo: "MOL-204329", img: "img/hero-204329.webp", t: "Casa en Vaqueros", s: "Cartera propia · En venta" },
    { codigo: "MOL-227812", img: "img/hero-227812.webp", t: "Finca en Jardines de San Lorenzo", s: "En venta" },
    { codigo: "MOL-209940", img: "img/hero-209940.webp", t: "Casa en Villa San Lorenzo", s: "En venta" },
    { codigo: "MOL-229568", img: "img/hero-229568.webp", t: "Departamento en Centro", s: "En alquiler" },
    { codigo: "MOL-214601", img: "img/hero-214601.webp", t: "Casa en El Encón", s: "En venta" },
    { codigo: "MOL-208481", img: "img/hero-208481.webp", t: "Casa en Centro", s: "En venta" },
    { codigo: "MOL-220876", img: "img/hero-220876.webp", t: "Casa en Centro", s: "En venta" },
    { codigo: "MOL-215232", img: "img/hero-215232.webp", t: "Finca en El Encón", s: "En alquiler" },
    { codigo: "MOL-227822", img: "img/hero-227822.webp", t: "Dúplex en Grand Bourg", s: "En venta" },
    { codigo: "MOL-213170", img: "img/hero-213170.webp", t: "Terreno en San Lorenzo", s: "En venta" }
  ];
  var DUR = 6200, FUNDIDO = 1400;

  var raiz = document.getElementById("reel");
  if (!raiz) return;
  var capas = [raiz.querySelector(".reel__capa--a"), raiz.querySelector(".reel__capa--b")];
  var pie = document.querySelector(".reel__pie");
  var puntos = pie ? pie.querySelector(".reel__puntos") : null;
  var quieto = matchMedia("(prefers-reduced-motion:reduce)").matches;

  var i = 0, activa = 0, reloj = null, serie = 0, enVuelo = false, pausado = false, visible = true, vivo = true, kb = 0;
  var datos = {}; // codigo -> lo que publica el sistema (lo manda app.js)

  function foto(d) {
    var im = new Image();
    im.alt = ""; im.decoding = "async"; im.src = d.img;
    if (!quieto) { kb++; im.className = "reel__kb" + (kb % 2 ? " reel__kb--a" : " reel__kb--b"); }
    return im;
  }

  function rotulo(d) {
    var x = datos[d.codigo];
    if (!x) return { t: d.t, s: d.s, hay: false };
    var s = x.ubicacion + " · " + (x.operacion === "Alquiler" ? "En alquiler" : "En venta");
    if (x.precioTxt && x.precioTxt !== "Consultar") s += " · " + x.precioTxt + (x.operacion === "Alquiler" ? " por mes" : "");
    return { t: x.titulo, s: s, hay: true };
  }

  function pintarPie(d, n) {
    if (!pie) return;
    var r = rotulo(d);
    pie.querySelector(".reel__n").textContent = (n < 9 ? "0" : "") + (n + 1) + " / " + REEL.length;
    pie.querySelector(".reel__t").textContent = r.t;
    pie.querySelector(".reel__s").textContent = r.s;
    var a = pie.querySelector(".reel__cta");
    a.href = "?ficha=" + encodeURIComponent(d.codigo);
    a.onclick = function (ev) {
      if (!r.hay) return; // sin datos del sistema, que navegue y la abra al cargar
      ev.preventDefault();
      document.dispatchEvent(new CustomEvent("molins:ficha", { detail: d.codigo }));
    };
    pie.classList.remove("reel__pie--entra"); void pie.offsetWidth; pie.classList.add("reel__pie--entra");
    if (puntos) {
      var ps = puntos.children;
      for (var k = 0; k < ps.length; k++) {
        ps[k].classList.toggle("es-activo", k === n);
        ps[k].classList.remove("es-corriendo");
        ps[k].setAttribute("aria-current", k === n ? "true" : "false");
        ps[k].style.setProperty("--dur", "0ms");
      }
    }
  }
  function progreso(n, ms) {
    if (!puntos || quieto) return;
    var p = puntos.children[n]; if (!p) return;
    p.style.setProperty("--dur", "0ms"); void p.offsetWidth;
    p.style.setProperty("--dur", ms + "ms");
    p.classList.add("es-corriendo");
  }

  function mostrar(n) {
    if (!vivo) return;
    clearTimeout(reloj); reloj = null;
    var d = REEL[n], mi = ++serie;
    enVuelo = true;
    var media = foto(d);
    var listo = function () {
      if (!vivo || mi !== serie) return; // llegó tarde: ya se pidió otra
      enVuelo = false;
      var entra = capas[1 - activa], sale = capas[activa];
      while (entra.firstChild) entra.removeChild(entra.firstChild);
      entra.appendChild(media);
      entra.classList.add("es-visible");
      sale.classList.remove("es-visible");
      activa = 1 - activa;
      i = n;
      /* El rótulo cambia cuando la foto nueva ya se impuso, no al arrancar el fundido. */
      setTimeout(function () { if (mi === serie) pintarPie(d, n); }, 550);
      progreso(n, DUR);
      programar(DUR);
      setTimeout(function () { if (mi === serie) while (sale.firstChild) sale.removeChild(sale.firstChild); }, FUNDIDO + 100);
      var sig = new Image(); sig.src = REEL[(n + 1) % REEL.length].img;
    };
    if (media.complete && media.naturalWidth) listo();
    else { media.onload = listo; media.onerror = function () { if (mi === serie) { enVuelo = false; programar(800); } }; }
  }

  function programar(ms) {
    clearTimeout(reloj);
    if (quieto) return;
    reloj = setTimeout(function () { reloj = null; if (!pausado && visible && !enVuelo) siguiente(); }, ms);
  }
  function siguiente() { mostrar((i + 1) % REEL.length); }
  function ir(n) { if (n === i && !enVuelo) return; mostrar(n); }
  function reanudar() { if (!reloj && !enVuelo && !pausado && visible && !quieto) programar(1500); }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { pausado = true; clearTimeout(reloj); reloj = null; }
    else { pausado = false; reanudar(); }
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        visible = e.isIntersecting;
        if (!visible) { clearTimeout(reloj); reloj = null; } else reanudar();
      });
    }, { threshold: 0.1 }).observe(raiz);
  }

  if (puntos) {
    REEL.forEach(function (d, n) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "reel__punto"; b.setAttribute("aria-label", "Ir a " + d.t);
      b.onclick = function () { ir(n); };
      puntos.appendChild(b);
    });
    var prev = pie.querySelector(".reel__prev"), next = pie.querySelector(".reel__next");
    if (prev) prev.onclick = function () { ir((i - 1 + REEL.length) % REEL.length); };
    if (next) next.onclick = function () { ir((i + 1) % REEL.length); };
  }

  /* app.js avisa cuando el sistema contestó: se refresca el rótulo en vivo. */
  document.addEventListener("molins:propiedades", function (ev) {
    (ev.detail || []).forEach(function (x) { datos[x.codigo] = x; });
    pintarPie(REEL[i], i);
  });

  mostrar(0);
  window.addEventListener("pagehide", function () { vivo = false; clearTimeout(reloj); });
})();
