/**
 * pintor.js — el renderizador mínimo de los sitios transpilados.
 *
 * NO SE EDITA ACÁ: este archivo lo copia `scripts/transpilar.mjs` a
 * `src/pintor.js` de cada sitio. La fuente vive en `molins-torres/scripts/`.
 * Está pegado al transpilador a propósito: el que emite los atributos y el que
 * los lee son el mismo paso, así no pueden desincronizarse.
 *
 * Qué entiende, que es exactamente lo que emite el transpilador:
 *
 *   <template data-lista="expr" data-alias="x">…</template>
 *        Rinde una fila por elemento y las escribe como hermanas ANTERIORES al
 *        template. Sin nodo contenedor: `<sc-for>` en el editor rinde como
 *        fragmento, y un envase rompería las grillas y sería inválido adentro
 *        de un <select>.
 *   data-si="expr"            muestra u oculta (atributo `hidden`)
 *   data-txt="expr"           texto del elemento
 *   data-estilo="expr"        el atributo style entero, calculado
 *   data-tpl-NOMBRE="a {expr} b"   atributo con plantilla
 *   data-attr-NOMBRE="expr"   atributo calculado; si da booleano, se pone o se saca
 *   data-src / data-href      lo mismo, para las dos que más se usan
 *   data-valor="expr"         valor de un campo de formulario
 *   data-click / data-change / data-input / data-submit   manejadores
 *
 * Las expresiones son caminos de puntos (`p.foto`), nada más: no hay evaluador
 * de JavaScript. Lo que se muestre lo calcula `vista()` en app.js.
 */
window.Pintor = (function () {
  "use strict";

  var DATOS = {};

  /* `true` y `false` llegan literales desde el editor (`{{ true }}`). */
  function evaluar(expr, alcance) {
    if (expr === "true") return true;
    if (expr === "false") return false;
    var partes = expr.split("."), v;
    if (alcance && Object.prototype.hasOwnProperty.call(alcance, partes[0])) v = alcance[partes[0]];
    else v = DATOS[partes[0]];
    for (var i = 1; i < partes.length && v != null; i++) v = v[partes[i]];
    return v;
  }

  function texto(v) {
    if (v == null || v === false) return "";
    if (Array.isArray(v)) return v.join(", ");
    return String(v);
  }

  /* Un alcance hijo copia el de arriba y le suma el alias de la fila. Se copia
     y no se encadena con prototipos para que `hasOwnProperty` de evaluar()
     distinga "lo trae la fila" de "lo trae la vista". */
  function derivar(alcance, alias, item) {
    var s = {};
    for (var k in alcance) s[k] = alcance[k];
    s[alias] = item;
    return s;
  }

  function aplicar(el, alcance) {
    var d = el.dataset, k;

    if (d.si !== undefined) el.hidden = !evaluar(d.si, alcance);
    if (d.txt !== undefined) el.textContent = texto(evaluar(d.txt, alcance));
    if (d.estilo !== undefined) el.setAttribute("style", texto(evaluar(d.estilo, alcance)));
    if (d.src !== undefined) { var s = texto(evaluar(d.src, alcance)); if (s && el.getAttribute("src") !== s) el.setAttribute("src", s); }
    if (d.href !== undefined) el.setAttribute("href", texto(evaluar(d.href, alcance)));

    /* Escribir el valor de un campo que está enfocado le manda el cursor al
       final en cada tecla. Si lo tiene el usuario, no se toca. */
    if (d.valor !== undefined && document.activeElement !== el) {
      var v = texto(evaluar(d.valor, alcance));
      if (el.value !== v) el.value = v;
    }

    for (k in d) {
      if (k.indexOf("tpl") === 0 && k.length > 3) {
        el.setAttribute(guion(k.slice(3)), d[k].replace(/\{([^}]+)\}/g, function (_, e) {
          return texto(evaluar(e.trim(), alcance));
        }));
      } else if (k.indexOf("attr") === 0 && k.length > 4) {
        var nombre = guion(k.slice(4)), val = evaluar(d[k], alcance);
        /* Un booleano se pone o se saca. Dejarlo como texto es la trampa que
           tenía el formulario de Torre: `disabled="false"` deshabilita igual. */
        if (val === true) el.setAttribute(nombre, "");
        else if (val === false || val == null) el.removeAttribute(nombre);
        else el.setAttribute(nombre, String(val));
      }
    }

    /* En un <a> hay que frenar la navegación: el manejador ya hace lo suyo. */
    if (d.click !== undefined) {
      var f = fn(d.click, alcance);
      el.onclick = el.tagName === "A" ? function (ev) { ev.preventDefault(); return f(ev); } : f;
    }
    /* En un <form> hay que frenar el envío nativo, que recargaría la página. */
    if (d.submit !== undefined) {
      var fs = fn(d.submit, alcance);
      el.onsubmit = function (ev) { ev.preventDefault(); return fs(ev); };
    }
    if (d.input !== undefined) el.oninput = fn(d.input, alcance);
    if (d.change !== undefined) {
      /* En el editor `onChange` salta en cada cambio. En HTML, `change` de un
         campo de texto espera a que pierda el foco, y el de un deslizador a que
         lo sueltes: el número no acompaña al dedo y se siente trabado. En los
         dos casos el evento correcto es `input`. */
      var vivo = el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !/^(checkbox|radio|file)$/.test(el.type));
      el[vivo ? "oninput" : "onchange"] = fn(d.change, alcance);
    }
  }

  function fn(expr, alcance) {
    return function (ev) {
      var f = evaluar(expr, alcance);
      if (typeof f === "function") return f(ev);
    };
  }

  /* dataset entrega `ariaLabel`; el atributo se llama `aria-label`. */
  function guion(s) {
    return s.charAt(0).toLowerCase() + s.slice(1).replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); });
  }

  function expandir(tpl, alcance) {
    var lista = evaluar(tpl.dataset.lista, alcance);
    var alias = tpl.dataset.alias;
    var padre = tpl.parentNode;

    /* Lo generado en la pasada anterior se anota en el propio template. Se
       borra por esa lista y no caminando hacia atrás por los hermanos: entre
       fila y fila la plantilla deja nodos de texto (los saltos de línea del
       HTML), y un recorrido que corta en el primer nodo que no es elemento se
       frena ahí y va dejando basura en cada pintada. */
    var previos = tpl.__generados || [];
    for (var i = 0; i < previos.length; i++) if (previos[i].parentNode === padre) padre.removeChild(previos[i]);
    tpl.__generados = [];
    if (!Array.isArray(lista)) return;

    lista.forEach(function (item) {
      var sub = derivar(alcance, alias, item);
      var frag = tpl.content.cloneNode(true);
      var nuevos = [];
      for (var n = frag.firstChild; n; n = n.nextSibling) {
        tpl.__generados.push(n);
        if (n.nodeType === 1) nuevos.push(n);
      }
      padre.insertBefore(frag, tpl);
      nuevos.forEach(function (el) { recorrer(el, sub, true); });
    });
  }

  /* Recorre en profundidad. Los <template> no se pintan: son moldes. */
  function recorrer(el, alcance, incluirse) {
    if (incluirse) {
      if (el.tagName === "TEMPLATE") { if (el.dataset.lista !== undefined) expandir(el, alcance); return; }
      aplicar(el, alcance);
    }
    for (var h = el.firstElementChild; h; h = h.nextElementSibling) recorrer(h, alcance, true);
  }

  return {
    pintar: function (datos, raiz) {
      DATOS = datos || {};
      recorrer(raiz || document.body, null, false);
    },
    datos: function () { return DATOS; },
  };
})();
