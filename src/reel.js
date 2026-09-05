/**
 * portal/src/reel.js — la portada como reel de agencia.
 *
 * Pedido de David (5/9): en vez de una foto fija o el video de Aires solo, que
 * la portada pase por todo lo que Fran comercializa —Aires en render y en
 * video, la cartera propia, los alquileres, La Torre— con un efecto de cine:
 * fundido encadenado, paneo lento sobre las fotos (Ken Burns) y un pie con
 * qué es cada cosa y a dónde ir.
 *
 * Reglas:
 *  · Dos capas apiladas. La que viene se carga por detrás y recién cuando
 *    está lista se funde encima; nunca se ve un cuadro en blanco.
 *  · Los videos sólo en escritorio, sin ahorro de datos y sin reduced-motion.
 *    En el celular la misma diapositiva muestra su foto.
 *  · Con reduced-motion no hay reel: queda la primera foto quieta con su pie.
 *  · Se pausa cuando la pestaña se esconde o la portada sale de pantalla.
 *  · Ninguna diapositiva afirma algo que el sistema no diga: los rótulos de
 *    las propiedades salen de lo que el CRM publicaba el 5/9/2026.
 */
(function () {
  "use strict";

  var REEL = [
    { video: "img/hero-valle.mp4", img: "img/hero-valle.webp", imgV: "img/hero-valle-v.webp", t: "Aires de San Lorenzo", s: "Etapa 1 en venta · San Lorenzo, Salta", href: "#proyectos", cta: "Ver el proyecto" },
    { img: "img/reel-venta-209940.webp", t: "Casa en Villa San Lorenzo", s: "Cartera propia · En venta", href: "#propiedades", cta: "Ver la cartera" },
    { img: "img/reel-torre-llegada.webp", t: "Edificio La Torre", s: "Doce unidades sobre Balcarce, en pozo", href: "https://edificiolatorre.com/", cta: "Conocer La Torre", ext: true },
    { img: "img/reel-alq-centro.webp", t: "Departamento en Centro", s: "En alquiler", href: "#propiedades", cta: "Ver alquileres", seg: "alquiler" },
    { img: "img/aires-conjunto.webp", t: "Aires de San Lorenzo", s: "El masterplan: dúplex, oficinas y locales", href: "https://airesdesanlorenzo.com/#etapa1", cta: "Elegir una unidad", ext: true },
    { img: "img/reel-venta-204329.webp", t: "Casa en Vaqueros", s: "Cartera propia · En venta", href: "#propiedades", cta: "Ver la cartera" },
    { video: "img/aires-portico.mp4", img: "img/aires-portico.webp", t: "Aires de San Lorenzo", s: "El ingreso, al atardecer", href: "#proyectos", cta: "Ver el proyecto" },
    { img: "img/reel-torre-hall.webp", t: "Edificio La Torre", s: "El hall de acceso · Salta centro", href: "https://edificiolatorre.com/", cta: "Conocer La Torre", ext: true },
    { img: "img/reel-venta-215232.webp", t: "Finca en El Encón", s: "Rosario de Lerma · En alquiler", href: "#propiedades", cta: "Ver alquileres", seg: "alquiler" },
    { img: "img/reel-venta-213170.webp", t: "Terreno en San Lorenzo", s: "Cartera propia · En venta", href: "#propiedades", cta: "Ver la cartera" }
  ];
  var DUR_FOTO = 6500, DUR_VIDEO_MAX = 9500, FUNDIDO = 1300;

  var raiz = document.getElementById("reel");
  if (!raiz) return;
  var capas = [raiz.querySelector(".reel__capa--a"), raiz.querySelector(".reel__capa--b")];
  var pie = document.querySelector(".reel__pie");
  var puntos = pie ? pie.querySelector(".reel__puntos") : null;

  var quieto = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var chica = matchMedia("(max-width:899px)").matches;
  var con = navigator.connection;
  var sinVideo = chica || quieto || !!(con && (con.saveData || /2g/.test(con.effectiveType || "")));

  var i = 0, activa = 0, reloj = null, pausado = false, visible = true, vivo = true, kb = 0;

  function fuente(d) { return chica && d.imgV ? d.imgV : d.img; }

  function armar(d, cb) {
    var el;
    if (d.video && !sinVideo) {
      el = document.createElement("video");
      el.muted = true; el.playsInline = true; el.setAttribute("playsinline", ""); el.setAttribute("muted", "");
      el.preload = "auto"; el.poster = d.img; el.disablePictureInPicture = true;
      el.src = d.video;
      var listo = false;
      var ok = function () { if (listo) return; listo = true; cb(el); };
      el.addEventListener("canplay", ok, { once: true });
      el.addEventListener("error", function () { if (!listo) { listo = true; cb(foto(d)); } }, { once: true });
      setTimeout(function () { if (!listo) { listo = true; cb(foto(d)); } }, 6000);
      el.load();
    } else {
      el = foto(d);
      if (el.complete && el.naturalWidth) cb(el);
      else { el.onload = function () { cb(el); }; el.onerror = function () { cb(el); }; }
    }
    return el;
  }
  function foto(d) {
    var im = new Image();
    im.alt = ""; im.decoding = "async";
    im.src = fuente(d);
    if (!quieto) { kb++; im.className = "reel__kb" + (kb % 2 ? " reel__kb--a" : " reel__kb--b"); }
    return im;
  }

  function pintarPie(d, n) {
    if (!pie) return;
    pie.querySelector(".reel__n").textContent = (n < 9 ? "0" : "") + (n + 1) + " / " + REEL.length;
    pie.querySelector(".reel__t").textContent = d.t;
    pie.querySelector(".reel__s").textContent = d.s;
    var a = pie.querySelector(".reel__cta");
    a.textContent = d.cta || "Ver";
    a.href = d.href;
    if (d.ext) { a.target = "_blank"; a.rel = "noopener"; } else { a.removeAttribute("target"); a.removeAttribute("rel"); }
    a.onclick = d.seg ? function () { try { sessionStorage.setItem("molins_seg", d.seg); } catch (e) {} document.dispatchEvent(new CustomEvent("molins:segmento", { detail: d.seg })); } : null;
    pie.classList.remove("reel__pie--entra"); void pie.offsetWidth; pie.classList.add("reel__pie--entra");
    if (puntos) {
      var ps = puntos.children;
      for (var k = 0; k < ps.length; k++) {
        ps[k].classList.toggle("es-activo", k === n);
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

  function mostrar(n, primera) {
    if (!vivo) return;
    var d = REEL[n];
    var entra = capas[1 - activa], sale = capas[activa];
    var el = armar(d, function (media) {
      if (!vivo) return;
      while (entra.firstChild) entra.removeChild(entra.firstChild);
      entra.appendChild(media);
      entra.classList.add("es-visible");
      sale.classList.remove("es-visible");
      activa = 1 - activa;
      i = n;
      pintarPie(d, n);
      var dur = DUR_FOTO;
      if (media.tagName === "VIDEO") {
        var p = media.play(); if (p && p.catch) p.catch(function () {});
        var real = isFinite(media.duration) && media.duration > 1 ? media.duration * 1000 - 200 : DUR_VIDEO_MAX;
        dur = Math.min(DUR_VIDEO_MAX, real);
      }
      progreso(n, dur);
      programar(dur);
      setTimeout(function () { while (sale.firstChild) sale.removeChild(sale.firstChild); }, FUNDIDO + 100);
      /* La que sigue se calienta con tiempo: sólo la foto, el video pesa. */
      var sig = REEL[(n + 1) % REEL.length];
      var pre = new Image(); pre.src = fuente(sig);
    });
    if (primera && el.tagName === "IMG") { /* la primera se ve desde el poster del HTML */ }
  }

  function programar(ms) {
    clearTimeout(reloj);
    if (quieto) return;
    reloj = setTimeout(function () { if (!pausado && visible) siguiente(); else reloj = null; }, ms);
  }
  function siguiente() { mostrar((i + 1) % REEL.length); }
  function ir(n) { if (n === i) return; clearTimeout(reloj); mostrar(n); }

  /* Pausa: pestaña escondida o portada fuera de pantalla. */
  function estadoVideo(play) {
    var v = raiz.querySelector("video"); if (!v) return;
    if (play) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause();
  }
  function reanudar() { if (!reloj && !pausado && visible && !quieto) programar(1200); estadoVideo(true); }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { pausado = true; clearTimeout(reloj); reloj = null; estadoVideo(false); }
    else { pausado = false; reanudar(); }
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        visible = e.isIntersecting;
        if (!visible) { clearTimeout(reloj); reloj = null; estadoVideo(false); } else reanudar();
      });
    }, { threshold: 0.15 }).observe(raiz);
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

  /* Arranque: la primera diapositiva entra sobre el poster que ya pintó el HTML. */
  mostrar(0, true);
  window.addEventListener("pagehide", function () { vivo = false; clearTimeout(reloj); });
})();
