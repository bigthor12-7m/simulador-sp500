// Simulador S&P 500 · criterios comunes a la app y al actualizador semanal (Node): avisos de fiabilidad, criterios de
// Benjamin Graham, puntuación F de Piotroski, fórmula mágica de Greenblatt y estrategias que se siguen cada semana.
(function (raiz) {
  const C = {};
  const ESC = ['pes', 'base', 'opt'];

  // ---------------------------------------------------------------- avisos de fiabilidad
  C.AVISOS = {
    ebit_negativo: { t: 'Beneficio operativo negativo en los últimos doce meses', grave: true },
    sin_consenso: { t: 'Sin consenso de analistas suficiente: años 1–2 con la tendencia histórica', grave: false },
    pocos_analistas: { t: 'Menos de 3 analistas en el consenso', grave: false },
    bpa_no_positivo: { t: 'BPA ajustado no positivo: margen de los años 1–2 sin el consenso de BPA', grave: false },
    peso_vt_alto: { t: 'El valor terminal supera el 85 % del valor (caso base)', grave: false },
    valor_extremo: { t: 'Valor central muy alejado de la cotización (menos de un 20 % o más del triple)', grave: true },
    patrimonio_negativo: { t: 'El modelo da un valor del patrimonio negativo en algún escenario', grave: true },
    divisa: { t: 'Estados financieros en otra divisa', grave: true },
    sin_multiplos: { t: 'Sin comparables con múltiplos válidos: valor central solo con el modelo intrínseco', grave: false },
    balance_antiguo: { t: 'Último balance de hace más de 7 meses', grave: false },
    datos_anteriores: { t: 'Sin datos nuevos de Yahoo esta semana: se mantienen los de la semana anterior', grave: false },
    valor_contable_bajo: { t: 'ROE muy alto sobre un valor contable pequeño: el modelo de beneficio residual es poco fiable para esta empresa', grave: true },
    beneficio_negativo: { t: 'Beneficio por acción previsto negativo', grave: true },
    ffo_negativo: { t: 'FFO (beneficio + amortización − partidas no recurrentes) negativo', grave: true },
    dividendo_no_cubierto: { t: 'El dividendo supera al FFO de los últimos doce meses', grave: false },
    sin_dividendo: { t: 'Sin dividendo publicado: se usa el 70 % del FFO como referencia', grave: false },
    cambio_perimetro: { t: 'El consenso no es comparable con las últimas cifras publicadas (fusión, adquisición o venta de un negocio, cambio brusco de ciclo o distinta definición de ingresos): años 1–2 con la tendencia histórica', grave: true },
  };
  C.avisosDe = function (e, v) {
    const av = (e.avisos || []).slice();
    if (e.valorada && v) {
      const r = v.central / e.cotizacion;
      if (v.valido && (r < 0.2 || r > 3)) av.push('valor_extremo');
      if (ESC.some((sc) => v.res[sc].eq < 0)) av.push('patrimonio_negativo');
      if (v.res.base.pesoTv > 0.85 && !av.includes('patrimonio_negativo')) av.push('peso_vt_alto');
    }
    return av;
  };
  C.fiable = (e, v) => !!(e.valorada && v && v.valido && v.central > 0 && !C.avisosDe(e, v).some((a) => C.AVISOS[a] && C.AVISOS[a].grave));
  C.margenSeg = (valor, px) => (valor > 0 ? 1 - px / valor : null);

  // ---------------------------------------------------------------- criterios de Graham
  const f1 = (x, d = 1) => (x == null || !isFinite(x) ? '—' : x.toFixed(d).replace('.', ',') + 'x');
  const pc = (x, d = 0, s = false) => (x == null || !isFinite(x) ? '—' : (s && x > 0 ? '+' : '') + (x * 100).toFixed(d).replace('.', ',') + ' %');
  const us = (x) => (x == null || !isFinite(x) ? '—' : x.toFixed(2).replace('.', ',') + ' $');
  C.tipoE = (e) => (e.modelo === 'reit' ? 'reit' : e.modelo === 'ri' ? (e.sector_gics === 'Utilities' ? 'electrica' : 'financiera') : 'general');
  C.CRITERIOS = [
    { id: 'per', t: 'PER de los últimos doce meses ≤ 15', f: (g) => g.per != null && g.per <= 15, v: (g) => f1(g.per) },
    { id: 'pb', t: 'Precio / valor contable ≤ 1,5 (o PER × P/VC ≤ 22,5)', f: (g) => (g.pb != null && g.pb <= 1.5) || (g.per_pb != null && g.per_pb <= 22.5),
      v: (g) => `${f1(g.pb)} · producto ${g.per_pb == null ? '—' : g.per_pb.toFixed(1).replace('.', ',')}` },
    { id: 'rc', t: 'Liquidez: activo corriente ≥ 2 × pasivo corriente', na: (e) => C.tipoE(e) !== 'general', f: (g) => g.rc != null && g.rc >= 2, v: (g) => f1(g.rc, 2) },
    { id: 'deuda', t: 'Solidez: deuda neta ≤ 3 × EBITDA', na: (e) => C.tipoE(e) === 'financiera',
      tE: (e) => ({ electrica: 'Solidez: deuda ≤ 2 × patrimonio (criterio de Graham para eléctricas)', reit: 'Solidez: deuda neta ≤ 6 × EBITDA (REIT)' }[C.tipoE(e)]),
      f: (g, e) => (C.tipoE(e) === 'electrica' ? g.deuda_patrimonio != null && g.deuda_patrimonio <= 2 : g.dn_ebitda != null && g.dn_ebitda <= (C.tipoE(e) === 'reit' ? 6 : 3)),
      v: (g, e) => (C.tipoE(e) === 'electrica' ? `${f1(g.deuda_patrimonio, 2)} el patrimonio` : g.dn_ebitda == null ? '—' : g.dn_ebitda < 0 ? 'caja neta' : f1(g.dn_ebitda)) },
    { id: 'ben', t: 'Beneficios positivos todos los años disponibles', tG: (g) => (g.ben_fuente === 'SEC' ? `Beneficios positivos en los últimos ${g.ben_n} años` : null),
      f: (g) => g.ben_n >= 3 && g.ben_pos === g.ben_n, v: (g) => `${g.ben_pos} de ${g.ben_n} años` },
    { id: 'div', t: 'Dividendos todos los años disponibles', tG: (g) => (g.ben_fuente === 'SEC' && g.div_n >= 6 ? `Dividendos ininterrumpidos en los últimos ${g.div_n} años` : null),
      f: (g) => g.div_n >= 3 && g.div_anios === g.div_n, v: (g) => `${g.div_anios} de ${g.div_n} años · rentabilidad ${pc(g.div, 1)}` },
    { id: 'cbpa', t: 'Crecimiento del BPA ≥ 10 % en el periodo disponible',
      tG: (g) => (g.cbpa_medias ? 'Crecimiento del BPA ≥ 33 % en el periodo (medias de 3 años al principio y al final)' : null),
      f: (g) => g.cbpa != null && g.cbpa >= (g.cbpa_medias ? 1 / 3 : 0.1), v: (g) => (g.cbpa == null ? '—' : `${pc(g.cbpa, 0, true)} en ${g.cbpa_anios} años`) },
    { id: 'ng', t: 'Cotización ≤ número de Graham (√(22,5 × BPA × valor contable))', f: (g, e) => g.ng != null && e.cotizacion <= g.ng, v: (g) => us(g.ng) },
  ];
  C.graham = function (e) {
    const g = e.graham || {};
    const items = C.CRITERIOS.map((c) => {
      const na = !!(c.na && c.na(e));
      return { id: c.id, t: (c.tE && c.tE(e)) || (c.tG && c.tG(g)) || c.t, na, ok: !na && !!c.f(g, e), v: na ? 'no aplica' : c.v(g, e) };
    });
    const ap = items.filter((i) => !i.na);
    return { items, puntos: ap.filter((i) => i.ok).length, total: ap.length };
  };
  // un criterio exigido que no se aplica a ese tipo de empresa no la excluye
  C.cumple = (e, ids) => { const g = C.graham(e); return ids.every((id) => { const it = g.items.find((i) => i.id === id) || {}; return it.ok || it.na; }); };

  // ---------------------------------------------------------------- Piotroski
  C.PIOTROSKI = [
    ['roa', 'Rentabilidad sobre activos positiva'], ['cfo', 'Flujo de caja de explotación positivo'], ['droa', 'La rentabilidad sobre activos mejora'],
    ['devengo', 'El flujo de explotación supera al beneficio (calidad del beneficio)'], ['deuda', 'La deuda a largo plazo sobre activos no aumenta'],
    ['liquidez', 'La liquidez (activo / pasivo corriente) mejora'], ['acciones', 'No emite acciones nuevas'], ['margen', 'El margen bruto mejora'],
    ['rotacion', 'La rotación de activos (ventas / activos) mejora'],
  ];

  // ---------------------------------------------------------------- estrategias que se siguen cada semana
  C.ESTRATEGIAS = [
    { id: 'margen25', n: 'Margen de seguridad ≥ 25 %', d: 'Valoraciones fiables que cotizan al menos un 25 % por debajo de su valor central.',
      f: (e, v) => C.fiable(e, v) && C.margenSeg(v.central, e.cotizacion) >= 0.25 },
    { id: 'graham', n: 'Graham clásico', d: 'Margen de seguridad ≥ 33 % sobre el valor bajo y PER, precio / valor contable, beneficios y dividendos de Graham.',
      f: (e, v) => C.fiable(e, v) && C.margenSeg(v.bajo, e.cotizacion) >= 0.33 && C.cumple(e, ['per', 'pb', 'ben', 'div']) },
    { id: 'greenblatt', n: 'Fórmula mágica (30 primeras)', d: 'Las 30 primeras por la fórmula de Greenblatt: rentabilidad del beneficio (EBIT / EV) y rentabilidad del capital.',
      f: (e) => !!(e.greenblatt && e.greenblatt.pos <= 30) },
    { id: 'piotroski', n: 'Piotroski F ≥ 8 bajo su valor', d: 'Puntuación F de 8 o 9 (con al menos 8 señales disponibles) y cotización por debajo del valor central.',
      f: (e, v) => C.fiable(e, v) && !!(e.piotroski && e.piotroski.f >= 8 && e.piotroski.n >= 8) && v.pot > 0 },
  ];

  // ---------------------------------------------------------------- valoración revisada de las 7 Magníficas
  // Devuelve la empresa con los datos, trayectorias y múltiplos revisados del Simulador 7M (mismo motor de DCF).
  C.aplicarRevisada = function (e) {
    const r = e.revisada;
    if (!r) return e;
    const T = r.trays, col = (k, i) => ESC.map((sc) => T[sc][k][i]);
    const tr = { g1: col('gr', 0), g2: col('gr', 1), m1: col('mg', 0), m2: col('mg', 1), m10: col('mg', 9), g10: T.base.gr[9], da: T.base.da[0],
      cx0: T.base.cx[0], cx10: T.base.cx[9], nof: T.base.nf[0], modo: 'revisado' };
    return Object.assign({}, e, r.emp, { diferencial: r.diferencial, trays: T, mu: r.mu, tr, revisada_activa: true, avisos: (e.avisos || []).filter((a) => a !== 'sin_consenso' && a !== 'cambio_perimetro') });
  };

  raiz.CRIT = C;
})(typeof window !== 'undefined' ? window : globalThis);
