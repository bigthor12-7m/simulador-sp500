// Simulador S&P 500 · base: formato, datos, estado, supuestos generales, navegación y buscador.
window.APP = (function () {
  const A = {};
  const ESC = ['pes', 'base', 'opt'];
  const NOM_ESC = { pes: 'Pesimista', base: 'Base', opt: 'Optimista' };
  A.ESC = ESC; A.NOM_ESC = NOM_ESC;
  const $ = (s, r) => (r || document).querySelector(s);
  A.$ = $;

  // ---------------------------------------------------------------- formato
  const nfCache = {};
  const nf = (d) => nfCache[d] || (nfCache[d] = new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' }));
  const num = (x, d = 0, signo = false) => {
    if (x == null || !isFinite(x)) return '—';
    const s = nf(d).format(Math.abs(x));
    return (x < 0 && Number(s.replace(/\./g, '').replace(',', '.')) !== 0 ? '−' : signo && x > 0 ? '+' : '') + s;
  };
  A.num = num;
  A.pct = (x, d = 1, signo = false) => (x == null || !isFinite(x) ? '—' : num(x * 100, d, signo) + ' %');
  A.pp = (x, d = 1) => (x == null || !isFinite(x) ? '—' : num(x * 100, d, true) + ' pp');
  A.usd = (x, d = 0) => (x == null || !isFinite(x) ? '—' : num(x, d) + ' $');
  A.veces = (x, d = 1) => (x == null || !isFinite(x) ? '—' : num(x, d) + 'x');
  // importes en millones de dólares -> texto legible
  A.mill = (x) => {
    if (x == null || !isFinite(x)) return '—';
    const a = Math.abs(x);
    if (a >= 1e6) return num(x / 1e6, 2) + ' billones $';
    if (a >= 1e3) return num(x / 1e3, a >= 1e5 ? 0 : 1) + ' mil M$';
    return num(x, 0) + ' M$';
  };
  A.fecha = (s) => { if (!s) return '—'; const [a, m, d] = String(s).slice(0, 10).split('-'); return `${Number(d)}/${Number(m)}/${a}`; };
  A.clsPot = (x) => (x >= 0 ? 'sv-pos' : 'sv-neg');
  A.sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  A.slug = (s) => encodeURIComponent(s);

  // h('div', {class: 'x', onclick: fn}, 'texto', otroNodo)
  A.h = function h(tag, attrs, ...hijos) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const c of hijos.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  };
  A.potSpan = (x, d = 0) => A.h('span', { class: x == null ? '' : A.clsPot(x) }, x == null ? 'n.s.' : A.pct(x, d, true));

  // ---------------------------------------------------------------- datos
  A.D = null;
  const FICHEROS = ['empresas', 'parametros', 'estado', 'historico'];
  async function json(nombre, opcional) {
    try {
      const r = await fetch(`datos/${nombre}.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { if (opcional) return null; throw e; }
  }
  A.json = json;
  const preparar = (e) => {
    const o = Object.assign({}, e);
    if (!o.modelo) o.modelo = 'fcff';
    if (o.valorada && o.modelo === 'fcff' && !o.trays) o.trays = MOTOR.trayectorias(o.tr);
    o.busca = A.sinAcentos(`${o.ticker} ${o.nombre} ${o.empresa}`);
    return o;
  };
  A.cargar = async function () {
    const [emp, par, est, hist] = await Promise.all(FICHEROS.map((f, i) => json(f, i >= 2)));
    const empresas = emp.map(preparar);
    // las 7 Magníficas: versión automática y versión revisada en el Simulador 7M (por defecto, la revisada)
    const auto = {}, rev = {};
    for (const e of empresas) if (e.valorada && e.revisada && e.modelo === 'fcff') { auto[e.ticker] = e; rev[e.ticker] = preparar(CRIT.aplicarRevisada(e)); }
    const p = Array.isArray(par) ? par[0] : par;
    A.D = { emp: empresas, porT: {}, pa: p, estado: est || {}, hist: hist || { fechas: [], series: {} }, desc: null, auto, rev };
    A.DEF = defectos(p);
    A.S = { par: copia(A.DEF), aj: {}, cmp: [], op: null, rev: leer('sp-rev', true) !== false, seg: leer('sp-seg', []) };
    montarEmpresas();
    A.S.cmp = leerCmp().filter((t) => A.D.porT[t]);
    A.S.seg = (Array.isArray(A.S.seg) ? A.S.seg : []).filter((t) => A.D.porT[t]);
    restaurarSupuestos();
  };
  // coloca en la lista la versión de cada una de las 7 que toca y rehace los índices
  function montarEmpresas() {
    const D = A.D;
    D.emp = D.emp.map((e) => (D.rev[e.ticker] ? (A.S.rev ? D.rev[e.ticker] : D.auto[e.ticker]) : e));
    D.porT = Object.fromEntries(D.emp.map((e) => [e.ticker, e]));
    const jer = {};
    for (const e of D.emp) {
      const s = (jer[e.sector] = jer[e.sector] || {});
      (s[e.industria] = s[e.industria] || []).push(e);
    }
    D.jer = jer;
  }
  A.usarRevisadas = function (on) {
    A.S.rev = !!on; escribir('sp-rev', A.S.rev);
    for (const t of Object.keys(A.D.rev)) delete A.S.aj[t];   // la beta por defecto cambia con la versión
    montarEmpresas(); cacheDef = null; A.cambio();
  };
  A.descripciones = async function () {
    if (!A.D.desc) A.D.desc = (await json('descripciones', true)) || {};
    return A.D.desc;
  };

  function defectos(p) {
    return { rf: Number(p.tipo_sin_riesgo), erp: Number(p.prima_riesgo_mercado), spread: Number(p.diferencial_deuda), g: Number(p.crecimiento_perpetuo), dwacc: 0,
      prob: { pes: Number(p.prob_pesimista), base: Number(p.prob_base), opt: Number(p.prob_optimista) }, pesoDcf: Number(p.peso_dcf), roicTope: Number(p.roic_tope),
      fr: { pes: Number(p.convergencia_roic_pesimista), base: Number(p.convergencia_roic_base), opt: Number(p.convergencia_roic_optimista) }, metodoVt: 'inductores' };
  }
  const copia = (o) => JSON.parse(JSON.stringify(o));
  A.copia = copia;
  function leer(k, def) { try { const x = localStorage.getItem(k); return x == null ? def : JSON.parse(x); } catch (e) { return def; } }
  function escribir(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  A.leer = leer; A.escribir = escribir;

  // ---------------------------------------------------------------- supuestos guardados en este navegador
  // Solo se guarda lo que difiere de los valores por defecto, para que lo demás siga a los datos de cada semana.
  const CAMPOS_PAR = ['rf', 'erp', 'g', 'dwacc', 'pesoDcf', 'metodoVt', 'prob'];
  const CAMPOS_AJ = ['beta', 'dg', 'dm', 'invModo', 'ronic', 'lag'];
  function instantanea() {
    const par = {}, aj = {};
    for (const k of CAMPOS_PAR) if (JSON.stringify(A.S.par[k]) !== JSON.stringify(A.DEF[k])) par[k] = copia(A.S.par[k]);
    for (const [t, a] of Object.entries(A.S.aj)) {
      const e = A.D.porT[t]; if (!e || !A.ajCambiado(t)) continue;
      const d = A.ajDef(e), o = {};
      for (const k of CAMPOS_AJ) if (a[k] !== d[k]) o[k] = a[k];
      if (Object.keys(o).length) aj[t] = o;
    }
    return { par, aj };
  }
  function aplicarInstantanea(x) {
    A.S.par = copia(A.DEF);
    for (const k of CAMPOS_PAR) if (x && x.par && x.par[k] !== undefined) A.S.par[k] = copia(x.par[k]);
    A.S.aj = {};
    for (const [t, o] of Object.entries((x && x.aj) || {})) { const e = A.D.porT[t]; if (e && e.valorada) A.S.aj[t] = Object.assign(A.ajDef(e), o); }
  }
  function restaurarSupuestos() { const x = leer('sp-sup', null); if (x) aplicarInstantanea(x); }
  const guardarSupuestos = () => escribir('sp-sup', instantanea());
  A.escenarios = () => { const l = leer('sp-esc', []); return Array.isArray(l) ? l : []; };
  A.guardarEscenario = function (nombre) {
    nombre = String(nombre || '').trim().slice(0, 40);
    if (!nombre) return false;
    const l = A.escenarios().filter((x) => x.n !== nombre);
    l.push(Object.assign({ n: nombre, fecha: new Date().toISOString().slice(0, 10) }, instantanea()));
    escribir('sp-esc', l.slice(-12)); return true;
  };
  A.cargarEscenario = function (nombre) { const x = A.escenarios().find((s) => s.n === nombre); if (x) { aplicarInstantanea(x); A.cambio(); } };
  A.borrarEscenario = function (nombre) { escribir('sp-esc', A.escenarios().filter((s) => s.n !== nombre)); };
  A.resumenEscenario = function (x) {
    const p = x.par || {}, partes = [];
    if (p.rf != null) partes.push(`rf ${A.pct(p.rf, 2)}`);
    if (p.erp != null) partes.push(`prima ${A.pct(p.erp, 2)}`);
    if (p.g != null) partes.push(`g ${A.pct(p.g, 2)}`);
    if (p.dwacc) partes.push(`WACC ${A.pp(p.dwacc, 2)}`);
    if (p.pesoDcf != null) partes.push(`${A.pct(p.pesoDcf, 0)} modelo`);
    if (p.prob) partes.push(`prob. ${A.pct(p.prob.pes, 0)}/${A.pct(p.prob.base, 0)}/${A.pct(p.prob.opt, 0)}`);
    if (p.metodoVt) partes.push(p.metodoVt === 'gordon' ? 'VT Gordon' : 'VT inductores');
    const n = Object.keys(x.aj || {}).length;
    if (n) partes.push(`${n} ${n === 1 ? 'empresa ajustada' : 'empresas ajustadas'}`);
    return partes.join(' · ') || 'supuestos por defecto';
  };

  // ---------------------------------------------------------------- empresas que sigo
  A.siguiendo = (t) => A.S.seg.includes(t);
  A.alternarSeg = function (t) {
    const i = A.S.seg.indexOf(t);
    if (i >= 0) A.S.seg.splice(i, 1); else A.S.seg.push(t);
    escribir('sp-seg', A.S.seg); return A.siguiendo(t);
  };
  A.botonSeg = function (t) {
    const b = A.h('button', { type: 'button', class: 'sv-btn ap-seg-b' });
    const sync = () => { const on = A.siguiendo(t); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '★ Siguiendo' : '☆ Seguir'; b.title = on ? 'Quitar de las empresas que sigues' : 'Añadir a las empresas que sigues (página Seguimiento)'; };
    b.addEventListener('click', (ev) => { ev.stopPropagation(); A.alternarSeg(t); sync(); });
    sync();
    return b;
  };
  A.ajDef = (e) => ({ beta: e.beta, dg: 0, dm: 0, invModo: 'consenso', ronic: null, lag: 1 });
  A.aj = (t) => A.S.aj[t] || A.ajDef(A.D.porT[t]);
  A.ajCambiado = (t) => { const a = A.S.aj[t], e = A.D.porT[t]; return !!a && (a.dg || a.dm || a.beta !== e.beta || a.invModo === 'explicito'); };
  A.parCambiado = () => JSON.stringify(A.S.par) !== JSON.stringify(A.DEF);

  // ---------------------------------------------------------------- cálculo (con caché por versión de supuestos)
  let version = 0, cacheV = -1, cache = null, cacheDef = null;
  A.tocar = () => { version++; };
  A.valor = function (t) { return A.valores()[t]; };
  A.valores = function () {
    if (cacheV === version && cache) return cache;
    const out = {};
    for (const e of A.D.emp) if (e.valorada) out[e.ticker] = MOTOR.valorar(e, e.trays, e.mu, A.S.par, A.aj(e.ticker));
    cache = out; cacheV = version;
    return out;
  };
  A.valoresDef = function () {
    if (cacheDef) return cacheDef;
    const out = {};
    for (const e of A.D.emp) if (e.valorada) out[e.ticker] = MOTOR.valorar(e, e.trays, e.mu, A.DEF, A.ajDef(e));
    return (cacheDef = out);
  };
  A.AVISOS = CRIT.AVISOS;

  // ---------------------------------------------------------------- comparador
  function leerCmp() { try { return JSON.parse(localStorage.getItem('sp-cmp') || '[]'); } catch (e) { return []; } }
  function guardarCmp() { try { localStorage.setItem('sp-cmp', JSON.stringify(A.S.cmp)); } catch (e) {} }
  A.MAX_CMP = 5;
  A.enCmp = (t) => A.S.cmp.includes(t);
  A.alternarCmp = function (t) {
    const c = A.S.cmp, i = c.indexOf(t);
    if (i >= 0) c.splice(i, 1);
    else { if (c.length >= A.MAX_CMP) c.shift(); c.push(t); }
    guardarCmp(); A.pintarNav(); return A.enCmp(t);
  };
  A.botonCmp = function (t) {
    const b = A.h('button', { type: 'button', class: 'sv-btn ap-cmp-b' });
    const sync = () => { const on = A.enCmp(t); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '✓ En el comparador' : '+ Comparar'; };
    b.addEventListener('click', (ev) => { ev.stopPropagation(); A.alternarCmp(t); sync(); });
    sync();
    return b;
  };

  // ---------------------------------------------------------------- supuestos generales
  const CTRL = [
    { id: 'rf', get: () => A.S.par.rf, set: (x) => (A.S.par.rf = x), fmt: (x) => A.pct(x, 2), def: () => A.DEF.rf },
    { id: 'erp', get: () => A.S.par.erp, set: (x) => (A.S.par.erp = x), fmt: (x) => A.pct(x, 2), def: () => A.DEF.erp },
    { id: 'dw', get: () => A.S.par.dwacc, set: (x) => (A.S.par.dwacc = x), fmt: (x) => A.pp(x, 2), def: () => 0 },
    { id: 'g', get: () => A.S.par.g, set: (x) => (A.S.par.g = x), fmt: (x) => A.pct(x, 2), def: () => A.DEF.g },
    { id: 'pd', get: () => A.S.par.pesoDcf, set: (x) => (A.S.par.pesoDcf = x), fmt: (x) => `${A.pct(x, 0)} modelo · ${A.pct(1 - x, 0)} múltiplos`, def: () => A.DEF.pesoDcf },
  ];
  function probs(cual, x) {
    const p = A.S.par.prob;
    if (cual === 'pes') p.pes = x; else p.opt = x;
    if (p.pes + p.opt > 1) { if (cual === 'pes') p.opt = Math.round((1 - p.pes) * 100) / 100; else p.pes = Math.round((1 - p.opt) * 100) / 100; }
    p.base = Math.round((1 - p.pes - p.opt) * 100) / 100;
  }
  const PRESETS = [
    ['Tipos −1 pp', (p) => { p.rf = A.DEF.rf - 0.01; }],
    ['Tipos +1 pp', (p) => { p.rf = A.DEF.rf + 0.01; }],
    ['Prima de riesgo +1 pp', (p) => { p.erp = A.DEF.erp + 0.01; }],
    ['g del 2 %', (p) => { p.g = 0.02; }],
    ['Más peso al pesimista (50/40/10)', (p) => { p.prob = { pes: 0.5, base: 0.4, opt: 0.1 }; }],
    ['Solo modelo intrínseco', (p) => { p.pesoDcf = 1; }],
    ['Solo múltiplos', (p) => { p.pesoDcf = 0; }],
    ['Valor terminal de Gordon', (p) => { p.metodoVt = 'gordon'; }],
  ];
  A.cambio = function () { A.tocar(); guardarSupuestos(); A.programar(); };
  A.montarControles = function () {
    for (const c of CTRL) {
      const el = $('#sv-' + c.id);
      el.addEventListener('input', () => { c.set(Number(el.value)); A.cambio(); });
      el.style.accentColor = 'var(--s1)';
    }
    for (const id of ['pp', 'po']) $('#sv-' + id).style.accentColor = 'var(--s1)';
    $('#sv-pp').addEventListener('input', (ev) => { probs('pes', Number(ev.target.value)); A.cambio(); });
    $('#sv-po').addEventListener('input', (ev) => { probs('opt', Number(ev.target.value)); A.cambio(); });
    for (const b of document.querySelectorAll('#sv-vt button')) b.addEventListener('click', () => { A.S.par.metodoVt = b.dataset.vt; A.cambio(); });
    const pr = $('#sv-presets');
    PRESETS.forEach(([lab, fn]) => {
      const b = A.h('button', { type: 'button', class: 'sv-chip' }, lab);
      b.addEventListener('click', () => { const p = copia(A.DEF); fn(p); A.S.par = p; A.cambio(); });
      pr.appendChild(b);
    });
    $('#sv-reset').addEventListener('click', () => { A.S.par = copia(A.DEF); A.S.aj = {}; A.cambio(); });
    const rv = $('#sv-rev');
    if (rv) rv.addEventListener('change', () => A.usarRevisadas(rv.checked));
    const fg = $('#sv-esc-f');
    if (fg) fg.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const inp = $('#sv-esc-n');
      if (A.guardarEscenario(inp.value)) { inp.value = ''; pintarEscenarios(); }
    });
  };
  function pintarEscenarios() {
    const cont = $('#sv-esc-l'); if (!cont) return;
    const l = A.escenarios();
    cont.replaceChildren(...(l.length ? l.map((x) => {
      const b = A.h('button', { type: 'button', class: 'sv-chip', title: A.resumenEscenario(x) }, x.n);
      b.addEventListener('click', () => A.cargarEscenario(x.n));
      const del = A.h('button', { type: 'button', class: 'ap-esc-x', 'aria-label': `Borrar el escenario ${x.n}` }, '✕');
      del.addEventListener('click', () => { A.borrarEscenario(x.n); pintarEscenarios(); });
      return A.h('span', { class: 'ap-escn' }, b, del);
    }) : [A.h('span', { class: 'sv-ctrl-d' }, 'Todavía no has guardado ninguno. Se guardan en este navegador.')]));
  }
  A.sincronizarControles = function () {
    for (const c of CTRL) {
      const el = $('#sv-' + c.id);
      if (document.activeElement !== el) el.value = c.get();
      $('#sv-' + c.id + '-v').textContent = c.fmt(c.get());
      const d = $('#sv-' + c.id + '-d'); if (d) d.textContent = 'Por defecto: ' + c.fmt(c.def());
    }
    const p = A.S.par.prob;
    $('#sv-pp').value = p.pes; $('#sv-po').value = p.opt;
    $('#sv-pp-v').textContent = A.pct(p.pes, 0); $('#sv-po-v').textContent = A.pct(p.opt, 0);
    $('#sv-prob-d').textContent = `Base: ${A.pct(p.base, 0)} · por defecto: ${A.pct(A.DEF.prob.pes, 0)} / ${A.pct(A.DEF.prob.base, 0)} / ${A.pct(A.DEF.prob.opt, 0)}`;
    for (const b of document.querySelectorAll('#sv-vt button')) b.setAttribute('aria-pressed', String(b.dataset.vt === A.S.par.metodoVt));
    $('#sv-vt-d').textContent = 'Por defecto: inductores (ROIC)';
    const q = A.S.par;
    $('#ap-sup-r').textContent = `rf ${A.pct(q.rf, 2)} · ERP ${A.pct(q.erp, 2)} · g ${A.pct(q.g, 2)} · ${A.pct(q.pesoDcf, 0)} modelo`;
    const rv = $('#sv-rev');
    if (rv) { rv.checked = A.S.rev; rv.closest('.sv-grp').hidden = !Object.keys(A.D.rev).length; }
    pintarEscenarios();
  };

  // ---------------------------------------------------------------- navegación
  A.vistas = {};
  let pendiente = false, ultimaRuta = '';
  A.ruta = function () {
    const partes = (location.hash || '#/mercado').replace(/^#\/?/, '').split('/').map((x) => decodeURIComponent(x));
    return { vista: partes[0] || 'mercado', args: partes.slice(1) };
  };
  A.ir = (hash) => { if (location.hash === hash) A.programar(); else location.hash = hash; };
  A.enlace = (hash, txt, cls) => A.h('a', { href: hash, class: cls }, txt);
  A.programar = function () {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => { pendiente = false; A.pintar(); });
  };
  A.pintar = function () {
    if (!A.D) return;
    A.sincronizarControles();
    const r = A.ruta(), clave = location.hash;
    const vista = A.vistas[r.vista] || A.vistas.mercado;
    const main = $('#vista');
    const nueva = clave !== ultimaRuta;
    const scroll = nueva ? 0 : window.scrollY;
    // conservar el foco de un control dentro de la vista (p. ej. un deslizador de la empresa)
    const foco = document.activeElement && main.contains(document.activeElement) && document.activeElement.id ? document.activeElement.id : null;
    main.replaceChildren();
    try { vista(main, r.args); } catch (err) { console.error(err); main.append(A.h('p', { class: 'sv-warn' }, 'No se ha podido mostrar esta página.')); }
    A.pintarNav(r.vista);
    if (foco) { const f = document.getElementById(foco); if (f) f.focus({ preventScroll: true }); }
    if (nueva) { window.scrollTo(0, 0); ultimaRuta = clave; } else window.scrollTo(0, scroll);
  };
  A.pintarNav = function (vista) {
    vista = vista || A.ruta().vista;
    const sec = ['sector', 'industria', 'empresa', 'informe'].includes(vista) ? 'mercado' : vista === 'glosario' ? 'metodo' : vista === 'importar' ? 'seguimiento' : vista;
    for (const a of document.querySelectorAll('.ap-nav a')) a.setAttribute('aria-current', a.dataset.sec === sec ? 'page' : 'false');
    const n = $('#ap-cmp-n'); n.hidden = !A.S.cmp.length; n.textContent = A.S.cmp.length;
    const al = $('#ap-al-n');
    if (al && A.alertasCumplidas) { const k = A.alertasCumplidas().length; al.hidden = !k; al.textContent = k; al.title = `${k} ${k === 1 ? 'alerta se cumple' : 'alertas se cumplen'}`; }
  };
  // migas: [['Mercado', '#/mercado'], ['Tecnología', '#/sector/..'], ['Apple']]
  A.migas = (items) => A.h('nav', { class: 'ap-migas', 'aria-label': 'Ruta' },
    items.map(([t, href], i) => [i ? A.h('span', { class: 'ap-migas-s', 'aria-hidden': 'true' }, '›') : null, href ? A.h('a', { href }, t) : A.h('span', { 'aria-current': 'page' }, t)]));

  // ---------------------------------------------------------------- buscador
  A.montarBuscador = function () {
    const inp = $('#ap-bus'), lista = $('#ap-bus-lista');
    let res = [], act = -1;
    const cerrar = () => { lista.hidden = true; inp.setAttribute('aria-expanded', 'false'); act = -1; };
    const buscar = (q) => {
      q = A.sinAcentos(q.trim());
      if (!q) return [];
      const exacto = [], pref = [], resto = [];
      for (const e of A.D.emp) {
        const t = e.ticker.toLowerCase();
        if (t === q) exacto.push(e);
        else if (t.startsWith(q) || A.sinAcentos(e.nombre).startsWith(q)) pref.push(e);
        else if (e.busca.includes(q)) resto.push(e);
      }
      const orden = (a, b) => (b.cap || 0) - (a.cap || 0);
      return exacto.concat(pref.sort(orden), resto.sort(orden)).slice(0, 8);
    };
    const pintarLista = () => {
      lista.replaceChildren();
      res.forEach((e, i) => {
        const v = e.valorada ? A.valoresDef()[e.ticker] : null;
        const li = A.h('li', { role: 'option', id: 'ap-bus-o' + i, 'aria-selected': String(i === act), class: 'ap-bus-o' },
          A.h('span', { class: 'ap-bus-t' }, e.ticker), A.h('span', { class: 'ap-bus-n' }, e.nombre),
          A.h('span', { class: 'ap-bus-s' }, e.sector));
        li.addEventListener('mousedown', (ev) => { ev.preventDefault(); elegir(e); });
        lista.appendChild(li);
      });
      if (!res.length && inp.value.trim()) lista.appendChild(A.h('li', { class: 'ap-bus-vacio' }, 'Ninguna empresa del S&P 500 coincide.'));
      lista.hidden = !inp.value.trim();
      inp.setAttribute('aria-expanded', String(!lista.hidden));
      inp.setAttribute('aria-activedescendant', act >= 0 ? 'ap-bus-o' + act : '');
    };
    const elegir = (e) => { inp.value = ''; cerrar(); inp.blur(); A.ir('#/empresa/' + e.ticker); };
    inp.addEventListener('input', () => { res = buscar(inp.value); act = res.length ? 0 : -1; pintarLista(); });
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown') { act = Math.min(res.length - 1, act + 1); pintarLista(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { act = Math.max(0, act - 1); pintarLista(); ev.preventDefault(); }
      else if (ev.key === 'Enter') { if (res[act]) elegir(res[act]); ev.preventDefault(); }
      else if (ev.key === 'Escape') { inp.value = ''; cerrar(); }
    });
    inp.addEventListener('blur', () => setTimeout(cerrar, 120));
    inp.addEventListener('focus', () => { if (inp.value.trim()) { res = buscar(inp.value); pintarLista(); } });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { ev.preventDefault(); inp.focus(); }
    });
  };

  // ---------------------------------------------------------------- estado de la actualización
  A.pintarEstado = function () {
    const est = A.D.estado || {};
    const f = est.fecha_mercado || A.D.pa.fecha_cotizacion;
    const dias = f ? Math.floor((Date.now() - new Date(f + 'T00:00:00Z').getTime()) / 864e5) : null;
    $('#ap-datos').textContent = `Datos del ${A.fecha(f)}` + (dias != null && dias > 9 ? ` · hace ${dias} días` : '');
    return { dias, fecha: f };
  };

  // tabla ordenable: cols = [{t: 'Título', v: (fila) => valor, f: (fila) => texto|nodo, cls, num: true}]
  A.tabla = function (cols, filas, opts = {}) {
    let orden = opts.orden || null, desc = opts.desc != null ? opts.desc : true;
    const tb = A.h('tbody');
    const ths = cols.map((c, i) => {
      const th = A.h('th', { scope: 'col', class: [c.cls, c.texto ? 'ap-txt' : null].filter(Boolean).join(' ') || null, title: c.ayuda || null });
      if (c.v) {
        const b = A.h('button', { type: 'button', class: 'ap-th-b' }, c.t);
        b.addEventListener('click', () => { if (orden === i) desc = !desc; else { orden = i; desc = c.texto ? false : true; } pintarCuerpo(); });
        th.append(b);
      } else th.append(c.t);
      return th;
    });
    const tabla = A.h('table', { class: 'sv-table' + (opts.clase ? ' ' + opts.clase : '') }, A.h('thead', null, A.h('tr', null, ths)), tb);
    function pintarCuerpo() {
      let fs = filas.slice();
      if (orden != null) {
        const vf = cols[orden].v;
        fs.sort((a, b) => {
          const x = vf(a), y = vf(b);
          if (x == null || (typeof x === 'number' && !isFinite(x))) return 1;
          if (y == null || (typeof y === 'number' && !isFinite(y))) return -1;
          return (typeof x === 'string' ? x.localeCompare(y, 'es') : x - y) * (desc ? -1 : 1);
        });
      }
      ths.forEach((th, i) => th.setAttribute('aria-sort', i === orden ? (desc ? 'descending' : 'ascending') : 'none'));
      tb.replaceChildren();
      const max = opts.max || Infinity;
      fs.slice(0, max).forEach((f) => {
        const tr = A.h('tr', opts.clic ? { tabindex: '0' } : null);
        for (const c of cols) {
          const x = c.f ? c.f(f) : c.v(f);
          tr.append(A.h('td', { class: [c.cls, c.texto ? 'ap-txt' : null].filter(Boolean).join(' ') || null }, x instanceof Node ? x : x == null ? '—' : String(x)));
        }
        if (opts.clic) {
          tr.addEventListener('click', () => opts.clic(f));
          tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') opts.clic(f); });
        }
        tb.append(tr);
      });
      if (opts.alPintar) opts.alPintar(fs);
    }
    pintarCuerpo();
    return A.h('div', { class: 'sv-tw' }, tabla);
  };

  A.tarjeta = (titulo, nota, ...cont) => A.h('section', { class: 'sv-card' }, titulo ? A.h('h2', { class: 'sv-card-t' }, titulo) : null, nota ? A.h('p', { class: 'sv-card-n' }, nota) : null, cont);
  A.kpi = (lab, valor, ref, cls) => A.h('div', { class: 'sv-card sv-kpi' }, A.h('p', { class: 'sv-kpi-l' }, lab), A.h('p', { class: 'sv-num' + (cls ? ' ' + cls : '') }, valor), ref ? A.h('p', { class: 'sv-kpi-r' }, ref) : null);
  A.mediana = (a) => { const b = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); if (!b.length) return null; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

  return A;
})();
