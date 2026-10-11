// Simulador S&P 500 · tus datos: cartera, notas y alertas por empresa, agenda de resultados y paso de los datos entre
// dispositivos. Todo se guarda en este navegador (localStorage); nada se envía a ningún servidor.
(function (A) {
  const { h, num, pct, usd, mill, fecha, G } = A;
  const REPO = 'https://github.com/bigthor12-7m/simulador-sp500';

  // ---------------------------------------------------------------- almacenamiento
  const P = (A.P = { cartera: [], notas: {} });
  function cargarP() {
    const c = A.leer('sp-cartera', []), n = A.leer('sp-notas', {});
    P.cartera = Array.isArray(c) ? c.filter((x) => x && x.t && x.n > 0) : [];
    P.notas = n && typeof n === 'object' ? n : {};
  }
  cargarP();
  const guardarCartera = () => A.escribir('sp-cartera', P.cartera);
  const guardarNotas = () => A.escribir('sp-notas', P.notas);
  const hoy = () => new Date().toISOString().slice(0, 10);
  A.nota = (t) => P.notas[t] || {};
  A.ponerNota = function (t, cambios) {
    const n = Object.assign({}, P.notas[t] || {}, cambios, { fecha: hoy() });
    const vacia = !n.tesis && n.compra == null && n.venta == null && n.margen == null;
    if (vacia) delete P.notas[t]; else P.notas[t] = n;
    guardarNotas();
  };
  A.agregarCompra = function (t, n, p, f) {
    P.cartera.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t, n: Number(n), p: Number(p), f: f || hoy() });
    guardarCartera();
  };
  A.borrarCompra = (id) => { P.cartera = P.cartera.filter((x) => x.id !== id); guardarCartera(); };

  // posiciones agregadas por empresa
  A.posiciones = function () {
    const m = {};
    for (const l of P.cartera) {
      const e = A.D.porT[l.t]; if (!e) continue;
      const x = (m[l.t] = m[l.t] || { t: l.t, e, acciones: 0, coste: 0, lotes: [] });
      x.acciones += l.n; x.coste += l.n * l.p; x.lotes.push(l);
    }
    const Vs = A.valores();
    const out = Object.values(m).map((x) => {
      const v = Vs[x.t], valor = x.acciones * x.e.cotizacion;
      const ok = A.fiable(x.e, v);
      const dpa = (x.e.dividendo || {}).dpa || 0;
      return Object.assign(x, { v, ok, valor, medio: x.coste / x.acciones, gan: valor - x.coste, ganPct: x.coste ? valor / x.coste - 1 : null,
        pot: ok ? v.pot : null, ms: ok ? A.margenSeg(v.central, x.e.cotizacion) : null, div: dpa * x.acciones });
    });
    const total = out.reduce((s, x) => s + x.valor, 0);
    out.forEach((x) => { x.peso = total ? x.valor / total : 0; });
    return out.sort((a, b) => b.valor - a.valor);
  };
  A.enCartera = (t) => P.cartera.some((x) => x.t === t);

  // ---------------------------------------------------------------- alertas propias (con los supuestos actuales)
  A.alertasDe = function (t) {
    const n = P.notas[t], e = A.D.porT[t];
    if (!n || !e) return [];
    const v = A.valor(t), ms = v && v.valido && v.central > 0 ? A.margenSeg(v.central, e.cotizacion) : null;
    const out = [];
    if (n.compra != null) out.push({ tipo: 'compra', ok: e.cotizacion <= n.compra, txt: `Cotización ≤ ${usd(n.compra, 2)}`, ahora: usd(e.cotizacion, 2) });
    if (n.venta != null) out.push({ tipo: 'venta', ok: e.cotizacion >= n.venta, txt: `Cotización ≥ ${usd(n.venta, 2)}`, ahora: usd(e.cotizacion, 2) });
    if (n.margen != null) out.push({ tipo: 'margen', ok: ms != null && ms >= n.margen, txt: `Margen de seguridad ≥ ${pct(n.margen, 0)}`, ahora: ms == null ? 'n.s.' : pct(ms, 0) });
    return out;
  };
  A.alertasCumplidas = () => Object.keys(P.notas).filter((t) => A.alertasDe(t).some((a) => a.ok));
  // lo que se pega en pipeline/avisos.json para recibir los avisos por correo
  A.configAvisos = function (actual) {
    const seguir = [...new Set(A.S.seg.concat(P.cartera.map((x) => x.t)))];
    const alertas = Object.entries(P.notas).filter(([, n]) => n.compra != null || n.venta != null || n.margen != null)
      .map(([t, n]) => Object.assign({ ticker: t }, n.compra != null ? { compra: n.compra } : {}, n.venta != null ? { venta: n.venta } : {}, n.margen != null ? { margen: n.margen } : {}));
    const c = actual || {};
    return { _nota: c._nota || 'Avisos por correo: empresas que sigues, alertas propias y estrategias. Generado desde la app.', seguir, umbral: c.umbral || 0.1,
      estrategias: c.estrategias || CRIT.ESTRATEGIAS.map((x) => x.id), alertas };
  };

  // ---------------------------------------------------------------- pasar los datos a otro dispositivo
  const b64 = { de: (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    a: (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))) };
  A.misDatos = () => ({ v: 1, fecha: hoy(), seg: A.S.seg, cartera: P.cartera, notas: P.notas, esc: A.escenarios(), sup: A.leer('sp-sup', null), cmp: A.S.cmp });
  A.enlaceDatos = () => location.href.split('#')[0] + '#/importar/' + b64.de(JSON.stringify(A.misDatos()));
  function resumenDatos(d) {
    const pz = [];
    if (d.cartera && d.cartera.length) pz.push(`${new Set(d.cartera.map((x) => x.t)).size} empresas en cartera (${d.cartera.length} compras)`);
    if (d.seg && d.seg.length) pz.push(`${d.seg.length} ${d.seg.length === 1 ? 'empresa seguida' : 'empresas seguidas'}`);
    const nn = Object.keys(d.notas || {}).length; if (nn) pz.push(`${nn} ${nn === 1 ? 'empresa' : 'empresas'} con notas o alertas`);
    if (d.esc && d.esc.length) pz.push(`${d.esc.length} escenarios guardados`);
    return pz.join(' · ') || 'ningún dato';
  }
  function importar(d, modo) {
    if (!d || d.v !== 1) throw new Error('Formato no reconocido');
    const unir = modo === 'combinar';
    const seg = unir ? [...new Set(A.S.seg.concat(d.seg || []))] : (d.seg || []);
    A.S.seg = seg.filter((t) => A.D.porT[t]); A.escribir('sp-seg', A.S.seg);
    const ids = new Set(P.cartera.map((x) => x.id));
    P.cartera = unir ? P.cartera.concat((d.cartera || []).filter((x) => !ids.has(x.id))) : (d.cartera || []);
    P.notas = unir ? Object.assign({}, P.notas, d.notas || {}) : (d.notas || {});
    guardarCartera(); guardarNotas();
    if (d.esc) { const act = unir ? A.escenarios() : []; const nombres = new Set((d.esc || []).map((x) => x.n)); A.escribir('sp-esc', act.filter((x) => !nombres.has(x.n)).concat(d.esc).slice(-12)); }
    if (!unir && d.sup) A.escribir('sp-sup', d.sup);
    if (d.cmp) { A.S.cmp = (unir ? [...new Set(A.S.cmp.concat(d.cmp))] : d.cmp).filter((t) => A.D.porT[t]).slice(-A.MAX_CMP); A.escribir('sp-cmp', A.S.cmp); }
  }

  A.vistas.importar = function (main, [dato]) {
    let d = null, err = null;
    try { d = JSON.parse(b64.a(dato || '')); if (!d || d.v !== 1) throw new Error(); } catch (e) { err = 'El enlace no es válido o está incompleto.'; }
    main.append(h('header', { class: 'sv-head' }, h('h1', { class: 'sv-h1' }, 'Importar tus datos'),
      h('p', { class: 'sv-take' }, err || `Este enlace trae ${resumenDatos(d)} (copia del ${fecha(d.fecha)}).`)));
    if (err) { main.append(A.enlace('#/seguimiento', 'Ir a Seguimiento')); return; }
    const st = h('p', { class: 'sv-ctrl-d', role: 'status' });
    const boton = (txt, modo, cls) => {
      const b = h('button', { type: 'button', class: cls || 'sv-btn' }, txt);
      b.addEventListener('click', () => { try { importar(d, modo); st.textContent = 'Datos importados.'; A.ir('#/cartera'); } catch (e) { st.textContent = 'No se han podido importar.'; } });
      return b;
    };
    main.append(A.tarjeta('¿Cómo quieres importarlos?', `En este dispositivo tienes ahora: ${resumenDatos(A.misDatos())}.`,
      h('div', { class: 'sv-bar' }, boton('Combinar con los míos', 'combinar', 'ap-inst'), boton('Sustituir los míos', 'sustituir'), h('a', { class: 'sv-btn', href: '#/mercado' }, 'Cancelar')), st));
  };

  // tarjeta "Tus datos": copia entre dispositivos y configuración de los avisos por correo
  A.tarjetaTusDatos = function (conf) {
    const st = h('p', { class: 'sv-ctrl-d', role: 'status' });
    const copiarTexto = async (txt, ok) => {
      try { await navigator.clipboard.writeText(txt); st.textContent = ok; return true; } catch (e) { st.textContent = 'No se ha podido copiar automáticamente: selecciónalo abajo.'; pre.textContent = txt; pre.hidden = false; return false; }
    };
    const pre = h('pre', { class: 'ap-pre', hidden: true });
    const bEnl = h('button', { type: 'button', class: 'sv-btn' }, 'Copiar enlace para otro dispositivo');
    bEnl.addEventListener('click', async () => {
      const u = A.enlaceDatos();
      if (navigator.share && /iphone|ipad|android/i.test(navigator.userAgent)) { try { await navigator.share({ title: 'Mis datos del Simulador S&P 500', url: u }); st.textContent = 'Enlace compartido.'; return; } catch (e) {} }
      copiarTexto(u, 'Enlace copiado: ábrelo en el otro dispositivo (por ejemplo, enviándotelo por correo o WhatsApp).');
    });
    const bArch = h('button', { type: 'button', class: 'sv-btn' }, 'Descargar copia');
    bArch.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(A.misDatos(), null, 1)], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `simulador-sp500-mis-datos-${hoy()}.json` });
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      st.textContent = 'Copia descargada.';
    });
    const inp = h('input', { type: 'file', accept: 'application/json,.json', class: 'ap-sr', id: 'imp-arch' });
    inp.addEventListener('change', () => {
      const fl = inp.files && inp.files[0]; if (!fl) return;
      fl.text().then((txt) => { const d = JSON.parse(txt); A.ir('#/importar/' + b64.de(JSON.stringify(d))); }).catch(() => { st.textContent = 'El archivo no es una copia válida.'; });
    });
    const lImp = h('label', { class: 'sv-btn', for: 'imp-arch' }, 'Importar copia…');
    const cfg = A.configAvisos(conf);
    const bCfg = h('button', { type: 'button', class: 'sv-btn' }, 'Copiar la configuración de los avisos');
    bCfg.addEventListener('click', () => copiarTexto(JSON.stringify(cfg, null, 1), 'Copiada. Pégala en el fichero de avisos de GitHub (sustituyendo todo) y pulsa «Commit changes».'));
    const enGit = (conf && conf.alertas) || [];
    return A.tarjeta(['Tus datos ', A.ayuda('sincronizar')], 'Cartera, empresas seguidas, notas, alertas y escenarios se guardan en este navegador. Para tenerlos también en el móvil o en otro ordenador, copia el enlace y ábrelo allí, o descarga una copia.',
      h('div', { class: 'sv-bar' }, bEnl, bArch, lImp, inp),
      h('h3', { class: 'ap-h3' }, 'Avisos por correo'),
      h('p', { class: 'sv-card-n' }, `Cada lunes llega el resumen de la semana, y de lunes a viernes, después del cierre, un aviso si alguna de tus alertas pasa a cumplirse. Para que los avisos usen tu lista (${cfg.seguir.length} empresas entre seguidas y en cartera) y tus ${cfg.alertas.length} alertas, copia la configuración y pégala en el fichero de avisos de GitHub. Ahora hay ${((conf && conf.seguir) || []).length} empresas y ${enGit.length} alertas configuradas allí.`),
      h('div', { class: 'sv-bar' }, bCfg, h('a', { class: 'sv-btn', href: `${REPO}/edit/main/pipeline/avisos.json`, target: '_blank', rel: 'noopener' }, 'Abrir el fichero de avisos ›'),
        h('a', { class: 'sv-btn', href: `${REPO}/issues`, target: '_blank', rel: 'noopener' }, 'Ver los avisos ›')),
      st, pre);
  };

  // ---------------------------------------------------------------- agenda de resultados y revisiones del consenso
  const diasHasta = (f) => (f ? Math.round((new Date(f + 'T00:00:00Z') - new Date(hoy() + 'T00:00:00Z')) / 864e5) : null);
  function cambioCentral(t, semanas) {
    const H = A.D.hist || { fechas: [], series: {} }, s = H.series[t] || [];
    const k = s.length - 1, j = k - semanas;
    return k > 0 && j >= 0 && s[k] && s[j] ? s[k][0] / s[j][0] - 1 : null;
  }
  A.cambioCentral = cambioCentral;
  A.agenda = function (tickers, opts = {}) {
    const filas = [...new Set(tickers)].map((t) => A.D.porT[t]).filter((e) => e && e.proximos_resultados)
      .map((e) => ({ e, d: diasHasta(e.proximos_resultados), c: e.consenso || {} }))
      .filter((x) => x.d != null && x.d >= -3 && (opts.dias == null || x.d <= opts.dias)).sort((a, b) => a.d - b.d);
    if (!filas.length) return h('p', { class: 'sv-card-n' }, opts.vacio || 'Ninguna de estas empresas tiene fecha de resultados próxima.');
    return A.tabla([
      { t: 'Fecha', v: (x) => x.d, f: (x) => h('span', null, fecha(x.e.proximos_resultados), h('span', { class: 'ap-tk' }, x.d <= 0 ? ' hoy o ya publicados' : x.d === 1 ? ' mañana' : ` en ${x.d} días`, x.c.fecha_estimada ? ' (estimada)' : '')) },
      { t: 'Empresa', v: (x) => x.e.nombre, f: (x) => h('span', { class: 'ap-emp' }, h('b', null, x.e.nombre), ' ', h('span', { class: 'ap-tk' }, x.e.ticker)), texto: true },
      { t: 'BPA esperado', v: (x) => x.c.prox_bpa, f: (x) => (x.c.prox_bpa == null ? '—' : usd(x.c.prox_bpa, 2)), ayuda: 'BPA medio que esperan los analistas para el trimestre que se presenta' },
      { t: 'Revisión del BPA (30 d · 90 d)', v: (x) => x.c.rev90, f: (x) => h('span', null, A.potSpan(x.c.rev30, 1), ' · ', A.potSpan(x.c.rev90, 1)), ayuda: 'Cambio del BPA esperado para el ejercicio en curso en los últimos 30 y 90 días' },
      { t: 'Analistas ↑ · ↓', f: (x) => (x.c.suben30 == null ? '—' : `${x.c.suben30} · ${x.c.bajan30}`), cls: 'sv-sec-col', ayuda: 'Analistas que han subido y bajado su previsión de BPA del ejercicio en los últimos 30 días' },
      { t: 'Última sorpresa', v: (x) => x.c.ult_sorpresa, f: (x) => (x.c.ult_sorpresa == null ? '—' : A.potSpan(x.c.ult_sorpresa, 1)), cls: 'sv-sec-col', ayuda: 'BPA publicado en el último trimestre frente al esperado' },
    ], filas, { clic: (x) => A.ir('#/empresa/' + x.e.ticker) });
  };

  // ---------------------------------------------------------------- ficha: mi seguimiento (notas, precios propios, cartera)
  A.tarjetaMia = function (e) {
    const n = A.nota(e.ticker), t = e.ticker;
    const tesis = h('textarea', { class: 'ap-ta', id: 'mi-tesis', rows: 3, placeholder: 'Por qué te interesa, qué tiene que pasar para comprar o vender…', maxlength: 2000 });
    tesis.value = n.tesis || '';
    let tmr = null;
    tesis.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => { A.ponerNota(t, { tesis: tesis.value.trim() }); est.textContent = 'Guardado.'; }, 500); });
    const campo = (id, lab, val, attrs, conv, nota) => {
      const i = h('input', Object.assign({ class: 'ap-in ap-num', id, type: 'number', inputmode: 'decimal' }, attrs));
      if (val != null) i.value = conv.mostrar(val);
      i.addEventListener('change', () => { const x = i.value === '' ? null : conv.guardar(Number(i.value)); A.ponerNota(t, { [id.replace('mi-', '')]: x != null && isFinite(x) ? x : null }); A.programar(); });
      return h('div', { class: 'sv-ctrl' }, h('label', { for: id }, lab), i, nota ? h('span', { class: 'sv-ctrl-d' }, nota) : null);
    };
    const dolar = { mostrar: (x) => x, guardar: (x) => (x > 0 ? x : null) }, porc = { mostrar: (x) => Math.round(x * 1000) / 10, guardar: (x) => x / 100 };
    const al = A.alertasDe(t);
    const est = h('p', { class: 'sv-ctrl-d', role: 'status' }, al.length ? al.map((a) => `${a.txt}: ${a.ok ? 'se cumple ✓' : 'no se cumple'} (ahora ${a.ahora})`).join(' · ') : 'Sin alertas: pon un precio de compra, de venta o un margen mínimo.');
    // cartera
    const pos = A.posiciones().find((x) => x.t === t);
    const nAcc = h('input', { class: 'ap-in ap-num', id: 'mi-acc', type: 'number', inputmode: 'decimal', min: 0, step: 'any', placeholder: 'Acciones' });
    const pCom = h('input', { class: 'ap-in ap-num', id: 'mi-pc', type: 'number', inputmode: 'decimal', min: 0, step: 'any', placeholder: 'Precio' });
    pCom.value = e.cotizacion;
    const bAdd = h('button', { type: 'button', class: 'sv-btn' }, 'Añadir a mi cartera');
    bAdd.addEventListener('click', () => { const a = Number(nAcc.value), p = Number(pCom.value); if (a > 0 && p > 0) { A.agregarCompra(t, a, p); A.programar(); } else nAcc.focus(); });
    const cartera = h('div', { class: 'ap-mi-cart' },
      pos ? h('p', { class: 'sv-card-n' }, h('b', null, `En tu cartera: ${num(pos.acciones, pos.acciones % 1 ? 2 : 0)} acciones`), ` a ${usd(pos.medio, 2)} de media · valor ${usd(pos.valor, 0)} · `, A.potSpan(pos.ganPct, 1), ` (${num(pos.gan, 0, true)} $) · `, A.enlace('#/cartera', 'ver cartera ›'))
        : h('p', { class: 'sv-card-n' }, 'No la tienes en tu cartera.'),
      h('div', { class: 'ap-mi-add' }, h('label', { class: 'ap-sr', for: 'mi-acc' }, 'Acciones compradas'), nAcc, h('span', { 'aria-hidden': 'true' }, '×'),
        h('label', { class: 'ap-sr', for: 'mi-pc' }, 'Precio de compra en dólares'), pCom, h('span', null, '$'), bAdd));
    return A.tarjeta(null, null,
      h('div', { class: 'sv-detail-h' }, h('h2', { class: 'sv-card-t' }, 'Mi seguimiento'), A.botonSeg(t)),
      h('p', { class: 'sv-card-n' }, 'Solo lo ves tú: se guarda en este navegador. Los precios y el margen activan las alertas de la app y, si copias la configuración en GitHub (página Seguimiento), también los avisos por correo.'),
      h('div', { class: 'ap-mi' },
        h('div', { class: 'ap-mi-tesis' }, h('label', { for: 'mi-tesis' }, 'Mi tesis'), tesis),
        h('div', { class: 'sv-ctrls ap-mi-alertas' },
          campo('mi-compra', 'Compraría por debajo de ($)', n.compra, { min: 0, step: 'any', placeholder: '—' }, dolar),
          campo('mi-venta', 'Vendería por encima de ($)', n.venta, { min: 0, step: 'any', placeholder: '—' }, dolar),
          campo('mi-margen', 'Avisar con un margen de seguridad de al menos (%)', n.margen, { min: 0, max: 90, step: 1, placeholder: '—' }, porc))),
      est, cartera);
  };

  // ---------------------------------------------------------------- MI CARTERA
  A.vistas.cartera = function (main) {
    const pos = A.posiciones(), eur = (A.D.estado || {}).eurusd;
    const total = pos.reduce((s, x) => s + x.valor, 0), coste = pos.reduce((s, x) => s + x.coste, 0);
    const conPot = pos.filter((x) => x.pot != null), pesoPot = conPot.reduce((s, x) => s + x.valor, 0);
    const potMedio = pesoPot ? conPot.reduce((s, x) => s + x.valor * x.pot, 0) / pesoPot : null;
    const div = pos.reduce((s, x) => s + x.div, 0);
    const beta = total ? pos.reduce((s, x) => s + x.valor * (x.e.beta || 1), 0) / total : null;
    const enEur = (x) => (eur ? ` · ${num(x / eur, 0)} €` : '');
    main.append(h('header', { class: 'sv-head' }, h('h1', { class: 'sv-h1' }, 'Mi cartera'),
      h('p', { class: 'sv-take' }, pos.length ? `${pos.length} ${pos.length === 1 ? 'empresa' : 'empresas'} por valor de ${usd(total, 0)}${eur ? ` (${num(total / eur, 0)} €)` : ''}; ${coste ? `${total >= coste ? 'ganas' : 'pierdes'} ${usd(Math.abs(total - coste), 0)} (${pct(total / coste - 1, 1, true)})` : ''}${potMedio != null ? ` y, según el modelo, su potencial medio es del ${pct(potMedio, 0, true)}` : ''}.`
        : 'Apunta tus compras y verás su valor, la ganancia, el potencial según el modelo, el reparto por sectores, los dividendos y los próximos resultados.'),
      h('p', { class: 'sv-meta' }, `Cotizaciones del ${fecha((A.D.estado || {}).fecha_mercado)}${eur ? ` · 1 € = ${num(eur, 4)} $` : ''} · se guarda en este navegador (página Seguimiento › Tus datos para pasarla a otro dispositivo).`)));
    if (pos.length) {
      main.append(h('section', { class: 'sv-kpis' },
        A.kpi('Valor de la cartera', usd(total, 0), `Coste ${usd(coste, 0)}${enEur(total)}`),
        A.kpi('Ganancia o pérdida', `${num(total - coste, 0, true)} $`, [A.potSpan(coste ? total / coste - 1 : null, 1), eur ? ` · ${num((total - coste) / eur, 0, true)} €` : ''], A.clsPot(total - coste)),
        A.kpi(['Potencial medio ', A.ayuda('potencial')], potMedio == null ? 'n.s.' : pct(potMedio, 0, true), `Ponderado por el valor de cada posición (${conPot.length} de ${pos.length} con valoración fiable)`, potMedio == null ? null : A.clsPot(potMedio)),
        A.kpi('Dividendos al año', usd(div, 0), `Rentabilidad ${pct(total ? div / total : null, 2)} sobre el valor y ${pct(coste ? div / coste : null, 2)} sobre el coste${eur ? ` · ${num(div / eur, 0)} €` : ''}`),
        A.kpi(['Beta de la cartera ', A.ayuda('beta')], num(beta, 2), 'Media ponderada: más de 1, más volátil que el mercado')));
      const senal = (x) => {
        const n = A.nota(x.t);
        if (n.venta != null && x.e.cotizacion >= n.venta) return h('span', { class: 'ap-senal ap-s-v' }, 'Tu precio de venta');
        if (!x.ok) return h('span', { class: 'ap-senal' }, 'Valoración poco fiable');
        if (x.ms >= 0.25) return h('span', { class: 'ap-senal ap-s-c' }, 'Margen ≥ 25 %');
        if (x.pot <= -0.2) return h('span', { class: 'ap-senal ap-s-v' }, `${pct(-x.pot, 0)} sobre su valor`);
        return h('span', { class: 'ap-senal' }, x.pot > 0 ? 'Por debajo de su valor' : 'En línea o algo cara');
      };
      main.append(A.tarjeta(['Posiciones ', A.ayuda('cartera')], 'Pulsa una fila para ver la valoración de la empresa. La señal compara la cotización con el valor central del modelo y con tus precios.',
        A.tabla([
          { t: 'Empresa', v: (x) => x.e.nombre, f: (x) => h('span', { class: 'ap-emp' }, h('b', null, x.e.nombre), ' ', h('span', { class: 'ap-tk' }, x.t)), texto: true },
          { t: 'Acciones', v: (x) => x.acciones, f: (x) => num(x.acciones, x.acciones % 1 ? 2 : 0) },
          { t: 'Precio medio', v: (x) => x.medio, f: (x) => usd(x.medio, 2), cls: 'sv-sec-col' },
          { t: 'Cotización', v: (x) => x.e.cotizacion, f: (x) => usd(x.e.cotizacion, 2) },
          { t: 'Valor', v: (x) => x.valor, f: (x) => usd(x.valor, 0), cls: 'sv-strong' },
          { t: 'Peso', v: (x) => x.peso, f: (x) => pct(x.peso, 1) },
          { t: 'Ganancia', v: (x) => x.ganPct, f: (x) => A.potSpan(x.ganPct, 1) },
          { t: 'Valor central', v: (x) => (x.ok ? x.v.central : null), f: (x) => (x.ok ? usd(x.v.central, 0) : '—'), cls: 'sv-sec-col' },
          { t: 'Potencial', v: (x) => x.pot, f: (x) => (x.pot == null ? '—' : A.potSpan(x.pot)) },
          { t: 'Señal', f: senal },
          { t: 'Dividendo', v: (x) => x.div, f: (x) => (x.div ? usd(x.div, 0) : '—'), cls: 'sv-sec-col' },
        ], pos, { orden: 4, clic: (x) => A.ir('#/empresa/' + x.t) })));
      // reparto por sectores y potencial
      const sec = {};
      for (const x of pos) sec[x.e.sector] = (sec[x.e.sector] || 0) + x.peso;
      const secF = Object.entries(sec).sort((a, b) => b[1] - a[1]);
      const val = pos.filter((x) => x.ok);
      main.append(h('div', { class: 'sv-grid2' },
        A.tarjeta('Peso por sector', null, G.caja(secF.length * 28 + 30, (c) => G.barras(c, secF.map(([s, w]) => ({ id: s, n: s, v: w, color: 'var(--s1)' })), { fmt: (d) => pct(d, 0) }))),
        val.length ? A.tarjeta('Potencial de cada posición', 'Rango entre el valor bajo y el alto; punto: valor central, frente a la cotización.',
          G.caja(val.length * 30 + 44, (c) => G.rangos(c, val.map((x) => ({ id: x.t, n: x.e.nombre, lo: x.v.bajo / x.e.cotizacion - 1, ce: x.v.pot, hi: x.v.alto / x.e.cotizacion - 1 })), { clic: (d) => A.ir('#/empresa/' + d.id) })))
          : A.tarjeta('Potencial de cada posición', null, h('p', { class: 'sv-card-n' }, 'Ninguna posición tiene una valoración fiable.'))));
      main.append(A.tarjeta('Próximos resultados de tu cartera', 'Fecha, BPA esperado para el trimestre y cómo han cambiado las previsiones de los analistas.', A.agenda(pos.map((x) => x.t), { vacio: 'Sin fechas de resultados próximas.' })));
    }
    // añadir compras
    const lista = h('datalist', { id: 'cart-lista' }, A.D.emp.filter((e) => e.cotizacion).map((e) => h('option', { value: `${e.ticker} · ${e.nombre}` })));
    const iEmp = h('input', { class: 'ap-in', id: 'cart-emp', list: 'cart-lista', placeholder: 'Empresa o ticker', autocomplete: 'off' });
    const iAcc = h('input', { class: 'ap-in ap-num', id: 'cart-acc', type: 'number', inputmode: 'decimal', min: 0, step: 'any', placeholder: 'Acciones' });
    const iPre = h('input', { class: 'ap-in ap-num', id: 'cart-pre', type: 'number', inputmode: 'decimal', min: 0, step: 'any', placeholder: 'Precio ($)' });
    const iFec = h('input', { class: 'ap-in ap-num', id: 'cart-fec', type: 'date', value: hoy() });
    const msg = h('p', { class: 'sv-ctrl-d', role: 'status' });
    const resolver = (s) => {
      const q = A.sinAcentos(String(s).split('·')[0].trim());
      return A.D.porT[q.toUpperCase()] || A.D.emp.find((e) => A.sinAcentos(e.nombre) === q) || A.D.emp.find((e) => e.busca.includes(q));
    };
    iEmp.addEventListener('change', () => { const e = resolver(iEmp.value); if (e && !iPre.value) iPre.value = e.cotizacion; });
    const bAdd = h('button', { type: 'submit', class: 'ap-inst' }, 'Añadir');
    const form = h('form', { class: 'ap-cart-f' }, lista,
      h('label', null, 'Empresa', iEmp), h('label', null, 'Acciones', iAcc), h('label', null, 'Precio de compra', iPre), h('label', null, 'Fecha', iFec), bAdd);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const e = resolver(iEmp.value), a = Number(iAcc.value), p = Number(iPre.value);
      if (!e) { msg.textContent = 'No encuentro esa empresa del S&P 500.'; iEmp.focus(); return; }
      if (!(a > 0) || !(p > 0)) { msg.textContent = 'Indica el número de acciones y el precio de compra.'; return; }
      A.agregarCompra(e.ticker, a, p, iFec.value || hoy()); A.programar();
    });
    main.append(A.tarjeta('Añadir una compra', 'Precio en dólares por acción. Puedes añadir varias compras de la misma empresa: se calcula el precio medio.', form, msg));
    if (P.cartera.length) {
      const compras = P.cartera.slice().sort((a, b) => (a.f < b.f ? 1 : -1));
      main.append(A.tarjeta(`Compras (${compras.length})`, null, A.tabla([
        { t: 'Fecha', v: (x) => x.f, f: (x) => fecha(x.f) },
        { t: 'Empresa', v: (x) => x.t, f: (x) => { const e = A.D.porT[x.t]; return h('span', { class: 'ap-emp' }, h('b', null, e ? e.nombre : x.t), ' ', h('span', { class: 'ap-tk' }, x.t)); }, texto: true },
        { t: 'Acciones', v: (x) => x.n, f: (x) => num(x.n, x.n % 1 ? 2 : 0) },
        { t: 'Precio', v: (x) => x.p, f: (x) => usd(x.p, 2) },
        { t: 'Importe', v: (x) => x.n * x.p, f: (x) => usd(x.n * x.p, 0) },
        { t: '', f: (x) => { const b = h('button', { type: 'button', class: 'sv-btn', 'aria-label': `Borrar la compra de ${x.t} del ${fecha(x.f)}` }, 'Borrar'); b.addEventListener('click', (ev) => { ev.stopPropagation(); A.borrarCompra(x.id); A.programar(); }); return b; } },
      ], compras)));
    }
  };
})(window.APP);
