// Simulador S&P 500 · páginas: mercado, sector, industria, empresa, comparador, informe y método.
(function (A) {
  const { h, num, pct, pp, usd, mill, fecha, veces, G } = A;
  const V = A.vistas;

  // ---------------------------------------------------------------- utilidades comunes
  // avisos, fiabilidad y criterios de Graham: comunes con el actualizador semanal (js/criterios.js)
  A.avisosDe = CRIT.avisosDe; A.fiable = CRIT.fiable; A.margenSeg = CRIT.margenSeg;
  A.CRITERIOS = CRIT.CRITERIOS; A.graham = CRIT.graham;

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
      { t: 'Graham', v: (e) => A.graham(e).puntos, f: (e) => { const g = A.graham(e); return `${g.puntos}/${g.total}`; }, ayuda: 'Criterios del inversor defensivo de Graham que cumple (de los que se le aplican)' },
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
        h('p', { class: 'sv-meta' }, `Cotizaciones del ${fecha(est.fecha_mercado || A.D.pa.fecha_cotizacion)} · ${R.nv} de ${R.n} empresas valoradas: DCF de flujos, beneficio residual (financieras y eléctricas reguladas) y AFFO (REIT) · importes en dólares`)),
      avisosGenerales() || '',
    );
    const cand = R.val.filter((e) => A.margenSeg(Vs[e.ticker].central, e.cotizacion) >= 0.25);
    main.append(h('section', { class: 'sv-kpis' },
      A.kpi('Cotizan por debajo de su valor central', String(R.bajo), `de ${R.nf} valoraciones fiables (${pct(R.bajo / R.nf, 0)}) · por defecto ${def.bajo}`),
      A.kpi('Potencial mediano', pct(R.med, 0, true), `Por defecto: ${pct(def.med, 0, true)}`, A.clsPot(R.med)),
      A.kpi('Valor agregado frente a la capitalización', pct(R.agregado, 0, true), `Suma de valores centrales ÷ capitalización · por defecto ${pct(def.agregado, 0, true)}`, A.clsPot(R.agregado)),
      h('a', { class: 'sv-card sv-kpi ap-kpi-link', href: '#/oportunidades' }, h('p', { class: 'sv-kpi-l' }, 'Con margen de seguridad de al menos el 25 %'), h('p', { class: 'sv-num' }, String(cand.length)), h('p', { class: 'sv-kpi-r' }, 'Ver el filtro de oportunidades ›')),
    ));

    // mapa del mercado
    const secs = Object.keys(A.D.jer).sort((a, b) => a.localeCompare(b, 'es'));
    const grupos = secs.map((s) => ({ n: s, hijos: Object.values(A.D.jer[s]).flat().filter((e) => e.cap > 0 && !e.principal).map((e) => {
      const v = Vs[e.ticker], ok = A.fiable(e, v);
      return { id: e.ticker, n: e.nombre, cap: e.cap, pot: ok ? v.pot : null, gris: !ok, e };
    }) })).filter((g) => g.hijos.length);
    const escala = h('div', { class: 'ap-mapa-esc', 'aria-hidden': 'true' }, h('span', null, '−50 %'), h('i'), h('span', null, '+50 %'));
    main.append(A.tarjeta('Mapa del mercado', 'Cada rectángulo es una empresa, con un tamaño proporcional a su capitalización, agrupada por sector. Verde: cotiza por debajo de su valor central; rojo: por encima; gris: sin valoración fiable. Pulsa una empresa para ver su ficha.',
      h('div', { class: 'ap-mapa-ley' }, escala, h('span', { class: 'sv-ctrl-d' }, 'Potencial con los supuestos actuales')),
      G.caja(window.innerWidth < 600 ? 520 : 480, (c) => G.mapa(c, grupos, {
        clic: (d) => A.ir('#/empresa/' + d.id),
        tip: (d, g) => { const v = Vs[d.id]; return [[`${d.n} (${d.id})`, null, 'sv-tip-h'], [`${g.n} · ${mill(d.cap)}`], [`Cotización: ${usd(d.e.cotizacion, 2)}`]].concat(
          d.pot != null ? [[`Valor central: ${usd(v.central)} (${pct(d.pot, 0, true)})`]] : [[d.e.valorada ? 'Valoración poco fiable: ver avisos' : 'Sin valorar']]); },
      }))));

    // sectores
    const filas = secs.map((s) => { const grupo = Object.values(A.D.jer[s]).flat(); return Object.assign({ s }, resumen(grupo, Vs)); });
    const conDatos = filas.filter((f) => f.nf >= 3).sort((a, b) => b.med - a.med);
    main.append(A.tarjeta('Potencial mediano por sector', 'Mediana del potencial (valor central frente a la cotización) de las empresas de cada sector con una valoración fiable. Pulsa un sector para entrar.',
      G.caja(conDatos.length * 30 + 30, (c) => G.barras(c, conDatos.map((f) => ({ id: f.s, n: f.s, v: f.med })), {
        clic: (d) => A.ir(hSec(d.id)),
        tip: (d) => { const f = filas.find((x) => x.s === d.id); return [[d.id, null, 'sv-tip-h'], [`Potencial mediano: ${pct(f.med, 0, true)}`], [`${f.bajo} de ${f.nf} por debajo de su valor`], [`PER adelantado mediano: ${veces(f.per)}`]]; },
      }))));
    main.append(A.tarjeta('Sectores', 'Empresas del índice por sector GICS. Pulsa un sector para ver sus industrias y empresas.',
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
        h('p', { class: 'sv-take' }, R.nf ? `${R.bajo} de las ${R.nf} empresas con valoración fiable cotizan por debajo de su valor central; potencial mediano del ${pct(R.med, 0, true)}.` : 'Ninguna empresa de este sector tiene esta semana una valoración fiable.'),
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
        h('p', { class: 'sv-take' }, R.nf ? `${R.bajo} de ${R.nf} cotizan por debajo de su valor central; potencial mediano del ${pct(R.med, 0, true)}.` : 'Ninguna empresa de esta industria tiene esta semana una valoración fiable.'),
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
        h('div', { class: 'ap-tit-b' }, A.botonSeg(e.ticker), A.botonCmp(e.ticker), e.valorada ? h('a', { class: 'sv-btn', href: '#/informe/' + e.ticker }, 'Informe') : null, e.valorada ? A.botonPdf(e.ticker) : null)),
      h('p', { class: 'sv-meta' }, [e.empresa !== e.nombre ? e.empresa : null, e.subindustria, e.sede, e.cap ? `capitalización ${mill(e.cap)}` : null,
        e.proximos_resultados ? `próximos resultados: ${fecha(e.proximos_resultados)}` : null].filter(Boolean).join(' · ')));
    main.append(cab);
    if (!e.valorada) {
      cab.append(h('p', { class: 'sv-take' }, `${e.nombre} no se valora con el modelo automático: ${e.motivo ? e.motivo.charAt(0).toLowerCase() + e.motivo.slice(1) : 'sin datos suficientes'}.`));
      if (e.principal) main.append(h('p', null, A.enlace('#/empresa/' + e.principal, `Ver la valoración de ${e.principal} ›`)));
      main.append(h('section', { class: 'sv-kpis' }, A.kpi('Cotización', usd(e.cotizacion, 2), e.cap ? mill(e.cap) : null),
        e.analistas && e.analistas.objetivo ? A.kpi('Precio objetivo medio de los analistas', usd(e.analistas.objetivo, 0), `${e.analistas.n || '—'} analistas · ${pct(e.analistas.objetivo / e.cotizacion - 1, 0, true)}`) : ''));
      main.append(A.tarjetaMia(e), tarjetaCotizacion(e, null));
      if (e.graham) main.append(h('div', { class: 'sv-grid2' }, tarjetaGraham(e), tarjetaCalidad(e)));
      main.append(h('div', { class: 'sv-grid2' }, tarjetaConsenso(e), tarjetaDividendo(e)));
      main.append(tarjetaHistoria(e), tarjetaDescripcion(e));
      return;
    }
    const aj = A.S.aj[e.ticker] || (A.S.aj[e.ticker] = A.ajDef(e));
    const v = A.valor(e.ticker), vd = A.valoresDef()[e.ticker];
    const av = A.avisosDe(e, v);
    cab.append(h('p', { class: 'sv-take' }, frase(e, v)));
    const nr = notaRevisada(e);
    if (nr) main.append(nr);
    if (av.length) main.append(avisoBox('Avisos sobre esta valoración', av.map((a) => (A.AVISOS[a] || { t: a }).t + (A.AVISOS[a] && A.AVISOS[a].grave ? ' (se excluye del filtro de oportunidades por defecto)' : ''))));
    if (e.modelo !== 'fcff') { empresaFase2(main, e, aj, v, vd); return; }
    const gi = MOTOR.crecimientoImplicito(e, e.trays, A.S.par, aj, v.w, v.res.base.roicT);
    const cb = MOTOR.camino(e.trays.base, aj);
    const ronicVis = aj.invModo === 'explicito' ? aj.ronic : v.ronicImpl;
    main.append(h('section', { class: 'sv-kpis' },
      kpisComunes(e, v),
      A.kpi(['DCF ponderado por escenarios ', A.ayuda('escenarios')], usd(v.pond), `${A.ESC.map((sc) => `${A.NOM_ESC[sc]} ${usd(v.res[sc].vps)}`).join(' · ')}`),
      A.kpi(['Crecimiento que descuenta la cotización ', A.ayuda('implicito')], gi == null ? 'n.s.' : pct(gi, 1), `Ventas, años 1–5 · caso base: ${pct(cb.gr.slice(0, 5).reduce((s, x) => s + x, 0) / 5, 1)} anual`),
      A.kpi(['WACC ', A.ayuda('wacc')], pct(v.w, 2), `Ke ${pct(v.W.ke, 1)} (beta ${num(v.W.beta, 2)}) · Kd ${pct(v.W.kd, 1)} · deuda ${pct(v.W.wd, 0)}`),
    ));
    main.append(tarjetaAjustes(e, aj, v, vd));
    main.append(A.tarjetaMia(e));
    main.append(tarjetaCotizacion(e, v));
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
    main.append(h('div', { class: 'sv-grid2' }, tarjetaGraham(e), tarjetaCalidad(e)));
    main.append(h('div', { class: 'sv-grid2' }, tarjetaConsenso(e), tarjetaDividendo(e)));
    main.append(tarjetaHistoria(e));
    main.append(tarjetaSupuestos(e, v));
    main.append(h('div', { class: 'sv-grid2' }, tarjetaAnalistas(e, v), tarjetaExportar(e)));
    main.append(tarjetaDescripcion(e));
  };

  // ---------------------------------------------------------------- fase 2: beneficio residual y REIT
  const MODELOS = {
    fcff: { n: 'DCF de flujos de caja libres', c: 'DCF de flujos de caja libres', intr: 'DCF ponderado por escenarios', imp: 'Crecimiento que descuenta la cotización', tasa: 'WACC' },
    ri: { n: 'Beneficio residual (ROE frente al coste de los recursos propios)', c: 'beneficio residual', intr: 'Beneficio residual ponderado', imp: 'ROE a largo plazo que descuenta la cotización', tasa: 'Ke' },
    reit: { n: 'Descuento del AFFO (flujo disponible para el accionista del REIT)', c: 'descuento del AFFO', intr: 'Descuento del AFFO ponderado', imp: 'Crecimiento del AFFO que descuenta la cotización', tasa: 'Ke' },
  };
  A.MODELOS = MODELOS;

  function kpisComunes(e, v) {
    const m = A.margenSeg(v.central, e.cotizacion);
    const lm = ['Margen de seguridad ', A.ayuda('margen-seguridad')];
    return [A.kpi(['Valor central ', A.ayuda('valor-central')], usd(v.central), [A.potSpan(v.pot), ` frente a ${usd(e.cotizacion, 2)} · rango ${usd(v.bajo)} – ${usd(v.alto)}`]),
      m != null && m > 0 ? A.kpi(lm, pct(m, 0), 'Parte del valor central que no paga la cotización (1 − cotización ÷ valor)', 'sv-pos')
        : A.kpi(lm, 'Sin margen', v.central > 0 ? `La cotización supera el valor central en un ${pct(e.cotizacion / v.central - 1, 0)}` : 'El modelo no da un valor positivo')];
  }

  // ---------------------------------------------------------------- ficha: exportar la valoración a Excel
  function tarjetaExportar(e) {
    const b = h('button', { type: 'button', class: 'sv-btn' }, 'Descargar la valoración en Excel');
    const st = h('p', { class: 'sv-ctrl-d', role: 'status' });
    b.addEventListener('click', async () => {
      b.disabled = true; st.textContent = 'Preparando el fichero…';
      try {
        if (!A.excel) await A.cargarScript('js/excel.js');
        const n = A.excel(e, A.valor(e.ticker), A.S.par, A.aj(e.ticker));
        st.textContent = `Descargado: ${n}. Cambia cualquier celda amarilla y todo se recalcula.`;
      } catch (err) { console.error(err); st.textContent = 'No se ha podido generar el fichero.'; }
      b.disabled = false;
    });
    const st2 = h('p', { class: 'sv-ctrl-d', role: 'status' });
    const pdf = (lang, tx) => { const x = h('button', { type: 'button', class: 'sv-btn' }, tx); x.addEventListener('click', () => A.descargarPdf(e.ticker, lang, x, st2)); return x; };
    return A.tarjeta('Llévate el modelo y el informe', `Hoja de cálculo con la valoración de ${e.nombre} construida con fórmulas: supuestos (en amarillo), proyección de los tres escenarios, valor terminal, múltiplos y valor central. Y el informe completo en PDF: resumen con puntos fuertes y riesgos, catalizadores, 10 años de cuentas, valoración, comparables, calidad, conclusiones y fuentes. Los dos usan los supuestos que tienes ahora en el simulador.`,
      h('div', { class: 'sv-bar' }, b, h('a', { class: 'sv-btn', href: '#/informe/' + e.ticker }, 'Ver el informe')), st,
      h('div', { class: 'sv-bar' }, pdf('es', 'Informe en PDF (castellano)'), pdf('ca', 'Informe en PDF (català)')), st2);
  }

  function empresaFase2(main, e, aj, v, vd) {
    const M = MODELOS[e.modelo], ri = e.modelo === 'ri', b = v.res.base;
    const imp = MOTOR.implicito(e, A.S.par, aj, v);
    const refImp = ri ? `ROE del año 1: ${pct(e.ri.bpa1[1] / e.ri.bv0, 1)} · a largo plazo en el caso base: ${pct(b.roeLT, 1)} · Ke ${pct(v.w, 1)}`
      : `Caso base: ${pct(e.reit.g1[1] + (aj.dg || 0), 1)} y ${pct(e.reit.g2[1] + (aj.dg || 0), 1)} en los años 1–2; después converge a g`;
    main.append(h('section', { class: 'sv-kpis' }, kpisComunes(e, v),
      A.kpi([M.intr + ' ', A.ayuda(ri ? 'beneficio-residual' : 'affo')], usd(v.pond), A.ESC.map((sc) => `${A.NOM_ESC[sc]} ${usd(v.res[sc].vps)}`).join(' · ')),
      A.kpi([M.imp + ' ', A.ayuda('implicito')], imp == null ? 'n.s.' : pct(imp, 1), refImp),
      A.kpi(['Coste de los recursos propios (Ke) ', A.ayuda('ke')], pct(v.w, 2), `Tipo sin riesgo + beta ${num(v.W.beta, 2)} × prima de riesgo`)));
    main.append(tarjetaAjustesF2(e, aj, v, vd));
    main.append(A.tarjetaMia(e));
    main.append(tarjetaCotizacion(e, v));
    const anios = d3.range(1, 11).map(String);
    const series = [['base', 'var(--s1)'], ['pes', 'var(--s2)'], ['opt', 'var(--s3)']];
    if (ri) {
      main.append(h('div', { class: 'sv-grid2' },
        A.tarjeta('Rentabilidad sobre recursos propios frente a su coste', 'ROE de cada año en los tres escenarios (años 1–2 con el BPA del consenso) y coste de los recursos propios (Ke, línea discontinua). Se crea valor mientras el ROE supera a Ke.',
          G.leyenda(series.map(([sc, c]) => [A.NOM_ESC[sc], c]).concat([['Ke', 'var(--color-fg)']])),
          G.caja(220, (c) => G.lineas(c, series.map(([sc, col]) => ({ n: A.NOM_ESC[sc], color: col, puntos: anios.map((a, k) => [a, v.res[sc].filas[k].roe]) }))
            .concat([{ n: 'Ke', color: 'var(--color-fg)', discontinua: true, puntos: anios.map((a) => [a, v.w]) }]), { fmtY: (d) => pct(d, 0), fmtTip: (d) => pct(d, 1), prefijo: 'Año ' }))),
        A.tarjeta('Del valor contable al valor por acción', 'Caso base, dólares por acción: valor contable de hoy más el valor actual del beneficio que supera al coste de los recursos propios.',
          G.caja(240, (c) => G.cascada(c, [{ n: 'Valor contable', v: b.base, tipo: 'suma', nota: `${usd(e.ri.bv0, 2)} en el último balance, actualizado a hoy` },
            { n: 'Beneficio residual años 1–10', v: b.va, tipo: 'suma' }, { n: 'Valor terminal', v: b.vaTv, tipo: 'suma' }, { n: 'Valor por acción', v: b.vps, tipo: 'total' }])),
          h('p', { class: 'sv-kpi-r' }, `Precio / valor contable que justifica el caso base: ${veces(b.vps / e.ri.bv0, 2)} (cotiza a ${veces(e.cotizacion / e.ri.bv0, 2)}).`))));
    } else {
      main.append(h('div', { class: 'sv-grid2' },
        A.tarjeta('AFFO por acción proyectado', 'Flujo disponible para el accionista (AFFO ≈ 85 % del FFO) en cada escenario; en línea discontinua, el dividendo si se mantiene el reparto actual.',
          G.leyenda(series.map(([sc, c]) => [A.NOM_ESC[sc], c]).concat([['Dividendo (caso base)', 'var(--color-fg)']])),
          G.caja(220, (c) => G.lineas(c, series.map(([sc, col]) => ({ n: A.NOM_ESC[sc], color: col, puntos: anios.map((a, k) => [a, v.res[sc].filas[k].affo]) }))
            .concat([{ n: 'Dividendo', color: 'var(--color-fg)', discontinua: true, puntos: anios.map((a, k) => [a, b.filas[k].dpa]) }]), { fmtY: (d) => num(d, 1), fmtTip: (d) => usd(d, 2), prefijo: 'Año ', cero: true }))),
        A.tarjeta('Del flujo al valor por acción', 'Caso base, dólares por acción.',
          G.caja(240, (c) => G.cascada(c, [{ n: 'AFFO años 1–10', v: b.va, tipo: 'suma' }, { n: 'Valor terminal', v: b.vaTv, tipo: 'suma' }, { n: 'Valor por acción', v: b.vps, tipo: 'total' }])),
          h('p', { class: 'sv-kpi-r' }, `P/FFO que justifica el caso base: ${veces(b.vps / e.reit.ffo_ps, 1)} (cotiza a ${veces(e.cotizacion / e.reit.ffo_ps, 1)}). Rentabilidad por dividendo: ${pct(e.reit.dps0 / e.cotizacion, 1)}.`))));
    }
    main.append(h('div', { class: 'sv-grid2' },
      A.tarjeta('Sensibilidad del caso base: Ke × g', 'Valor por acción. Verde: por encima de la cotización; rojo: por debajo. Recuadro: supuestos actuales.', G.caja(260, (c) => G.sensibilidad(c, e, v, A.S.par, aj))),
      A.tarjeta('Valor por acción según el método', 'Barra: mínimo–máximo; trazo: valor central de cada método; línea vertical: cotización.', G.caja(200, (c) => G.metodos(c, e, v, v.pesoDcf)))));
    main.append(tarjetaProyeccionF2(e, v));
    main.append(tarjetaComparables(e));
    main.append(h('div', { class: 'sv-grid2' }, tarjetaGraham(e), tarjetaCalidad(e)));
    main.append(h('div', { class: 'sv-grid2' }, tarjetaConsenso(e), tarjetaDividendo(e)));
    main.append(tarjetaHistoria(e));
    main.append(tarjetaSupuestosF2(e, v));
    main.append(h('div', { class: 'sv-grid2' }, tarjetaAnalistas(e, v), tarjetaExportar(e)));
    main.append(tarjetaDescripcion(e));
  }

  function tarjetaAjustesF2(e, aj, v, vd) {
    const set = (k) => (x) => { aj[k] = x; A.cambio(); };
    const reset = h('button', { type: 'button', class: 'sv-btn' }, 'Volver a los de la empresa');
    reset.addEventListener('click', () => { A.S.aj[e.ticker] = A.ajDef(e); A.cambio(); });
    const ri = e.modelo === 'ri';
    return A.tarjeta(null, null,
      h('div', { class: 'sv-detail-h' }, h('h2', { class: 'sv-card-t' }, `Supuestos de ${e.nombre}`), reset),
      h('p', { class: 'sv-card-n' }, ri ? 'El ajuste del ROE se suma al ROE de largo plazo de los tres escenarios; los años 1–2 siguen al consenso y la transición es lineal.'
        : 'El ajuste del crecimiento se suma al de los años 1–2 de los tres escenarios y a la transición hasta g.'),
      h('div', { class: 'sv-ctrls' },
        control('aj-beta', 'Beta', { min: Math.max(0.3, Math.round((e.beta - 1) * 100) / 100), max: Math.round((e.beta + 1) * 100) / 100, step: 0.01 }, aj.beta, (x) => num(x, 2),
          `Por defecto: ${num(e.beta, 2)} (media de la de Yahoo, ${num(e.beta_yahoo, 2)}, y la mediana de su industria, ${num(e.beta_sector_apalancada, 2)}; mínimo 0,6)`, set('beta')),
        ri ? control('aj-dm', 'ROE a largo plazo', { min: -0.08, max: 0.08, step: 0.0025 }, aj.dm, (x) => A.pp(x, 2),
          `Caso base, año 10: ${pct(v.res.base.roeLT, 1)} · Ke ${pct(v.w, 1)}`, set('dm'))
          : control('aj-dg', 'Crecimiento del AFFO', { min: -0.08, max: 0.08, step: 0.005 }, aj.dg, (x) => A.pp(x, 1),
            `Caso base: ${pct(e.reit.g1[1] + (aj.dg || 0), 1)} el año 1 · por defecto ${pct(e.reit.g1[1], 1)}`, set('dg'))),
      A.ajCambiado(e.ticker) && vd ? h('p', { class: 'sv-kpi-r' }, `Con los supuestos por defecto de la empresa: valor central ${usd(vd.central)} (${pct(vd.pot, 0, true)}).`) : null);
  }

  function tarjetaProyeccionF2(e, v) {
    const r = v.res.base, ri = e.modelo === 'ri';
    const filas = ri ? [
      ['Valor contable inicial', (f) => num(f.bvIni, 2)], ['ROE', (f) => pct(f.roe, 1)], ['BPA', (f) => num(f.bpa, 2)],
      ['Reparto (dividendos y recompras)', (f) => pct(f.payout, 0)], ['Beneficio residual', (f) => num(f.ri, 2)], ['Valor actual', (f) => num(f.va, 2)],
    ] : [
      ['Crecimiento', (f) => pct(f.crecimiento, 1)], ['FFO por acción', (f) => num(f.ffo, 2)], ['AFFO por acción', (f) => num(f.affo, 2)],
      ['Dividendo (mismo reparto)', (f) => num(f.dpa, 2)], ['Valor actual del AFFO', (f) => num(f.va, 2)],
    ];
    const tabla = h('table', { class: 'sv-table ap-proy' },
      h('thead', null, h('tr', null, h('th', null, '$ por acción'), r.filas.map((f) => h('th', null, `Año ${f.anio}`)))),
      h('tbody', null, filas.map(([n, fn]) => h('tr', null, h('td', null, n), r.filas.map((f) => h('td', null, fn(f)))))));
    const nota = ri ? `Caso base. Años 1–2: BPA del consenso; después el ROE converge al ${pct(r.roeLT, 1)} y el reparto al que sostiene un crecimiento del ${pct(v.g, 1)}. Valor terminal: beneficio residual del año 11 creciendo a g.`
      : `Caso base. Años 1–2: crecimiento de los ingresos del consenso; después converge a g (${pct(v.g, 1)}). Valor terminal de Gordon sobre el AFFO del año 10.`;
    return A.tarjeta('Proyección del caso base', nota, h('div', { class: 'sv-tw' }, tabla));
  }

  function tarjetaSupuestosF2(e, v) {
    const dl = (pares) => h('dl', { class: 'ap-dl' }, pares.map(([k, x]) => [h('dt', null, k), h('dd', null, x)]));
    if (e.modelo === 'ri') {
      const p = e.ri;
      const esc = A.ESC.map((sc, i) => { const r = v.res[sc]; return h('tr', null, h('td', null, A.NOM_ESC[sc]), h('td', null, usd(p.bpa1[i], 2)), h('td', null, usd(p.bpa2[i], 2)),
        h('td', null, pct(r.filas[0].roe, 1)), h('td', null, pct(r.roe2, 1)), h('td', null, pct(r.roeLT, 1)), h('td', null, usd(r.vps))); });
      return A.tarjeta('Datos y supuestos del modelo', `Valor contable del ${fecha(e.fecha_balance)} y beneficio de los últimos doce meses hasta el ${fecha(e.fecha_ttm)} (Yahoo Finance).`,
        h('div', { class: 'sv-grid2' },
          dl([['Valor contable por acción', usd(p.bv0, 2)], ['Valor contable tangible por acción', usd(p.tbv, 2)], ['Patrimonio de los accionistas comunes', mill(e.patrimonio_comun)],
            ['Beneficio de los últimos doce meses', mill(e.beneficio_ttm)], ['ROE de los últimos doce meses', pct(p.roe_ttm, 1)], ['BPA de los últimos doce meses', usd(p.bpa_ttm, 2)]]),
          dl([['Dividendos + recompras (TTM)', `${mill((e.dividendos_ttm || 0) + (e.recompras_ttm || 0))} (${pct(p.payout0, 0)} del beneficio)`],
            ['Beta', `${num(e.beta, 2)} = media de Yahoo (${num(e.beta_yahoo, 2)}) y de su industria (${num(e.beta_sector_apalancada, 2)}), mínimo 0,6`],
            ['Ke', pct(v.w, 2)], ['Acciones (diluidas)', `${num(e.acciones_m, 1)} millones`], ['Convergencia del ROE', `el ${pct(A.S.par.fr.pes, 0)}, ${pct(A.S.par.fr.base, 0)} y ${pct(A.S.par.fr.opt, 0)} del diferencial del año 2 sobre Ke se mantiene a largo plazo`]])),
        h('div', { class: 'sv-tw' }, h('table', { class: 'sv-table ap-esc' },
          h('thead', null, h('tr', null, ['Escenario', 'BPA año 1', 'BPA año 2', 'ROE año 1', 'ROE año 2', 'ROE largo plazo', 'Valor por acción'].map((x) => h('th', null, x)))),
          h('tbody', null, esc))));
    }
    const p = e.reit;
    const esc = A.ESC.map((sc, i) => h('tr', null, h('td', null, A.NOM_ESC[sc]), h('td', null, pct(p.g1[i], 1)), h('td', null, pct(p.g2[i], 1)), h('td', null, usd(v.res[sc].vps))));
    return A.tarjeta('Datos y supuestos del modelo', `Cifras de los últimos doce meses hasta el ${fecha(e.fecha_ttm)} (Yahoo Finance). FFO = beneficio + amortización − partidas no recurrentes (plusvalías por venta de inmuebles, deterioros); AFFO ≈ 85 % del FFO (el resto, inversión de mantenimiento).`,
      h('div', { class: 'sv-grid2' },
        dl([['FFO de los últimos doce meses', `${mill(p.ffo)} (${usd(p.ffo_ps, 2)} por acción)`], ['Partidas no recurrentes excluidas (plusvalías, deterioros)', mill(-(p.plusvalias || 0))], ['AFFO por acción (base del modelo)', usd(p.affo0, 2)],
          ['Dividendo anual por acción', `${usd(p.dps0, 2)} (rentabilidad ${pct(p.dps0 / e.cotizacion, 1)})`], ['Cobertura del dividendo (FFO ÷ dividendo)', veces(p.cobertura, 2)]]),
        dl([['EBITDA de los últimos doce meses', mill(p.ebitda)], ['Deuda neta', mill(p.nd)], ['Beta', `${num(e.beta, 2)} = media de Yahoo (${num(e.beta_yahoo, 2)}) y de su industria (${num(e.beta_sector_apalancada, 2)}), mínimo 0,6`],
          ['Ke', pct(v.w, 2)], ['Acciones (diluidas)', `${num(e.acciones_m, 1)} millones`]])),
      h('div', { class: 'sv-tw' }, h('table', { class: 'sv-table ap-esc' },
        h('thead', null, h('tr', null, ['Escenario', 'Crecimiento año 1', 'Crecimiento año 2', 'Valor por acción'].map((x) => h('th', null, x)))),
        h('tbody', null, esc))));
  }

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
  // control deslizante: mientras se arrastra solo cambia la cifra; al soltar se recalcula la página
  function control(id, etiqueta, attrs, valor, fmt, nota, alCambiar) {
    const inp = h('input', Object.assign({ class: 'sv-range', id, type: 'range' }, attrs));
    inp.value = valor; inp.style.accentColor = 'var(--s1)';
    const val = h('span', { class: 'sv-ctrl-v' }, typeof fmt === 'function' ? fmt(Number(valor)) : fmt);
    if (typeof fmt === 'function') inp.addEventListener('input', () => { val.textContent = fmt(Number(inp.value)); });
    inp.addEventListener('change', () => alCambiar(Number(inp.value)));
    return h('div', { class: 'sv-ctrl' }, h('div', { class: 'sv-ctrl-l' }, h('label', { for: id }, etiqueta), val), inp, h('span', { class: 'sv-ctrl-d' }, nota));
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
        control('aj-beta', 'Beta', { min: Math.max(0.3, Math.round((e.beta - 1) * 100) / 100), max: Math.round((e.beta + 1) * 100) / 100, step: 0.01 }, aj.beta, (x) => num(x, 2),
          `Por defecto: ${num(e.beta, 2)} (media de la de Yahoo, ${num(e.beta_yahoo, 2)}, y la de su industria con su deuda, ${num(e.beta_sector_apalancada, 2)})`, set('beta')),
        control('aj-dg', 'Crecimiento de las ventas (años 1–9)', { min: -0.1, max: 0.1, step: 0.005 }, aj.dg, (x) => pp(x, 1),
          `Caso base, media años 1–5: ${pct(media5(cb.gr), 1)} · por defecto: ${pct(media5(e.trays.base.gr), 1)}`, set('dg')),
        control('aj-dm', 'Margen EBITA a largo plazo (año 10)', { min: -0.15, max: 0.15, step: 0.005, disabled: expl }, aj.dm, (x) => pp(x, 1),
          expl ? 'Sin efecto: el margen sale del retorno de la inversión' : `Caso base, año 10: ${pct(cb.mg[9], 1)} · por defecto: ${pct(e.trays.base.mg[9], 1)}`, set('dm'))),
      h('div', { class: 'sv-inv' }, h('p', { class: 'sv-grp-t' }, 'Retorno de la nueva inversión'),
        h('div', { class: 'sv-ctrls' },
          h('div', { class: 'sv-ctrl' }, h('div', { class: 'sv-ctrl-l' }, h('span', null, 'Cómo se proyecta el beneficio')), seg,
            h('span', { class: 'sv-ctrl-d' }, aplica ? 'Por defecto: margen del consenso' : `${e.nombre} apenas necesita capital para crecer: su beneficio no depende de esta palanca.`)),
          control('aj-ronic', 'Rentabilidad de la nueva inversión (RONIC)', { min: 0, max: 0.6, step: 0.005, disabled: !expl }, ronic == null ? 0 : ronic, (x) => (ronic == null && !expl ? 'n.s.' : pct(x, 1)),
            v.ronicImpl != null ? `Implícita en el consenso: ${pct(v.ronicImpl, 1)} · WACC ${pct(v.w, 1)}` : 'No significativa', set('ronic')),
          control('aj-lag', 'Años hasta que la inversión rinde', { min: 1, max: 3, step: 1, disabled: !aplica }, aj.lag, (x) => (x === 1 ? '1 año' : `${x} años`), 'La inversión de un año empieza a rendir en el año indicado después', set('lag')))),
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
    if (e.modelo !== 'fcff') return tarjetaComparablesF2(e);
    const mu = e.mu || {}, Vs = A.valores();
    const peers = (mu.comparables || []).map((t) => A.D.porT[t]).filter(Boolean);
    const nivel = { subindustria: 'de su misma subindustria', industria: 'de su industria (la subindustria tiene pocas empresas comparables)', sector: 'de su sector (la industria tiene pocas empresas comparables)' }[mu.nivel] || '';
    const filas = [e].concat(peers);
    const quien = mu.nivel === 'revisado' ? 'Comparables elegidos a mano en el Simulador 7M (aquí solo aparecen los que forman parte del S&P 500).' : `Empresas del S&P 500 ${nivel}, las más parecidas en tamaño. Se descartan PER adelantados por encima de 60 y EV/EBITDA por encima de 40.`;
    return A.tarjeta(['Comparables y múltiplos adelantados ', A.ayuda('comparables')], `${quien} Mediana: PER ${veces(mu.per_mediana)} → ${usd(mu.per_valor_mediana)} por acción; EV/EBITDA ${veces(mu.ev_ebitda_mediana)} → ${usd(mu.ev_ebitda_valor_mediana)}.`,
      A.tabla([
        { t: 'Empresa', v: (x) => x.nombre, f: (x) => (x === e ? h('b', null, `${x.nombre} (esta empresa)`) : nomCelda(x)), texto: true },
        { t: 'Subindustria', f: (x) => x.subindustria, cls: 'sv-sec-col' },
        { t: 'Capitalización', v: (x) => x.cap, f: (x) => mill(x.cap) },
        { t: 'PER adelantado', v: (x) => (x.adelantados || {}).per, f: (x) => veces((x.adelantados || {}).per) },
        { t: 'EV/EBITDA adelantado', v: (x) => (x.adelantados || {}).ev_ebitda, f: (x) => veces((x.adelantados || {}).ev_ebitda) },
        { t: 'Potencial', v: (x) => (A.fiable(x, Vs[x.ticker]) ? Vs[x.ticker].pot : null), f: (x) => potCelda(x, Vs[x.ticker]) },
      ], filas, { clic: (x) => x !== e && irEmp(x) }));
  }

  function tarjetaComparablesF2(e) {
    const mu = e.mu || {}, Vs = A.valores(), ri = e.modelo === 'ri';
    const peers = (mu.comparables || []).map((t) => A.D.porT[t]).filter(Boolean);
    const nivel = { subindustria: 'de su misma subindustria', industria: 'de su industria (la subindustria tiene pocas empresas comparables)', sector: 'de su sector' }[mu.nivel] || '';
    const txt = (mu.metodos || []).filter((m) => m.mult).map((m) => `${m.n} ${veces(m.mult.med, 1)} → ${usd(m.valor && m.valor.med)} por acción`).join('; ');
    const a = (x) => x.adelantados || {};
    const cols = [{ t: 'Empresa', v: (x) => x.nombre, f: (x) => (x === e ? h('b', null, `${x.nombre} (esta empresa)`) : nomCelda(x)), texto: true },
      { t: 'Subindustria', f: (x) => x.subindustria, cls: 'sv-sec-col' }, { t: 'Capitalización', v: (x) => x.cap, f: (x) => mill(x.cap) }];
    if (ri) cols.push({ t: 'PER adelantado', v: (x) => a(x).per, f: (x) => veces(a(x).per) }, { t: 'Precio / valor contable', v: (x) => a(x).pb, f: (x) => veces(a(x).pb, 2) },
      { t: 'ROE año 1', v: (x) => (x.ri ? x.ri.bpa1[1] / x.ri.bv0 : null), f: (x) => (x.ri ? pct(x.ri.bpa1[1] / x.ri.bv0, 1) : '—') });
    else cols.push({ t: 'P/FFO', v: (x) => a(x).pffo, f: (x) => veces(a(x).pffo) }, { t: 'EV/EBITDA', v: (x) => a(x).ev_ebitda_ttm, f: (x) => veces(a(x).ev_ebitda_ttm) },
      { t: 'Rent. dividendo', v: (x) => a(x).rent_dividendo, f: (x) => pct(a(x).rent_dividendo, 1) });
    cols.push({ t: 'Potencial', v: (x) => (A.fiable(x, Vs[x.ticker]) ? Vs[x.ticker].pot : null), f: (x) => potCelda(x, Vs[x.ticker]) });
    return A.tarjeta('Comparables y múltiplos', `Empresas del S&P 500 ${nivel} valoradas con el mismo modelo, las más parecidas en tamaño. Mediana: ${txt || 'sin múltiplos válidos'}.`,
      A.tabla(cols, [e].concat(peers), { clic: (x) => x !== e && irEmp(x) }));
  }

  function tarjetaGraham(e) {
    const gr = A.graham(e), g = e.graham || {};
    return A.tarjeta([`Criterios de Graham: ${gr.puntos} de ${gr.total} `, A.ayuda('graham')], 'Criterios del inversor defensivo de Benjamin Graham (The Intelligent Investor). Beneficios, dividendos y crecimiento del BPA con los 10 últimos ejercicios presentados a la SEC (si no hay, con los 4 años de Yahoo). La liquidez no se aplica a financieras, eléctricas ni REIT, y la deuda de bancos y aseguradoras forma parte de su negocio.',
      h('ul', { class: 'ap-checks' }, gr.items.map((i) => h('li', { class: i.na ? 'ap-na' : i.ok ? 'ap-ok' : 'ap-no' }, h('span', { class: 'ap-check', 'aria-hidden': 'true' }, i.na ? '–' : i.ok ? '✓' : '✗'),
        h('span', { class: 'ap-check-t' }, i.t), h('span', { class: 'ap-check-v' }, i.v), h('span', { class: 'ap-sr' }, i.na ? ' (no aplica)' : i.ok ? ' (cumple)' : ' (no cumple)')))),
      h('p', { class: 'sv-kpi-r' }, `BPA de los últimos doce meses ${usd(g.bpa, 2)} · valor contable por acción ${usd(g.vc, 2)} · número de Graham ${usd(g.ng, 2)}` +
        (g.ng ? ` (la cotización está un ${pct(Math.abs(e.cotizacion / g.ng - 1), 0)} ${e.cotizacion > g.ng ? 'por encima' : 'por debajo'})` : '')));
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
      historico: 'sin consenso utilizable: crecimiento y margen de los últimos doce meses',
      revisado: 'crecimiento y margen revisados a mano en el Simulador 7M (consenso y guías de la empresa)' };
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
          e.revisada_activa ? ['Diferencial de la deuda', `${pct(e.diferencial, 2)} (Simulador 7M)`]
            : ['Rating sintético', `${e.rating}${e.cobertura != null ? ` (cobertura de intereses ${num(e.cobertura, 1)}x)` : ' (por deuda / EBITDA)'} · diferencial ${pct(e.diferencial, 2)}`],
          ['Beta', e.revisada_activa ? `${num(e.beta, 2)} (revisada en el Simulador 7M; la automática sería ${num(A.D.auto[e.ticker].beta, 2)})` : `${num(e.beta, 2)} = media de Yahoo (${num(e.beta_yahoo, 2)}) y de su industria reapalancada (${num(e.beta_sector_apalancada, 2)})`],
          ['Margen de referencia (mediana de comparables)', pct(e.margen_referencia, 1)], ['Años 1–2', MODO[T.modo] || '—']])),
      h('div', { class: 'sv-tw' }, h('table', { class: 'sv-table ap-esc' },
        h('thead', null, h('tr', null, ['Escenario', 'Crec. año 1', 'Crec. año 2', 'Margen año 1', 'Margen año 2', 'Margen año 10', 'DCF por acción'].map((x) => h('th', null, x)))),
        h('tbody', null, esc))),
      h('p', { class: 'sv-kpi-r' }, `Crecimiento del año 10: ${pct(T.g10, 1)} en los tres escenarios; amortización ${pct(T.da, 1)} de las ventas; CapEx del ${pct(T.cx0, 1)} al ${pct(T.cx10, 1)}; NOF ${pct(T.nof, 1)} de las ventas.`));
  }

  // ---------------------------------------------------------------- ficha: valoración revisada de las 7 Magníficas
  function notaRevisada(e) {
    if (!A.D.rev[e.ticker]) return null;
    const b = h('button', { type: 'button', class: 'sv-btn' }, e.revisada_activa ? 'Ver la valoración automática' : 'Usar la valoración revisada');
    b.addEventListener('click', () => A.usarRevisadas(!e.revisada_activa));
    const f = (A.D.rev[e.ticker].revisada || {}).fecha;
    return h('div', { class: 'ap-nota' },
      h('p', null, e.revisada_activa
        ? [h('b', null, 'Valoración revisada en el Simulador 7M. '), `Crecimiento, márgenes, inversión, beta y comparables revisados empresa a empresa${f ? ` (datos del ${fecha(f)})` : ''}, con el mismo motor de DCF. `, h('a', { href: 'https://bigthor12-7m.github.io/simulador-7mag/', target: '_blank', rel: 'noopener' }, 'Abrir el Simulador 7M ›'), ' ', A.ayuda('revisada')]
        : [h('b', null, 'Valoración automática. '), 'Estás viendo el modelo con las reglas comunes del S&P 500; las 7 Magníficas tienen además una valoración revisada empresa a empresa.']), b);
  }

  // ---------------------------------------------------------------- ficha: cotización de 5 años frente al S&P 500
  A.D_px = {};
  const cargarPx = (t) => (A.D_px[t] ? Promise.resolve(A.D_px[t]) : A.json('precios/' + t.replace('^', '_'), true).then((d) => (A.D_px[t] = (d || []).map(([f, c]) => [new Date(f + 'T00:00:00Z'), c]))));
  function tarjetaCotizacion(e, v) {
    const cont = h('div', { class: 'sv-chart', style: { minHeight: '250px' } }), resumenTxt = h('p', { class: 'sv-kpi-r' });
    let rango = A.leer('sp-px-rango', 5);
    const seg = h('div', { class: 'sv-seg', role: 'group', 'aria-label': 'Periodo' }, [[1, '1 año'], [3, '3 años'], [5, '5 años']].map(([a, txt]) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(a === rango) }, txt);
      b.addEventListener('click', () => { rango = a; A.escribir('sp-px-rango', a); for (const x of seg.children) x.setAttribute('aria-pressed', String(x === b)); dibujar(); });
      return b;
    }));
    let datos = null;
    const hist = historicoDe(e.ticker);
    function dibujar() {
      if (!datos) return;
      const [px, sp] = datos;
      if (!px.length) { cont.replaceChildren(h('p', { class: 'sv-card-n' }, 'Sin cotizaciones históricas disponibles.')); resumenTxt.textContent = ''; return; }
      const fin = px[px.length - 1][0], ini = new Date(Date.UTC(fin.getUTCFullYear() - rango, fin.getUTCMonth(), fin.getUTCDate()));
      const p = px.filter((x) => x[0] >= ini);
      const s0 = sp.find((x) => x[0] >= p[0][0]);
      const spR = s0 ? sp.filter((x) => x[0] >= p[0][0]).map(([d, c]) => [d, c / s0[1] * p[0][1]]) : [];
      const cen = hist.filter((r) => r.d >= ini).map((r) => [r.d, r.central]);
      const series = [{ n: 'Cotización', color: 'var(--s2)', puntos: p, fmtTip: (x) => usd(x, 2) },
        { n: 'S&P 500 (misma base)', color: 'var(--cds-chart-muted)', discontinua: true, puntos: spR, fmtTip: (x) => usd(x, 2) }];
      if (cen.length) series.push({ n: 'Valor central semanal', color: 'var(--s1)', puntos: cen, soloPuntos: cen.length < 6, fmtTip: (x) => usd(x, 0) });
      const refs = v && v.valido && v.central > 0 ? [{ v: Math.min(v.central, d3.max(p, (x) => x[1]) * 2.5), n: `Valor central ${usd(v.central)}`, color: 'var(--s1)' }] : [];
      G.temporal(cont, series, { alto: 250, refs, fmtY: (x) => num(x, 0), prefijo: 'Semana del ' });
      const r = p[p.length - 1][1] / p[0][1] - 1, rs = spR.length ? spR[spR.length - 1][1] / spR[0][1] - 1 : null;
      const u52 = px.filter((x) => +x[0] >= +fin - 365 * 864e5).map((x) => x[1]);
      resumenTxt.textContent = `En ${rango === 1 ? 'el último año' : `los últimos ${rango} años`}: ${pct(r, 0, true)}${rs != null ? ` (S&P 500: ${pct(rs, 0, true)})` : ''}, sin contar dividendos. ` +
        `Máximo y mínimo de las últimas 52 semanas: ${usd(d3.max(u52), 2)} y ${usd(d3.min(u52), 2)} (cotización ${pct(e.cotizacion / d3.max(u52) - 1, 0, true)} desde el máximo).`;
    }
    Promise.all([cargarPx(e.ticker), cargarPx('^GSPC')]).then((d) => { datos = d; requestAnimationFrame(() => { if (cont.isConnected) dibujar(); }); })
      .catch(() => cont.replaceChildren(h('p', { class: 'sv-card-n' }, 'No se han podido cargar las cotizaciones.')));
    return A.tarjeta(null, null, h('div', { class: 'sv-detail-h' }, h('h2', { class: 'sv-card-t' }, 'Cotización y valor central'), seg),
      h('p', { class: 'sv-card-n' }, 'Cierre semanal de los últimos años frente al S&P 500 llevado a la misma base; puntos azules: valor central de cada actualización semanal; línea discontinua azul: valor central con los supuestos actuales.'),
      G.leyenda([['Cotización', 'var(--s2)'], ['S&P 500 (misma base)', 'var(--cds-chart-muted)'], ['Valor central', 'var(--s1)']]), cont, resumenTxt);
  }

  // ---------------------------------------------------------------- ficha: historia de 10 años (SEC)
  let HIST = null, histP = null;
  A.cargarHistoria = () => (HIST ? Promise.resolve(HIST) : histP || (histP = A.json('historia', true).then((d) => (HIST = d || {}))));
  function tarjetaHistoria(e) {
    const cuerpo = h('div', null, h('p', { class: 'sv-card-n' }, 'Cargando la historia de la SEC…'));
    A.cargarHistoria().then((H) => {
      const d = H[e.ticker];
      if (!Object.keys(H).length) { cuerpo.replaceChildren(h('p', { class: 'sv-card-n' }, 'La historia de 10 años de la SEC todavía no se ha podido descargar: mientras tanto, los criterios de Graham usan los 4 años de Yahoo Finance.')); return; }
      if (!d || !d.años) { cuerpo.replaceChildren(h('p', { class: 'sv-card-n' }, 'Sin datos de la SEC para esta empresa.')); return; }
      const idx = d.años.map((a, i) => i).filter((i) => ['ventas', 'beneficio', 'bpa'].some((k) => d[k] && d[k][i] != null));
      if (!idx.length) { cuerpo.replaceChildren(h('p', { class: 'sv-card-n' }, 'Sin datos de la SEC para esta empresa.')); return; }
      const i0 = idx[0], anios = d.años.slice(i0).map(String);
      const S = (k) => (d[k] || []).slice(i0);
      const grande = Math.max(...S('ventas').filter((x) => x != null).map(Math.abs), 0) > 2e5;
      const U = grande ? 1000 : 1, uT = grande ? 'miles de M$' : 'M$';
      const dpa = S('dpa').map((x, i) => (x != null ? x : null));
      const mini = (titulo, serie, fmt, fmtTip, color) => h('div', { class: 'ap-mini' }, h('p', { class: 'ap-mini-t' }, titulo),
        G.caja(150, (c) => G.anios(c, anios.map((a, i) => ({ a, v: serie[i] })), { alto: 150, fmt, fmtTip, n: titulo.split(' (')[0], color })));
      const cagr = (s) => { const xs = s.map((x, i) => [i, x]).filter(([, x]) => x != null && x > 0); if (xs.length < 2) return null; const [a, b] = [xs[0], xs[xs.length - 1]]; return b[0] > a[0] ? (b[1] / a[1]) ** (1 / (b[0] - a[0])) - 1 : null; };
      const cv = cagr(S('ventas')), cb = cagr(S('bpa'));
      const g = e.graham || {};
      cuerpo.replaceChildren(
        h('div', { class: 'ap-minis' },
          mini(`Ventas (${uT})`, S('ventas').map((x) => (x == null ? null : x / U)), (x) => num(x, 0), (x) => `${num(x, grande ? 1 : 0)} ${uT}`),
          mini(`Beneficio neto (${uT})`, S('beneficio').map((x) => (x == null ? null : x / U)), (x) => num(x, 0), (x) => `${num(x, grande ? 1 : 0)} ${uT}`),
          mini('BPA ($ por acción)', S('bpa'), (x) => num(x, 1), (x) => usd(x, 2)),
          mini('Dividendo por acción ($)', dpa, (x) => num(x, 1), (x) => usd(x, 2), 'var(--s3)')),
        h('p', { class: 'sv-kpi-r' }, [cv != null ? `Ventas: ${pct(cv, 1, true)} anual` : null, cb != null ? `BPA: ${pct(cb, 1, true)} anual` : null,
          g.ben_fuente === 'SEC' ? `beneficios positivos ${g.ben_pos} de ${g.ben_n} años` : null, g.div_n ? `dividendos ${g.div_anios} de ${g.div_n} años` : null].filter(Boolean).join(' · ') +
          (cv != null || cb != null ? ` (crecimiento anual compuesto ${anios[0]}–${anios[anios.length - 1]}).` : '')),
        h('details', { class: 'ap-det' }, h('summary', null, 'Ver la tabla completa'),
          h('div', { class: 'sv-tw' }, h('table', { class: 'sv-table ap-proy' },
            h('thead', null, h('tr', null, h('th', null, uT), anios.map((a) => h('th', null, a)))),
            h('tbody', null, [['Ventas', 'ventas', U], ['EBIT', 'ebit', U], ['Beneficio neto', 'beneficio', U], ['Flujo de explotación', 'cfo', U], ['Patrimonio', 'patrimonio', U], ['Dividendos pagados', 'dividendos', U],
              ['BPA ($)', 'bpa', 0], ['Dividendo por acción ($)', 'dpa', 0]].map(([n, k, u]) => h('tr', null, h('td', null, n),
              S(k).map((x) => h('td', null, x == null ? '—' : u ? num(x / u, grande ? 1 : 0) : num(x, 2))))))))));
    }).catch(() => cuerpo.replaceChildren(h('p', { class: 'sv-card-n' }, 'No se ha podido cargar la historia.')));
    return A.tarjeta(['Historia de 10 años ', A.ayuda('sec')], 'Ejercicios presentados a la SEC (formularios 10-K), por año natural. BPA y dividendo por acción ajustados por splits. Con esta historia se calculan los criterios de Graham de beneficios, dividendos y crecimiento del BPA a 10 años.', cuerpo);
  }

  // ---------------------------------------------------------------- ficha: resultados y consenso de los analistas
  function tarjetaConsenso(e) {
    const c = e.consenso || {};
    const dd = e.proximos_resultados ? Math.round((new Date(e.proximos_resultados + 'T00:00:00Z') - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) / 864e5) : null;
    const dl = (pares) => h('dl', { class: 'ap-dl' }, pares.filter(Boolean).map(([k, x]) => [h('dt', null, k), h('dd', null, x)]));
    const dc4 = A.cambioCentral(e.ticker, 4);
    const filas = [
      e.proximos_resultados ? ['Próximos resultados', `${fecha(e.proximos_resultados)}${c.fecha_estimada ? ' (fecha estimada)' : ''}${dd != null && dd >= 0 ? ` · en ${dd} ${dd === 1 ? 'día' : 'días'}` : ''}`] : ['Próximos resultados', 'sin fecha'],
      c.prox_bpa != null ? ['BPA esperado del trimestre', `${usd(c.prox_bpa, 2)}${c.prox_bpa_bajo != null ? ` (entre ${usd(c.prox_bpa_bajo, 2)} y ${usd(c.prox_bpa_alto, 2)})` : ''}${c.prox_ventas ? ` · ventas ${mill(c.prox_ventas / 1e6)}` : ''}`] : null,
      c.ult_bpa != null ? [[`Último trimestre (${fecha(c.ult_trimestre)}) `, A.ayuda('sorpresa')], [`BPA ${usd(c.ult_bpa, 2)} frente a ${usd(c.ult_esperado, 2)} esperado: `, A.potSpan(c.ult_sorpresa, 1)]] : null,
      c.bpa_0y != null ? [[`BPA esperado del ejercicio${c.fin_0y ? ` (cierre ${fecha(c.fin_0y)})` : ''} `, A.ayuda('revision-consenso')], [`${usd(c.bpa_0y, 2)} · en 30 días `, A.potSpan(c.rev30, 1), ' · en 90 días ', A.potSpan(c.rev90, 1)]] : null,
      c.bpa_1y != null ? ['BPA esperado del ejercicio siguiente', [`${usd(c.bpa_1y, 2)} · en 90 días `, A.potSpan(c.rev90_1y, 1)]] : null,
      c.suben30 != null ? ['Analistas en los últimos 30 días', `${c.suben30} suben y ${c.bajan30} bajan su previsión de BPA del ejercicio`] : null,
      dc4 != null ? ['Valor central del modelo en 4 semanas', A.potSpan(dc4, 1)] : null,
    ];
    const t0 = c.tendencia_0y || [], t1 = c.tendencia_1y || [];
    const et = ['−90 d', '−60 d', '−30 d', '−7 d', 'Hoy'];
    const hayT = t0.filter((x) => x != null).length >= 3;
    const s4 = (c.sorpresas || []).filter((x) => x[1] != null);
    return A.tarjeta(['Resultados y consenso ', A.ayuda('consenso')], 'Previsiones de los analistas según Yahoo Finance: si suben, el mercado suele premiarlo; si bajan, conviene revisar la tesis.',
      dl(filas),
      hayT ? h('div', null, h('p', { class: 'ap-mini-t' }, 'Evolución del BPA esperado (ejercicio en curso y siguiente)'),
        G.leyenda([['Ejercicio en curso', 'var(--s1)'], ['Siguiente', 'var(--s3)']]),
        G.caja(150, (cc) => G.lineas(cc, [{ n: 'Ejercicio en curso', color: 'var(--s1)', puntos: et.map((x, i) => [x, t0[i]]) }].concat(t1.filter((x) => x != null).length >= 3 ? [{ n: 'Siguiente', color: 'var(--s3)', puntos: et.map((x, i) => [x, t1[i]]) }] : []), { alto: 150, fmtY: (d) => num(d, 2), fmtTip: (d) => usd(d, 2) }))) : null,
      s4.length ? h('div', { class: 'sv-tw' }, h('table', { class: 'sv-table ap-esc' },
        h('thead', null, h('tr', null, ['Trimestre', 'BPA publicado', 'Esperado', 'Sorpresa'].map((x) => h('th', null, x)))),
        h('tbody', null, s4.slice().reverse().map(([q, a, es]) => h('tr', null, h('td', null, fecha(q)), h('td', null, usd(a, 2)), h('td', null, usd(es, 2)), h('td', null, es ? A.potSpan((a - es) / Math.abs(es), 1) : '—')))))) : null);
  }

  // ---------------------------------------------------------------- ficha: dividendo
  function tarjetaDividendo(e) {
    const d = e.dividendo || {};
    const dl = (pares) => h('dl', { class: 'ap-dl' }, pares.filter(Boolean).map(([k, x]) => [h('dt', null, k), h('dd', null, x)]));
    if (!d.dpa) {
      return A.tarjeta('Dividendo', null, h('p', { class: 'sv-card-n' }, `${e.nombre} no paga dividendo${e.recompras_ttm ? `; en los últimos doce meses ha dedicado ${mill(e.recompras_ttm)} a recomprar acciones` : ''}.`));
    }
    return A.tarjeta(['Dividendo ', A.ayuda('rentabilidad-dividendo')], 'Dividendo anual actual (Yahoo Finance) e historia de los formularios 10-K de la SEC. Los años seguidos subiéndolo son aproximados: dependen de cómo declare cada empresa el dividendo por acción.',
      h('p', { class: 'ap-f' }, h('span', { class: 'ap-f-n' }, pct(d.rent, 2)), h('span', null, ' de rentabilidad')),
      dl([['Dividendo anual por acción', usd(d.dpa, 2)],
        d.payout != null ? [A.conAyuda('Parte del beneficio que reparte (payout)', 'payout'), `${pct(d.payout, 0)}${d.payout > 1 ? ' (más que el beneficio contable)' : ''}`] : null,
        d.ex ? [A.conAyuda('Última fecha ex-dividendo', 'ex-dividendo'), fecha(d.ex)] : null,
        d.paga != null ? ['Años seguidos pagándolo (SEC)', String(d.paga)] : null,
        d.sube != null ? [A.conAyuda('Años seguidos subiéndolo (SEC)', 'dividendo-creciente'), String(d.sube)] : null,
        d.cagr != null ? [`Crecimiento anual ${d.cagr_desde}–${d.cagr_hasta}`, pct(d.cagr, 1, true)] : null]));
  }

  // ---------------------------------------------------------------- ficha: Piotroski y fórmula mágica
  function tarjetaCalidad(e) {
    const p = e.piotroski, gb = e.greenblatt;
    const lista = p ? h('ul', { class: 'ap-checks' }, CRIT.PIOTROSKI.map(([k, t]) => {
      const x = p.d[k];
      return h('li', { class: x == null ? 'ap-na' : x ? 'ap-ok' : 'ap-no' }, h('span', { class: 'ap-check', 'aria-hidden': 'true' }, x == null ? '–' : x ? '✓' : '✗'),
        h('span', { class: 'ap-check-t' }, t), h('span', { class: 'ap-check-v' }, x == null ? 'sin datos' : ''), h('span', { class: 'ap-sr' }, x == null ? ' (sin datos)' : x ? ' (cumple)' : ' (no cumple)'));
    })) : h('p', { class: 'sv-card-n' }, 'Sin dos ejercicios anuales completos para calcularla.');
    const gTxt = gb ? `Puesto ${gb.pos} de ${gb.n} en la fórmula mágica de Greenblatt: rentabilidad del beneficio (EBIT ÷ valor de la empresa) del ${pct(gb.ey, 1)} y rentabilidad del capital (EBIT ÷ activo fijo y NOF) del ${pct(gb.roc, 0)}.` +
      (gb.pos <= 30 ? ' Está entre las 30 primeras.' : '')
      : `No entra en la fórmula mágica: ${e.modelo !== 'fcff' || ['Financials', 'Utilities'].includes(e.sector_gics) ? 'se excluyen financieras, eléctricas y REIT' : 'beneficio operativo no positivo o sin datos'}.`;
    return A.tarjeta(['Calidad: Piotroski y Greenblatt ', A.ayuda('piotroski')], p ? `Puntuación F de Piotroski: ${p.f} de 9 (${p.n} señales con datos), comparando el ejercicio ${String(p.ejercicio || '').slice(0, 4)} con el anterior.` : null,
      p ? h('p', { class: 'ap-f' }, h('span', { class: 'ap-f-n ' + (p.f >= 7 ? 'sv-pos' : p.f <= 3 ? 'sv-neg' : '') }, String(p.f)), h('span', null, ' / 9')) : null,
      lista, h('p', { class: 'sv-kpi-r' }, gTxt, ' ', A.ayuda('greenblatt')));
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
    let val = E.filter((e) => e.valorada && Vs[e.ticker]);
    const col = (i) => G.colores[i % G.colores.length];
    if (val.length) main.append(A.tarjeta('Valor central frente a la cotización', 'Barra: rango bajo–alto; punto: valor central, en % frente a la cotización.',
      G.caja(val.length * 34 + 44, (c) => G.rangos(c, val.map((e) => { const v = Vs[e.ticker]; return { id: e.ticker, n: e.nombre, lo: v.bajo / e.cotizacion - 1, ce: v.pot, hi: v.alto / e.cotizacion - 1 }; }), { rowH: 34, clic: (d) => A.ir('#/empresa/' + d.id) }))));
    // tabla de métricas
    const fc = (e) => e.modelo === 'fcff', ri = (e) => e.modelo === 'ri', rt = (e) => e.modelo === 'reit';
    const fil = [
      ['Sector', (e) => e.sector], ['Subindustria', (e) => e.subindustria], ['Modelo de valoración', (e) => (e.valorada ? { fcff: 'DCF de flujos', ri: 'Beneficio residual', reit: 'AFFO (REIT)' }[e.modelo] : 'sin valorar')],
      ['Cotización', (e) => usd(e.cotizacion, 2)], ['Capitalización', (e) => mill(e.cap)],
      ['Valor central', (e, v) => (v ? usd(v.central) : '—'), true], ['Potencial', (e, v) => (v ? A.potSpan(v.pot) : '—'), true], ['Margen de seguridad', (e, v) => { const m = v && v.central > 0 ? A.margenSeg(v.central, e.cotizacion) : null; return m != null && m > 0 ? pct(m, 0) : 'sin margen'; }],
      ['Rango (bajo – alto)', (e, v) => (v ? `${usd(v.bajo)} – ${usd(v.alto)}` : '—')],
      ['Valor intrínseco: pesimista · base · optimista', (e, v) => (v ? A.ESC.map((sc) => num(v.res[sc].vps, 0)).join(' · ') : '—')], ['Valor por múltiplos', (e, v) => (v ? usd(v.mm) : '—')],
      ['Tasa de descuento (WACC o Ke)', (e, v) => (v ? `${pct(v.w, 1)} ${fc(e) ? 'WACC' : 'Ke'}` : '—')], ['Beta', (e) => num(e.beta, 2)], ['Rating sintético', (e) => e.rating || '—'],
      ['Crecimiento año 1 · año 2', (e) => (fc(e) && e.tr ? `${pct(e.tr.g1[1], 1)} · ${pct(e.tr.g2[1], 1)} (ventas)` : rt(e) && e.reit ? `${pct(e.reit.g1[1], 1)} · ${pct(e.reit.g2[1], 1)} (AFFO)` : ri(e) && e.ri ? `${pct(e.ri.bpa2[1] / e.ri.bpa1[1] - 1, 1)} (BPA, año 2)` : '—')],
      ['Rentabilidad: hoy · año 2 · largo plazo', (e, v) => (fc(e) && e.tr ? `${pct(e.ebit_ttm / e.ventas_ttm, 1)} · ${pct(e.tr.m2[1], 1)} · ${pct(e.tr.m10[1], 1)} (margen EBITA)`
        : ri(e) && v ? `${pct(e.ri.roe_ttm, 1)} · ${pct(v.res.base.roe2, 1)} · ${pct(v.res.base.roeLT, 1)} (ROE)` : rt(e) && e.reit ? `${pct(e.reit.ffo_ps / e.cotizacion, 1)} (FFO / cotización)` : '—')],
      ['Lo que descuenta la cotización', (e, v) => { if (!v || !v.valido) return '—'; const g = MOTOR.implicito(e, A.S.par, A.aj(e.ticker), v); return g == null ? 'n.s.' : `${pct(g, 1)} ${fc(e) ? '(crec. ventas años 1–5)' : ri(e) ? '(ROE a largo plazo)' : '(crec. AFFO años 1–5)'}`; }],
      ['Peso del valor terminal', (e, v) => (v ? pct(v.res.base.pesoTv, 0) : '—')],
      ['Múltiplos adelantados', (e) => { const a = e.adelantados || {}; return fc(e) ? `PER ${veces(a.per)} · EV/EBITDA ${veces(a.ev_ebitda)}` : ri(e) ? `PER ${veces(a.per)} · P/VC ${veces(a.pb, 2)}` : rt(e) ? `P/FFO ${veces(a.pffo)} · EV/EBITDA ${veces(a.ev_ebitda_ttm)}` : '—'; }],
      ['PER TTM · precio / valor contable', (e) => `${veces((e.graham || {}).per)} · ${veces((e.graham || {}).pb)}`],
      ['Número de Graham', (e) => usd((e.graham || {}).ng, 2)], ['Criterios de Graham', (e) => { const g = A.graham(e); return `${g.puntos} de ${g.total}`; }],
      ['Rentabilidad por dividendo', (e) => pct((e.graham || {}).div, 1)], ['Deuda neta / EBITDA', (e) => (ri(e) && e.sector_gics === 'Financials' ? 'no aplica' : veces((e.graham || {}).dn_ebitda))],
      ['Precio objetivo de los analistas', (e) => (e.analistas && e.analistas.objetivo ? `${usd(e.analistas.objetivo, 0)} (${pct(e.analistas.objetivo / e.cotizacion - 1, 0, true)})` : '—')],
    ];
    main.append(A.tarjeta('Indicadores', null, h('div', { class: 'sv-tw' }, h('table', { class: 'sv-table ap-cmp-t' },
      h('thead', null, h('tr', null, h('th', null, ''), E.map((e, i) => h('th', null, h('a', { href: '#/empresa/' + e.ticker }, h('i', { class: 'ap-pt', style: { background: col(i) } }), e.nombre))))),
      h('tbody', null, fil.map(([n, f, fuerte]) => h('tr', null, h('td', null, n), E.map((e) => { const v = e.valorada ? Vs[e.ticker] : null; const x = f(e, v); return h('td', { class: fuerte ? 'sv-strong' : null }, x instanceof Node ? x : String(x)); }))))))));
    const valRi = val.filter(ri);
    if (valRi.length >= 2) {
      const anios = d3.range(1, 11).map(String);
      main.append(A.tarjeta('ROE proyectado (caso base)', 'Empresas valoradas por beneficio residual: ROE de cada año (años 1–2 del consenso y convergencia a largo plazo).', G.leyenda(valRi.map((e) => [e.nombre, col(E.indexOf(e))])),
        G.caja(220, (c) => G.lineas(c, valRi.map((e) => ({ n: e.nombre, color: col(E.indexOf(e)), puntos: anios.map((a, k) => [a, Vs[e.ticker].res.base.filas[k].roe]) })), { fmtY: (d) => pct(d, 0), fmtTip: (d) => pct(d, 1), prefijo: 'Año ' }))));
    }
    val = val.filter(fc);
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
  const scripts = {};
  A.cargarScript = (src) => scripts[src] || (scripts[src] = new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { delete scripts[src]; ko(new Error('No se pudo cargar ' + src)); }; document.head.append(s);
  }));

  // tarjetas y textos que reutiliza el informe (js/informe.js)
  A.tj = { frase, tarjetaProyeccion, tarjetaProyeccionF2, tarjetaComparables, tarjetaGraham, tarjetaAnalistas, tarjetaSupuestos, tarjetaSupuestosF2,
    tarjetaCalidad, tarjetaConsenso, tarjetaDividendo, tarjetaCotizacion, tarjetaHistoria, historicoDe };

  // ---------------------------------------------------------------- MÉTODO
  V.metodo = function (main) {
    const R = (A.D.estado || {}).no_valoradas || {};
    const li = (b, txt) => h('li', null, h('b', null, b + ' '), txt);
    main.append(h('header', { class: 'sv-head' }, h('h1', { class: 'sv-h1' }, 'Cómo se calcula'),
      h('p', { class: 'sv-take' }, 'Las mismas reglas para todas las empresas, con los criterios del modelo de las 7 Magníficas pero sin ajustes manuales empresa a empresa (salvo las propias 7 Magníficas, que usan su valoración revisada).'),
      h('p', { class: 'sv-meta' }, h('a', { href: '#/glosario' }, 'Glosario de términos ›'))));
    const n = (m) => A.D.emp.filter((e) => e.valorada && e.modelo === m).length;
    main.append(A.tarjeta('Tres modelos según el tipo de empresa', null, h('ul', { class: 'sv-method' },
      li(`DCF de flujos de caja libres (${n('fcff')} empresas).`, 'Empresas industriales, tecnológicas, de consumo, salud, energía, etc.: el valor es el de sus flujos de caja libres para todos los inversores, menos la deuda neta.'),
      li(`Beneficio residual (${n('ri')} empresas).`, 'Bancos, aseguradoras, gestoras, financieras y eléctricas reguladas: su deuda es parte del negocio (depósitos, reservas técnicas) o su rentabilidad está regulada sobre una base de activos, así que se valora directamente el patrimonio por su rentabilidad (ROE) frente a su coste (Ke).'),
      li(`Descuento del AFFO (${n('reit')} REIT).`, 'Sociedades de inversión inmobiliaria: el valor es el del flujo de caja recurrente disponible para el accionista (AFFO), con P/FFO y EV/EBITDA de sus comparables.'))));
    main.append(A.tarjeta('DCF de flujos de caja libres', null, h('ul', { class: 'sv-method' },
      li('Datos.', 'Lista del S&P 500 con su clasificación GICS (Wikipedia). Estados financieros normalizados de los últimos doce meses y del último balance trimestral, cotizaciones, betas y consenso de analistas de Yahoo Finance. La actualización completa es cada lunes; además, de lunes a viernes, después del cierre de Wall Street, se actualizan las cotizaciones, el tipo sin riesgo y los múltiplos.'),
      li('Años 1–2.', 'Consenso de ventas y BPA (mínimo, medio y máximo) llevado a doce meses desde el último trimestre publicado. El BPA se convierte en beneficio operativo con la diferencia que había en los últimos doce meses entre el BPA publicado y el beneficio operativo; si el consenso usa un BPA "ajustado" muy distinto del contable, se resta la remuneración en acciones.'),
      li('Años 3–10.', 'El crecimiento converge linealmente al 3,5 % del año 10; el margen converge a un margen de largo plazo que recorre un 30 % de la distancia hasta la mediana de sus comparables (sin moverse más de un 30 % respecto al del año 2). Escenario pesimista: −15 % de margen a largo plazo; optimista: +10 %.'),
      li('EBITA.', 'Se usa el beneficio operativo antes de la amortización de intangibles adquiridos y, en coherencia, la amortización que se suma al flujo es solo la de los activos propios.'),
      li('Inversión.', 'CapEx sobre ventas de los últimos doce meses que converge a 1,25 veces la amortización si hoy es mayor; NOF constantes sobre ventas.'),
      li('WACC.', 'Ke = tipo sin riesgo + beta × prima de riesgo. Beta = media de la beta de Yahoo (5 años) y la beta de su industria desapalancada y vuelta a apalancar con la deuda de la empresa, con un mínimo de 0,6. Coste de la deuda = tipo sin riesgo + diferencial por rating sintético (cobertura de intereses).'),
      li('Valor terminal.', 'Por inductores: NOPAT del año 11 × (1 − g / ROIC terminal) / (WACC − g), con el ROIC terminal entre el WACC y el ROIC del año 10 (tope del 40 %). Alternativa: Gordon.'),
      li('Múltiplos.', 'PER y EV/EBITDA adelantados de las empresas del S&P 500 de su misma subindustria (de su industria si en la subindustria hay menos de cinco con múltiplos válidos, y de su sector si aun así hay menos de tres), las diez más parecidas en tamaño; se descartan PER por encima de 60 y EV/EBITDA por encima de 40.'),
      li('Valor central.', '50 % DCF ponderado por escenarios (25/50/25) + 50 % media de los valores por PER y EV/EBITDA. Margen de seguridad = 1 − cotización ÷ valor.'),
      li('Fiabilidad.', 'Se marcan las valoraciones con beneficio operativo negativo, patrimonio negativo en algún escenario, valor central menor del 20 % o mayor del triple de la cotización, sin consenso o con mucho peso del valor terminal. Las graves se excluyen por defecto del filtro de oportunidades.'),
      li('Fusiones, adquisiciones y consensos no comparables.', 'Si el consenso del próximo trimestre prevé un salto de ventas incompatible con el último trimestre publicado (más de un 50 % por encima o un 40 % por debajo), o parte de unas ventas del año anterior distintas de las publicadas (cifras pro forma), el consenso no es comparable con los estados financieros: suele ser una empresa comprada o vendida que las cuentas todavía no recogen, aunque también puede ser un cambio brusco de ciclo o una definición distinta de los ingresos (por ejemplo, ingresos netos en las bolsas). En ese caso los años 1–2 siguen la tendencia histórica y la valoración se marca como poco fiable para revisarla.'),
      li('Las 7 Magníficas.', 'Por defecto usan la valoración revisada a mano en el Simulador 7M (crecimiento, márgenes, inversión, beta y comparables), con el mismo motor. Se puede volver al modelo automático en los supuestos generales.'))));
    main.append(A.tarjeta('Beneficio residual', null, h('ul', { class: 'sv-method' },
      li('Fórmula.', 'Valor por acción = valor contable + valor actual de (ROE − Ke) × valor contable de cada año + valor terminal (el beneficio residual del año 11 creciendo a g). Es equivalente a descontar dividendos, pero parte del valor contable, que en estos negocios es una buena medida del capital invertido.'),
      li('Años 1–2.', 'BPA del consenso (mínimo, medio y máximo) llevado a doce meses desde el último trimestre publicado; el ROE es ese BPA sobre el valor contable de cada año.'),
      li('Largo plazo.', 'El ROE converge linealmente hasta el año 10 a Ke + un porcentaje del diferencial del año 2 sobre Ke: el 25 % en el escenario pesimista, el 50 % en el base y el 75 % en el optimista (la misma convergencia que el ROIC del DCF). El reparto (dividendos y recompras) pasa del actual al que sostiene un crecimiento g a largo plazo: 1 − g / ROE.'),
      li('Ke y beta.', 'Ke = tipo sin riesgo + beta × prima de riesgo. Beta = media de la de Yahoo y la mediana de su industria (sin desapalancar: aquí la deuda es parte de la actividad), con un mínimo de 0,6.'),
      li('Múltiplos.', 'PER adelantado y precio / valor contable de comparables con el mismo modelo (P/VC hasta 10).'),
      li('Lo que descuenta la cotización.', 'ROE a largo plazo que iguala el valor del caso base a la cotización.'))));
    main.append(A.tarjeta('REIT: descuento del AFFO', null, h('ul', { class: 'sv-method' },
      li('FFO y AFFO.', 'FFO (funds from operations) = beneficio + amortización − partidas no recurrentes (plusvalías por venta de inmuebles, deterioros). AFFO ≈ 85 % del FFO: se descuenta el 15 % como inversión de mantenimiento, que Yahoo no publica por separado.'),
      li('Proyección.', 'El AFFO por acción crece en los años 1–2 como los ingresos del consenso (mínimo, medio y máximo) y converge a g en el año 10; valor terminal de Gordon. Se descuenta el AFFO y no el dividendo, porque lo que no se reparte se reinvierte en nuevos inmuebles.'),
      li('Múltiplos.', 'P/FFO de los últimos doce meses (hasta 50) y EV/EBITDA (hasta 40) de otros REIT de su subindustria o industria.'),
      li('Lo que descuenta la cotización.', 'Crecimiento anual del AFFO en los años 1–5 que iguala el valor del caso base a la cotización.'))));
    main.append(A.tarjeta('Filtro de oportunidades (inversión en valor)', null, h('ul', { class: 'sv-method' },
      li('Idea.', 'Benjamin Graham proponía comprar solo con un margen de seguridad: que el valor estimado supere con holgura a la cotización, para cubrir errores de estimación.'),
      li('Valor de referencia.', 'Puedes exigir el margen sobre el valor bajo (el más prudente), el escenario pesimista del modelo intrínseco, el valor central, el caso base o el valor alto.'),
      li('Criterios del inversor defensivo.', 'PER ≤ 15; precio/valor contable ≤ 1,5 (o PER × P/VC ≤ 22,5); liquidez ≥ 2; deuda neta ≤ 3 × EBITDA; beneficios positivos los 10 últimos años; dividendos ininterrumpidos 10 años; crecimiento del BPA de al menos un tercio en 10 años (medias de tres años al principio y al final); cotización por debajo del número de Graham. La historia de 10 años sale de los estados financieros presentados a la SEC; si una empresa no la tiene, se usan los 4 años de Yahoo (y un crecimiento del BPA ≥ 10 %). Como en Graham, la liquidez no se exige a financieras, eléctricas ni REIT; en las eléctricas la solidez es deuda ≤ 2 × patrimonio, en los REIT deuda neta ≤ 6 × EBITDA y en bancos y aseguradoras no se aplica.'),
      li('Puntuación F de Piotroski.', 'Nueve señales con los dos últimos ejercicios anuales, un punto cada una: rentabilidad sobre activos positiva y creciente, flujo de explotación positivo y mayor que el beneficio, menos deuda a largo plazo sobre activos, más liquidez, sin emitir acciones, más margen bruto y más rotación de activos.'),
      li('Fórmula mágica de Greenblatt.', 'Se ordenan las empresas valoradas por DCF (sin financieras ni eléctricas) por rentabilidad del beneficio (EBIT ÷ valor de la empresa) y por rentabilidad del capital (EBIT ÷ activo fijo neto + NOF); la suma de los dos puestos da la clasificación.'),
      li('Aviso.', 'Es un filtro para encontrar candidatas que estudiar a fondo, no una recomendación de compra: el modelo es automático y no conoce todos los hechos recientes (litigios, cambios de negocio).'))));
    main.append(A.tarjeta('Actualizaciones, seguimiento y avisos', null, h('ul', { class: 'sv-method' },
      li('Cada lunes.', 'Actualización completa: estados financieros, consenso, comparables, historia de la SEC y todas las valoraciones.'),
      li('De lunes a viernes.', 'Al cierre de Wall Street se actualizan las cotizaciones, la capitalización, el tipo sin riesgo y los múltiplos (PER, P/VC, EV/EBITDA, rentabilidad por dividendo); el valor de cada empresa se recalcula en la app con esos datos.'),
      li('Estrategias.', `${CRIT.ESTRATEGIAS.map((x) => x.n).join('; ')}. Cada lunes se guardan sus candidatas con los supuestos por defecto.`),
      li('Rentabilidad.', 'La de cada semana es la media, con pesos iguales, de la variación de la cotización de las candidatas de la semana anterior (sin dividendos ni costes), y se compara con el S&P 500 y con la media de todas las empresas valoradas.'),
      li('Avisos por correo.', 'Al terminar la actualización del lunes se abre un aviso (issue) en GitHub con las empresas que entran y salen de cada estrategia, las empresas seguidas que se mueven más de un 10 %, tus alertas que se cumplen y los próximos resultados; GitHub lo envía por correo. Cada día laborable, si alguna de tus alertas pasa a cumplirse, llega otro aviso.'),
      li('Tus alertas.', 'Precio de compra, precio de venta y margen de seguridad mínimo de cada empresa, en «Mi seguimiento» de su ficha. La app las comprueba al abrirla; para recibirlas por correo, copia su configuración (en «Seguimiento › Tus datos») en el fichero pipeline/avisos.json del repositorio.'))));
    main.append(A.tarjeta('Tu cartera y tus datos', null, h('ul', { class: 'sv-method' },
      li('Mi cartera.', 'Compras con su precio y fecha; la app calcula el valor (en dólares y en euros), la ganancia, el potencial ponderado por el peso de cada posición con el valor central, los dividendos anuales, la beta y el peso por sector.'),
      li('Notas.', 'En la ficha de cada empresa puedes escribir tu tesis y tus precios de compra y de venta; aparecen también en el informe.'),
      li('Privacidad.', 'Todo se guarda solo en el navegador del dispositivo: no se envía a ningún servidor.'),
      li('Otros dispositivos.', 'Con el enlace o el fichero de «Seguimiento › Tus datos» los abres en el móvil o en otro ordenador, combinándolos con los que haya o sustituyéndolos.'))));
    main.append(A.tarjeta('Más datos', null, h('ul', { class: 'sv-method' },
      li('Historia de 10 años.', 'Ventas, beneficio, BPA, dividendos, patrimonio y flujo de explotación de los formularios 10-K presentados a la SEC (API XBRL "frames", por año natural). BPA y dividendo por acción ajustados por splits.'),
      li('Cotizaciones.', 'Cierres semanales de los últimos 5 años de Yahoo Finance, y el S&P 500 para comparar.'),
      li('Resultados y consenso.', 'Próxima fecha de resultados, BPA y ventas esperados para el trimestre, sorpresas de los cuatro últimos trimestres y revisiones de la previsión de BPA de los analistas en los últimos 7, 30 y 90 días (Yahoo Finance).'),
      li('Dividendo.', 'Dividendo anual y fecha ex-dividendo de Yahoo Finance; años seguidos pagándolo y subiéndolo y su crecimiento anual, de la historia de la SEC.'),
      li('Excel.', 'Desde la ficha de cada empresa se puede descargar la valoración en una hoja de cálculo con fórmulas: los supuestos en amarillo, la proyección de los tres escenarios, el valor terminal, los múltiplos y el valor central.'),
      li('Informe en PDF.', 'El botón «Informe PDF» de la ficha descarga el informe completo de la empresa, en castellano o en catalán: portada con las cifras clave, resumen con puntos fuertes y riesgos, catalizadores, análisis financiero de 10 años, valoración (WACC, escenarios, sensibilidad, lo que descuenta la cotización, múltiplos y puente hasta el valor por acción), comparables, inversión en valor y calidad, conclusiones y fuentes. Se genera en el propio navegador con los supuestos que tengas en el simulador.'),
      li('Glosario.', h('a', { href: '#/glosario' }, 'Todos los términos explicados ›')))));
    if (Object.keys(R).length) main.append(A.tarjeta('Empresas sin valorar', 'Componentes del índice que no se valoran esta semana.',
      h('ul', { class: 'sv-method' }, Object.entries(R).map(([m, n]) => h('li', null, `${m}: ${n}`)))));
    main.append(A.tarjeta('Versión', null, h('p', { class: 'sv-card-n' }, `App ${A.VERSION}. Datos actualizados el ${fecha((A.D.estado || {}).actualizado)}.`)));
  };
})(window.APP);
