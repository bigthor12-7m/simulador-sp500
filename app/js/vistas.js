// Simulador S&P 500 · páginas: mercado, sector, industria, empresa, comparador, informe y método.
(function (A) {
  const { h, num, pct, pp, usd, mill, fecha, veces, G } = A;
  const V = A.vistas;

  // ---------------------------------------------------------------- utilidades comunes
  // avisos de una empresa: los fijos del modelo + los que dependen de los supuestos actuales
  A.avisosDe = function (e, v) {
    const av = (e.avisos || []).slice();
    if (e.valorada && v) {
      const r = v.central / e.cotizacion;
      if (v.valido && (r < 0.2 || r > 3)) av.push('valor_extremo');
      if (A.ESC.some((sc) => v.res[sc].eq < 0)) av.push('patrimonio_negativo');
      if (v.res.base.pesoTv > 0.85 && !av.includes('patrimonio_negativo')) av.push('peso_vt_alto');
    }
    return av;
  };
  A.fiable = (e, v) => !!(e.valorada && v && v.valido && v.central > 0 && !A.avisosDe(e, v).some((a) => A.AVISOS[a] && A.AVISOS[a].grave));
  A.margenSeg = (valor, px) => (valor > 0 ? 1 - px / valor : null);

  // criterios del inversor defensivo de Benjamin Graham (adaptados a los datos disponibles)
  A.CRITERIOS = [
    { id: 'per', t: 'PER de los últimos doce meses ≤ 15', f: (g) => g.per != null && g.per <= 15, v: (g) => veces(g.per) },
    { id: 'pb', t: 'Precio / valor contable ≤ 1,5 (o PER × P/VC ≤ 22,5)', f: (g) => (g.pb != null && g.pb <= 1.5) || (g.per_pb != null && g.per_pb <= 22.5), v: (g) => `${veces(g.pb)} · producto ${num(g.per_pb, 1)}` },
    { id: 'rc', t: 'Liquidez: activo corriente ≥ 2 × pasivo corriente', f: (g) => g.rc != null && g.rc >= 2, v: (g) => veces(g.rc, 2) },
    { id: 'deuda', t: 'Solidez: deuda neta ≤ 3 × EBITDA', f: (g) => g.dn_ebitda != null && g.dn_ebitda <= 3, v: (g) => (g.dn_ebitda == null ? '—' : g.dn_ebitda < 0 ? 'caja neta' : veces(g.dn_ebitda)) },
    { id: 'ben', t: 'Beneficios positivos todos los años disponibles', f: (g) => g.ben_n >= 3 && g.ben_pos === g.ben_n, v: (g) => `${g.ben_pos} de ${g.ben_n} años` },
    { id: 'div', t: 'Dividendos todos los años disponibles', f: (g) => g.div_n >= 3 && g.div_anios === g.div_n, v: (g) => `${g.div_anios} de ${g.div_n} años · rentabilidad ${pct(g.div, 1)}` },
    { id: 'cbpa', t: 'Crecimiento del BPA ≥ 10 % en el periodo disponible', f: (g) => g.cbpa != null && g.cbpa >= 0.1, v: (g) => (g.cbpa == null ? '—' : `${pct(g.cbpa, 0, true)} en ${g.cbpa_anios} años`) },
    { id: 'ng', t: 'Cotización ≤ número de Graham (√(22,5 × BPA × valor contable))', f: (g, e) => g.ng != null && e.cotizacion <= g.ng, v: (g) => usd(g.ng, 2) },
  ];
  A.graham = function (e) {
    const g = e.graham || {};
    const items = A.CRITERIOS.map((c) => ({ id: c.id, t: c.t, ok: !!c.f(g, e), v: c.v(g) }));
    return { items, puntos: items.filter((i) => i.ok).length, total: items.length };
  };

  const potCelda = (e, v) => (e.valorada && v && v.valido ? A.potSpan(v.pot) : h('span', { class: 'ap-gris' }, e.valorada ? 'n.s.' : 'sin valorar'));
  const nomCelda = (e) => h('span', { class: 'ap-emp' }, h('b', null, e.nombre), ' ', h('span', { class: 'ap-tk' }, e.ticker));
  const irEmp = (e) => A.ir('#/empresa/' + e.ticker);
  const hSec = (s) => '#/sector/' + A.slug(s);
  const hInd = (s, i) => '#/industria/' + A.slug(s) + '/' + A.slug(i);
  const avisoBox = (titulo, lista) => (lista.length ? h('div', { class: 'ap-avisos' }, h('p', { class: 'ap-avisos-t' }, titulo), h('ul', null, lista.map((x) => h('li', null, x)))) : null);

  function avisosGenerales() {
    const est = A.D.estado || {}, { dias } = A.pintarEstado();
    const av = (est.avisos || []).slice();
    if (dias != null && dias > 9) av.push(`Los datos son de hace ${dias} días: la actualización semanal no se ha completado.`);
    return avisoBox('Avisos de la actualización semanal', av);
  }

  // estadísticas de un grupo de empresas con los supuestos actuales
  function resumen(grupo, Vs) {
    const val = grupo.filter((e) => A.fiable(e, Vs[e.ticker]));
    const pots = val.map((e) => Vs[e.ticker].pot);
    const cap = val.reduce((s, e) => s + e.cotizacion * e.acciones_m, 0);
    const valor = val.reduce((s, e) => s + Vs[e.ticker].central * e.acciones_m, 0);
    return { n: grupo.length, nv: grupo.filter((e) => e.valorada).length, nf: val.length, bajo: pots.filter((x) => x > 0).length,
      med: A.mediana(pots), agregado: cap ? valor / cap - 1 : null, per: A.mediana(val.map((e) => (e.adelantados || {}).per)),
      wacc: val.length ? val.reduce((s, e) => s + Vs[e.ticker].w, 0) / val.length : null, val };
  }

  // columnas de las tablas de empresas
  function colsEmpresas(Vs, extra = {}) {
    const vv = (e) => Vs[e.ticker];
    const cols = [
      { t: 'Empresa', v: (e) => e.nombre, f: nomCelda, texto: true },
      extra.industria ? { t: 'Industria', v: (e) => e.industria, cls: 'sv-sec-col', texto: true } : null,
      { t: 'Cotización', v: (e) => e.cotizacion, f: (e) => usd(e.cotizacion, 2) },
      { t: 'Valor central', v: (e) => (A.fiable(e, vv(e)) ? vv(e).central : null), f: (e) => (e.valorada && vv(e) && vv(e).valido ? usd(vv(e).central) : '—'), cls: 'sv-strong' },
      { t: 'Potencial', v: (e) => (A.fiable(e, vv(e)) ? vv(e).pot : null), f: (e) => potCelda(e, vv(e)) },
      { t: 'Rango', f: (e) => (e.valorada && vv(e) && vv(e).valido ? `${num(vv(e).bajo, 0)} – ${num(vv(e).alto, 0)}` : '—'), cls: 'sv-sec-col' },
      { t: 'PER adel.', v: (e) => (e.adelantados || {}).per, f: (e) => veces((e.adelantados || {}).per), cls: 'sv-sec-col' },
      { t: 'WACC', v: (e) => (vv(e) ? vv(e).w : null), f: (e) => (vv(e) ? pct(vv(e).w, 1) : '—'), cls: 'sv-sec-col' },
      { t: 'Graham', v: (e) => A.graham(e).puntos, f: (e) => `${A.graham(e).puntos}/${A.CRITERIOS.length}`, ayuda: 'Criterios del inversor defensivo de Graham que cumple' },
      { t: '', f: (e) => A.botonCmp(e.ticker) },
    ];
    return cols.filter(Boolean);
  }

  // ---------------------------------------------------------------- MERCADO
  V.mercado = function (main) {
    const Vs = A.valores(), E = A.D.emp;
    const R = resumen(E, Vs), def = resumen(E, A.valoresDef());
    const cambiado = A.parCambiado();
    const est = A.D.estado || {};
    main.append(
      h('header', { class: 'sv-head' },
        h('h1', { class: 'sv-h1' }, 'Simulador de valoración · S&P 500'),
        h('p', { class: 'sv-take' }, `Con ${cambiado ? 'estos supuestos' : 'los supuestos por defecto'}, ${R.bajo} de las ${R.nf} empresas con una valoración fiable cotizan por debajo de su valor central; el potencial mediano es del ${pct(R.med, 0, true)}` +
          (cambiado ? ` (por defecto: ${def.bajo} y ${pct(def.med, 0, true)}).` : '.')),
        h('p', { class: 'sv-meta' }, `Cotizaciones del ${fecha(est.fecha_mercado || A.D.pa.fecha_cotizacion)} · ${R.nv} de ${R.n} empresas valoradas con el modelo automático (bancos, aseguradoras y REIT llegarán en la fase 2) · importes en dólares`)),
      avisosGenerales() || '',
    );
    const cand = R.val.filter((e) => A.margenSeg(Vs[e.ticker].central, e.cotizacion) >= 0.25);
    main.append(h('section', { class: 'sv-kpis' },
      A.kpi('Cotizan por debajo de su valor central', `${R.bajo} de ${R.nf}`, `${pct(R.bajo / R.nf, 0)} de las valoraciones fiables · por defecto ${def.bajo}`),
      A.kpi('Potencial mediano', pct(R.med, 0, true), `Por defecto: ${pct(def.med, 0, true)}`, A.clsPot(R.med)),
      A.kpi('Valor agregado frente a la capitalización', pct(R.agregado, 0, true), `Suma de valores centrales ÷ capitalización · por defecto ${pct(def.agregado, 0, true)}`, A.clsPot(R.agregado)),
      h('a', { class: 'sv-card sv-kpi ap-kpi-link', href: '#/oportunidades' }, h('p', { class: 'sv-kpi-l' }, 'Con margen de seguridad de al menos el 25 %'), h('p', { class: 'sv-num' }, String(cand.length)), h('p', { class: 'sv-kpi-r' }, 'Ver el filtro de oportunidades ›')),
    ));

    // sectores
    const secs = Object.keys(A.D.jer).sort((a, b) => a.localeCompare(b, 'es'));
    const filas = secs.map((s) => { const grupo = Object.values(A.D.jer[s]).flat(); return Object.assign({ s }, resumen(grupo, Vs)); });
    const conDatos = filas.filter((f) => f.nf >= 3).sort((a, b) => b.med - a.med);
    main.append(A.tarjeta('Potencial mediano por sector', 'Mediana del potencial (valor central frente a la cotización) de las empresas de cada sector con una valoración fiable. Pulsa un sector para entrar.',
      G.caja(conDatos.length * 30 + 30, (c) => G.barras(c, conDatos.map((f) => ({ id: f.s, n: f.s, v: f.med })), {
        clic: (d) => A.ir(hSec(d.id)),
        tip: (d) => { const f = filas.find((x) => x.s === d.id); return [[d.id, null, 'sv-tip-h'], [`Potencial mediano: ${pct(f.med, 0, true)}`], [`${f.bajo} de ${f.nf} por debajo de su valor`], [`PER adelantado mediano: ${veces(f.per)}`]]; },
      }))));
    main.append(A.tarjeta('Sectores', 'Empresas del índice por sector GICS. "Sin valorar": bancos, aseguradoras y REIT (fase 2) o sin datos suficientes.',
      A.tabla([
        { t: 'Sector', v: (f) => f.s, f: (f) => h('a', { href: hSec(f.s) }, f.s), texto: true },
        { t: 'Empresas', v: (f) => f.n },
        { t: 'Valoradas', v: (f) => f.nv },
        { t: 'Por debajo de su valor', v: (f) => (f.nf ? f.bajo / f.nf : null), f: (f) => (f.nf ? `${f.bajo} de ${f.nf}` : '—') },
        { t: 'Potencial mediano', v: (f) => f.med, f: (f) => (f.med == null ? '—' : A.potSpan(f.med)) },
        { t: 'PER adelantado', v: (f) => f.per, f: (f) => veces(f.per), cls: 'sv-sec-col' },
        { t: 'WACC medio', v: (f) => f.wacc, f: (f) => pct(f.wacc, 1), cls: 'sv-sec-col' },
      ], filas, { orden: 4, clic: (f) => A.ir(hSec(f.s)) })));

    // extremos
    const ord = R.val.slice().sort((a, b) => Vs[b.ticker].pot - Vs[a.ticker].pot);
    const mini = (lista) => A.tabla([
      { t: 'Empresa', f: nomCelda },
      { t: 'Cotización', f: (e) => usd(e.cotizacion, 2) },
      { t: 'Valor central', f: (e) => usd(Vs[e.ticker].central), cls: 'sv-strong' },
      { t: 'Potencial', f: (e) => A.potSpan(Vs[e.ticker].pot) },
    ], lista, { clic: irEmp });
    main.append(h('div', { class: 'sv-grid2' },
      A.tarjeta('Mayor potencial', 'Las diez valoraciones fiables con más diferencia a favor del valor central.', mini(ord.slice(0, 10))),
      A.tarjeta('Menor potencial', 'Las diez que más cotizan por encima de su valor central.', mini(ord.slice(-10).reverse()))));
  };

  // ---------------------------------------------------------------- SECTOR
  V.sector = function (main, [sec]) {
    const inds = A.D.jer[sec];
    if (!inds) { main.append(h('p', { class: 'sv-warn' }, 'Sector no encontrado.'), A.enlace('#/mercado', 'Volver al mercado')); return; }
    const Vs = A.valores(), grupo = Object.values(inds).flat(), R = resumen(grupo, Vs);
    main.append(A.migas([['Mercado', '#/mercado'], [sec]]),
      h('header', { class: 'sv-head' }, h('h1', { class: 'sv-h1' }, sec),
        h('p', { class: 'sv-take' }, R.nf ? `${R.bajo} de las ${R.nf} empresas con valoración fiable cotizan por debajo de su valor central; potencial mediano del ${pct(R.med, 0, true)}.` : 'Las empresas de este sector se valorarán en la fase 2 (modelo específico).'),
        h('p', { class: 'sv-meta' }, `${R.n} empresas en el S&P 500 · ${R.nv} valoradas · ${Object.keys(inds).length} industrias`)));
    const filas = Object.keys(inds).map((i) => Object.assign({ i }, resumen(inds[i], Vs)));
    const conDatos = filas.filter((f) => f.nf >= 1).sort((a, b) => b.med - a.med);
    if (conDatos.length) main.append(A.tarjeta('Potencial mediano por industria', 'Pulsa una industria para ver sus empresas.',
      G.caja(conDatos.length * 30 + 30, (c) => G.barras(c, conDatos.map((f) => ({ id: f.i, n: `${f.i} (${f.nf})`, v: f.med })), { clic: (d) => A.ir(hInd(sec, d.id)) }))));
    main.append(A.tarjeta('Industrias', null, A.tabla([
      { t: 'Industria', v: (f) => f.i, f: (f) => h('a', { href: hInd(sec, f.i) }, f.i), texto: true },
      { t: 'Empresas', v: (f) => f.n },
      { t: 'Por debajo de su valor', v: (f) => (f.nf ? f.bajo / f.nf : null), f: (f) => (f.nf ? `${f.bajo} de ${f.nf}` : '—') },
      { t: 'Potencial mediano', v: (f) => f.med, f: (f) => (f.med == null ? '—' : A.potSpan(f.med)) },
      { t: 'PER adelantado', v: (f) => f.per, f: (f) => veces(f.per), cls: 'sv-sec-col' },
    ], filas, { orden: 3, clic: (f) => A.ir(hInd(sec, f.i)) })));
    main.append(A.tarjeta('Empresas del sector', 'Pulsa una empresa para ver su valoración. Las columnas se ordenan pulsando su título.',
      A.tabla(colsEmpresas(Vs, { industria: true }), grupo, { orden: 4, clic: irEmp })));
  };

  // ---------------------------------------------------------------- INDUSTRIA
  V.industria = function (main, [sec, ind]) {
    const grupo = (A.D.jer[sec] || {})[ind];
    if (!grupo) { main.append(h('p', { class: 'sv-warn' }, 'Industria no encontrada.'), A.enlace('#/mercado', 'Volver al mercado')); return; }
    const Vs = A.valores(), R = resumen(grupo, Vs);
    const subs = [...new Set(grupo.map((e) => e.subindustria))];
    main.append(A.migas([['Mercado', '#/mercado'], [sec, hSec(sec)], [ind]]),
      h('header', { class: 'sv-head' }, h('h1', { class: 'sv-h1' }, ind),
        h('p', { class: 'sv-take' }, R.nf ? `${R.bajo} de ${R.nf} cotizan por debajo de su valor central; potencial mediano del ${pct(R.med, 0, true)}.` : 'Sin empresas valoradas en la fase 1.'),
        h('p', { class: 'sv-meta' }, `${grupo.length} empresas · subindustrias: ${subs.join(', ')}`)));
    const val = grupo.filter((e) => e.valorada && Vs[e.ticker] && Vs[e.ticker].valido).sort((a, b) => Vs[b.ticker].pot - Vs[a.ticker].pot);
    if (val.length) main.append(A.tarjeta('Valor central frente a la cotización', 'Barra: rango entre el valor bajo y el alto; punto: valor central. A la derecha de la línea, la empresa cotiza por debajo de su valor. Pulsa una empresa para ver su detalle.',
      G.caja(val.length * 30 + 44, (c) => G.rangos(c, val.map((e) => { const v = Vs[e.ticker]; return { id: e.ticker, n: e.nombre, lo: v.bajo / e.cotizacion - 1, ce: v.pot, hi: v.alto / e.cotizacion - 1, color: A.fiable(e, v) ? null : 'var(--cds-chart-muted)' }; }), {
        clic: (d) => A.ir('#/empresa/' + d.id),
        tip: (d) => { const e = A.D.porT[d.id], v = Vs[d.id]; return [[`${e.nombre} (${e.ticker})`, null, 'sv-tip-h'], [`Valor central: ${usd(v.central)} (${pct(v.pot, 0, true)})`], [`Rango: ${usd(v.bajo)} – ${usd(v.alto)}`], [`Cotización: ${usd(e.cotizacion, 2)}`]].concat(A.fiable(e, v) ? [] : [['Valoración poco fiable: ver avisos']]); },
      }))));
    const cols = colsEmpresas(Vs);
    cols.splice(1, 0, { t: 'Subindustria', v: (e) => e.subindustria, cls: 'sv-sec-col', texto: true });
    main.append(A.tarjeta('Empresas', null, A.tabla(cols, grupo, { orden: 4, clic: irEmp })));
  };

  // ---------------------------------------------------------------- EMPRESA
  V.empresa = function (main, [t]) {
    const e = A.D.porT[String(t || '').toUpperCase()];
    if (!e) { main.append(h('p', { class: 'sv-warn' }, `No hay ninguna empresa del S&P 500 con el ticker ${t}.`), A.enlace('#/mercado', 'Volver al mercado')); return; }
    main.append(A.migas([['Mercado', '#/mercado'], [e.sector, hSec(e.sector)], [e.industria, hInd(e.sector, e.industria)], [e.nombre]]));
    const cab = h('header', { class: 'sv-head' },
      h('div', { class: 'ap-tit' }, h('h1', { class: 'sv-h1' }, `${e.nombre} `, h('span', { class: 'ap-tk-g' }, e.ticker)),
        h('div', { class: 'ap-tit-b' }, A.botonCmp(e.ticker), e.valorada ? h('a', { class: 'sv-btn', href: '#/informe/' + e.ticker }, 'Informe') : null)),
      h('p', { class: 'sv-meta' }, [e.empresa !== e.nombre ? e.empresa : null, e.subindustria, e.sede, e.cap ? `capitalización ${mill(e.cap)}` : null,
        e.proximos_resultados ? `próximos resultados: ${fecha(e.proximos_resultados)}` : null].filter(Boolean).join(' · ')));
    main.append(cab);
    if (!e.valorada) {
      cab.append(h('p', { class: 'sv-take' }, `${e.nombre} no se valora con el modelo automático: ${e.motivo ? e.motivo.charAt(0).toLowerCase() + e.motivo.slice(1) : 'sin datos suficientes'}.`));
      if (e.principal) main.append(h('p', null, A.enlace('#/empresa/' + e.principal, `Ver la valoración de ${e.principal} ›`)));
      main.append(h('section', { class: 'sv-kpis' }, A.kpi('Cotización', usd(e.cotizacion, 2), e.cap ? mill(e.cap) : null),
        e.analistas && e.analistas.objetivo ? A.kpi('Precio objetivo medio de los analistas', usd(e.analistas.objetivo, 0), `${e.analistas.n || '—'} analistas · ${pct(e.analistas.objetivo / e.cotizacion - 1, 0, true)}`) : ''));
      if (e.graham) main.append(tarjetaGraham(e));
      main.append(tarjetaDescripcion(e));
      return;
    }
    const aj = A.S.aj[e.ticker] || (A.S.aj[e.ticker] = A.ajDef(e));
    const v = A.valor(e.ticker), vd = A.valoresDef()[e.ticker];
    const av = A.avisosDe(e, v);
    cab.append(h('p', { class: 'sv-take' }, frase(e, v)));
    if (av.length) main.append(avisoBox('Avisos sobre esta valoración', av.map((a) => (A.AVISOS[a] || { t: a }).t + (A.AVISOS[a] && A.AVISOS[a].grave ? ' (se excluye del filtro de oportunidades por defecto)' : ''))));
    const gi = MOTOR.crecimientoImplicito(e, e.trays, A.S.par, aj, v.w, v.res.base.roicT);
    const cb = MOTOR.camino(e.trays.base, aj);
    const ronicVis = aj.invModo === 'explicito' ? aj.ronic : v.ronicImpl;
    main.append(h('section', { class: 'sv-kpis' },
      A.kpi('Valor central', usd(v.central), [A.potSpan(v.pot), ` frente a ${usd(e.cotizacion, 2)} · rango ${usd(v.bajo)} – ${usd(v.alto)}`]),
      (() => { const m = A.margenSeg(v.central, e.cotizacion);
        return m != null && m > 0 ? A.kpi('Margen de seguridad', pct(m, 0), 'Parte del valor central que no paga la cotización (1 − cotización ÷ valor)', 'sv-pos')
          : A.kpi('Margen de seguridad', 'Sin margen', v.central > 0 ? `La cotización supera el valor central en un ${pct(e.cotizacion / v.central - 1, 0)}` : 'El modelo no da un valor positivo'); })(),
      A.kpi('DCF ponderado por escenarios', usd(v.pond), `${A.ESC.map((sc) => `${A.NOM_ESC[sc]} ${usd(v.res[sc].vps)}`).join(' · ')}`),
      A.kpi('Crecimiento que descuenta la cotización', gi == null ? 'n.s.' : pct(gi, 1), `Ventas, años 1–5 · caso base: ${pct(cb.gr.slice(0, 5).reduce((s, x) => s + x, 0) / 5, 1)} anual`),
      A.kpi('WACC', pct(v.w, 2), `Ke ${pct(v.W.ke, 1)} (beta ${num(v.W.beta, 2)}) · Kd ${pct(v.W.kd, 1)} · deuda ${pct(v.W.wd, 0)}`),
    ));
    main.append(tarjetaAjustes(e, aj, v, vd));
    const hist = historicoDe(e.ticker);
    main.append(A.tarjeta('Evolución semanal', 'Cotización y valor central con los supuestos por defecto en cada actualización semanal. El rombo es la simulación actual si has cambiado algún supuesto.',
      G.leyenda([['Valor central', 'var(--s1)'], ['Cotización', 'var(--s2)'], ['Simulación actual', 'var(--color-fg)', 'b']]),
      G.caja(220, (c) => G.evolucion(c, hist, v.central))));
    const ivNota = h('p', { class: 'sv-kpi-r' });
    const ivLeg = h('div');
    const sc = MOTOR.valorSinCrecimiento(e, v.w);
    ivNota.textContent = (ronicVis == null ? `${e.nombre} apenas necesita capital para crecer. ` : `Rentabilidad de la nueva inversión: ${pct(ronicVis, 1)} frente a un WACC del ${pct(v.w, 1)}. `) +
      `Sin crecer (NOPAT actual a perpetuidad), valdría ${usd(sc)} por acción; el crecimiento aporta ${num(v.res.base.vps - sc, 0, true)} $ hasta los ${usd(v.res.base.vps)} del caso base.`;
    main.append(A.tarjeta('Inversión de crecimiento y su retorno', `Caso base, ${G.unidad(e) === 1000 ? 'miles de millones' : 'millones'} de dólares por año: NOPAT del negocio actual, lo que aporta la inversión nueva y la inversión de crecimiento (CapEx − amortización + NOF). El punto es el flujo de caja libre; TTM = últimos doce meses.`,
      ivLeg, G.caja(250, (c) => { const r = G.inversion(c, e, v); ivLeg.replaceChildren(r.leyenda); }), ivNota));
    const flLeg = h('div');
    main.append(h('div', { class: 'sv-grid2' },
      A.tarjeta('Flujo de caja libre proyectado', `${G.unidad(e) === 1000 ? 'Miles de millones' : 'Millones'} de dólares por año, en cada escenario.`, flLeg, G.caja(220, (c) => flLeg.replaceChildren(G.flujos(c, e, v)))),
      A.tarjeta('Del valor de la empresa al valor por acción', `Caso base, ${G.unidad(e) === 1000 ? 'miles de millones' : 'millones'} de dólares.`, G.caja(250, (c) => G.puente(c, e, v)),
        h('p', { class: 'sv-kpi-r' }, `Patrimonio de ${mill(v.res.base.eq)} ÷ ${num(e.acciones_m, 0)} millones de acciones = ${usd(v.res.base.vps)} por acción en el caso base.`))));
    main.append(h('div', { class: 'sv-grid2' },
      A.tarjeta('Sensibilidad del caso base: WACC × g', 'Valor por acción con el ROIC terminal del caso base fijo. Verde: por encima de la cotización; rojo: por debajo. Recuadro: supuestos actuales.', G.caja(260, (c) => G.sensibilidad(c, e, v, A.S.par, aj))),
      A.tarjeta('Valor por acción según el método', 'Barra: mínimo–máximo; trazo: valor central de cada método; línea vertical: cotización.', G.caja(200, (c) => G.metodos(c, e, v, v.pesoDcf)))));
    main.append(tarjetaProyeccion(e, v));
    main.append(tarjetaComparables(e));
    main.append(h('div', { class: 'sv-grid2' }, tarjetaGraham(e), tarjetaAnalistas(e, v)));
    main.append(tarjetaSupuestos(e, v));
    main.append(tarjetaDescripcion(e));
  };

  function frase(e, v) {
    if (!v.valido) return `Con estos supuestos el WACC queda a menos de 0,5 puntos de g y el valor terminal no tiene sentido económico.`;
    const ms = A.margenSeg(v.central, e.cotizacion);
    const cal = v.central <= 0 ? 'el modelo no le da valor positivo' : ms >= 0.25 ? 'cotiza con un margen de seguridad amplio' : v.pot > 0.05 ? 'cotiza algo por debajo de su valor' : v.pot > -0.05 ? 'cotiza en línea con su valor' : 'cotiza por encima de su valor';
    return `Con ${A.parCambiado() || A.ajCambiado(e.ticker) ? 'estos supuestos' : 'los supuestos por defecto'}, el valor central es de ${usd(v.central)} por acción frente a una cotización de ${usd(e.cotizacion, 2)} (${pct(v.pot, 0, true)}): según el modelo, ${cal}.`;
  }

  function historicoDe(t) {
    const H = A.D.hist || { fechas: [], series: {} }, s = H.series[t] || [];
    return H.fechas.map((f, i) => (s[i] ? { fecha: f, d: new Date(f + 'T00:00:00Z'), central: s[i][0], px: s[i][1] } : null)).filter(Boolean);
  }

  // control deslizante con etiqueta, valor y nota
  function control(id, etiqueta, attrs, valor, txt, nota, alCambiar) {
    const inp = h('input', Object.assign({ class: 'sv-range', id, type: 'range' }, attrs));
    inp.value = valor; inp.style.accentColor = 'var(--s1)';
    inp.addEventListener('input', () => alCambiar(Number(inp.value)));
    return h('div', { class: 'sv-ctrl' }, h('div', { class: 'sv-ctrl-l' }, h('label', { for: id }, etiqueta), h('span', { class: 'sv-ctrl-v' }, txt)), inp, h('span', { class: 'sv-ctrl-d' }, nota));
  }

  function tarjetaAjustes(e, aj, v, vd) {
    const set = (k) => (x) => { aj[k] = x; A.cambio(); };
    const cb = MOTOR.camino(e.trays.base, aj);
    const media5 = (a) => a.slice(0, 5).reduce((s, x) => s + x, 0) / 5;
    const aplica = v.ronicImpl != null || aj.invModo === 'explicito';
    const expl = aj.invModo === 'explicito';
    const seg = h('div', { class: 'sv-seg', role: 'group', 'aria-label': 'Cómo se proyecta el beneficio' },
      [['consenso', 'Margen del consenso'], ['explicito', 'Retorno de la inversión']].map(([m, txt]) => {
        const b = h('button', { type: 'button', 'aria-pressed': String(aj.invModo === m), disabled: m === 'explicito' && !aplica }, txt);
        b.addEventListener('click', () => {
          if (m === 'explicito') { if (aj.ronic == null) aj.ronic = Math.round((v.ronicImpl || 0.15) * 1000) / 1000; aj.invModo = 'explicito'; } else aj.invModo = 'consenso';
          A.cambio();
        });
        return b;
      }));
    const ronic = expl ? aj.ronic : v.ronicImpl;
    const reset = h('button', { type: 'button', class: 'sv-btn' }, 'Volver a los de la empresa');
    reset.addEventListener('click', () => { A.S.aj[e.ticker] = A.ajDef(e); A.cambio(); });
    return A.tarjeta(null, null,
      h('div', { class: 'sv-detail-h' }, h('h2', { class: 'sv-card-t' }, `Supuestos de ${e.nombre}`), reset),
      h('p', { class: 'sv-card-n' }, 'Se aplican a los tres escenarios. El crecimiento se ajusta en los años 1–9 y converge al del año 10; el margen se ajusta a partir del año 3 hasta llegar entero al año 10.'),
      h('div', { class: 'sv-ctrls' },
        control('aj-beta', 'Beta', { min: Math.max(0.3, Math.round((e.beta - 1) * 100) / 100), max: Math.round((e.beta + 1) * 100) / 100, step: 0.01 }, aj.beta, num(aj.beta, 2),
          `Por defecto: ${num(e.beta, 2)} (media de la de Yahoo, ${num(e.beta_yahoo, 2)}, y la de su industria con su deuda, ${num(e.beta_sector_apalancada, 2)})`, set('beta')),
        control('aj-dg', 'Crecimiento de las ventas (años 1–9)', { min: -0.1, max: 0.1, step: 0.005 }, aj.dg, pp(aj.dg, 1),
          `Caso base, media años 1–5: ${pct(media5(cb.gr), 1)} · por defecto: ${pct(media5(e.trays.base.gr), 1)}`, set('dg')),
        control('aj-dm', 'Margen EBITA a largo plazo (año 10)', { min: -0.15, max: 0.15, step: 0.005, disabled: expl }, aj.dm, pp(aj.dm, 1),
          expl ? 'Sin efecto: el margen sale del retorno de la inversión' : `Caso base, año 10: ${pct(cb.mg[9], 1)} · por defecto: ${pct(e.trays.base.mg[9], 1)}`, set('dm'))),
      h('div', { class: 'sv-inv' }, h('p', { class: 'sv-grp-t' }, 'Retorno de la nueva inversión'),
        h('div', { class: 'sv-ctrls' },
          h('div', { class: 'sv-ctrl' }, h('div', { class: 'sv-ctrl-l' }, h('span', null, 'Cómo se proyecta el beneficio')), seg,
            h('span', { class: 'sv-ctrl-d' }, aplica ? 'Por defecto: margen del consenso' : `${e.nombre} apenas necesita capital para crecer: su beneficio no depende de esta palanca.`)),
          control('aj-ronic', 'Rentabilidad de la nueva inversión (RONIC)', { min: 0, max: 0.6, step: 0.005, disabled: !expl }, ronic == null ? 0 : ronic, ronic == null ? 'n.s.' : pct(ronic, 1),
            v.ronicImpl != null ? `Implícita en el consenso: ${pct(v.ronicImpl, 1)} · WACC ${pct(v.w, 1)}` : 'No significativa', set('ronic')),
          control('aj-lag', 'Años hasta que la inversión rinde', { min: 1, max: 3, step: 1, disabled: !aplica }, aj.lag, aj.lag === 1 ? '1 año' : `${aj.lag} años`, 'La inversión de un año empieza a rendir en el año indicado después', set('lag')))),
      A.ajCambiado(e.ticker) && vd ? h('p', { class: 'sv-kpi-r' }, `Con los supuestos por defecto de la empresa: valor central ${usd(vd.central)} (${pct(vd.pot, 0, true)}).`) : null);
  }

  function tarjetaProyeccion(e, v) {
    const U = G.unidad(e), uTxt = U === 1000 ? 'miles de millones de $' : 'millones de $';
    const r = v.res.base;
    const filas = [
      ['Ventas', (f) => num(f.ventas / U, U === 1000 ? 1 : 0), num(e.ventas_ttm / U, U === 1000 ? 1 : 0)],
      ['Crecimiento', (f) => pct(f.crecimiento, 1), '—'],
      ['Margen EBITA', (f) => pct(f.margen, 1), pct(e.ebit_ttm / e.ventas_ttm, 1)],
      ['NOPAT', (f) => num(f.nopat / U, U === 1000 ? 1 : 0), num(r.nopat0 / U, U === 1000 ? 1 : 0)],
      ['Inversión neta', (f) => num(f.reinv / U, U === 1000 ? 1 : 0), num(r.reinv0 / U, U === 1000 ? 1 : 0)],
      ['Flujo de caja libre', (f) => num(f.fcff / U, U === 1000 ? 1 : 0), num((r.nopat0 - r.reinv0) / U, U === 1000 ? 1 : 0)],
    ];
    const tabla = h('table', { class: 'sv-table ap-proy' },
      h('thead', null, h('tr', null, h('th', null, uTxt), h('th', null, 'TTM'), r.filas.map((f) => h('th', null, `Año ${f.anio}`)))),
      h('tbody', null, filas.map(([n, fn, ttm]) => h('tr', null, h('td', null, n), h('td', null, ttm), r.filas.map((f) => h('td', null, fn(f)))))));
    return A.tarjeta('Proyección del caso base', 'Años 1–2: consenso de analistas; años 3–10: convergencia lineal al crecimiento y al margen de largo plazo. EBITA = beneficio operativo antes de la amortización de intangibles adquiridos.', h('div', { class: 'sv-tw' }, tabla));
  }

  function tarjetaComparables(e) {
    const mu = e.mu || {}, Vs = A.valores();
    const peers = (mu.comparables || []).map((t) => A.D.porT[t]).filter(Boolean);
    const nivel = { subindustria: 'de su misma subindustria', industria: 'de su industria (la subindustria tiene pocas empresas comparables)', sector: 'de su sector (la industria tiene pocas empresas comparables)' }[mu.nivel] || '';
    const filas = [e].concat(peers);
    return A.tarjeta('Comparables y múltiplos adelantados', `Empresas del S&P 500 ${nivel}, las más parecidas en tamaño. Se descartan PER adelantados por encima de 60 y EV/EBITDA por encima de 40. Mediana: PER ${veces(mu.per_mediana)} → ${usd(mu.per_valor_mediana)} por acción; EV/EBITDA ${veces(mu.ev_ebitda_mediana)} → ${usd(mu.ev_ebitda_valor_mediana)}.`,
      A.tabla([
        { t: 'Empresa', v: (x) => x.nombre, f: (x) => (x === e ? h('b', null, `${x.nombre} (esta empresa)`) : nomCelda(x)), texto: true },
        { t: 'Subindustria', f: (x) => x.subindustria, cls: 'sv-sec-col' },
        { t: 'Capitalización', v: (x) => x.cap, f: (x) => mill(x.cap) },
        { t: 'PER adelantado', v: (x) => (x.adelantados || {}).per, f: (x) => veces((x.adelantados || {}).per) },
        { t: 'EV/EBITDA adelantado', v: (x) => (x.adelantados || {}).ev_ebitda, f: (x) => veces((x.adelantados || {}).ev_ebitda) },
        { t: 'Potencial', v: (x) => (A.fiable(x, Vs[x.ticker]) ? Vs[x.ticker].pot : null), f: (x) => potCelda(x, Vs[x.ticker]) },
      ], filas, { clic: (x) => x !== e && irEmp(x) }));
  }

  function tarjetaGraham(e) {
    const gr = A.graham(e), g = e.graham || {};
    return A.tarjeta(`Criterios de Graham: ${gr.puntos} de ${gr.total}`, 'Criterios del inversor defensivo de Benjamin Graham (The Intelligent Investor), adaptados a los datos disponibles: los históricos cubren unos 4 años, no 10 o 20.',
      h('ul', { class: 'ap-checks' }, gr.items.map((i) => h('li', { class: i.ok ? 'ap-ok' : 'ap-no' }, h('span', { class: 'ap-check', 'aria-hidden': 'true' }, i.ok ? '✓' : '✗'),
        h('span', { class: 'ap-check-t' }, i.t), h('span', { class: 'ap-check-v' }, i.v), h('span', { class: 'ap-sr' }, i.ok ? ' (cumple)' : ' (no cumple)')))),
      h('p', { class: 'sv-kpi-r' }, `BPA de los últimos doce meses ${usd(g.bpa, 2)} · valor contable por acción ${usd(g.vc, 2)} · número de Graham ${usd(g.ng, 2)}` + (g.ng ? ` (${pct(e.cotizacion / g.ng - 1, 0, true)} la cotización)` : '')));
  }

  function tarjetaAnalistas(e, v) {
    const a = e.analistas || {};
    const REC = { strong_buy: 'compra fuerte', buy: 'compra', hold: 'mantener', underperform: 'peor que el mercado', sell: 'venta', none: '—' };
    return A.tarjeta('Consenso de los analistas', 'Precio objetivo a doce meses según Yahoo Finance. Sirve de contraste: no forma parte del modelo, que solo usa sus previsiones de ventas y BPA.',
      h('dl', { class: 'ap-dl' },
        h('dt', null, 'Precio objetivo medio'), h('dd', null, a.objetivo ? `${usd(a.objetivo, 0)} (${pct(a.objetivo / e.cotizacion - 1, 0, true)})` : '—'),
        h('dt', null, 'Rango de objetivos'), h('dd', null, a.bajo ? `${usd(a.bajo, 0)} – ${usd(a.alto, 0)}` : '—'),
        h('dt', null, 'Recomendación media'), h('dd', null, a.recomendacion ? `${REC[a.recomendacion] || a.recomendacion} (${num(a.media, 1)} en una escala de 1 a 5)` : '—'),
        h('dt', null, 'Analistas'), h('dd', null, a.n ? String(a.n) : '—'),
        h('dt', null, 'Valor central del modelo'), h('dd', null, v ? `${usd(v.central)} (${pct(v.pot, 0, true)})` : '—')));
  }

  function tarjetaSupuestos(e, v) {
    const T = e.tr, dl = (pares) => h('dl', { class: 'ap-dl' }, pares.map(([k, x]) => [h('dt', null, k), h('dd', null, x)]));
    const MODO = { calibrado: 'BPA del consenso convertido en EBITA con la diferencia entre BPA publicado y EBITA de los últimos doce meses',
      ajustado: 'BPA "ajustado" del consenso (muy por encima del contable): EBITA ajustado menos la remuneración en acciones',
      bruto: 'BPA del consenso más los intereses netos (los últimos doce meses incluyen partidas extraordinarias)',
      historico: 'sin consenso utilizable: crecimiento y margen de los últimos doce meses' };
    const esc = A.ESC.map((sc, i) => h('tr', null, h('td', null, A.NOM_ESC[sc]), h('td', null, pct(T.g1[i], 1)), h('td', null, pct(T.g2[i], 1)), h('td', null, pct(T.m1[i], 1)), h('td', null, pct(T.m2[i], 1)), h('td', null, pct(T.m10[i], 1)), h('td', null, usd(v.res[sc].vps))));
    return A.tarjeta('Datos y supuestos del modelo', `Cifras de los últimos doce meses hasta el ${fecha(e.fecha_ttm)} y balance del ${fecha(e.fecha_balance)} (Yahoo Finance, millones de dólares).`,
      h('div', { class: 'sv-grid2' },
        dl([['Ventas TTM', mill(e.ventas_ttm)], ['EBITA TTM (margen)', `${mill(e.ebit_ttm)} (${pct(e.ebit_ttm / e.ventas_ttm, 1)})`],
          ['EBIT contable', mill(e.ebit_contable)], ['Amortización de intangibles adquiridos', mill(e.amortizacion_intangibles)],
          ['Amortización (sin intangibles adquiridos)', `${mill(e.da_ttm)} (${pct(e.da_ttm / e.ventas_ttm, 1)} de las ventas)`], ['CapEx', `${mill(e.capex_ttm)} (${pct(e.capex_ttm / e.ventas_ttm, 1)})`],
          ['NOF / ventas', pct(e.nof_ventas_ttm, 1)], ['Capital invertido', mill(e.capital_invertido)], ['Tipo impositivo', pct(e.tipo_impositivo, 1)],
          ['Remuneración en acciones', mill(e.sbc_ttm)]]),
        dl([['Deuda financiera bruta', mill(e.deuda_bruta)], ['Deuda neta', mill(e.deuda_financiera_neta)], ['Inversiones no operativas', mill(e.inversiones_no_operativas)],
          ['Minoritarios y preferentes', mill((e.minoritarios || 0) + (e.preferentes || 0))], ['Acciones (diluidas)', `${num(e.acciones_m, 1)} millones`],
          ['Rating sintético', `${e.rating}${e.cobertura != null ? ` (cobertura de intereses ${num(e.cobertura, 1)}x)` : ' (por deuda / EBITDA)'} · diferencial ${pct(e.diferencial, 2)}`],
          ['Beta', `${num(e.beta, 2)} = media de Yahoo (${num(e.beta_yahoo, 2)}) y de su industria reapalancada (${num(e.beta_sector_apalancada, 2)})`],
          ['Margen de referencia (mediana de comparables)', pct(e.margen_referencia, 1)], ['Años 1–2', MODO[T.modo] || '—']])),
      h('div', { class: 'sv-tw' }, h('table', { class: 'sv-table ap-esc' },
        h('thead', null, h('tr', null, ['Escenario', 'Crec. año 1', 'Crec. año 2', 'Margen año 1', 'Margen año 2', 'Margen año 10', 'DCF por acción'].map((x) => h('th', null, x)))),
        h('tbody', null, esc))),
      h('p', { class: 'sv-kpi-r' }, `Crecimiento del año 10: ${pct(T.g10, 1)} en los tres escenarios; amortización ${pct(T.da, 1)} de las ventas; CapEx del ${pct(T.cx0, 1)} al ${pct(T.cx10, 1)}; NOF ${pct(T.nof, 1)} de las ventas.`));
  }

  function tarjetaDescripcion(e) {
    const p = h('p', { class: 'ap-desc' }, 'Cargando la descripción…');
    const extra = h('p', { class: 'sv-kpi-r' });
    A.descripciones().then((D) => {
      const d = D[e.ticker];
      if (!d || !d.d) { p.textContent = 'Sin descripción disponible.'; return; }
      p.textContent = d.d;
      const partes = [d.empleados ? `${num(d.empleados, 0)} empleados` : null, [d.ciudad, d.pais].filter(Boolean).join(', ') || null].filter(Boolean);
      extra.replaceChildren(partes.join(' · '), d.web ? [' · ', h('a', { href: d.web, target: '_blank', rel: 'noopener' }, d.web.replace(/^https?:\/\/(www\.)?/, ''))] : '');
    }).catch(() => { p.textContent = 'Sin descripción disponible.'; });
    return A.tarjeta('La empresa', 'Descripción de Yahoo Finance (en inglés).', p, extra);
  }

  // ---------------------------------------------------------------- COMPARAR
  V.comparar = function (main, [lista]) {
    if (lista) {
      const ts = lista.split(',').map((x) => x.trim().toUpperCase()).filter((x) => A.D.porT[x]).slice(0, A.MAX_CMP);
      if (ts.length && ts.join(',') !== A.S.cmp.join(',')) { A.S.cmp = ts; try { localStorage.setItem('sp-cmp', JSON.stringify(ts)); } catch (e) {} }
    }
    const ts = A.S.cmp.slice(), Vs = A.valores();
    main.append(h('header', { class: 'sv-head' }, h('h1', { class: 'sv-h1' }, 'Comparar empresas'),
      h('p', { class: 'sv-take' }, `Hasta ${A.MAX_CMP} empresas lado a lado, con los mismos supuestos generales. Añádelas con el botón "+ Comparar" de cualquier tabla o ficha, o aquí debajo.`)));
    // selector
    const inp = h('input', { type: 'search', class: 'ap-in', placeholder: 'Añadir empresa (nombre o ticker)…', 'aria-label': 'Añadir empresa al comparador', id: 'cmp-bus', autocomplete: 'off' });
    const sug = h('div', { class: 'sv-chips ap-sug' });
    inp.addEventListener('input', () => {
      const q = A.sinAcentos(inp.value.trim()); sug.replaceChildren();
      if (!q) return;
      A.D.emp.filter((e) => e.busca.includes(q) && !ts.includes(e.ticker)).sort((a, b) => (b.cap || 0) - (a.cap || 0)).slice(0, 6).forEach((e) => {
        const b = h('button', { type: 'button', class: 'sv-chip' }, `${e.nombre} (${e.ticker})`);
        b.addEventListener('click', () => { A.alternarCmp(e.ticker); A.ir('#/comparar/' + A.S.cmp.join(',')); });
        sug.append(b);
      });
    });
    const chips = h('div', { class: 'sv-chips' }, ts.map((t) => {
      const e = A.D.porT[t];
      const b = h('button', { type: 'button', class: 'sv-chip', 'aria-label': `Quitar ${e.nombre}` }, `${e.nombre} ✕`);
      b.addEventListener('click', () => { A.alternarCmp(t); A.ir('#/comparar/' + A.S.cmp.join(',')); });
      return b;
    }));
    main.append(h('section', { class: 'sv-card' }, h('div', { class: 'ap-cmp-sel' }, chips, inp), sug,
      ts.length ? h('p', { class: 'sv-kpi-r' }, 'Enlace para compartir esta comparación: ', h('a', { href: '#/comparar/' + ts.join(',') }, location.href.split('#')[0] + '#/comparar/' + ts.join(','))) : null));
    if (ts.length < 2) { main.append(h('p', { class: 'sv-card-n' }, 'Elige al menos dos empresas para compararlas.')); return; }
    const E = ts.map((t) => A.D.porT[t]);
    const val = E.filter((e) => e.valorada && Vs[e.ticker]);
    const col = (i) => G.colores[i % G.colores.length];
    if (val.length) main.append(A.tarjeta('Valor central frente a la cotización', 'Barra: rango bajo–alto; punto: valor central, en % frente a la cotización.',
      G.caja(val.length * 34 + 44, (c) => G.rangos(c, val.map((e) => { const v = Vs[e.ticker]; return { id: e.ticker, n: e.nombre, lo: v.bajo / e.cotizacion - 1, ce: v.pot, hi: v.alto / e.cotizacion - 1 }; }), { rowH: 34, clic: (d) => A.ir('#/empresa/' + d.id) }))));
    // tabla de métricas
    const fil = [
      ['Sector', (e) => e.sector], ['Subindustria', (e) => e.subindustria], ['Cotización', (e) => usd(e.cotizacion, 2)], ['Capitalización', (e) => mill(e.cap)],
      ['Valor central', (e, v) => (v ? usd(v.central) : '—'), true], ['Potencial', (e, v) => (v ? A.potSpan(v.pot) : '—'), true], ['Margen de seguridad', (e, v) => (v && v.central > 0 ? pct(A.margenSeg(v.central, e.cotizacion), 0) : '—')],
      ['Rango (bajo – alto)', (e, v) => (v ? `${usd(v.bajo)} – ${usd(v.alto)}` : '—')],
      ['DCF pesimista · base · optimista', (e, v) => (v ? A.ESC.map((sc) => num(v.res[sc].vps, 0)).join(' · ') : '—')], ['Valor por múltiplos', (e, v) => (v ? usd(v.mm) : '—')],
      ['WACC', (e, v) => (v ? pct(v.w, 1) : '—')], ['Beta', (e) => num(e.beta, 2)], ['Rating sintético', (e) => e.rating || '—'],
      ['Crecimiento de ventas año 1 · año 2', (e) => (e.tr ? `${pct(e.tr.g1[1], 1)} · ${pct(e.tr.g2[1], 1)}` : '—')],
      ['Margen EBITA TTM · año 2 · año 10', (e) => (e.tr ? `${pct(e.ebit_ttm / e.ventas_ttm, 1)} · ${pct(e.tr.m2[1], 1)} · ${pct(e.tr.m10[1], 1)}` : '—')],
      ['Crecimiento que descuenta la cotización', (e, v) => { if (!v || !v.valido) return '—'; const g = MOTOR.crecimientoImplicito(e, e.trays, A.S.par, A.aj(e.ticker), v.w, v.res.base.roicT); return g == null ? 'n.s.' : pct(g, 1); }],
      ['Peso del valor terminal', (e, v) => (v ? pct(v.res.base.pesoTv, 0) : '—')],
      ['PER adelantado · EV/EBITDA adelantado', (e) => `${veces((e.adelantados || {}).per)} · ${veces((e.adelantados || {}).ev_ebitda)}`],
      ['PER TTM · precio / valor contable', (e) => `${veces((e.graham || {}).per)} · ${veces((e.graham || {}).pb)}`],
      ['Número de Graham', (e) => usd((e.graham || {}).ng, 2)], ['Criterios de Graham', (e) => `${A.graham(e).puntos} de ${A.CRITERIOS.length}`],
      ['Rentabilidad por dividendo', (e) => pct((e.graham || {}).div, 1)], ['Deuda neta / EBITDA', (e) => veces((e.graham || {}).dn_ebitda)],
      ['Precio objetivo de los analistas', (e) => (e.analistas && e.analistas.objetivo ? `${usd(e.analistas.objetivo, 0)} (${pct(e.analistas.objetivo / e.cotizacion - 1, 0, true)})` : '—')],
    ];
    main.append(A.tarjeta('Indicadores', null, h('div', { class: 'sv-tw' }, h('table', { class: 'sv-table ap-cmp-t' },
      h('thead', null, h('tr', null, h('th', null, ''), E.map((e, i) => h('th', null, h('a', { href: '#/empresa/' + e.ticker }, h('i', { class: 'ap-pt', style: { background: col(i) } }), e.nombre))))),
      h('tbody', null, fil.map(([n, f, fuerte]) => h('tr', null, h('td', null, n), E.map((e) => { const v = e.valorada ? Vs[e.ticker] : null; const x = f(e, v); return h('td', { class: fuerte ? 'sv-strong' : null }, x instanceof Node ? x : String(x)); }))))))));
    if (val.length >= 2) {
      const anios = d3.range(1, 11).map(String);
      const serie = (fn) => val.map((e, i) => ({ n: e.nombre, color: col(E.indexOf(e)), puntos: anios.map((a, k) => [a, fn(e, Vs[e.ticker], k)]) }));
      main.append(h('div', { class: 'sv-grid2' },
        A.tarjeta('Crecimiento de las ventas (caso base)', 'Años 1–2 del consenso y convergencia al 3,5 % del año 10.', G.leyenda(val.map((e) => [e.nombre, col(E.indexOf(e))])),
          G.caja(220, (c) => G.lineas(c, serie((e, v, k) => v.res.base.filas[k].crecimiento), { fmtY: (d) => pct(d, 0), prefijo: 'Año ' }))),
        A.tarjeta('Margen EBITA (caso base)', 'Margen sobre ventas de cada año proyectado.', G.leyenda(val.map((e) => [e.nombre, col(E.indexOf(e))])),
          G.caja(220, (c) => G.lineas(c, serie((e, v, k) => v.res.base.filas[k].margen), { fmtY: (d) => pct(d, 0), prefijo: 'Año ' })))));
      main.append(A.tarjeta('Flujo de caja libre (caso base, año 0 = 100)', 'Evolución del flujo de caja libre de cada empresa en índice, para comparar ritmos con tamaños distintos (solo empresas con flujo positivo en los últimos doce meses).', G.leyenda(val.map((e) => [e.nombre, col(E.indexOf(e))])),
        G.caja(220, (c) => {
          const pos = val.filter((e) => { const r = Vs[e.ticker].res.base; return r.nopat0 - r.reinv0 > 0; });
          if (!pos.length) { c.replaceChildren(h('p', { class: 'sv-card-n' }, 'Ninguna de estas empresas tiene flujo de caja libre positivo en los últimos doce meses.')); return; }
          G.lineas(c, pos.map((e) => { const r = Vs[e.ticker].res.base, b = r.nopat0 - r.reinv0; return { n: e.nombre, color: col(E.indexOf(e)), puntos: ['0'].concat(anios).map((a, k) => [a, k === 0 ? 100 : r.filas[k - 1].fcff / b * 100]) }; }), { fmtY: (d) => num(d, 0), prefijo: 'Año ' });
        })));
    }
  };

  // ---------------------------------------------------------------- INFORME (imprimible)
  V.informe = function (main, [t]) {
    const e = A.D.porT[String(t || '').toUpperCase()];
    if (!e || !e.valorada) { main.append(h('p', { class: 'sv-warn' }, 'No hay informe para esta empresa.'), A.enlace('#/mercado', 'Volver al mercado')); return; }
    const aj = A.aj(e.ticker), v = A.valor(e.ticker), Vd = A.valoresDef()[e.ticker];
    const gi = MOTOR.crecimientoImplicito(e, e.trays, A.S.par, aj, v.w, v.res.base.roicT);
    const ms = A.margenSeg(v.central, e.cotizacion), gr = A.graham(e), av = A.avisosDe(e, v);
    const cb = MOTOR.camino(e.trays.base, aj), media5 = cb.gr.slice(0, 5).reduce((s, x) => s + x, 0) / 5;
    const cambiado = A.parCambiado() || A.ajCambiado(e.ticker);
    const veredicto = v.central <= 0 || !v.valido ? 'Sin valor significativo con este modelo' : ms >= 0.25 ? 'Infravalorada con margen de seguridad (≥ 25 %)' : v.pot > 0.05 ? 'Ligeramente infravalorada' : v.pot >= -0.05 ? 'En línea con su valor' : v.pot >= -0.25 ? 'Ligeramente sobrevalorada' : 'Sobrevalorada';
    const imprimir = h('button', { type: 'button', class: 'ap-inst' }, 'Imprimir o guardar en PDF');
    imprimir.addEventListener('click', () => window.print());
    const P = (txt) => h('p', null, txt);
    const est = A.D.estado || {};
    main.append(h('div', { class: 'ap-inf-bar no-print' }, A.migas([['Mercado', '#/mercado'], [e.nombre, '#/empresa/' + e.ticker], ['Informe']]), imprimir));
    const doc = h('article', { class: 'ap-inf' },
      h('header', { class: 'ap-inf-cab' },
        h('p', { class: 'ap-inf-mini' }, `Informe de valoración · Simulador S&P 500 · datos del ${fecha(est.fecha_mercado || A.D.pa.fecha_cotizacion)}`),
        h('h1', null, `${e.empresa} (${e.ticker})`),
        h('p', { class: 'ap-inf-sub' }, `${e.sector} · ${e.industria} · ${e.subindustria}`)),
      h('section', { class: 'ap-inf-res' },
        h('div', null, h('p', { class: 'ap-inf-l' }, 'Valor central'), h('p', { class: 'ap-inf-n' }, usd(v.central)), h('p', { class: 'ap-inf-l' }, `Rango ${usd(v.bajo)} – ${usd(v.alto)}`)),
        h('div', null, h('p', { class: 'ap-inf-l' }, 'Cotización'), h('p', { class: 'ap-inf-n' }, usd(e.cotizacion, 2)), h('p', { class: 'ap-inf-l' }, `Capitalización ${mill(e.cap)}`)),
        h('div', null, h('p', { class: 'ap-inf-l' }, 'Potencial'), h('p', { class: 'ap-inf-n ' + A.clsPot(v.pot) }, pct(v.pot, 0, true)), h('p', { class: 'ap-inf-l' }, ms != null && ms > 0 ? `Margen de seguridad ${pct(ms, 0)}` : 'Sin margen de seguridad')),
        h('div', null, h('p', { class: 'ap-inf-l' }, 'Conclusión del modelo'), h('p', { class: 'ap-inf-v' }, veredicto), h('p', { class: 'ap-inf-l' }, `Criterios de Graham: ${gr.puntos} de ${gr.total}`))),
      h('h2', null, '1. Resumen'),
      P(`${frase(e, v)} El DCF ponderado por escenarios da ${usd(v.pond)} por acción (pesimista ${usd(v.res.pes.vps)}, base ${usd(v.res.base.vps)} y optimista ${usd(v.res.opt.vps)}, con probabilidades del ${pct(A.S.par.prob.pes, 0)}, ${pct(A.S.par.prob.base, 0)} y ${pct(A.S.par.prob.opt, 0)})` +
        (v.mm != null ? ` y los múltiplos adelantados de sus comparables, ${usd(v.mm)}; el valor central pondera un ${pct(v.pesoDcf, 0)} el DCF y un ${pct(1 - v.pesoDcf, 0)} los múltiplos.` : '; no hay comparables con múltiplos válidos, así que el valor central es el DCF.')),
      P(gi == null ? 'No se puede calcular el crecimiento que descuenta la cotización con estos supuestos.' :
        `La cotización actual descuenta un crecimiento de las ventas del ${pct(gi, 1)} anual en los próximos cinco años, frente al ${pct(media5, 1)} del caso base (consenso de analistas en los años 1–2). ` +
        (gi > media5 ? 'El mercado espera más crecimiento que el modelo.' : 'El mercado espera menos crecimiento que el modelo.')),
      cambiado && Vd ? P(`Este informe usa supuestos modificados en el simulador. Con los supuestos por defecto, el valor central sería ${usd(Vd.central)} (${pct(Vd.pot, 0, true)}).`) : null,
      av.length ? h('div', { class: 'ap-inf-av' }, h('p', null, h('b', null, 'Avisos sobre la fiabilidad: ')), h('ul', null, av.map((a) => h('li', null, (A.AVISOS[a] || { t: a }).t)))) : null,
      h('h2', null, '2. Valor por método'),
      G.caja(200, (c) => G.metodos(c, e, v, v.pesoDcf)),
      h('h2', null, '3. Proyección y flujos de caja'),
      P(`Ventas de los últimos doce meses: ${mill(e.ventas_ttm)}, con un margen EBITA del ${pct(e.ebit_ttm / e.ventas_ttm, 1)}. En el caso base, las ventas crecen un ${pct(e.tr.g1[1], 1)} el año 1 y un ${pct(e.tr.g2[1], 1)} el año 2 y convergen al ${pct(e.tr.g10, 1)} en el año 10; el margen pasa del ${pct(e.tr.m2[1], 1)} del año 2 al ${pct(cb.mg[9], 1)} del año 10.`),
      tarjetaProyeccion(e, v),
      G.leyenda([['Base', 'var(--s1)'], ['Pesimista', 'var(--s2)'], ['Optimista', 'var(--s3)']]),
      G.caja(220, (c) => G.flujos(c, e, v)),
      h('h2', null, '4. Coste del capital y sensibilidad'),
      P(`WACC del ${pct(v.w, 2)}: coste de los recursos propios del ${pct(v.W.ke, 2)} (tipo sin riesgo ${pct(A.S.par.rf, 2)} + beta ${num(v.W.beta, 2)} × prima de riesgo ${pct(A.S.par.erp, 2)}) y coste de la deuda del ${pct(v.W.kd, 2)} (rating sintético ${e.rating}), con un ${pct(v.W.wd, 0)} de deuda. Valor terminal por ${A.S.par.metodoVt === 'gordon' ? 'Gordon' : 'inductores de valor'} con g = ${pct(v.g, 2)}: pesa el ${pct(v.res.base.pesoTv, 0)} del valor en el caso base.`),
      G.caja(260, (c) => G.sensibilidad(c, e, v, A.S.par, aj)),
      h('h2', null, '5. Del valor de la empresa al valor por acción'),
      G.caja(250, (c) => G.puente(c, e, v)),
      h('h2', null, '6. Comparables, Graham y analistas'),
      tarjetaComparables(e), tarjetaGraham(e), tarjetaAnalistas(e, v),
      h('h2', null, '7. Datos y supuestos'),
      tarjetaSupuestos(e, v),
      h('p', { class: 'ap-inf-pie' }, 'Modelo automático con reglas comunes para todas las empresas del S&P 500 (consenso de analistas en los años 1–2, convergencia a largo plazo, WACC por CAPM y múltiplos de comparables de su subindustria). Herramienta formativa: no es una recomendación de inversión. Datos de Yahoo Finance.'));
    main.append(doc);
  };

  // ---------------------------------------------------------------- MÉTODO
  V.metodo = function (main) {
    const R = (A.D.estado || {}).no_valoradas || {};
    const li = (b, txt) => h('li', null, h('b', null, b + ' '), txt);
    main.append(h('header', { class: 'sv-head' }, h('h1', { class: 'sv-h1' }, 'Cómo se calcula'),
      h('p', { class: 'sv-take' }, 'Las mismas reglas para todas las empresas, con los criterios del modelo de las 7 Magníficas pero sin ajustes manuales empresa a empresa.')));
    main.append(A.tarjeta('Valoración', null, h('ul', { class: 'sv-method' },
      li('Datos.', 'Lista del S&P 500 con su clasificación GICS (Wikipedia). Estados financieros normalizados de los últimos doce meses y del último balance trimestral, cotizaciones, betas y consenso de analistas de Yahoo Finance. Se actualizan cada lunes.'),
      li('Años 1–2.', 'Consenso de ventas y BPA (mínimo, medio y máximo) llevado a doce meses desde el último trimestre publicado. El BPA se convierte en beneficio operativo con la diferencia que había en los últimos doce meses entre el BPA publicado y el beneficio operativo; si el consenso usa un BPA "ajustado" muy distinto del contable, se resta la remuneración en acciones.'),
      li('Años 3–10.', 'El crecimiento converge linealmente al 3,5 % del año 10; el margen converge a un margen de largo plazo que recorre un 30 % de la distancia hasta la mediana de sus comparables (sin moverse más de un 30 % respecto al del año 2). Escenario pesimista: −15 % de margen a largo plazo; optimista: +10 %.'),
      li('EBITA.', 'Se usa el beneficio operativo antes de la amortización de intangibles adquiridos y, en coherencia, la amortización que se suma al flujo es solo la de los activos propios.'),
      li('Inversión.', 'CapEx sobre ventas de los últimos doce meses que converge a 1,25 veces la amortización si hoy es mayor; NOF constantes sobre ventas.'),
      li('WACC.', 'Ke = tipo sin riesgo + beta × prima de riesgo. Beta = media de la beta de Yahoo (5 años) y la beta de su industria desapalancada y vuelta a apalancar con la deuda de la empresa, con un mínimo de 0,6. Coste de la deuda = tipo sin riesgo + diferencial por rating sintético (cobertura de intereses).'),
      li('Valor terminal.', 'Por inductores: NOPAT del año 11 × (1 − g / ROIC terminal) / (WACC − g), con el ROIC terminal entre el WACC y el ROIC del año 10 (tope del 40 %). Alternativa: Gordon.'),
      li('Múltiplos.', 'PER y EV/EBITDA adelantados de las empresas del S&P 500 de su misma subindustria (o industria o sector si hay menos de tres), las diez más parecidas en tamaño; se descartan PER por encima de 60 y EV/EBITDA por encima de 40.'),
      li('Valor central.', '50 % DCF ponderado por escenarios (25/50/25) + 50 % media de los valores por PER y EV/EBITDA. Margen de seguridad = 1 − cotización ÷ valor.'),
      li('Fiabilidad.', 'Se marcan las valoraciones con beneficio operativo negativo, patrimonio negativo en algún escenario, valor central menor del 20 % o mayor del triple de la cotización, sin consenso o con mucho peso del valor terminal. Las graves se excluyen por defecto del filtro de oportunidades.'))));
    main.append(A.tarjeta('Filtro de oportunidades (inversión en valor)', null, h('ul', { class: 'sv-method' },
      li('Idea.', 'Benjamin Graham proponía comprar solo con un margen de seguridad: que el valor estimado supere con holgura a la cotización, para cubrir errores de estimación.'),
      li('Valor de referencia.', 'Puedes exigir el margen sobre el valor bajo (el más prudente), el DCF pesimista, el valor central, el DCF base o el valor alto.'),
      li('Criterios del inversor defensivo.', 'PER ≤ 15; precio/valor contable ≤ 1,5 (o PER × P/VC ≤ 22,5); liquidez ≥ 2; deuda neta ≤ 3 × EBITDA; beneficios y dividendos todos los años disponibles; crecimiento del BPA ≥ 10 %; cotización por debajo del número de Graham. Los históricos de Yahoo cubren unos 4 años, no los 10–20 que pedía Graham.'),
      li('Aviso.', 'Es un filtro para encontrar candidatas que estudiar a fondo, no una recomendación de compra: el modelo es automático y no conoce hechos recientes (fusiones, litigios, cambios de negocio).'))));
    main.append(A.tarjeta('Empresas sin valorar en esta fase', 'Bancos, aseguradoras, gestoras y REIT necesitan otro modelo (rentabilidad sobre recursos propios frente a su coste, o valor de los activos); llegarán en la fase 2.',
      h('ul', { class: 'sv-method' }, Object.entries(R).map(([m, n]) => h('li', null, `${m}: ${n}`)))));
    main.append(A.tarjeta('Versión', null, h('p', { class: 'sv-card-n' }, `App ${A.VERSION}. Datos actualizados el ${fecha((A.D.estado || {}).actualizado)}.`)));
  };
})(window.APP);
