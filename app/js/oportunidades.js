// Simulador S&P 500 · filtro de oportunidades de inversión en valor (margen de seguridad de Benjamin Graham).
(function (A) {
  const { h, num, pct, usd, veces, mill, G } = A;
  const REFS = [
    { id: 'bajo', t: 'Valor bajo', d: 'Escenario pesimista combinado con el menor de los dos múltiplos: la referencia más prudente.', f: (v) => v.bajo },
    { id: 'pes', t: 'Escenario pesimista', d: 'Solo el modelo intrínseco (DCF, beneficio residual o AFFO) del escenario pesimista, sin múltiplos.', f: (v) => v.res.pes.vps },
    { id: 'central', t: 'Valor central', d: 'Modelo intrínseco ponderado por escenarios y múltiplos de comparables.', f: (v) => v.central },
    { id: 'base', t: 'Caso base', d: 'Solo el modelo intrínseco (DCF, beneficio residual o AFFO) del caso base, sin múltiplos.', f: (v) => v.res.base.vps },
    { id: 'alto', t: 'Valor alto', d: 'Escenario optimista con el mayor de los múltiplos: la referencia menos exigente.', f: (v) => v.alto },
  ];
  const CAPS = [[0, 'Todas'], [10000, 'Más de 10.000 M$'], [50000, 'Más de 50.000 M$'], [200000, 'Más de 200.000 M$']];
  const DEF = () => ({ ref: 'central', ms: 0.25, sinMs: false, sectores: [], fiables: true, crit: [], minG: 0, cap: 0, minF: 0, topG: 0, minDiv: 0, subeDiv: 0 });
  const DIVS = [[0, 'Sin exigir'], [0.01, 'Al menos un 1 %'], [0.02, 'Al menos un 2 %'], [0.03, 'Al menos un 3 %'], [0.04, 'Al menos un 4 %']];
  const SUBES = [[0, 'Sin exigir'], [5, '5 años o más'], [8, '8 años o más'], [10, '10 años (todos los de la SEC)']];
  const TOPS = [[0, 'Sin exigir'], [30, 'Entre las 30 primeras'], [50, 'Entre las 50 primeras'], [100, 'Entre las 100 primeras']];
  const PRESETS = [
    ['Graham clásico', { ref: 'bajo', ms: 0.33, crit: ['per', 'pb', 'ben', 'div'], minG: 0 }],
    ['Margen amplio sobre el valor central', { ref: 'central', ms: 0.33, crit: [], minG: 0 }],
    ['Calidad a buen precio', { ref: 'central', ms: 0.2, crit: ['ben', 'deuda', 'cbpa'], minG: 0, minF: 6 }],
    ['Prudente: margen sobre el escenario pesimista', { ref: 'pes', ms: 0.15, crit: [], minG: 0 }],
    ['Fórmula mágica de Greenblatt (30 primeras)', { sinMs: true, topG: 30, fiables: false }],
    ['Piotroski 8–9 bajo su valor', { ref: 'central', ms: 0, minF: 8 }],
    ['Dividendo creciente 10 años bajo su valor', { ref: 'central', ms: 0, subeDiv: 10, minDiv: 0.015 }],
  ];
  function estado() {
    if (!A.S.op) {
      let g = null;
      try { g = JSON.parse(localStorage.getItem('sp-op') || 'null'); } catch (e) {}
      A.S.op = Object.assign(DEF(), g || {});
    }
    return A.S.op;
  }
  const guardar = () => { try { localStorage.setItem('sp-op', JSON.stringify(A.S.op)); } catch (e) {} };
  const cambiar = (fn) => { fn(A.S.op); guardar(); A.programar(); };

  function candidatas(op) {
    const Vs = A.valores(), ref = REFS.find((r) => r.id === op.ref) || REFS[2];
    const out = [];
    for (const e of A.D.emp) {
      const v = Vs[e.ticker];
      if (!e.valorada || !v || !v.valido) continue;
      if (op.fiables && !A.fiable(e, v)) continue;
      if (op.sectores.length && !op.sectores.includes(e.sector)) continue;
      if (op.cap && !(e.cap >= op.cap)) continue;
      const valor = ref.f(v);
      const ms = A.margenSeg(valor, e.cotizacion);
      const gr = A.graham(e);
      const okCrit = op.crit.every((c) => { const it = gr.items.find((i) => i.id === c) || {}; return it.ok || it.na; });
      const pf = e.piotroski ? e.piotroski.f : null, gb = e.greenblatt ? e.greenblatt.pos : null;
      const okF = !op.minF || (pf != null && pf >= op.minF && e.piotroski.n >= 8);
      const okG = !op.topG || (gb != null && gb <= op.topG);
      const dv = e.dividendo || {};
      const okD = (!op.minDiv || (dv.rent || 0) >= op.minDiv) && (!op.subeDiv || (dv.sube || 0) >= op.subeDiv);
      out.push({ e, v, valor, ms, gr, pf, gb, pasa: (op.sinMs || (ms != null && ms >= op.ms)) && okCrit && gr.puntos >= op.minG && okF && okG && okD });
    }
    return out;
  }

  A.vistas.oportunidades = function (main) {
    const op = estado();
    const todas = candidatas(op), sel = todas.filter((x) => x.pasa).sort(op.sinMs && op.topG ? (a, b) => a.gb - b.gb : (a, b) => b.ms - a.ms);
    const ref = REFS.find((r) => r.id === op.ref) || REFS[2];
    const extras = [op.crit.length || op.minG ? 'los criterios de Graham elegidos' : null, op.minF ? `una puntuación F de Piotroski de al menos ${op.minF}` : null,
      op.topG ? `un puesto entre los ${op.topG} primeros de la fórmula mágica` : null,
      op.minDiv ? `una rentabilidad por dividendo de al menos el ${pct(op.minDiv, 1)}` : null,
      op.subeDiv ? `${op.subeDiv} años o más subiendo el dividendo` : null].filter(Boolean);
    main.append(h('header', { class: 'sv-head' },
      h('h1', { class: 'sv-h1' }, 'Oportunidades de inversión en valor'),
      h('p', { class: 'sv-take' }, (op.sinMs ? `${sel.length} ${sel.length === 1 ? 'empresa cumple' : 'empresas cumplen'} ` + (extras.length ? extras.join(', ') : 'los filtros')
        : `${sel.length} ${sel.length === 1 ? 'empresa cotiza' : 'empresas cotizan'} con un margen de seguridad de al menos el ${pct(op.ms, 0)} sobre su ${ref.t.toLowerCase()}` + (extras.length ? ' y cumplen ' + extras.join(', ') : '')) +
        ` (de ${todas.length} valoraciones ${op.fiables ? 'fiables ' : ''}analizadas).`),
      h('p', { class: 'sv-meta' }, 'Margen de seguridad = 1 − cotización ÷ valor. Filtro para encontrar candidatas que estudiar a fondo: no es una recomendación de compra. Los criterios de Graham que no se aplican a un tipo de empresa (p. ej. la liquidez en un banco) no la excluyen.')));

    // ---------------- filtros
    const segRef = h('div', { class: 'sv-seg ap-seg-w', role: 'group', 'aria-label': 'Valor de referencia' }, REFS.map((r) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(r.id === op.ref), title: r.d }, r.t);
      b.addEventListener('click', () => cambiar((o) => { o.ref = r.id; }));
      return b;
    }));
    const ms = h('input', { class: 'sv-range', id: 'op-ms', type: 'range', min: 0, max: 0.6, step: 0.05 });
    ms.value = op.ms; ms.style.accentColor = 'var(--s1)';
    ms.addEventListener('change', () => cambiar((o) => { o.ms = Number(ms.value); }));
    ms.addEventListener('input', () => { const x = A.$('#op-ms-v'); if (x) x.textContent = pct(Number(ms.value), 0); });
    const secs = Object.keys(A.D.jer).sort((a, b) => a.localeCompare(b, 'es'));
    const chipsSec = h('div', { class: 'sv-chips' }, secs.map((s) => {
      const conVal = Object.values(A.D.jer[s]).flat().some((e) => e.valorada);
      if (!conVal) return null;
      const b = h('button', { type: 'button', class: 'sv-chip', 'aria-pressed': String(op.sectores.includes(s)) }, s);
      b.addEventListener('click', () => cambiar((o) => { o.sectores = o.sectores.includes(s) ? o.sectores.filter((x) => x !== s) : o.sectores.concat(s); }));
      return b;
    }));
    const todosSec = h('button', { type: 'button', class: 'sv-btn' }, 'Todos los sectores');
    todosSec.addEventListener('click', () => cambiar((o) => { o.sectores = []; }));
    const checks = h('div', { class: 'ap-op-crit' }, A.CRITERIOS.map((c) => {
      const id = 'op-c-' + c.id;
      const inp = h('input', { type: 'checkbox', id });
      inp.checked = op.crit.includes(c.id);
      inp.addEventListener('change', () => cambiar((o) => { o.crit = inp.checked ? o.crit.concat(c.id) : o.crit.filter((x) => x !== c.id); }));
      return h('label', { class: 'ap-op-c', for: id }, inp, ' ', c.t);
    }));
    const minG = h('input', { class: 'sv-range', id: 'op-ming', type: 'range', min: 0, max: A.CRITERIOS.length, step: 1 });
    minG.value = op.minG; minG.style.accentColor = 'var(--s1)';
    minG.addEventListener('change', () => cambiar((o) => { o.minG = Number(minG.value); }));
    minG.addEventListener('input', () => { const x = A.$('#op-ming-v'); if (x) x.textContent = `${minG.value} de ${A.CRITERIOS.length}`; });
    const sinMs = h('input', { type: 'checkbox', id: 'op-sinms' }); sinMs.checked = !!op.sinMs;
    sinMs.addEventListener('change', () => cambiar((o) => { o.sinMs = sinMs.checked; }));
    const minF = h('input', { class: 'sv-range', id: 'op-minf', type: 'range', min: 0, max: 9, step: 1 });
    minF.value = op.minF || 0; minF.style.accentColor = 'var(--s1)';
    minF.addEventListener('change', () => cambiar((o) => { o.minF = Number(minF.value); }));
    minF.addEventListener('input', () => { const x = A.$('#op-minf-v'); if (x) x.textContent = Number(minF.value) ? `${minF.value} de 9` : 'sin exigir'; });
    const topG = h('select', { id: 'op-topg', class: 'ap-sel' }, TOPS.map(([x, t]) => { const o = h('option', { value: x }, t); if (x === (op.topG || 0)) o.selected = true; return o; }));
    topG.addEventListener('change', () => cambiar((o) => { o.topG = Number(topG.value); }));
    const selDiv = h('select', { id: 'op-div', class: 'ap-sel' }, DIVS.map(([x, t]) => { const o = h('option', { value: x }, t); if (x === (op.minDiv || 0)) o.selected = true; return o; }));
    selDiv.addEventListener('change', () => cambiar((o) => { o.minDiv = Number(selDiv.value); }));
    const selSube = h('select', { id: 'op-sube', class: 'ap-sel' }, SUBES.map(([x, t]) => { const o = h('option', { value: x }, t); if (x === (op.subeDiv || 0)) o.selected = true; return o; }));
    selSube.addEventListener('change', () => cambiar((o) => { o.subeDiv = Number(selSube.value); }));
    const fia = h('input', { type: 'checkbox', id: 'op-fia' }); fia.checked = op.fiables;
    fia.addEventListener('change', () => cambiar((o) => { o.fiables = fia.checked; }));
    const cap = h('select', { id: 'op-cap', class: 'ap-sel' }, CAPS.map(([x, t]) => { const o = h('option', { value: x }, t); if (x === op.cap) o.selected = true; return o; }));
    cap.addEventListener('change', () => cambiar((o) => { o.cap = Number(cap.value); }));
    const pres = h('div', { class: 'sv-chips' }, h('span', { class: 'sv-bar-l' }, 'Filtros rápidos:'), PRESETS.map(([t, p]) => {
      const b = h('button', { type: 'button', class: 'sv-chip' }, t);
      b.addEventListener('click', () => cambiar((o) => Object.assign(o, DEF(), p, { sectores: o.sectores, cap: o.cap })));
      return b;
    }));
    const reset = h('button', { type: 'button', class: 'sv-btn' }, 'Quitar filtros');
    reset.addEventListener('click', () => cambiar((o) => Object.assign(o, DEF())));
    main.append(h('section', { class: 'sv-card' },
      h('h2', { class: 'sv-card-t' }, 'Filtros'),
      h('div', { class: 'sv-ctrls ap-op-ctrls' },
        h('div', { class: 'sv-grp' }, h('p', { class: 'sv-grp-t' }, 'Valor de referencia'), segRef, h('span', { class: 'sv-ctrl-d' }, ref.d),
          h('div', { class: 'sv-ctrl' + (op.sinMs ? ' ap-off' : '') }, h('div', { class: 'sv-ctrl-l' }, h('label', { for: 'op-ms' }, ['Margen de seguridad mínimo ', A.ayuda('margen-seguridad')]), h('span', { class: 'sv-ctrl-v', id: 'op-ms-v' }, pct(op.ms, 0))), ms,
            h('span', { class: 'sv-ctrl-d' }, op.ms > 0 ? `La cotización, como mucho el ${pct(1 - op.ms, 0)} del valor (potencial de al menos ${pct(op.ms / (1 - op.ms), 0, true)}).` : 'Cualquier empresa que cotice por debajo de su valor.')),
          h('label', { class: 'ap-op-c', for: 'op-sinms' }, sinMs, ' Sin exigir margen de seguridad (solo los demás criterios)')),
        h('div', { class: 'sv-grp' }, h('p', { class: 'sv-grp-t' }, ['Criterios de Graham que se exigen ', A.ayuda('graham')]), checks,
          h('div', { class: 'sv-ctrl' }, h('div', { class: 'sv-ctrl-l' }, h('label', { for: 'op-ming' }, 'Puntuación mínima de Graham'), h('span', { class: 'sv-ctrl-v', id: 'op-ming-v' }, `${op.minG} de ${A.CRITERIOS.length}`)), minG)),
        h('div', { class: 'sv-grp' }, h('p', { class: 'sv-grp-t' }, 'Calidad y rentabilidad'),
          h('div', { class: 'sv-ctrl' }, h('div', { class: 'sv-ctrl-l' }, h('label', { for: 'op-minf' }, ['Puntuación F de Piotroski mínima ', A.ayuda('piotroski')]), h('span', { class: 'sv-ctrl-v', id: 'op-minf-v' }, op.minF ? `${op.minF} de 9` : 'sin exigir')), minF,
            h('span', { class: 'sv-ctrl-d' }, 'Nueve señales de solidez y mejora del último ejercicio. Se exigen al menos 8 señales con datos.')),
          h('div', { class: 'sv-ctrl' }, h('div', { class: 'sv-ctrl-l' }, h('label', { for: 'op-topg' }, ['Fórmula mágica de Greenblatt ', A.ayuda('greenblatt')])), topG,
            h('span', { class: 'sv-ctrl-d' }, 'Puesto por rentabilidad del beneficio (EBIT ÷ valor de la empresa) y del capital. Sin financieras, eléctricas ni REIT.'))),
        h('div', { class: 'sv-grp' }, h('p', { class: 'sv-grp-t' }, 'Dividendo'),
          h('div', { class: 'sv-ctrl' }, h('div', { class: 'sv-ctrl-l' }, h('label', { for: 'op-div' }, 'Rentabilidad por dividendo')), selDiv),
          h('div', { class: 'sv-ctrl' }, h('div', { class: 'sv-ctrl-l' }, h('label', { for: 'op-sube' }, 'Años seguidos subiendo el dividendo')), selSube,
            h('span', { class: 'sv-ctrl-d' }, 'Según los 10-K de la SEC (hasta 10 años; aproximado).'))),
        h('div', { class: 'sv-grp' }, h('p', { class: 'sv-grp-t' }, 'Universo'), h('div', { class: 'sv-chips' }, chipsSec), todosSec,
          h('label', { class: 'ap-op-c', for: 'op-cap' }, 'Capitalización ', cap),
          h('label', { class: 'ap-op-c', for: 'op-fia' }, fia, ' Solo valoraciones fiables (sin avisos graves)'))),
      h('div', { class: 'sv-bar' }, pres, reset)));

    // ---------------- resultados
    const msMed = A.mediana(sel.map((x) => x.ms));
    const porSec = {};
    for (const x of sel) porSec[x.e.sector] = (porSec[x.e.sector] || 0) + 1;
    main.append(h('section', { class: 'sv-kpis' },
      A.kpi('Candidatas', String(sel.length), `de ${todas.length} valoraciones analizadas`),
      A.kpi('Margen de seguridad mediano', msMed == null ? '—' : pct(msMed, 0), `sobre el ${ref.t.toLowerCase()}`),
      A.kpi('Puntuación de Graham mediana', sel.length ? `${num(A.mediana(sel.map((x) => x.gr.puntos)), 0)}` : '—', 'criterios del inversor defensivo que cumplen'),
      A.kpi('Piotroski mediana', sel.some((x) => x.pf != null) ? `${num(A.mediana(sel.map((x) => x.pf)), 0)} de 9` : '—', 'puntuación F de las candidatas'),
      A.kpi('Rentabilidad por dividendo mediana', sel.length ? pct(A.mediana(sel.map((x) => (x.e.graham || {}).div || 0)), 1) : '—', 'de las candidatas')));

    if (todas.length) main.append(A.tarjeta('Margen de seguridad frente al PER', `Cada punto es una empresa; en azul, las que pasan el filtro. A la derecha de la línea, la cotización está por debajo del ${ref.t.toLowerCase()}; abajo, PER de los últimos doce meses más bajo. Pulsa un punto para ver la empresa.`,
      G.caja(320, (c) => G.dispersion(c, todas.filter((x) => x.ms != null && (x.e.graham || {}).per != null).map((x) => ({ id: x.e.ticker, n: x.e.nombre, x: Math.max(-1, x.ms), y: Math.min(60, x.e.graham.per), sel: x.pasa, d: x })), {
        alto: 320, dx: [-1, 0.8], dy: [0, 60], x0: 0, y0: 15, fmtX: (d) => pct(d, 0), fmtY: (d) => num(d, 0), tituloX: 'Margen de seguridad →', tituloY: 'PER TTM',
        clic: (p) => A.ir('#/empresa/' + p.id),
        tip: (p) => [[`${p.d.e.nombre} (${p.id})`, null, 'sv-tip-h'], [`Margen de seguridad: ${pct(p.d.ms, 0)}`], [`${ref.t}: ${usd(p.d.valor)} · cotización ${usd(p.d.e.cotizacion, 2)}`], [`PER TTM: ${veces(p.d.e.graham.per)} · Graham ${p.d.gr.puntos}/${p.d.gr.total}`]],
      }))));

    if (sel.length) {
      const secF = Object.entries(porSec).sort((a, b) => b[1] - a[1]);
      main.append(A.tarjeta('Candidatas por sector', null, G.caja(secF.length * 28 + 30, (c) => G.barras(c, secF.map(([s, n]) => ({ id: s, n: s, v: n, color: 'var(--s1)' })), { fmt: (d) => num(d, 0), clic: (d) => cambiar((o) => { o.sectores = [d.id]; }) }))));
    }
    const exportar = h('button', { type: 'button', class: 'sv-btn' }, 'Descargar la lista (CSV)');
    exportar.addEventListener('click', () => descargarCsv(sel, ref));
    const cols = [
      { t: 'Empresa', v: (x) => x.e.nombre, f: (x) => h('span', { class: 'ap-emp' }, h('b', null, x.e.nombre), ' ', h('span', { class: 'ap-tk' }, x.e.ticker)), texto: true },
      { t: 'Sector', v: (x) => x.e.sector, f: (x) => x.e.sector, cls: 'sv-sec-col', texto: true },
      { t: 'Cotización', v: (x) => x.e.cotizacion, f: (x) => usd(x.e.cotizacion, 2) },
      { t: ref.t, v: (x) => x.valor, f: (x) => usd(x.valor) },
      { t: 'Margen de seguridad', v: (x) => x.ms, f: (x) => h('span', { class: 'sv-strong ' + A.clsPot(x.ms) }, pct(x.ms, 0)) },
      { t: 'Valor central', v: (x) => x.v.central, f: (x) => usd(x.v.central), cls: 'sv-sec-col' },
      { t: 'PER TTM', v: (x) => (x.e.graham || {}).per, f: (x) => veces((x.e.graham || {}).per) },
      { t: 'P/VC', v: (x) => (x.e.graham || {}).pb, f: (x) => veces((x.e.graham || {}).pb), cls: 'sv-sec-col' },
      { t: 'Dividendo', v: (x) => (x.e.dividendo || {}).rent, f: (x) => pct((x.e.dividendo || {}).rent, 1), cls: 'sv-sec-col' },
      { t: 'Sube div.', v: (x) => (x.e.dividendo || {}).sube, f: (x) => { const k = (x.e.dividendo || {}).sube; return k ? `${k} años` : '—'; }, cls: 'sv-sec-col', ayuda: 'Años seguidos subiendo el dividendo por acción (SEC)' },
      { t: 'Graham', v: (x) => x.gr.puntos, f: (x) => `${x.gr.puntos}/${x.gr.total}` },
      { t: 'Piotroski', v: (x) => x.pf, f: (x) => (x.pf == null ? '—' : `${x.pf}/9`), ayuda: 'Puntuación F de Piotroski (0 a 9)' },
      { t: 'Greenblatt', v: (x) => (x.gb == null ? null : -x.gb), f: (x) => (x.gb == null ? '—' : `${x.gb}.º`), cls: 'sv-sec-col', ayuda: 'Puesto en la fórmula mágica de Greenblatt (1 = mejor)' },
      { t: '', f: (x) => A.botonCmp(x.e.ticker) },
    ];
    const porGb = op.sinMs && op.topG;
    main.append(A.tarjeta(`Candidatas (${sel.length})`, sel.length ? `Ordenadas por ${porGb ? 'puesto en la fórmula mágica' : 'margen de seguridad'}. Pulsa una fila para ver la valoración completa y su informe.` : 'Ninguna empresa cumple todos los filtros: prueba con un margen de seguridad menor u otro valor de referencia.',
      sel.length ? A.tabla(cols, sel, { orden: porGb ? 12 : 4, clic: (x) => A.ir('#/empresa/' + x.e.ticker) }) : null,
      sel.length ? h('div', { class: 'sv-bar' }, h('span', { class: 'sv-bar-l' }, `Supuestos generales actuales: rf ${pct(A.S.par.rf, 2)} · prima de riesgo ${pct(A.S.par.erp, 2)} · g ${pct(A.S.par.g, 2)}`), exportar) : null));
  };

  function descargarCsv(sel, ref) {
    const cab = ['Ticker', 'Empresa', 'Sector', 'Industria', 'Cotización', ref.t, 'Margen de seguridad', 'Valor central', 'Potencial', 'PER TTM', 'P/VC', 'Número de Graham', 'Criterios Graham', 'Rentabilidad dividendo', 'Piotroski F', 'Puesto Greenblatt', 'Años subiendo el dividendo'];
    const n = (x, d = 2) => (x == null || !isFinite(x) ? '' : String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ','));
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const filas = sel.map((x) => [x.e.ticker, q(x.e.empresa), q(x.e.sector), q(x.e.industria), n(x.e.cotizacion), n(x.valor), n(x.ms, 4), n(x.v.central), n(x.v.pot, 4),
      n((x.e.graham || {}).per), n((x.e.graham || {}).pb), n((x.e.graham || {}).ng), x.gr.puntos, n((x.e.graham || {}).div, 4), x.pf == null ? '' : x.pf, x.gb == null ? '' : x.gb, (x.e.dividendo || {}).sube || 0].join(';'));
    const blob = new Blob(['﻿' + cab.join(';') + '\n' + filas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `oportunidades-sp500-${(A.D.estado || {}).fecha_mercado || 'hoy'}.csv` });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
})(window.APP);
