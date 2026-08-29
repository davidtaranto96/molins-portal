/**
 * La medición del portal: consentimiento, visitas, atribución y clics.
 *
 * ESTE ARCHIVO NO SE REESCRIBIÓ. Es el código que ya venía funcionando en el
 * portal publicado, movido tal cual desde el `index.html` anterior (líneas
 * 1989-2121 del commit a501738). Se mueve, no se traduce, justamente para no
 * perder nada en el camino.
 *
 * SEGUNDA PASADA, 2026-08-29 (más tarde): se le AGREGÓ —sin tocar lo que ya
 * andaba— lo que el CRM aprendió a mirar: `anotar()` acepta un cuarto
 * parámetro `segundos` (cuánto tiempo estuvo en una sección) y `alAceptar()`
 * avisa con el evento `molins:acepto` para que `app.js` re-mida lo pendiente.
 * Los relojes por sección y los hitos de scroll viven en `app.js`.
 *
 * POR QUÉ IMPORTA, 2026-08-29: el rediseño que trajo Claude Design sólo leía
 * propiedades. No mandaba el formulario, no registraba clics de WhatsApp y no
 * medía visitas. Publicarlo tal cual dejaba a Francisco sin consultas por la
 * web y a las pantallas de Cookies y Campañas del CRM sin datos.
 *
 * Lo que expone, y que `app.js` usa:
 *   · window.CK       — el consentimiento y el id de visitante
 *   · window.VISITAS  — la cola de eventos (tope 30, envío cada 5 s)
 *   · window.ATRIB    — utm, referrer y página de entrada
 *   · window.registrarClic(tipo, propiedad)
 *   · window.enviarConsulta(datos)
 */
(function () {
  "use strict";

  var API = window.MOLINS_API || "https://crm.franciscomolins.com";
  var CARTERA = window.MOLINS_CARTERA || "propia,alquileres";
  var CLAVE_SITIO = window.MOLINS_CLAVE || "";

  /* ¿El sitio está adentro de otro (la vista previa del CRM)? Entonces no es
     un visitante: no se muestra el cartel de cookies, no se mide nada y los
     clics no se registran. Sin esto, cada vez que Francisco abría «Mi portal
     web» el CRM se contaba a sí mismo como una entrada. El try es por si un
     padre de otro origen bloquea leer `top`: ahí también estamos embebidos. */
  var EMBEBIDO = false;
  try { EMBEBIDO = window.self !== window.top; } catch (e) { EMBEBIDO = true; }
  window.MOLINS_EMBEBIDO = EMBEBIDO;

window.CK = (function(){
  var C_OK = 'molins_consent', C_VID = 'molins_vid', D180 = 180;

  function leer(n){
    try { var m = document.cookie.match('(^|;)\\s*' + n + '\\s*=\\s*([^;]+)'); return m ? decodeURIComponent(m[2]) : null; }
    catch(e){ return null; }
  }
  function escribir(n, v){
    try {
      var exp = new Date(Date.now() + D180 * 864e5).toUTCString();
      var seguro = location.protocol === 'https:' ? ';Secure' : '';
      document.cookie = n + '=' + encodeURIComponent(v) + ';expires=' + exp + ';path=/;SameSite=Lax' + seguro;
    } catch(e){}
  }
  function borrar(n){ try { document.cookie = n + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'; } catch(e){} }
  function aleatorio(){
    var r = '', abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    for (var i = 0; i < 16; i++) r += abc.charAt(Math.floor(Math.random() * abc.length));
    return r;
  }

  var api = {
    estado: function(){ return leer(C_OK) || 'sin_responder'; },
    visitante: function(){
      if (api.estado() !== 'si') return null;
      var v = leer(C_VID);
      if (!v) { v = aleatorio(); escribir(C_VID, v); }
      return v;
    },
    decidir: function(ok){
      escribir(C_OK, ok ? 'si' : 'no');
      if (!ok) borrar(C_VID); else api.visitante();
      var b = document.getElementById('ck'); if (b) b.hidden = true;
      document.documentElement.classList.remove('ck-abierto');
      try { if (window.VISITAS) VISITAS.alAceptar(); } catch(e){}
    }
  };
  return api;
})();

window.VISITAS = (function(){
  var COLA = [], TOPE = 30, timer = null, sid = null;

  function sesion(){
    if (sid) return sid;
    try {
      sid = sessionStorage.getItem('molins_sid');
      if (!sid) { sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 12); sessionStorage.setItem('molins_sid', sid); }
    } catch(e){ sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 12); }
    return sid;
  }

  function cuerpo(){
    var ok = CK.estado() === 'si';
    var base = { sesionId: sesion(), consentimiento: CK.estado(), eventos: [] };
    if (!ok) { COLA.length = 0; return base; }
    var a = window.ATRIB || {};
    base.eventos      = COLA.splice(0, TOPE);
    base.visitanteId  = CK.visitante();
    base.utm_source   = a.utm_source   || null;
    base.utm_medium   = a.utm_medium   || null;
    base.utm_campaign = a.utm_campaign || null;
    base.utm_content  = a.utm_content  || null;
    base.utm_term     = a.utm_term     || null;
    base.referrer     = a.referrer     || null;
    base.paginaEntrada = String(a.paginaEntrada || location.pathname).slice(0, 500);
    base.dispositivo  = window.matchMedia('(max-width: 768px)').matches ? 'movil' : 'escritorio';
    base.idioma       = (document.documentElement.lang || 'es').slice(0, 5);
    /* De acá sale el país en el CRM, sin mirar la IP: ni la VPN ni el Relay
       privado de Apple rompen el reloj, que es justo lo que sí le pasa a la IP. */
    try { base.zonaHoraria = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch(e){}
    return base;
  }

  function enviar(final){
    if (EMBEBIDO) return;
    try {
      var b = JSON.stringify(cuerpo());
      if (final && navigator.sendBeacon) {
        /* CORREGIDO 2026-08-29 — es el ÚNICO cambio respecto del original.
           El tipo era 'application/json', y eso convierte al beacon en una
           petición con preflight. `sendBeacon` viaja siempre con las
           credenciales incluidas, así que el OPTIONS exige que la respuesta
           traiga `Access-Control-Allow-Credentials: true`, cosa que la ruta no
           manda —ni debería, es una entrada pública—. Resultado: el preflight
           fallaba y el envío del cierre de pestaña NUNCA salía. Se perdían los
           últimos eventos de cada visita, en silencio y también en producción.
           Con 'text/plain' es una petición simple: no hay preflight y el POST
           llega. El handler hace `req.json()`, que parsea el cuerpo sin mirar
           el tipo, así que del otro lado no cambia nada. */
        navigator.sendBeacon(API + '/api/publico/visitas?clave=' + encodeURIComponent(CLAVE_SITIO),
                             new Blob([b], { type: 'text/plain;charset=UTF-8' }));
        return;
      }
      fetch(API + '/api/publico/visitas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sitio-clave': CLAVE_SITIO },
        body: b, keepalive: true
      }).catch(function(){});
    } catch(e){}
  }

  function anotar(tipo, valor, propiedadCodigo, segundos){
    if (EMBEBIDO) return false;
    if (CK.estado() !== 'si') return false;
    if (COLA.length >= TOPE) return false;
    var ev = { tipo: tipo, valor: String(valor || '').slice(0, 500) || null,
               propiedadCodigo: propiedadCodigo || null, en: new Date().toISOString() };
    if (typeof segundos === 'number' && segundos > 0) ev.segundos = Math.min(7200, Math.round(segundos));
    COLA.push(ev);
    if (!timer) timer = setTimeout(function(){ timer = null; enviar(false); }, 5000);
    return true;
  }

  function alAceptar(){
    try {
      document.querySelectorAll('section[id]').forEach(function(sec){
        var r = sec.getBoundingClientRect();
        if (r.top < innerHeight && r.bottom > 0) anotar('seccion', sec.id);
      });
    } catch(e){}
    /* Aviso para app.js: lo que quedó pendiente de antes de aceptar (los hitos
       de scroll, por ejemplo) se re-mide recién ahora que se puede anotar. */
    try { document.dispatchEvent(new CustomEvent('molins:acepto')); } catch(e){}
    enviar(false);
  }

  return { enviar: enviar, anotar: anotar, alAceptar: alAceptar };
})();

window.ATRIB = (function(){
  var q = {}; try { new URLSearchParams(location.search).forEach(function(v,k){ q[k] = v; }); } catch(e){}
  var guardada = {};
  try { guardada = JSON.parse(sessionStorage.getItem('molins_atrib') || '{}'); } catch(e){}
  var a = {
    utm_source: q.utm_source || guardada.utm_source || null,
    utm_medium: q.utm_medium || guardada.utm_medium || null,
    utm_campaign: q.utm_campaign || guardada.utm_campaign || null,
    utm_content: q.utm_content || guardada.utm_content || null,
    utm_term: q.utm_term || guardada.utm_term || null,
    referrer: guardada.referrer || document.referrer || null,
    paginaEntrada: guardada.paginaEntrada || location.href.split('#')[0],
    visitanteId: guardada.visitanteId || null
  };
  /* El id de visitante SOLO existe si la persona aceptó, y vive en una cookie
     de 180 días y no en sessionStorage: en sessionStorage se pierde al cerrar
     la pestaña, así que "volvió" nunca podría dar verdadero. */
  a.visitanteId = window.CK && CK.estado() === 'si' ? CK.visitante() : null;
  try { sessionStorage.setItem('molins_atrib', JSON.stringify(a)); } catch(e){}
  return a;
})();

  /**
   * Código corto derivado del id de visitante (seis caracteres): va al final
   * del mensaje de WhatsApp entre corchetes y en el registro del clic, para
   * poder cruzar el mensaje con el anuncio del que salió.
   *
   * Tal cual estaba en el portal publicado. Vivía suelto en el `index.html`
   * viejo (línea 1308) y quedó fuera del bloque de módulos, así que se trae
   * acá: sin esto el clic se registra sin código y se pierde el cruce.
   */
  window.codigoCorto = function () {
    var v = (window.ATRIB && ATRIB.visitanteId) || "";
    var h = 0;
    for (var i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) >>> 0;
    var abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", out = "";
    for (var k = 0; k < 6; k++) { out += abc.charAt(h % abc.length); h = Math.floor(h / abc.length) + 7; }
    return out;
  };

  /**
   * El clic se registra en el instante, antes de que exista el mensaje: mucha
   * gente borra el texto prellenado de WhatsApp antes de mandarlo.
   */
  window.registrarClic = function (tipo, p) {
    if (EMBEBIDO) return;
    try {
      var a = window.ATRIB || {};
      fetch(API + "/api/publico/clics", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", "x-sitio-clave": CLAVE_SITIO },
        body: JSON.stringify({
          tipo: tipo,
          codigo: window.codigoCorto(),
          visitanteId: a.visitanteId || null,
          propiedadCodigo: p ? p.codigo : null,
          utm_source: a.utm_source || null, utm_medium: a.utm_medium || null,
          utm_campaign: a.utm_campaign || null, utm_content: a.utm_content || null,
          referrer: a.referrer || null, pagina: location.href, idioma: "es",
          dispositivo: window.innerWidth < 768 ? "celular" : "escritorio",
        }),
      }).catch(function () {});
    } catch (e) {}
  };

  /**
   * Manda la consulta al CRM. Devuelve una promesa: quien la llama decide qué
   * mostrar. Los errores llegan con `status` para poder distinguir el 429 (que
   * tiene una explicación distinta) del resto.
   */
  window.enviarConsulta = function (datos) {
    var a = window.ATRIB || {};
    var cuerpo = Object.assign(
      {
        utm_source: a.utm_source || null, utm_medium: a.utm_medium || null,
        utm_campaign: a.utm_campaign || null, utm_content: a.utm_content || null,
        utm_term: a.utm_term || null, referrer: a.referrer || null,
        paginaEntrada: a.paginaEntrada || null, paginaConsulta: location.href,
        dispositivo: window.innerWidth < 768 ? "celular" : "escritorio",
        idioma: "es", visitanteId: a.visitanteId || null,
      },
      datos
    );
    return fetch(API + "/api/publico/consultas", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sitio-clave": CLAVE_SITIO },
      body: JSON.stringify(cuerpo),
    }).then(function (r) {
      if (r.ok) return r.json().catch(function () { return {}; });
      return r.json().catch(function () { return {}; }).then(function (b) {
        var e = new Error("HTTP " + r.status);
        e.status = r.status; e.cuerpo = b;
        throw e;
      });
    });
  };

  window.MOLINS_CFG = { API: API, CARTERA: CARTERA, CLAVE: CLAVE_SITIO };
})();
