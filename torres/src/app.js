/**
 * Edificio La Torre — la lógica del sitio, en JavaScript plano.
 *
 * POR QUÉ NO HAY FRAMEWORK: el diseño venía de Claude Design y arrancaba
 * React desde unpkg para dibujar una página que no cambia de datos. Para una
 * web estática eso es traer una biblioteca de 140 KB para llenar doce botones.
 * `scripts/transpilar.mjs` convirtió las directivas del editor en atributos de
 * datos, y esto los llena.
 *
 * Lo que hace, en orden:
 *   1. lee las unidades del CRM y, si no contesta, usa las de acá;
 *   2. dibuja el esquema, la ficha, el simulador y el formulario;
 *   3. manda al CRM las consultas y los clics, con la campaña de origen.
 */
(() => {
  "use strict";

  // ¿El sitio está adentro de otro (la vista previa del CRM)? Entonces no es
  // un visitante: no se muestra el cartel de medición y los clics no se
  // registran. El try es por si un padre de otro origen bloquea leer `top`.
  let EMBEBIDO = false;
  try { EMBEBIDO = window.self !== window.top; } catch (e) { EMBEBIDO = true; }

  // ── Configuración ─────────────────────────────────────────────────────────
  // Se sobreescribe desde el HTML con window.TORRE_CONFIG, así el mismo archivo
  // sirve para la prueba y para producción sin tocar código.
  const CFG = Object.assign(
    {
      crm: "https://crm.franciscomolins.com",
      clave: "sk_JaM2iwc_VomlqxOK-mu3PYydaMP_i2Vy",
      cartera: "torre",
      whatsapp: "5493874153669",
      vigenciaPrecios: "agosto 2026",
      campaniaPorDefecto: "organico",
      // Los precios van tapados por decisión de David (31/8): primero se vende
      // el negocio, el número se conversa. Volver a mostrarlos es
      // window.TORRE_CONFIG = { mostrarPrecios: true } — nada más.
      mostrarPrecios: false,
    },
    window.TORRE_CONFIG || {}
  );

  /**
   * Las unidades de respaldo.
   *
   * Son las mismas que hoy están publicadas, y quedan como red: si el CRM no
   * contesta —un despliegue, un corte— el sitio sigue mostrando el edificio en
   * vez de una página vacía. El CRM manda cuando responde.
   */
  const UNIDADES_RESPALDO = [
    { id: "6A", piso: 6, codigo: "6.º A", tip: "Horizonte", tipoDesc: "Monoambiente", sup: 37, precio: 58000, estado: "libre" },
    { id: "5A", piso: 5, codigo: "5.º A", tip: "Evolución", tipoDesc: "Monoambiente con terraza", sup: 42, precio: 66000, estado: "libre" },
    { id: "4A", piso: 4, codigo: "4.º A", tip: "Esencia", tipoDesc: "1 dormitorio en suite", sup: 55, precio: 79000, estado: "libre" },
    { id: "3A", piso: 3, codigo: "3.º A", tip: "Esencia", tipoDesc: "1 dormitorio en suite", sup: 55, precio: 79000, estado: "libre" },
    { id: "2A", piso: 2, codigo: "2.º A", tip: "Esencia", tipoDesc: "1 dormitorio en suite", sup: 55, precio: 79000, estado: "reservada" },
    { id: "1A", piso: 1, codigo: "1.º A", tip: "Esencia", tipoDesc: "1 dormitorio en suite", sup: 55, precio: 77000, estado: "libre" },
    { id: "6B", piso: 6, codigo: "6.º B", tip: "Cúspide", tipoDesc: "1 dormitorio en suite", sup: 55, precio: 83000, estado: "libre" },
    { id: "5B", piso: 5, codigo: "5.º B", tip: "Cúspide", tipoDesc: "1 dormitorio en suite", sup: 55, precio: 82000, estado: "libre" },
    { id: "4B", piso: 4, codigo: "4.º B", tip: "Cúspide", tipoDesc: "1 dormitorio en suite", sup: 55, precio: 81000, estado: "libre" },
    { id: "3B", piso: 3, codigo: "3.º B", tip: "Cúspide", tipoDesc: "1 dormitorio en suite", sup: 55, precio: 80000, estado: "reservada" },
    { id: "2B", piso: 2, codigo: "2.º B", tip: "Cúspide", tipoDesc: "1 dormitorio en suite", sup: 55, precio: 79000, estado: "libre" },
    { id: "1B", piso: 1, codigo: "1.º B", tip: "Cúspide", tipoDesc: "1 dormitorio en suite", sup: 55, precio: 78000, estado: "libre" },
  ];

  const TIPOS = [
    { n: 1, nombre: "Horizonte", slug: "horizonte", desc: "Monoambiente · 37 m²", pagina: "img/plano-tipologia-1-horizonte.jpg", render: "img/render-tipologia-1.jpg", ambiente: "Kitchenette y estar — render ilustrativo", ubic: "Unidad 6.º A · Torre Norte", areas: "Dormitorio · Kitchenette · Baño", fotoArea: "img/area-dormitorio.jpg" },
    { n: 2, nombre: "Evolución", slug: "evolucion", desc: "Monoambiente con terraza · 42 m²", pagina: "img/plano-tipologia-2-evolucion.jpg", render: "img/render-tipologia-2.jpg", ambiente: "Terraza propia — render ilustrativo", ubic: "Unidad 5.º A · Torre Norte", areas: "Dormitorio · Kitchenette · Baño · Terraza propia", fotoArea: "img/area-terraza.jpg" },
    { n: 3, nombre: "Esencia", slug: "esencia", desc: "1 dormitorio en suite · 55 m²", pagina: "img/plano-tipologia-3-esencia.jpg", render: "img/render-tipologia-3.jpg", ambiente: "Dormitorio en suite — render ilustrativo", ubic: "Unidades 1.º a 4.º A · Torre Norte", areas: "Cocina · Comedor-estar · Dormitorio en suite · 2 balcones", fotoArea: "img/area-suite.jpg" },
    { n: 4, nombre: "Cúspide", slug: "cuspide", desc: "1 dormitorio en suite · 55 m²", pagina: "img/plano-tipologia-4-cuspide.jpg", render: "img/render-tipologia-4.jpg", ambiente: "Estar y comedor — render ilustrativo", ubic: "Unidades 1.º a 6.º B · Torre Sur", areas: "Cocina · Comedor-estar · Dormitorio en suite · 2 balcones", fotoArea: "img/area-estar.jpg" },
  ];

  const COCHERA = 12000;

  // ── Estado ────────────────────────────────────────────────────────────────
  let UN = UNIDADES_RESPALDO.slice();
  const st = {
    sel: "4B", tipoActiva: "Horizonte",
    simU: "4B", simPct: 35, simCuotas: 24, simCochera: false,
    fUnidad: "4B", fMsg: "", fNombre: "", fTel: "", envio: "idle",
    modal: null, consent: "pend",
  };
  const ctx = { campania: CFG.campaniaPorDefecto, origen: "directo", unidadAviso: null };

  // ── Auxiliares ────────────────────────────────────────────────────────────
  const u = (id) => UN.find((x) => x.id === id);
  const torre = (x) => (x.id.endsWith("A") ? "Torre Norte" : "Torre Sur");
  const fmt = (n) => "USD " + n.toLocaleString("es-AR");
  const tipoDe = (x) => TIPOS.find((t) => t.nombre === x.tip) || TIPOS[0];
  const waNum = () => String(CFG.whatsapp).replace(/[^0-9]/g, "");
  /**
   * El número como se lee, no como se marca.
   *
   * El diseño lo mostraba con `'+' + waNum()` — «+5493874153669» de corrido.
   * Un teléfono que no se puede leer de un vistazo no sirve en un cartel ni
   * para dictarlo.
   */
  const waDisplay = () => {
    const n = waNum();
    const m = n.match(/^(\d{2})(9)?(\d{3})(\d{3})(\d{4})$/);
    return m ? `+${m[1]} ${m[2] || ""} ${m[3]} ${m[4]}-${m[5]}`.replace(/\s+/g, " ") : "+" + n;
  };
  const wa = (msg) => "https://wa.me/" + waNum() + "?text=" + encodeURIComponent(msg);
  const base = () => String(CFG.crm).replace(/\/+$/, "");

  const estadoMeta = (e) =>
    e === "libre" ? { label: "Libre", color: "var(--estado-libre)" }
    : e === "reservada" ? { label: "Reservada", color: "var(--estado-reservada)" }
    : { label: "Vendida", color: "var(--gris-claro)" };

  /** Un objeto de estilos a la cadena que espera el atributo `style`. */
  const aEstilo = (o) =>
    Object.entries(o)
      .map(([k, v]) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()) + ":" + v)
      .join(";");

  // ── El CRM ────────────────────────────────────────────────────────────────

  /**
   * La clave del sitio viaja en la cabecera `x-sitio-clave`.
   *
   * OJO, 2026-08-29: el diseño la mandaba adentro del cuerpo del POST y el CRM
   * la lee de la cabecera (`api/publico/consultas/route.ts:75`), así que
   * devolvía 401 y no entraba ni una consulta.
   */
  const cabeceras = () => ({ "Content-Type": "application/json", "x-sitio-clave": CFG.clave });

  function clic(tipo, dato) {
    if (EMBEBIDO) return;
    if (st.consent !== "si" || !CFG.clave) return;
    const cuerpo = JSON.stringify({ tipo, dato: dato ?? null, campania: ctx.campania, origen: ctx.origen, url: location.href });
    // `fetch` con keepalive y no `sendBeacon`: sendBeacon no deja poner
    // cabeceras, y esta ruta del CRM pide la clave en la cabecera. keepalive
    // sobrevive igual a que se cierre la pestaña.
    fetch(base() + "/api/publico/clics", { method: "POST", headers: cabeceras(), body: cuerpo, keepalive: true }).catch(() => {});
  }

  /**
   * Manda la consulta al CRM.
   *
   * OJO CON LOS NOMBRES DE LOS CAMPOS: el esquema de `/api/publico/consultas`
   * es un objeto de Zod, y Zod TIRA en silencio lo que no declara — no da
   * error. La primera versión de acá mandaba `campania`, `origen`,
   * `unidadAviso`, `url`, `unidad` y `origen_formulario`, ninguno de los cuales
   * existe en el esquema: la consulta habría entrado sin unidad y sin campaña,
   * que es justo lo único que hace falta saber. Se manda con los nombres que la
   * ruta declara, y nada más.
   */
  async function postConsulta(datos) {
    const cuerpo = {
      nombre: datos.nombre,
      telefono: datos.telefono,
      interes: datos.unidad ? "Edificio La Torre — unidad " + datos.unidad : "Edificio La Torre",
      mensaje: datos.mensaje || null,
      canal: "PORTAL",
      utm_campaign: ctx.campania || null,
      utm_source: ctx.origen || null,
      paginaConsulta: location.href,
      dispositivo: window.innerWidth < 768 ? "celular" : "escritorio",
      idioma: "es",
    };
    const r = await fetch(base() + "/api/publico/consultas", {
      method: "POST",
      headers: cabeceras(),
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) throw new Error("crm");
  }

  /**
   * Trae las unidades del CRM. Si no contesta, se queda con las de respaldo.
   *
   * El CRM es la fuente: es lo que hace que Francisco prenda y apague una
   * unidad desde el sistema y el sitio lo muestre sin que nadie toque código.
   */
  async function traerUnidades() {
    if (!CFG.clave) return;
    try {
      const r = await fetch(base() + "/api/publico/propiedades?cartera=" + encodeURIComponent(CFG.cartera), { headers: { Accept: "application/json" } });
      if (!r.ok) return;
      const j = await r.json();
      const ps = Array.isArray(j) ? j : j.propiedades || [];
      if (!ps.length) return;
      const mapeadas = ps
        .map((p) => {
          /* El identificador de la unidad es piso + letra: "6A".
             OJO: en el CRM son DOS campos —`piso` es 6 y `unidad` es "A"—, así
             que no alcanza con mirar `unidad`. La primera versión hacía
             `p.unidad || p.codigo` y buscaba el patrón `6A` adentro: como
             `unidad` viene con la letra sola y es un valor verdadero, nunca
             caía al código, el patrón no encontraba nada, TODAS las unidades se
             descartaban y el sitio seguía mostrando el respaldo — con la
             conexión al CRM andando y sin un solo error en consola. */
          const armado = p.piso != null && p.unidad ? String(p.piso) + String(p.unidad) : "";
          const id = (armado || String(p.codigo || "")).toUpperCase().match(/[0-9][AB]/)?.[0];
          if (!id) return null;
          return {
            id,
            piso: p.piso ?? Number(id[0]),
            codigo: id[0] + ".º " + id[1],
            tip: p.tipologia || "",
            tipoDesc: p.tipoDesc || "",
            sup: p.supTotal ?? 0,
            precio: p.precio ?? 0,
            estado: p.estado === "VENDIDA" ? "vendida" : p.estado === "RESERVADA" ? "reservada" : "libre",
          };
        })
        .filter(Boolean);
      if (mapeadas.length) UN = mapeadas.sort((a, b) => b.piso - a.piso || a.id.localeCompare(b.id));
    } catch (e) {
      /* se queda con el respaldo */
    }
  }

  // ── Dibujar ───────────────────────────────────────────────────────────────
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  /** Resuelve "sim.antFmt" contra el modelo. */
  const leer = (obj, ruta) => ruta.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

  function celda(x) {
    const s = st.sel === x.id;
    const b = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", width: "100%", padding: "10px 12px", borderRadius: "4px", cursor: "pointer", transition: "border-color 180ms ease, background 180ms ease", textAlign: "left" };
    if (s) return Object.assign({}, b, { background: "var(--terracota)", border: "1px solid var(--terracota)" });
    const bg = x.estado === "libre" ? "#fff" : x.estado === "reservada" ? "#FAF4E8" : "#F2EFEA";
    return Object.assign({}, b, { background: bg, border: "1px solid rgba(41,33,26,0.16)" });
  }

  function specs(x) {
    const f = [["Superficie total", x.sup + " m²"], ["Distribución", x.tipoDesc]];
    if (x.tip === "Horizonte") f.push(["Cocina", "Kitchenette"], ["Baño", "Completo, con ducha"], ["Orientación", "Norte"]);
    if (x.tip === "Evolución") f.push(["Terraza", "Propia, al frente"], ["Cocina", "Kitchenette"], ["Baño", "Completo, con ducha"]);
    if (x.tip === "Esencia") f.push(["Dormitorio", "En suite, con vestidor"], ["Cocina y lavadero", "Separados del estar"], ["Balcones", "Dos, independientes"]);
    if (x.tip === "Cúspide") f.push(["Dormitorio", "En suite, con vestidor"], ["Cocina y lavadero", "Separados del estar"], ["Balcones", "Dos"]);
    f.push(["Ubicación", torre(x) + " · piso " + x.piso]);
    return f.map((r) => ({ k: r[0], v: r[1] }));
  }

  /** El modelo que consume el HTML. Es el puerto de `renderVals` del diseño. */
  function vista() {
    const cel = (x) => {
      const em = estadoMeta(x.estado);
      const s = st.sel === x.id;
      return {
        id: x.id, codigo: x.codigo, sub: x.tip + " · " + x.sup + " m²", estadoLabel: x.estado === "libre" ? "" : em.label,
        sel: () => {
          st.sel = x.id; st.tipoActiva = x.tip; pintar();
          // En el celular la ficha vive abajo de la lista: sin este scroll,
          // tocar una unidad no muestra ningún cambio en pantalla.
          if (window.matchMedia && matchMedia("(max-width: 900px)").matches) {
            const f = document.getElementById("ficha-unidad");
            if (f) f.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        },
        st: aEstilo(celda(x)),
        stCode: aEstilo({ fontFamily: "var(--serif)", fontSize: "16px", fontWeight: "400", color: s ? "var(--crema)" : x.estado === "vendida" ? "var(--gris-claro)" : "var(--tinta)" }),
        stSub: aEstilo({ fontSize: "12px", color: s ? "rgba(243,234,218,0.86)" : "var(--gris-calido)" }),
        stEstado: aEstilo({ fontSize: "11px", fontWeight: "600", letterSpacing: "0.02em", color: s ? "rgba(243,234,218,0.9)" : em.color }),
        stDot: aEstilo({ width: "8px", height: "8px", borderRadius: "50%", background: s ? "var(--crema)" : em.color, flex: "none" }),
      };
    };

    const selU = u(st.sel) || UN[0];
    const emSel = estadoMeta(selU.estado);
    const tSel = tipoDe(selU);

    const su = u(st.simU) || UN[0];
    const valor = su.precio + (st.simCochera ? COCHERA : 0);
    const ant = Math.round((valor * st.simPct) / 100);
    const saldo = valor - ant;
    const cuota = Math.round(saldo / st.simCuotas);
    const simMsg = "Hola Francisco. Simulé en el sitio de La Torre la unidad " + su.codigo + " (" + su.tip + ")" + (st.simCochera ? " con cochera" : "") + ": valor " + fmt(valor) + ", anticipo del " + st.simPct + " % (" + fmt(ant) + ") y " + st.simCuotas + " cuotas de obra de " + fmt(cuota) + " más ajuste CAC. Quiero avanzar con la consulta.";

    const btnBase = { border: "1px solid rgba(41,33,26,0.24)", borderRadius: "4px", padding: "11px 16px", fontSize: "14px", cursor: "pointer", transition: "background 180ms ease, border-color 180ms ease", background: "#fff", color: "var(--tinta)", fontWeight: "500" };
    const btnOn = Object.assign({}, btnBase, { background: "var(--terracota)", border: "1px solid var(--terracota)", color: "var(--crema-claro)", fontWeight: "600" });

    // Las tipologías dejaron de ser solapas: son TARJETAS de un carrusel
    // horizontal (el patrón de la referencia que trajo David). El estilo vive
    // acá porque data-estilo pinta el style entero; el riel y el snap los pone
    // la clase .riel-tipos en estilos.css.
    const cardBase = { display: "block", flex: "0 0 auto", width: "min(300px, 74vw)", scrollSnapAlign: "start", padding: "0", borderRadius: "6px", overflow: "hidden", cursor: "pointer", textAlign: "left", background: "#fff", border: "1px solid rgba(41,33,26,0.16)", transition: "border-color 200ms ease, box-shadow 200ms ease, transform 200ms ease" };
    const cardOn = Object.assign({}, cardBase, { border: "1px solid var(--terracota)", boxShadow: "0 10px 30px rgba(156,58,32,0.18)", transform: "translateY(-2px)" });
    const tMeta = TIPOS.find((t) => t.nombre === st.tipoActiva) || TIPOS[0];
    const delTipo = UN.filter((x) => x.tip === tMeta.nombre);
    const libres = delTipo.filter((x) => x.estado === "libre");
    const desdeN = (libres.length ? libres : delTipo).reduce((m, x) => Math.min(m, x.precio), Infinity);

    return {
      vigencia: CFG.vigenciaPrecios,
      verPrecios: !!CFG.mostrarPrecios,
      cocheraLinea: CFG.mostrarPrecios
        ? "Se suma a cualquier unidad por USD 12.000 adicionales, sujeta a disponibilidad."
        : "Se suma a cualquier unidad, sujeta a disponibilidad. El valor se conversa al consultar.",
      // Las tipologías como bloques editoriales, una por una, con la foto de
      // su área (las mismas páginas del brochure que siguen a cada tipología).
      tiposFicha: TIPOS.map((t) => ({
        num: "0" + t.n, nombre: t.nombre, desc: t.desc, ubic: t.ubic, areas: t.areas, foto: t.fotoArea,
        verPlano: () => abrirModal(t.pagina, "Tipología " + t.n + " — " + t.nombre),
        verAmbiente: () => abrirModal(t.render, t.nombre + " · " + t.ambiente),
        verUnidades: () => {
          const del = UN.filter((y) => y.tip === t.nombre);
          const x = del.find((y) => y.estado === "libre") || del[0];
          if (x) st.sel = x.id;
          clic("ver_unidades_tipologia", t.slug);
          pintar(); irA("unidades");
        },
      })),
      unidadesNorte: UN.filter((x) => x.id.endsWith("A")).map(cel),
      unidadesSur: UN.filter((x) => x.id.endsWith("B")).map(cel),
      ficha: {
        titulo: selU.codigo + " — " + selU.tip,
        linea: torre(selU) + " · piso " + selU.piso + " · " + selU.tipoDesc,
        estadoLabel: emSel.label,
        stChip: aEstilo({ fontSize: "12px", fontWeight: "600", color: emSel.color, border: "1px solid " + emSel.color, borderRadius: "999px", padding: "5px 14px", whiteSpace: "nowrap" }),
        plano: tSel.pagina,
        specs: specs(selU),
        precioFmt: CFG.mostrarPrecios ? fmt(selU.precio) : "A consultar",
        cta: selU.estado === "libre" ? "Consultar por el " + selU.codigo : "Consultar por disponibilidad",
        verPlano: () => abrirModal(tSel.pagina, "Plano — " + selU.codigo + " · " + selU.tip),
        consultar: () => {
          clic("consultar_unidad", selU.id);
          st.fUnidad = selU.id;
          st.fMsg = "Me interesa la unidad " + selU.codigo + " (" + selU.tip + ", " + selU.sup + " m², " + torre(selU) + ").";
          pintar(); irA("contacto");
        },
        simular: () => { st.simU = selU.id; pintar(); irA("financiacion"); },
      },
      sim: {
        uId: st.simU,
        opciones: UN.map((x) => ({ id: x.id, label: x.codigo + " · " + x.tip + " · " + x.sup + " m²" + (CFG.mostrarPrecios ? " — " + fmt(x.precio) : "") + (x.estado !== "libre" ? " · " + estadoMeta(x.estado).label.toLowerCase() : "") })),
        setU: (e) => { st.simU = e.target.value; pintar(); },
        pct: st.simPct, pctFmt: st.simPct + " %",
        setPct: (e) => { st.simPct = parseInt(e.target.value, 10); pintar(); },
        cuotas: st.simCuotas, cuotasFmt: st.simCuotas + " cuotas",
        setCuotas: (e) => { st.simCuotas = parseInt(e.target.value, 10); pintar(); },
        cochNo: () => { st.simCochera = false; pintar(); },
        cochSi: () => { st.simCochera = true; pintar(); },
        stCochNo: aEstilo(st.simCochera ? btnBase : btnOn),
        stCochSi: aEstilo(st.simCochera ? btnOn : btnBase),
        valorLabel: st.simCochera ? "Valor total, con cochera" : "Valor total de la unidad",
        valorFmt: fmt(valor), antFmt: fmt(ant), saldoFmt: fmt(saldo), cuotaFmt: fmt(cuota),
        wa: wa(simMsg),
        clicWa: () => clic("whatsapp_simulacion", su.id),
        enviar: () => {
          clic("simulacion", su.id);
          st.fUnidad = su.id;
          st.fMsg = "Quiero avanzar con esta simulación: unidad " + su.codigo + " (" + su.tip + ")" + (st.simCochera ? " con cochera" : "") + ", valor " + fmt(valor) + ", anticipo del " + st.simPct + " % (" + fmt(ant) + ") y " + st.simCuotas + " cuotas de obra de " + fmt(cuota) + " más ajuste CAC.";
          pintar(); irA("contacto");
        },
      },
      tipos: TIPOS.map((t) => ({
        num: "0" + t.n, nombre: t.nombre, desc: t.desc, foto: t.render,
        sel: () => { st.tipoActiva = t.nombre; pintar(); },
        st: aEstilo(st.tipoActiva === t.nombre ? cardOn : cardBase),
        stN: aEstilo({ fontFamily: "'Archivo',sans-serif", fontSize: "10.5px", letterSpacing: "0.28em", color: "var(--gris-calido)" }),
      })),
      tipo: {
        pagina: tMeta.pagina, nombre: tMeta.nombre, desc: tMeta.desc, ubic: tMeta.ubic,
        desde: desdeN === Infinity ? "Consultar" : "Desde " + fmt(desdeN),
        verLamina: () => abrirModal(tMeta.pagina, "Tipología " + tMeta.n + " — " + tMeta.nombre),
        verAmbiente: () => abrirModal(tMeta.render, tMeta.nombre + " · " + tMeta.ambiente),
        verUnidades: () => {
          const x = delTipo.find((y) => y.estado === "libre") || delTipo[0];
          if (x) st.sel = x.id;
          clic("ver_unidades_tipologia", tMeta.slug);
          pintar(); irA("unidades");
        },
      },
      form: {
        unidad: st.fUnidad, msg: st.fMsg,
        /* El HTML pide `form.nombre` y `form.setNombre` desde que se transpiló,
           y acá no existían: los campos nunca escribían en el estado y
           `enviarForm` los leía por un id que el marcado tampoco tiene. Con las
           dos cosas juntas el formulario no se podía mandar nunca. */
        nombre: st.fNombre, tel: st.fTel,
        setNombre: (ev) => { st.fNombre = ev.target.value; },
        setTel: (ev) => { st.fTel = ev.target.value; },
        /* El <form> del HTML dice `data-submit="form.enviar"` y acá no había
           ningún `enviar`: el `enviar` de más arriba es el del simulador, que
           es otro objeto. El envío quedaba colgado de un listener puesto sobre
           `#form-consulta`, un id que el marcado tampoco tiene. */
        enviar: () => enviarForm(),
        opciones: UN.map((x) => ({ id: x.id, label: x.codigo + " — " + x.tip + " (" + torre(x) + ")" }))
          .concat([{ id: "cochera", label: "Cochera en planta baja" }, { id: "general", label: "Consulta general por el edificio" }]),
        enviando: st.envio === "enviando",
        btnLabel: st.envio === "enviando" ? "Enviando…" : "Enviar la consulta",
        ok: st.envio === "ok", fallo: st.envio === "fallo",
        waHref: wa("Hola Francisco, te escribo por el Edificio La Torre."),
      },
      modalVisible: !!st.modal,
      modalSrc: st.modal ? st.modal.src : "",
      modalTitulo: st.modal ? st.modal.titulo : "",
      modalCerrar: () => { st.modal = null; pintar(); },
      consentVisible: !EMBEBIDO && st.consent === "pend",
      aceptarMedicion: () => guardarConsent("si"),
      rechazarMedicion: () => guardarConsent("no"),
      waDisplay: waDisplay(),
      clicWaGeneral: () => clic("whatsapp", "contacto"),
      clicWaFlotante: () => clic("whatsapp", "flotante"),
      clicWaPie: () => clic("whatsapp", "pie"),
      // Desde el pie se puede volver a decidir: borra la respuesta guardada y
      // el banner vuelve a aparecer, como en Aires.
      volverAElegirCookies: () => {
        try { localStorage.removeItem("latorre_consent"); } catch (e) {}
        st.consent = "pend"; pintar();
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      },
    };
  }

  // ── El pintor ─────────────────────────────────────────────────────────────
  // Ya no vive acá: lo emite el transpilador en `src/pintor.js`, junto con los
  // atributos que escribe en el HTML. Los dos sitios de Molins usan el mismo,
  // así que el que pone las marcas y el que las lee no pueden desincronizarse.
  //
  // Se cambió el 2026-08-29, cuando el transpilador dejó de envolver las listas
  // en un <div> y pasó a anclar en la propia plantilla. El pintor de acá
  // esperaba el envase viejo y con el HTML nuevo no dibujaba nada.
  function pintar() {
    window.Pintor.pintar(vista());
  }

  // ── Acciones sueltas ──────────────────────────────────────────────────────
  function abrirModal(src, titulo) { st.modal = { src, titulo }; pintar(); }

  function irA(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 88;
    const rm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: y, behavior: rm ? "auto" : "smooth" });
  }

  function guardarConsent(v) {
    st.consent = v;
    try { localStorage.setItem("latorre_consent", v); } catch (e) {}
    if (v === "si") clic("visita");
    pintar();
  }

  async function enviarForm() {
    if (st.envio === "enviando") return;
    const nombre = st.fNombre || "";
    const tel = st.fTel || "";
    if (nombre.trim().length < 2 || tel.trim().length < 6) return;
    st.envio = "enviando"; pintar();
    try {
      await postConsulta({ nombre: nombre.trim(), telefono: tel.trim(), unidad: st.fUnidad, mensaje: st.fMsg, origen_formulario: "sitio-la-torre" });
      st.envio = "ok";
    } catch (e) {
      st.envio = "fallo";
    }
    pintar();
  }

  // ── Arranque ──────────────────────────────────────────────────────────────
  function leerURL() {
    try {
      const p = new URLSearchParams(location.search);
      ctx.campania = p.get("utm_campaign") || p.get("c") || CFG.campaniaPorDefecto;
      ctx.origen = p.get("utm_source") || p.get("o") || "directo";
      const q = (p.get("u") || p.get("unidad") || "").toUpperCase().replace(/[^0-9AB]/g, "");
      if (q && u(q)) { ctx.unidadAviso = q; st.sel = q; st.simU = q; st.fUnidad = q; st.tipoActiva = u(q).tip; }
      const tq = (p.get("tipologia") || "").toLowerCase();
      if (tq) {
        const t = TIPOS.find((x) => x.slug === tq);
        if (t) {
          const un = UN.find((x) => x.tip === t.nombre && x.estado === "libre") || UN.find((x) => x.tip === t.nombre);
          if (un) { ctx.unidadAviso = ctx.unidadAviso || un.id; st.sel = un.id; st.simU = un.id; st.fUnidad = un.id; st.tipoActiva = t.nombre; }
        }
      }
    } catch (e) {}
    try {
      const c = localStorage.getItem("latorre_consent");
      if (c === "si" || c === "no") { st.consent = c; if (c === "si") clic("visita"); }
    } catch (e) {}
  }

  function reveals() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver((es) => {
      es.forEach((en) => { if (en.isIntersecting) { en.target.style.opacity = "1"; en.target.style.transform = "none"; io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    $$("[data-reveal]").forEach((el, i) => {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
      el.style.opacity = "0";
      el.style.transform = "translateY(14px)";
      el.style.transition = "opacity 240ms ease " + ((i % 3) * 60) + "ms, transform 240ms ease " + ((i % 3) * 60) + "ms";
      io.observe(el);
    });
  }

  async function arrancar() {
    leerURL();
    pintar();          // con el respaldo, para que se vea enseguida
    await traerUnidades();
    leerURL();         // el deep-link puede apuntar a una unidad que sólo el CRM conoce
    pintar();
    reveals();
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && st.modal) { st.modal = null; pintar(); } });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
