// Simulador S&P 500 · informe de valoración de una empresa (pantalla, impresión y PDF). Sigue la estructura de los informes
// de análisis: resumen con puntos fuertes y riesgos, catalizadores, análisis financiero de 10 años, valoración, comparables,
// inversión en valor y calidad, cotización, supuestos, conclusiones y fuentes.
(function (A) {
  const { h, num, pct, pp, usd, mill, fecha, veces, G } = A;
  const V = A.vistas;

  // ---------------------------------------------------------------- diagnóstico: puntos fuertes, riesgos y qué vigilar
  function rocDe(e, v) {
    if (e.modelo !== 'fcff' || !e.capital_invertido || e.capital_invertido <= 0) return null;
    return (e.ebit_ttm * (1 - e.tipo_impositivo)) / e.capital_invertido;
  }
  function cagr(serie, años) {
    const xs = serie.map((x, i) => [años[i], x]).filter(([, x]) => x != null && x > 0);
    if (xs.length < 3) return null;
    const [a0, x0] = xs[0], [a1, x1] = xs[xs.length - 1];
    return a1 > a0 ? { g: (x1 / x0) ** (1 / (a1 - a0)) - 1, a0, a1 } : null;
  }
  A.diagnostico = function (e, v, hist) {
    const fuertes = [], riesgos = [];
    const g = e.graham || {}, c = e.consenso || {}, d = e.dividendo || {}, pf = e.piotroski, gb = e.greenblatt;
    const roic = rocDe(e, v), ms = A.margenSeg(v.central, e.cotizacion), av = A.avisosDe(e, v);
    if (roic != null && roic > v.w + 0.02) fuertes.push(`Rentabilidad sobre el capital invertido (ROIC) del ${pct(roic, 0)}, por encima de su coste (WACC del ${pct(v.w, 1)}): el negocio crea valor.`);
    if (roic != null && roic < v.w) riesgos.push(`Rentabilidad sobre el capital invertido (ROIC) del ${pct(roic, 1)}, por debajo de su coste (WACC del ${pct(v.w, 1)}).`);
    if (e.modelo === 'ri' && e.ri && e.ri.roe_ttm != null) (e.ri.roe_ttm > v.w + 0.02 ? fuertes : e.ri.roe_ttm < v.w ? riesgos : []).push(`ROE de los últimos doce meses del ${pct(e.ri.roe_ttm, 1)} frente a un coste de los recursos propios del ${pct(v.w, 1)}.`);
    if (g.dn_ebitda != null && e.sector_gics !== 'Financials') {
      if (g.dn_ebitda < 0) fuertes.push('Caja neta: no tiene deuda financiera neta.');
      else if (g.dn_ebitda < 1) fuertes.push(`Deuda baja: la deuda neta equivale a ${veces(g.dn_ebitda)} el EBITDA.`);
      else if (g.dn_ebitda > 3) riesgos.push(`Deuda neta elevada: ${veces(g.dn_ebitda)} el EBITDA.`);
    }
    if (e.cobertura != null && e.cobertura < 3 && e.modelo === 'fcff') riesgos.push(`Cobertura de intereses baja: el beneficio operativo es ${veces(e.cobertura)} los gastos financieros.`);
    if (hist) {
      const cv = cagr(hist.ventas, hist.años);
      if (cv && cv.g > 0.07) fuertes.push(`Ventas creciendo un ${pct(cv.g, 1)} anual entre ${cv.a0} y ${cv.a1}.`);
      if (cv && cv.g < 0) riesgos.push(`Ventas cayendo un ${pct(-cv.g, 1)} anual entre ${cv.a0} y ${cv.a1}.`);
      const ni = hist.beneficio.filter((x) => x != null);
      const neg = ni.filter((x) => x < 0).length;
      if (ni.length >= 6 && neg === 0) fuertes.push(`Beneficios positivos en los ${ni.length} ejercicios presentados a la SEC.`);
      if (neg > 0) riesgos.push(`Pérdidas en ${neg} de los últimos ${ni.length} ejercicios.`);
    }
    if (d.sube >= 8) fuertes.push(`${d.sube} años seguidos subiendo el dividendo${d.cagr != null ? ` (${pct(d.cagr, 1, true)} anual)` : ''}.`);
    if (d.payout != null && d.payout > 1 && e.modelo !== 'reit') riesgos.push(`Reparte más dividendo que beneficio contable (payout del ${pct(d.payout, 0)}).`);
    if (pf && pf.n >= 8 && pf.f >= 7) fuertes.push(`Puntuación F de Piotroski de ${pf.f} sobre 9: solidez financiera y mejora en el último ejercicio.`);
    if (pf && pf.n >= 8 && pf.f <= 3) riesgos.push(`Puntuación F de Piotroski de ${pf.f} sobre 9: señales de deterioro en el último ejercicio.`);
    if (gb && gb.pos <= 50) fuertes.push(`Puesto ${gb.pos} de ${gb.n} en la fórmula mágica de Greenblatt (beneficio alto frente a su precio y a su capital).`);
    if (c.rev90 != null && c.rev90 > 0.03) fuertes.push(`Los analistas han subido un ${pct(c.rev90, 1)} su previsión de BPA del ejercicio en los últimos 90 días.`);
    if (c.rev90 != null && c.rev90 < -0.03) riesgos.push(`Los analistas han bajado un ${pct(-c.rev90, 1)} su previsión de BPA del ejercicio en los últimos 90 días.`);
    if (c.ult_sorpresa != null && c.ult_sorpresa < -0.05) riesgos.push(`En el último trimestre el BPA quedó un ${pct(-c.ult_sorpresa, 0)} por debajo de lo esperado.`);
    if (c.ult_sorpresa != null && c.ult_sorpresa > 0.05) fuertes.push(`En el último trimestre el BPA superó en un ${pct(c.ult_sorpresa, 0)} lo esperado.`);
    if (A.fiable(e, v) && ms != null && ms >= 0.25) fuertes.push(`Cotiza con un margen de seguridad del ${pct(ms, 0)} sobre el valor central.`);
    if (v.valido && v.central > 0 && e.cotizacion / v.central - 1 > 0.2) riesgos.push(`La cotización supera en un ${pct(e.cotizacion / v.central - 1, 0)} el valor central: descuenta más de lo que recoge el modelo.`);
    if (v.res.base.pesoTv > 0.75) riesgos.push(`El valor terminal pesa el ${pct(v.res.base.pesoTv, 0)} del valor: la valoración depende mucho del largo plazo.`);
    if ((v.W.beta || e.beta) > 1.4) riesgos.push(`Beta de ${num(v.W.beta || e.beta, 2)}: más volátil que el mercado.`);
    for (const a of av) if (A.AVISOS[a] && A.AVISOS[a].grave) riesgos.unshift(A.AVISOS[a].t + '.');
    return { fuertes: fuertes.slice(0, 6), riesgos: riesgos.slice(0, 6) };
  };

  // ---------------------------------------------------------------- análisis financiero de 10 años (SEC) y ratios
  function tablaHistoria(d, U, uT, fin) {
    const años = d.años.map(String);
    const i0 = d.años.findIndex((a, i) => ['ventas', 'beneficio', 'bpa'].some((k) => d[k] && d[k][i] != null));
    const sl = (k) => (d[k] || []).slice(i0);
    const ventas = sl('ventas'), ebit = sl('ebit'), ni = sl('beneficio'), cfo = sl('cfo'), pat = sl('patrimonio');
    const dec = U === 1000 ? 1 : 0;
    const filas = [
      ['Ventas', ventas.map((x) => (x == null ? null : num(x / U, dec)))],
      ['Crecimiento de las ventas', ventas.map((x, i) => (i && x != null && ventas[i - 1] ? pct(x / ventas[i - 1] - 1, 1) : null))],
      ['Resultado de explotación (EBIT)', ebit.map((x) => (x == null ? null : num(x / U, dec)))],
      ['Margen de explotación', ebit.map((x, i) => (x != null && ventas[i] ? pct(x / ventas[i], 1) : null))],
      ['Beneficio neto', ni.map((x) => (x == null ? null : num(x / U, dec)))],
      ['Margen neto', ni.map((x, i) => (x != null && ventas[i] ? pct(x / ventas[i], 1) : null))],
      ['BPA ($)', sl('bpa').map((x) => (x == null ? null : num(x, 2)))],
      ['Dividendo por acción ($)', sl('dpa').map((x) => (x == null ? null : num(x, 2)))],
      ['Flujo de explotación', cfo.map((x) => (x == null ? null : num(x / U, dec)))],
      fin ? null : ['Conversión en caja (flujo ÷ beneficio)', cfo.map((x, i) => (x != null && ni[i] > 0 ? veces(x / ni[i], 2) : null))],
      ['Patrimonio neto', pat.map((x) => (x == null ? null : num(x / U, dec)))],
      ['ROE (beneficio ÷ patrimonio)', ni.map((x, i) => (x != null && pat[i] > 0 ? pct(x / pat[i], 1) : null))],
    ].filter((f) => f && f[1].some((x) => x != null));
    return h('div', { class: 'sv-tw' }, h('table', { class: 'sv-table ap-proy ap-hist' },
      h('thead', null, h('tr', null, h('th', null, uT), años.slice(i0).map((a) => h('th', null, a)))),
      h('tbody', null, filas.map(([n, xs]) => h('tr', null, h('td', null, n), xs.map((x) => h('td', null, x == null ? '—' : x)))))));
  }
  function lecturaRatios(e, v, hist) {
    const g = e.graham || {}, d = e.dividendo || {}, pf = e.piotroski, mu = e.mu || {}, a = e.adelantados || {};
    const filas = [];
    if (e.modelo === 'fcff' && e.ventas_ttm) {
      const m = e.ebit_ttm / e.ventas_ttm;
      filas.push(['Margen EBITA (últimos doce meses)', pct(m, 1), m > 0.25 ? 'Muy alto: fuerte poder de fijación de precios o ventaja competitiva.' : m > 0.15 ? 'Alto.' : m > 0.05 ? 'Intermedio.' : m > 0 ? 'Bajo: poco margen ante una caída de ventas.' : 'Negativo: pierde dinero en la explotación.']);
      const roic = rocDe(e, v);
      if (roic != null) filas.push(['ROIC (NOPAT ÷ capital invertido)', pct(roic, 1), roic > v.w ? `Supera su coste de capital (WACC del ${pct(v.w, 1)}): crea valor al invertir.` : `No cubre su coste de capital (WACC del ${pct(v.w, 1)}).`]);
    }
    if (e.modelo === 'ri' && e.ri) filas.push(['ROE (últimos doce meses)', pct(e.ri.roe_ttm, 1), e.ri.roe_ttm > v.w ? `Por encima de su coste de los recursos propios (${pct(v.w, 1)}).` : `Por debajo de su coste de los recursos propios (${pct(v.w, 1)}).`]);
    if (e.modelo === 'reit' && e.reit) filas.push(['Cobertura del dividendo (FFO ÷ dividendo)', veces(e.reit.cobertura, 2), e.reit.cobertura >= 1.2 ? 'Holgada.' : e.reit.cobertura >= 1 ? 'Justa.' : 'El dividendo supera al FFO.']);
    if (g.dn_ebitda != null && e.sector_gics !== 'Financials') filas.push(['Deuda neta ÷ EBITDA', g.dn_ebitda < 0 ? 'caja neta' : veces(g.dn_ebitda, 1), g.dn_ebitda < 0 ? 'Más caja que deuda financiera.' : g.dn_ebitda < 1 ? 'Endeudamiento bajo.' : g.dn_ebitda <= 3 ? 'Endeudamiento moderado.' : 'Endeudamiento alto.']);
    if (g.rc != null && CRIT.tipoE(e) === 'general') filas.push(['Liquidez (activo corriente ÷ pasivo corriente)', veces(g.rc, 2), g.rc >= 2 ? 'Holgada (criterio de Graham).' : g.rc >= 1 ? 'Suficiente.' : 'Ajustada: el pasivo corriente supera al activo corriente.']);
    if (e.cobertura != null && e.modelo === 'fcff') filas.push(['Cobertura de intereses (EBIT ÷ gastos financieros)', veces(e.cobertura, 1), e.cobertura > 8 ? 'Holgada.' : e.cobertura >= 3 ? 'Suficiente.' : 'Ajustada.']);
    if (hist && e.sector_gics !== 'Financials') {
      const ni = hist.beneficio, cfo = hist.cfo;
      const k = ni.map((x, i) => (x != null && x > 0 && cfo[i] != null ? i : -1)).filter((i) => i >= 0).pop();
      if (k != null) { const r = cfo[k] / ni[k]; filas.push([`Conversión en caja ${hist.años[k]} (flujo de explotación ÷ beneficio)`, veces(r, 2), r >= 1 ? 'El beneficio se convierte en caja: buena calidad del beneficio.' : r >= 0.8 ? 'Aceptable.' : 'Baja: conviene revisar la calidad del beneficio.']); }
    }
    if (g.per != null) filas.push(['PER (últimos doce meses)', veces(g.per, 1), g.per <= 15 ? 'Barato según Graham (≤ 15).' : g.per <= 25 ? 'Intermedio.' : 'Exigente: el precio descuenta crecimiento.']);
    const perMed = mu.per_mediana || ((mu.metodos || []).find((m) => m.mult && /^PER/.test(m.n)) || { mult: {} }).mult.med;
    if (a.per != null) filas.push(['PER adelantado', veces(a.per, 1), perMed ? `Mediana de sus comparables: ${veces(perMed, 1)}.`
      : g.per != null ? (a.per < g.per ? 'Por debajo del PER actual: los analistas esperan más beneficio.' : 'Por encima del PER actual: los analistas esperan menos beneficio.') : '—']);
    if (d.dpa) filas.push(['Rentabilidad por dividendo', pct(d.rent, 2), d.payout != null ? `Reparte el ${pct(d.payout, 0)} del beneficio${d.sube >= 2 ? ` y lleva ${d.sube} años subiéndolo` : ''}.` : '—']);
    if (pf) filas.push(['Puntuación F de Piotroski', `${pf.f} de 9`, pf.f >= 7 ? 'Sólida y mejorando.' : pf.f >= 4 ? 'Intermedia.' : 'Débil.']);
    return h('div', { class: 'sv-tw' }, h('table', { class: 'sv-table ap-esc ap-ratios' },
      h('thead', null, h('tr', null, ['Ratio', 'Valor', 'Lectura'].map((x) => h('th', null, x)))),
      h('tbody', null, filas.map(([n, x, l]) => h('tr', null, h('td', null, n), h('td', null, x), h('td', { class: 'ap-txt ap-lect' }, l))))));
  }
  function seccionFinanzas(e, v, H) {
    const d = H && H[e.ticker];
    if (!d || !d.años) return [h('p', null, 'Sin historia de la SEC para esta empresa: el análisis usa las cifras de los últimos doce meses.'), lecturaRatios(e, v, null)];
    const grande = Math.max(...(d.ventas || []).filter((x) => x != null).map(Math.abs), 0) > 2e5;
    const U = grande ? 1000 : 1, uT = grande ? 'miles de M$' : 'M$';
    const i0 = d.años.findIndex((a, i) => ['ventas', 'beneficio'].some((k) => d[k] && d[k][i] != null));
    const años = d.años.slice(i0).map(String), S = (k) => (d[k] || []).slice(i0);
    const cv = cagr(S('ventas'), d.años.slice(i0)), cb = cagr(S('bpa'), d.años.slice(i0));
    const mg = S('ebit').map((x, i) => (x != null && S('ventas')[i] ? x / S('ventas')[i] : null)), mn = S('beneficio').map((x, i) => (x != null && S('ventas')[i] ? x / S('ventas')[i] : null));
    const ult = mg.filter((x) => x != null), ultN = mn.filter((x) => x != null);
    const texto = [cv ? `Las ventas han pasado de ${mill(S('ventas').find((x) => x != null))} a ${mill(S('ventas').filter((x) => x != null).pop())} (${pct(cv.g, 1, true)} anual entre ${cv.a0} y ${cv.a1})` : null,
      cb ? (cb.g >= 0 ? `el BPA ha crecido un ${pct(cb.g, 1)} anual` : `el BPA ha caído un ${pct(-cb.g, 1)} anual`) : null,
      ult.length >= 2 ? `el margen de explotación ha ido del ${pct(ult[0], 1)} al ${pct(ult[ult.length - 1], 1)}` : null,
      ultN.length >= 2 ? `y el margen neto, del ${pct(ultN[0], 1)} al ${pct(ultN[ultN.length - 1], 1)}` : null].filter(Boolean).join('; ');
    return [
      h('p', null, (texto ? texto.charAt(0).toUpperCase() + texto.slice(1) + '.' : '') + ' Cifras de los formularios 10-K presentados a la SEC, por año natural.'),
      tablaHistoria(d, U, uT, e.sector_gics === 'Financials'),
      h('div', { class: 'sv-grid2' },
        h('div', null, h('p', { class: 'ap-mini-t' }, `Ventas y beneficio neto (${uT})`), G.leyenda([['Ventas', 'var(--s1)'], ['Beneficio neto', 'var(--s3)']]),
          G.caja(200, (c) => G.lineas(c, [{ n: 'Ventas', color: 'var(--s1)', puntos: años.map((a, i) => [a, S('ventas')[i] == null ? NaN : S('ventas')[i] / U]) },
            { n: 'Beneficio neto', color: 'var(--s3)', puntos: años.map((a, i) => [a, S('beneficio')[i] == null ? NaN : S('beneficio')[i] / U]) }], { alto: 200, cero: true, fmtY: (x) => num(x, 0), fmtTip: (x) => `${num(x, grande ? 1 : 0)} ${uT}` }))),
        h('div', null, h('p', { class: 'ap-mini-t' }, 'Márgenes'), G.leyenda([['Margen de explotación', 'var(--s1)'], ['Margen neto', 'var(--s2)']]),
          G.caja(200, (c) => G.lineas(c, [{ n: 'Margen de explotación', color: 'var(--s1)', puntos: años.map((a, i) => [a, mg[i] == null ? NaN : mg[i]]) },
            { n: 'Margen neto', color: 'var(--s2)', puntos: años.map((a, i) => [a, mn[i] == null ? NaN : mn[i]]) }], { alto: 200, fmtY: (x) => pct(x, 0), fmtTip: (x) => pct(x, 1) })))),
      h('h3', { class: 'ap-h3' }, 'Ratios y su lectura'),
      lecturaRatios(e, v, d)];
  }

  // ---------------------------------------------------------------- INFORME
  V.informe = function (main, [t], opciones = {}) {
    const e = A.D.porT[String(t || '').toUpperCase()];
    if (!e || !e.valorada) { main.append(h('p', { class: 'sv-warn' }, 'No hay informe para esta empresa.'), A.enlace('#/mercado', 'Volver al mercado')); return null; }
    const T = A.tj, MODELOS = A.MODELOS;
    const aj = A.aj(e.ticker), v = A.valor(e.ticker), Vd = A.valoresDef()[e.ticker];
    const fc = e.modelo === 'fcff', ri = e.modelo === 'ri', M = MODELOS[e.modelo];
    const imp = MOTOR.implicito(e, A.S.par, aj, v);
    const ms = A.margenSeg(v.central, e.cotizacion), gr = A.graham(e), av = A.avisosDe(e, v), b = v.res.base;
    const cb = fc ? MOTOR.camino(e.trays.base, aj) : null, media5 = fc ? cb.gr.slice(0, 5).reduce((s, x) => s + x, 0) / 5 : null;
    const cambiado = A.parCambiado() || A.ajCambiado(e.ticker);
    const veredicto = v.central <= 0 || !v.valido ? 'Sin valor significativo con este modelo' : ms >= 0.25 ? 'Infravalorada con margen de seguridad (≥ 25 %)' : v.pot > 0.05 ? 'Ligeramente infravalorada' : v.pot >= -0.05 ? 'En línea con su valor' : v.pot >= -0.25 ? 'Ligeramente sobrevalorada' : 'Sobrevalorada';
    const lang = opciones.lang || (A.leer('sp-inf-lang', 'es') === 'ca' ? 'ca' : 'es');
    const P = (txt) => h('p', null, txt);
    const est = A.D.estado || {};
    const H = opciones.historia || null;
    const nomIntr = fc ? 'El DCF ponderado por escenarios' : ri ? 'El modelo de beneficio residual, ponderado por escenarios,' : 'El descuento del AFFO, ponderado por escenarios,';
    const corto = fc ? 'DCF' : 'modelo intrínseco';
    let txtImp;
    if (imp == null) txtImp = 'No se puede calcular lo que descuenta la cotización con estos supuestos.';
    else if (fc) txtImp = `La cotización actual descuenta un crecimiento de las ventas del ${pct(imp, 1)} anual en los próximos cinco años, frente al ${pct(media5, 1)} del caso base (consenso de analistas en los años 1–2). ` + (imp > media5 ? 'El mercado espera más crecimiento que el modelo.' : 'El mercado espera menos crecimiento que el modelo.');
    else if (ri) txtImp = `La cotización actual descuenta un ROE a largo plazo del ${pct(imp, 1)}, frente al ${pct(b.roeLT, 1)} del caso base y a un coste de los recursos propios del ${pct(v.w, 1)}. ` + (imp > b.roeLT ? 'El mercado espera que mantenga más rentabilidad que el modelo.' : 'El mercado espera menos rentabilidad que el modelo.');
    else txtImp = `La cotización actual descuenta un crecimiento del AFFO del ${pct(imp, 1)} anual en los próximos cinco años, frente al ${pct((e.reit.g1[1] + e.reit.g2[1]) / 2 + (aj.dg || 0), 1)} de media en los años 1–2 del caso base. ` + (imp > e.reit.g1[1] ? 'El mercado espera más crecimiento que el modelo.' : 'El mercado espera menos crecimiento que el modelo.');
    const anios = d3.range(1, 11).map(String);
    const series = [['base', 'var(--s1)'], ['pes', 'var(--s2)'], ['opt', 'var(--s3)']];
    const n2 = (num_, txt) => h('h2', null, `${num_}. ${txt}`);
    const h3 = (txt) => h('h3', { class: 'ap-h3' }, txt);
    let proy, coste, puente;
    if (fc) {
      proy = [h3('Proyección y flujos de caja'),
        P(`Ventas de los últimos doce meses: ${mill(e.ventas_ttm)}, con un margen EBITA del ${pct(e.ebit_ttm / e.ventas_ttm, 1)}. En el caso base, las ventas crecen un ${pct(e.tr.g1[1], 1)} el año 1 y un ${pct(e.tr.g2[1], 1)} el año 2 y convergen al ${pct(e.tr.g10, 1)} en el año 10; el margen pasa del ${pct(e.tr.m2[1], 1)} del año 2 al ${pct(cb.mg[9], 1)} del año 10.`),
        T.tarjetaProyeccion(e, v), G.leyenda([['Base', 'var(--s1)'], ['Pesimista', 'var(--s2)'], ['Optimista', 'var(--s3)']]), G.caja(220, (c) => G.flujos(c, e, v))];
      coste = [h3('Coste del capital y sensibilidad'),
        P(`WACC del ${pct(v.w, 2)}: coste de los recursos propios del ${pct(v.W.ke, 2)} (tipo sin riesgo ${pct(A.S.par.rf, 2)} + beta ${num(v.W.beta, 2)} × prima de riesgo ${pct(A.S.par.erp, 2)}) y coste de la deuda del ${pct(v.W.kd, 2)} (rating sintético ${e.rating}), con un ${pct(v.W.wd, 0)} de deuda. Valor terminal por ${A.S.par.metodoVt === 'gordon' ? 'Gordon' : 'inductores de valor'} con g = ${pct(v.g, 2)}: pesa el ${pct(b.pesoTv, 0)} del valor en el caso base.`),
        G.caja(260, (c) => G.sensibilidad(c, e, v, A.S.par, aj))];
      puente = [h3('Del valor de la empresa al valor por acción'), G.caja(250, (c) => G.puente(c, e, v))];
    } else if (ri) {
      proy = [h3('Rentabilidad y beneficio residual'),
        P(`Valor contable de ${usd(e.ri.bv0, 2)} por acción y ROE de los últimos doce meses del ${pct(e.ri.roe_ttm, 1)}. Con el BPA del consenso, el ROE es del ${pct(b.filas[0].roe, 1)} el año 1 y del ${pct(b.roe2, 1)} el año 2; después converge al ${pct(b.roeLT, 1)} a largo plazo (caso base). El valor crece mientras el ROE supere al coste de los recursos propios (${pct(v.w, 1)}).`),
        G.leyenda(series.map(([sc, c]) => [A.NOM_ESC[sc], c]).concat([['Ke', 'var(--color-fg)']])),
        G.caja(220, (c) => G.lineas(c, series.map(([sc, col]) => ({ n: A.NOM_ESC[sc], color: col, puntos: anios.map((a, k) => [a, v.res[sc].filas[k].roe]) }))
          .concat([{ n: 'Ke', color: 'var(--color-fg)', discontinua: true, puntos: anios.map((a) => [a, v.w]) }]), { fmtY: (d) => pct(d, 0), fmtTip: (d) => pct(d, 1), prefijo: 'Año ' })),
        T.tarjetaProyeccionF2(e, v)];
      coste = [h3('Coste de los recursos propios y sensibilidad'),
        P(`Ke del ${pct(v.w, 2)}: tipo sin riesgo ${pct(A.S.par.rf, 2)} + beta ${num(v.W.beta, 2)} × prima de riesgo ${pct(A.S.par.erp, 2)}. En este modelo se descuenta directamente el beneficio del accionista, sin WACC: la deuda de un banco o una aseguradora es parte de su negocio. El valor terminal (beneficio residual del año 11 creciendo a g = ${pct(v.g, 2)}) pesa el ${pct(b.pesoTv, 0)} del valor en el caso base.`),
        G.caja(260, (c) => G.sensibilidad(c, e, v, A.S.par, aj))];
      puente = [h3('Del valor contable al valor por acción'),
        G.caja(240, (c) => G.cascada(c, [{ n: 'Valor contable', v: b.base, tipo: 'suma' }, { n: 'Beneficio residual años 1–10', v: b.va, tipo: 'suma' }, { n: 'Valor terminal', v: b.vaTv, tipo: 'suma' }, { n: 'Valor por acción', v: b.vps, tipo: 'total' }])),
        P(`Precio / valor contable que justifica el caso base: ${veces(b.vps / e.ri.bv0, 2)}; la cotización está a ${veces(e.cotizacion / e.ri.bv0, 2)}.`)];
    } else {
      proy = [h3('FFO, AFFO y dividendo'),
        P(`FFO de los últimos doce meses de ${usd(e.reit.ffo_ps, 2)} por acción y AFFO estimado de ${usd(e.reit.affo0, 2)} (85 % del FFO). Dividendo de ${usd(e.reit.dps0, 2)} (rentabilidad del ${pct(e.reit.dps0 / e.cotizacion, 1)}), cubierto ${veces(e.reit.cobertura, 2)} por el FFO. En el caso base el AFFO crece un ${pct(e.reit.g1[1] + (aj.dg || 0), 1)} el año 1 y un ${pct(e.reit.g2[1] + (aj.dg || 0), 1)} el año 2 (ingresos del consenso) y converge a g.`),
        G.leyenda(series.map(([sc, c]) => [A.NOM_ESC[sc], c]).concat([['Dividendo (caso base)', 'var(--color-fg)']])),
        G.caja(220, (c) => G.lineas(c, series.map(([sc, col]) => ({ n: A.NOM_ESC[sc], color: col, puntos: anios.map((a, k) => [a, v.res[sc].filas[k].affo]) }))
          .concat([{ n: 'Dividendo', color: 'var(--color-fg)', discontinua: true, puntos: anios.map((a, k) => [a, b.filas[k].dpa]) }]), { fmtY: (d) => num(d, 1), fmtTip: (d) => usd(d, 2), prefijo: 'Año ', cero: true })),
        T.tarjetaProyeccionF2(e, v)];
      coste = [h3('Coste de los recursos propios y sensibilidad'),
        P(`Ke del ${pct(v.w, 2)}: tipo sin riesgo ${pct(A.S.par.rf, 2)} + beta ${num(v.W.beta, 2)} × prima de riesgo ${pct(A.S.par.erp, 2)}. Valor terminal de Gordon con g = ${pct(v.g, 2)}: pesa el ${pct(b.pesoTv, 0)} del valor en el caso base.`),
        G.caja(260, (c) => G.sensibilidad(c, e, v, A.S.par, aj))];
      puente = [h3('Del flujo al valor por acción'),
        G.caja(240, (c) => G.cascada(c, [{ n: 'AFFO años 1–10', v: b.va, tipo: 'suma' }, { n: 'Valor terminal', v: b.vaTv, tipo: 'suma' }, { n: 'Valor por acción', v: b.vps, tipo: 'total' }])),
        P(`P/FFO que justifica el caso base: ${veces(b.vps / e.reit.ffo_ps, 1)}; la cotización está a ${veces(e.cotizacion / e.reit.ffo_ps, 1)}.`)];
    }
    // diagnóstico y conclusiones
    const hist = H && H[e.ticker];
    const dg = A.diagnostico(e, v, hist);
    const lista = (xs, cls) => h('ul', { class: 'ap-inf-lista ' + (cls || '') }, xs.map((x) => h('li', null, x)));
    const c = e.consenso || {};
    const sens = (() => { const x = MOTOR.sensibilidadVps(e, A.S.par, aj, v, v.w + 0.01, v.g); return x && b.vps ? x / b.vps - 1 : null; })();
    const nota = A.nota ? A.nota(e.ticker) : {};
    const vigilar = [
      e.proximos_resultados ? `Próximos resultados el ${fecha(e.proximos_resultados)}${c.prox_bpa != null ? `: BPA esperado de ${usd(c.prox_bpa, 2)} por acción` : ''}${c.prox_ventas ? ` y ventas de ${mill(c.prox_ventas / 1e6)}` : ''}.` : null,
      fc ? `El valor depende sobre todo del crecimiento de las ventas (${pct(e.tr.g1[1], 1)} y ${pct(e.tr.g2[1], 1)} en los años 1–2 según el consenso) y del margen a largo plazo (${pct(cb.mg[9], 1)} en el año 10).`
        : ri ? `El valor depende sobre todo del ROE que mantenga a largo plazo (${pct(b.roeLT, 1)} en el caso base) frente a su coste (${pct(v.w, 1)}).`
          : `El valor depende sobre todo del crecimiento del AFFO (${pct(e.reit.g1[1] + (aj.dg || 0), 1)} el año 1 en el caso base) y de los tipos de interés.`,
      sens != null ? `Sensibilidad: un punto más de ${fc ? 'WACC' : 'Ke'} cambia el valor del caso base en un ${pct(sens, 0, true)}.` : null,
      v.valido && v.central > 0 ? `Precio de compra con un margen de seguridad del 25 %: ${usd(v.central * 0.75, 0)} por acción (cotización actual: ${usd(e.cotizacion, 2)}).` : null,
      gr.items.some((i) => !i.ok && !i.na) ? ['Criterios de Graham que no cumple: ', gr.items.filter((i) => !i.ok && !i.na).map((i, k) => [k ? '; ' : '', h('span', null, i.t)]), '.'] : null,
      nota.tesis ? `Tu tesis: ${nota.tesis}` : null,
      nota.compra != null || nota.venta != null ? `Tus precios: ${[nota.compra != null ? `compra por debajo de ${usd(nota.compra, 2)}` : null, nota.venta != null ? `venta por encima de ${usd(nota.venta, 2)}` : null].filter(Boolean).join(' y ')}.` : null,
    ].filter(Boolean);

    if (!opciones.sinBarra) {
      const imprimir = h('button', { type: 'button', class: 'sv-btn' }, lang === 'ca' ? 'Imprimir' : 'Imprimir');
      imprimir.addEventListener('click', () => window.print());
      const bPdf = h('button', { type: 'button', class: 'ap-inst' }, lang === 'ca' ? 'Descarregar PDF' : 'Descargar PDF');
      const st = h('span', { class: 'sv-ctrl-d', role: 'status' });
      bPdf.addEventListener('click', () => A.descargarPdf(e.ticker, lang, bPdf, st));
      const selLang = h('div', { class: 'sv-seg ap-idioma', role: 'group', 'aria-label': 'Idioma del informe' }, [['es', 'Castellano'], ['ca', 'Català']].map(([k, tx]) => {
        const bt = h('button', { type: 'button', 'aria-pressed': String(k === lang), lang: k }, tx);
        bt.addEventListener('click', () => { A.escribir('sp-inf-lang', k); A.programar(); });
        return bt;
      }));
      main.append(h('div', { class: 'ap-inf-bar no-print' }, A.migas([['Mercado', '#/mercado'], [e.nombre, '#/empresa/' + e.ticker], ['Informe']]), h('div', { class: 'ap-tit-b' }, selLang, imprimir, bPdf), st));
    }
    const fuentes = [
      `Cotizaciones, estados financieros de los últimos doce meses, consenso de analistas y múltiplos: Yahoo Finance (datos del ${fecha(est.fecha_mercado || A.D.pa.fecha_cotizacion)}; actualización completa del ${fecha(String(est.actualizado || '').slice(0, 10))}).`,
      'Historia de 10 años: formularios 10-K presentados a la SEC (EDGAR, API XBRL «frames»), por año natural; BPA y dividendo por acción ajustados por splits.',
      'Lista del S&P 500 y clasificación sectorial GICS: Wikipedia (List of S&P 500 companies).',
      `Parámetros de mercado: tipo sin riesgo ${pct(A.S.par.rf, 2)} (Treasury a 10 años), prima de riesgo ${pct(A.S.par.erp, 2)}, crecimiento a perpetuidad ${pct(A.S.par.g, 2)}; escenarios ${pct(A.S.par.prob.pes, 0)} / ${pct(A.S.par.prob.base, 0)} / ${pct(A.S.par.prob.opt, 0)}.`,
      e.revisada_activa ? 'Supuestos de crecimiento, márgenes, inversión, beta y comparables revisados en el Simulador 7M.' : null,
      `Método completo: ${location.href.split('#')[0]}#/metodo`,
    ].filter(Boolean);
    const doc = h('article', { class: 'ap-inf' },
      h('header', { class: 'ap-inf-cab' },
        h('p', { class: 'ap-inf-mini' }, `Informe de valoración · Simulador S&P 500 · datos del ${fecha(est.fecha_mercado || A.D.pa.fecha_cotizacion)}`),
        h('h1', null, `${e.empresa} (${e.ticker})`),
        h('p', { class: 'ap-inf-sub' }, `${e.sector} · ${e.industria} · ${e.subindustria} · modelo: ${M.n}`)),
      h('section', { class: 'ap-inf-res' },
        h('div', null, h('p', { class: 'ap-inf-l' }, 'Valor central'), h('p', { class: 'ap-inf-n' }, usd(v.central)), h('p', { class: 'ap-inf-l' }, `Rango ${usd(v.bajo)} – ${usd(v.alto)}`)),
        h('div', null, h('p', { class: 'ap-inf-l' }, 'Cotización'), h('p', { class: 'ap-inf-n' }, usd(e.cotizacion, 2)), h('p', { class: 'ap-inf-l' }, `Capitalización ${mill(e.cap)}`)),
        h('div', null, h('p', { class: 'ap-inf-l' }, 'Potencial'), h('p', { class: 'ap-inf-n ' + A.clsPot(v.pot) }, pct(v.pot, 0, true)), h('p', { class: 'ap-inf-l' }, ms != null && ms > 0 ? `Margen de seguridad ${pct(ms, 0)}` : 'Sin margen de seguridad')),
        h('div', null, h('p', { class: 'ap-inf-l' }, 'Conclusión del modelo'), h('p', { class: 'ap-inf-v' }, veredicto), h('p', { class: 'ap-inf-l' }, `Criterios de Graham: ${gr.puntos} de ${gr.total}`))),
      n2(1, 'Resumen'),
      P(`${T.frase(e, v)} ${nomIntr} da ${usd(v.pond)} por acción (pesimista ${usd(v.res.pes.vps)}, base ${usd(b.vps)} y optimista ${usd(v.res.opt.vps)}, con probabilidades del ${pct(A.S.par.prob.pes, 0)}, ${pct(A.S.par.prob.base, 0)} y ${pct(A.S.par.prob.opt, 0)})` +
        (v.mm != null ? ` y los múltiplos de sus comparables, ${usd(v.mm)}; el valor central pondera un ${pct(v.pesoDcf, 0)} el ${corto} y un ${pct(1 - v.pesoDcf, 0)} los múltiplos.` : `; no hay comparables con múltiplos válidos, así que el valor central es el ${corto}.`)),
      P(txtImp),
      cambiado && Vd ? P(`Este informe usa supuestos modificados en el simulador. Con los supuestos por defecto, el valor central sería ${usd(Vd.central)} (${pct(Vd.pot, 0, true)}).`) : null,
      h('div', { class: 'sv-grid2 ap-inf-dg' },
        h('div', null, h3('Puntos fuertes'), dg.fuertes.length ? lista(dg.fuertes, 'ap-fuertes') : P('Ninguno destacable con los datos disponibles.')),
        h('div', null, h3('Riesgos'), dg.riesgos.length ? lista(dg.riesgos, 'ap-riesgos') : P('Ninguno destacable con los datos disponibles.'))),
      av.length ? h('div', { class: 'ap-inf-av' }, h('p', null, h('b', null, 'Avisos sobre la fiabilidad: ')), h('ul', null, av.map((a) => h('li', null, (A.AVISOS[a] || { t: a }).t)))) : null,
      n2(2, 'Próximos catalizadores y consenso'),
      T.tarjetaConsenso(e),
      n2(3, 'Análisis financiero'),
      seccionFinanzas(e, v, H),
      n2(4, 'Valoración'),
      h3('Valor por método'),
      G.caja(200, (c) => G.metodos(c, e, v, v.pesoDcf)),
      proy, coste, puente,
      n2(5, 'Comparables y múltiplos'),
      T.tarjetaComparables(e),
      n2(6, 'Inversión en valor y calidad'),
      T.tarjetaGraham(e), T.tarjetaCalidad(e), T.tarjetaDividendo(e),
      n2(7, 'Cotización y consenso de los analistas'),
      T.tarjetaCotizacion(e, v), T.tarjetaAnalistas(e, v),
      n2(8, 'Datos y supuestos'),
      fc ? T.tarjetaSupuestos(e, v) : T.tarjetaSupuestosF2(e, v),
      n2(9, 'Conclusiones: qué vigilar'),
      lista(vigilar),
      n2(10, 'Fuentes y método'),
      lista(fuentes, 'ap-fuentes'),
      h('p', { class: 'ap-inf-pie' }, e.revisada_activa ? `Valoración revisada empresa a empresa en el Simulador 7M (${M.c}; supuestos de crecimiento, márgenes, inversión y comparables revisados), con el mismo motor que el resto del S&P 500. Herramienta formativa: no es una recomendación de inversión. Datos de Yahoo Finance.`
        : `Modelo automático con reglas comunes para todas las empresas del S&P 500 (${M.c}; consenso de analistas en los años 1–2, convergencia a largo plazo, CAPM y múltiplos de comparables). Herramienta formativa: no es una recomendación de inversión. Datos de Yahoo Finance.`));
    main.append(doc);
    if (!H) A.cargarHistoria().then((HH) => { // la historia llega después: se rehace la sección 3
      if (!doc.isConnected) return;
      const nuevo = h('div', null, seccionFinanzas(e, v, HH));
      const h2s = [...doc.querySelectorAll(':scope > h2')];
      const i3 = h2s.findIndex((x) => x.textContent.startsWith('3.'));
      if (i3 < 0) return;
      let n = h2s[i3].nextSibling; while (n && n !== h2s[i3 + 1]) { const s = n.nextSibling; n.remove(); n = s; }
      h2s[i3].after(...nuevo.childNodes);
      const dg2 = A.diagnostico(e, v, HH[e.ticker]);
      const ff = doc.querySelector('.ap-fuertes'), rr = doc.querySelector('.ap-riesgos');
      if (ff) ff.replaceChildren(...dg2.fuertes.map((x) => h('li', null, x)));
      if (rr) rr.replaceChildren(...dg2.riesgos.map((x) => h('li', null, x)));
    });
    if (lang === 'ca') {
      doc.lang = 'ca'; doc.style.visibility = 'hidden';
      A.cargarScript('js/catala.js').then(() => A.catala(doc)).catch(() => {}).finally(() => { doc.style.visibility = ''; });
    }
    return doc;
  };

  // ---------------------------------------------------------------- descarga en PDF (js/pdf.js se carga al pedirlo)
  let ocupado = false;
  A.descargarPdf = async function (t, lang, boton, estado) {
    if (ocupado) return;
    ocupado = true;
    const texto0 = boton ? boton.textContent : '';
    const msg = (x, fin) => {
      if (estado) estado.textContent = x;
      else if (boton) { boton.textContent = x; if (fin) setTimeout(() => { boton.textContent = texto0; }, 4000); }
    };
    if (boton) boton.disabled = true;
    msg(lang === 'ca' ? 'Preparant el PDF…' : 'Preparando el PDF…');
    try {
      await A.cargarScript('vendor/pdf/jspdf.umd.min.js');
      await A.cargarScript('vendor/pdf/jspdf.plugin.autotable.min.js');
      await A.cargarScript('js/pdf.js');
      if (lang === 'ca') await A.cargarScript('js/catala.js');
      const nombre = await A.pdfInforme(t, lang);
      msg(estado ? (lang === 'ca' ? 'Descarregat: ' : 'Descargado: ') + nombre : (lang === 'ca' ? 'PDF descarregat' : 'PDF descargado'), true);
    } catch (err) { console.error(err); msg(lang === 'ca' ? 'No s\'ha pogut generar el PDF.' : 'No se ha podido generar el PDF.', true); }
    if (boton) boton.disabled = false;
    ocupado = false;
  };
  // botón de la cabecera de la ficha: informe en PDF en el idioma elegido para el informe
  A.botonPdf = function (t) {
    const b = h('button', { type: 'button', class: 'ap-inst ap-btn-pdf', title: 'Descarga el informe completo de la empresa en PDF' }, 'Informe PDF');
    b.addEventListener('click', () => A.descargarPdf(t, A.leer('sp-inf-lang', 'es') === 'ca' ? 'ca' : 'es', b));
    return b;
  };
})(window.APP);
