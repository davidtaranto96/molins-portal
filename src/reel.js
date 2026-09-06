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
  /* Al lado de la foto asoma la siguiente propiedad; tocarla adelanta. */
  var prox = document.querySelector(".reel__prox");
  var proxM = document.querySelector(".reel__prox-m"); // la pastilla del celular
  function pintarProx(n) {
    var d = REEL[(n + 1) % REEL.length], r = rotulo(d);
    if (proxM) { var imM = proxM.querySelector("img"), bM = proxM.querySelector("b"); if (imM && imM.getAttribute("src") !== d.img) imM.src = d.img; if (bM) bM.textContent = r.t; }
    if (!prox) return;
    var im = prox.querySelector(".reel__prox-foto"), b = prox.querySelector("b");
    if (im && im.getAttribute("src") !== d.img) {
      im.style.transition = "none"; im.style.opacity = "0"; im.style.transform = "translateX(60px)";
      im.onload = function () { requestAnimationFrame(function () { im.style.transition = "opacity .6s ease, transform .7s cubic-bezier(.2,.8,.2,1), filter .5s"; im.style.opacity = "1"; im.style.transform = ""; }); };
      im.src = d.img;
    } else if (im) { im.style.opacity = "1"; im.style.transform = ""; }
    if (b) b.textContent = r.t;
  }
  if (prox) prox.addEventListener("click", function () { ir((i + 1) % REEL.length); });
  if (proxM) proxM.addEventListener("click", function () { ir((i + 1) % REEL.length); });
  var puntos = pie ? pie.querySelector(".reel__puntos") : null;
  var quieto = matchMedia("(prefers-reduced-motion:reduce)").matches;

  var i = 0, activa = 0, reloj = null, serie = 0, enVuelo = false, pausado = false, visible = true, vivo = true, kb = 0;
  var datos = {}; // codigo -> lo que publica el sistema (lo manda app.js)

  /* La foto entera, nunca recortada (pedido de David 6/9): va contenida y
     centrada, y la misma foto desenfocada y oscura llena los costados. */
  function foto(d) {
    var caja = document.createElement("span"); caja.className = "reel__cuadro";
    var fondo = new Image(); fondo.className = "reel__fondo"; fondo.alt = ""; fondo.decoding = "async"; fondo.src = d.img;
    var im = new Image(); im.alt = ""; im.decoding = "async"; im.src = d.img;
    im.className = "reel__img" + (quieto ? "" : (kb++ % 2 ? " reel__kb--a" : " reel__kb--b"));
    caja.appendChild(fondo); caja.appendChild(im); caja.__img = im;
    return caja;
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

  /* El cambio de propiedad: la foto de la franja "Siguiente" vuela hasta el marco
     principal (crece, se desplaza y se ilumina) mientras la actual se aleja; recién
     cuando llega se hace el cambio de capa, sin fundido, así nunca se mezclan dos fotos.
     Devuelve false cuando no puede volar (celular, movimiento reducido, sin franja). */
  var volando = false;
  function rectDestino(ar) {
    var alto = raiz.parentNode.offsetHeight, w = Math.round(alto * ar), antes = raiz.style.width;
    raiz.style.transition = "none"; raiz.style.width = w + "px";
    var r = raiz.getBoundingClientRect();
    raiz.style.width = antes; void raiz.offsetWidth; raiz.style.transition = "";
    return r;
  }
  function volar(d, ar, sale, fin) {
    var chica = matchMedia("(max-width:899px)").matches;
    var im = prox && prox.querySelector(".reel__prox-foto");
    if (!prox || quieto || chica || !im || !raiz.parentNode || !("animate" in im)) return false;
    var padre = raiz.parentNode, pr = padre.getBoundingClientRect(), a = im.getBoundingClientRect();
    if (!a.width || !pr.width) return false;
    var b = rectDestino(ar);
    var clon = document.createElement("img");
    clon.src = d.img; clon.alt = ""; clon.className = "reel__vuelo";
    clon.style.cssText = "left:" + (a.left - pr.left) + "px;top:" + (a.top - pr.top) + "px;width:" + a.width + "px;height:" + a.height + "px";
    padre.appendChild(clon);
    volando = true;
    im.style.transition = "opacity .2s"; im.style.opacity = "0";
    /* El marco ya empieza a tomar el ancho de la foto que llega. */
    ajustarAncho(ar);
    var suave = "cubic-bezier(.2,.8,.2,1)";
    /* Mientras vuela, el borde difuminado de la izquierda (el mismo del marco) va
       entrando: al llegar ya es idéntico a la capa de abajo y el cambio no se ve. */
    var anim = clon.animate([
      { left: (a.left - pr.left) + "px", top: (a.top - pr.top) + "px", width: a.width + "px", height: a.height + "px", filter: "brightness(.62) saturate(.9)", maskSize: "200% 100%", maskPosition: "100% 0%", webkitMaskSize: "200% 100%", webkitMaskPosition: "100% 0%" },
      { left: (b.left - pr.left) + "px", top: (b.top - pr.top) + "px", width: b.width + "px", height: b.height + "px", filter: "brightness(1) saturate(1)", maskSize: "100% 100%", maskPosition: "0% 0%", webkitMaskSize: "100% 100%", webkitMaskPosition: "0% 0%" }
    ], { duration: 760, easing: suave, fill: "forwards" });
    var lejos = sale.animate([
      { transform: "none", filter: "brightness(1)" },
      { transform: "translateX(-5%) scale(.96)", filter: "brightness(.55)" }
    ], { duration: 760, easing: suave, fill: "forwards" });
    var cerrado = false;
    var cierre = function () {
      if (cerrado) return; cerrado = true; volando = false;
      fin();
      /* Con la capa nueva ya debajo, el clon se apaga y aparece el borde difuminado. */
      clon.classList.add("se-apaga");
      setTimeout(function () { lejos.cancel(); sale.style.transform = ""; sale.style.filter = ""; if (clon.parentNode) clon.parentNode.removeChild(clon); }, 320);
    };
    anim.onfinish = cierre;
    setTimeout(cierre, 1000);
    return true;
  }

  function mostrar(n) {
    if (!vivo || volando) return;
    clearTimeout(reloj); reloj = null;
    var d = REEL[n], mi = ++serie;
    enVuelo = true;
    var media = foto(d), im = media.__img;
    var listo = function () {
      if (!vivo || mi !== serie) return; // llegó tarde: ya se pidió otra
      enVuelo = false;
      var entra = capas[1 - activa], sale = capas[activa];
      while (entra.firstChild) entra.removeChild(entra.firstChild);
      entra.appendChild(media);
      /* El marco toma el ancho exacto de la proporción de la foto: entera, sin recortes. */
      var ar = im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : 1.333;
      var esPrimera = !document.querySelector(".reel__capa.es-visible");
      var cambiar = function (seco) {
        if (seco) { entra.style.transition = "none"; sale.style.transition = "none"; }
        ajustarAncho(ar);
        entra.classList.add("es-visible");
        sale.classList.remove("es-visible");
        /* El cambio seco necesita que el estilo se aplique antes de devolver la
           transición: el rAF corre antes del recálculo y no alcanzaba. */
        if (seco) { void entra.offsetWidth; entra.style.transition = ""; sale.style.transition = ""; }
      };
      if (esPrimera || !volar(d, ar, sale, function () { cambiar(true); })) cambiar(false);
      activa = 1 - activa;
      i = n;
      /* El rótulo cambia cuando la foto nueva ya se impuso, no al arrancar el fundido. */
      setTimeout(function () { if (mi === serie) { pintarPie(d, n); pintarProx(n); } }, 550);
      progreso(n, DUR);
      programar(DUR);
      setTimeout(function () { if (mi === serie) while (sale.firstChild) sale.removeChild(sale.firstChild); }, FUNDIDO + 100);
      var sig = new Image(); sig.src = REEL[(n + 1) % REEL.length].img;
    };
    if (im.complete && im.naturalWidth) listo();
    else { im.onload = listo; im.onerror = function () { if (mi === serie) { enVuelo = false; programar(800); } }; }
  }

  var arActual = 1.333;
  function ajustarAncho(ar) {
    arActual = ar || arActual;
    raiz.style.setProperty("--ar", arActual.toFixed(4));
    if (matchMedia("(max-width:899px)").matches) { raiz.style.width = ""; return; }
    var alto = raiz.parentNode ? raiz.parentNode.offsetHeight : raiz.offsetHeight;
    /* La portada arranca oculta hasta que el pintor la muestra: si todavía no
       tiene alto, se vuelve a intentar en el próximo cuadro. */
    if (!alto) { requestAnimationFrame(function () { ajustarAncho(); }); return; }
    raiz.style.width = Math.round(alto * arActual) + "px";
  }
  addEventListener("resize", function () { ajustarAncho(); });
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

  function arrancar() { requestAnimationFrame(function () { mostrar(0); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar); else arrancar();
  document.addEventListener("molins:propiedades", function () { ajustarAncho(); });
  window.addEventListener("pagehide", function () { vivo = false; clearTimeout(reloj); });
})();
