// Simulador S&P 500 · gráficos (d3). Cada función recibe el contenedor y los datos ya calculados.
(function (A) {
  const G = (A.G = {});
  const { num, pct, usd, fecha, h } = A;
  const C1 = 'var(--s1)', C2 = 'var(--s2)', C3 = 'var(--s3)';
  G.colores = [C1, C2, C3, 'var(--s4)', 'var(--s5)'];

  // ---------------------------------------------------------------- utilidades
  G.colorDe = (() => {
    let probe = null;
    return (css) => {
      if (!probe) { probe = document.createElement('span'); probe.style.display = 'none'; document.body.appendChild(probe); }
      probe.style.color = ''; probe.style.color = css;
      return getComputedStyle(probe).color;
    };
  })();
  G.lienzo = function (cont, alto) {
    const w = Math.max(280, cont.clientWidth || cont.parentNode.clientWidth || 600);
    cont.replaceChildren();
    const svg = d3.select(cont).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${alto}`).attr('height', alto).attr('role', 'img');
    const tip = d3.select(cont).append('div').attr('class', 'sv-tip').style('opacity', 0);
    return { svg, tip, w };
  };
  G.medir = function (svg, textos, size = 12) {
    const t = svg.append('text').attr('font-size', size).attr('visibility', 'hidden');
    let m = 0;
    for (const s of textos) { t.text(s); m = Math.max(m, t.node().getComputedTextLength()); }
    t.remove();
    return m;
  };
  G.moverTip = function (tip, cont, x, y) {
    const n = tip.node(), cw = cont.clientWidth, tw = n.offsetWidth;
    tip.style('left', Math.max(0, Math.min(cw - tw, x + 12)) + 'px').style('top', Math.max(0, y - 10) + 'px');
  };
  G.linea = function (tip, filas) {
    const n = tip.node();
    n.replaceChildren();
    filas.forEach(([txt, color, cls]) => {
      const div = document.createElement('div');
      if (cls) div.className = cls;
      if (color) { const s = document.createElement('span'); s.className = 'sv-tip-s'; s.style.background = color; div.appendChild(s); }
      div.appendChild(document.createTextNode(txt));
      n.appendChild(div);
    });
  };
  G.leyenda = (items) => h('div', { class: 'sv-legend' }, items.map(([t, c, tipo]) => h('span', null, h(tipo || 'i', { style: { background: c } }), t)));
  // crea el contenedor y pinta cuando ya está en el documento (para conocer su anchura)
  G.caja = function (alto, fn) {
    const cont = h('div', { class: 'sv-chart', style: { minHeight: alto + 'px' } });
    requestAnimationFrame(() => { if (cont.isConnected) fn(cont); });
    return cont;
  };
  const ejeY = (svg, y, x0, x1, n, fmt) => {
    svg.selectAll(null).data(y.ticks(n)).join('line').attr('x1', x0).attr('x2', x1).attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).style('stroke', (d) => (d === 0 ? 'var(--cds-chart-axis)' : 'var(--cds-chart-grid)'));
    svg.selectAll(null).data(y.ticks(n)).join('text').attr('x', x0 - 8).attr('y', (d) => y(d)).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text(fmt || ((d) => num(d, 0)));
  };
  const tipEn = (tip, cont, ev, filas) => { G.linea(tip, filas); tip.style('opacity', 1); const [mx, my] = d3.pointer(ev, cont); G.moverTip(tip, cont, mx, my); };

  // ---------------------------------------------------------------- rangos de potencial (punto + barra) por fila
  // filas: [{id, n, lo, ce, hi, ref?, sub?}] en % frente a la cotización
  G.rangos = function (cont, filas, opts = {}) {
    const rowH = opts.rowH || 30, alto = filas.length * rowH + 44;
    const { svg, tip, w } = G.lienzo(cont, alto);
    const ml = Math.min(w * 0.42, G.medir(svg, filas.map((f) => f.n), 12) + 14);
    const mr = G.medir(svg, filas.map((f) => pct(f.ce, 0, true)), 12) + 18;
    const xs = filas.flatMap((f) => [f.lo, f.hi, f.ce, f.ref, 0]).filter((x) => x != null && isFinite(x));
    const lim = opts.lim || [-0.9, 2];
    const x = d3.scaleLinear().domain([Math.max(lim[0], Math.min(-0.5, d3.min(xs))), Math.min(lim[1], Math.max(0.3, d3.max(xs)))]).nice().range([ml, w - mr]).clamp(true);
    const y = (i) => 24 + i * rowH + rowH / 2;
    const ticks = x.ticks(Math.max(3, Math.floor((w - ml - mr) / 80)));
    svg.selectAll('line.gr').data(ticks).join('line').attr('x1', (d) => x(d)).attr('x2', (d) => x(d)).attr('y1', 16).attr('y2', alto - 22).style('stroke', 'var(--cds-chart-grid)');
    svg.selectAll('text.tk').data(ticks).join('text').attr('x', (d) => x(d)).attr('y', alto - 6).attr('text-anchor', 'middle').attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text((d) => pct(d, 0, true));
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 12).attr('y2', alto - 22).style('stroke', 'var(--cds-chart-reference)').attr('stroke-width', 1.5);
    svg.append('text').attr('x', x(0) + 4).attr('y', 10).attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text(opts.ref0 || 'Cotización');
    const fila = svg.selectAll('g.f').data(filas).join('g').attr('class', 'f').style('cursor', opts.clic ? 'pointer' : 'default');
    fila.append('rect').attr('x', 0).attr('width', w).attr('y', (d, i) => y(i) - rowH / 2).attr('height', rowH).style('fill', 'transparent');
    fila.filter((d) => d.lo != null && d.hi != null).append('rect').attr('x', (d) => x(Math.min(d.lo, d.hi))).attr('width', (d) => Math.max(2, Math.abs(x(d.hi) - x(d.lo))))
      .attr('y', (d, i) => y(i) - 5).attr('height', 10).attr('rx', 4).style('fill', C1).attr('fill-opacity', (d) => (d.sel ? 0.42 : 0.22));
    fila.filter((d) => d.ref != null).append('line').attr('x1', (d) => x(d.ref)).attr('x2', (d) => x(d.ref)).attr('y1', (d, i) => y(i) - 9).attr('y2', (d, i) => y(i) + 9).style('stroke', 'var(--cds-chart-muted)').attr('stroke-width', 2);
    fila.append('circle').attr('cx', (d) => x(d.ce)).attr('cy', (d, i) => y(i)).attr('r', 5.5).style('fill', (d) => d.color || C1).style('stroke', 'var(--color-panel)').attr('stroke-width', 2);
    fila.append('text').attr('x', ml - 10).attr('y', (d, i) => y(i)).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 12)
      .attr('font-weight', (d) => (d.sel ? 600 : 400)).style('fill', 'var(--color-fg)').text((d) => d.n)
      .each(function (d) { // recorta nombres largos
        const t = d3.select(this); let s = d.n;
        while (this.getComputedTextLength() > ml - 16 && s.length > 4) { s = s.slice(0, -2); t.text(s + '…'); }
      });
    fila.append('text').attr('x', w - mr + 10).attr('y', (d, i) => y(i)).attr('dy', '0.35em').attr('font-size', 12).attr('font-weight', 600)
      .style('fill', (d) => (d.ce >= 0 ? 'var(--color-ok)' : 'var(--color-bad)')).text((d) => pct(d.ce, 0, true));
    fila.on('click', (ev, d) => opts.clic && opts.clic(d))
      .on('mousemove', (ev, d) => tipEn(tip, cont, ev, opts.tip ? opts.tip(d) : [[d.n, null, 'sv-tip-h'], [`Central: ${pct(d.ce, 0, true)}`]]))
      .on('mouseleave', () => tip.style('opacity', 0));
  };

  // ---------------------------------------------------------------- empresa: evolución semanal
  G.evolucion = function (cont, filas, sim) {
    if (!filas.length) { cont.replaceChildren(h('p', { class: 'sv-card-n' }, 'Todavía no hay histórico: cada lunes se añade un punto.')); return; }
    const alto = 220, ult = filas[filas.length - 1];
    const { svg, tip, w } = G.lienzo(cont, alto);
    const ys = filas.flatMap((r) => [r.central, r.px]).concat(sim != null ? [sim] : []);
    const y = d3.scaleLinear().domain([d3.min(ys) * 0.9, d3.max(ys) * 1.06]).nice().range([alto - 24, 12]);
    const ml = G.medir(svg, y.ticks(5).map((t) => num(t, 0)), 11) + 10, mr = 64;
    const DIA = 864e5, d0 = filas[0].d, d1 = ult.d;
    const x = d3.scaleUtc().domain(filas.length > 1 ? [d0, d1] : [new Date(+d0 - 7 * DIA), new Date(+d0 + 7 * DIA)]).range([ml + 8, w - mr]);
    ejeY(svg, y, ml, w - mr, 5);
    const xt = filas.length > 1 ? x.ticks(Math.max(2, Math.floor((w - ml - mr) / 90))) : [d0];
    svg.selectAll('text.xt').data(xt).join('text').attr('x', (t) => x(t)).attr('y', alto - 6).attr('text-anchor', 'middle').attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text(d3.utcFormat('%-d/%-m/%y'));
    if (filas.length > 1) {
      svg.append('path').attr('d', d3.line().x((r) => x(r.d)).y((r) => y(r.central))(filas)).style('fill', 'none').style('stroke', C1).attr('stroke-width', 2);
      svg.append('path').attr('d', d3.line().x((r) => x(r.d)).y((r) => y(r.px))(filas)).style('fill', 'none').style('stroke', C2).attr('stroke-width', 2);
    }
    svg.selectAll('circle.c').data(filas).join('circle').attr('cx', (r) => x(r.d)).attr('cy', (r) => y(r.central)).attr('r', 4).style('fill', C1).style('stroke', 'var(--color-panel)').attr('stroke-width', 1.5);
    svg.selectAll('circle.p').data(filas).join('circle').attr('cx', (r) => x(r.d)).attr('cy', (r) => y(r.px)).attr('r', 4).style('fill', C2).style('stroke', 'var(--color-panel)').attr('stroke-width', 1.5);
    if (sim != null && Math.abs(sim - ult.central) > 0.005 * Math.abs(ult.central))
      svg.append('path').attr('d', d3.symbol(d3.symbolDiamond, 80)()).attr('transform', `translate(${x(d1)},${y(sim)})`).style('fill', 'var(--color-fg)').style('stroke', 'var(--color-panel)').attr('stroke-width', 1.5);
    const fin = [{ v: ult.central }, { v: ult.px }].map((o) => Object.assign(o, { y: y(o.v) })).sort((a, b) => a.y - b.y);
    if (fin[1].y - fin[0].y < 13) fin[1].y = fin[0].y + 13;
    for (const o of fin) svg.append('text').attr('x', w - mr + 8).attr('y', o.y).attr('dy', '0.35em').attr('font-size', 11).style('fill', 'var(--color-fg)').text(usd(o.v));
    const guia = svg.append('line').attr('y1', 12).attr('y2', alto - 24).style('stroke', 'var(--cds-chart-axis)').attr('opacity', 0);
    svg.append('rect').attr('x', ml).attr('width', w - ml - mr).attr('y', 0).attr('height', alto - 20).style('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx] = d3.pointer(ev);
        const r = filas.reduce((a, b) => (Math.abs(x(b.d) - mx) < Math.abs(x(a.d) - mx) ? b : a));
        guia.attr('x1', x(r.d)).attr('x2', x(r.d)).attr('opacity', 1);
        tipEn(tip, cont, ev, [[`Semana del ${fecha(r.fecha)}`, null, 'sv-tip-h'], [`Valor central: ${usd(r.central)} (${pct(r.central / r.px - 1, 0, true)})`, C1], [`Cotización: ${usd(r.px, 2)}`, C2]]);
      })
      .on('mouseleave', () => { tip.style('opacity', 0); guia.attr('opacity', 0); });
  };

  // ---------------------------------------------------------------- empresa: inversión de crecimiento y su retorno
  G.inversion = function (cont, e, v) {
    const r = v.res.base, U = r.nopat0 > 5e4 || e.ventas_ttm > 2e5 ? 1000 : 1, uTxt = U === 1000 ? 'mil M$' : 'M$';
    const C = { actual: 'var(--cds-chart-muted)', nuevo: C1, inv: C2 };
    const NOM = { actual: 'NOPAT del negocio actual', nuevo: 'NOPAT de la nueva inversión', inv: 'Inversión de crecimiento' };
    const filas = [{ lab: 'TTM', actual: r.nopat0, nuevo: 0, inv: -r.reinv0, fcf: r.nopat0 - r.reinv0 }]
      .concat(r.filas.map((f) => ({ lab: String(f.anio), actual: f.nopatActual, nuevo: f.nopatNuevo, inv: -f.reinv, fcf: f.fcff })));
    for (const f of filas) {
      let up = 0, dn = 0; f.seg = [];
      for (const k of ['actual', 'nuevo', 'inv']) {
        const x = f[k] / U;
        if (x >= 0) { f.seg.push({ k, a: up, b: up + x }); up += x; } else { f.seg.push({ k, a: dn + x, b: dn }); dn += x; }
      }
      f.max = up; f.min = dn;
    }
    const alto = 250;
    const { svg, tip, w } = G.lienzo(cont, alto);
    const y = d3.scaleLinear().domain([Math.min(0, d3.min(filas, (f) => Math.min(f.min, f.fcf / U))), d3.max(filas, (f) => Math.max(f.max, f.fcf / U))]).nice().range([alto - 24, 10]);
    const ml = G.medir(svg, y.ticks(5).map((d) => num(d, 0)), 11) + 10;
    const x = d3.scaleBand().domain(filas.map((f) => f.lab)).range([ml, w]).padding(0.28);
    ejeY(svg, y, ml, w, 5);
    svg.selectAll('text.xt').data(filas).join('text').attr('x', (f) => x(f.lab) + x.bandwidth() / 2).attr('y', alto - 6).attr('text-anchor', 'middle').attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text((f) => f.lab);
    const bw = Math.min(32, x.bandwidth());
    const col = svg.selectAll('g.col').data(filas).join('g');
    col.each(function (f) {
      const g = d3.select(this), x0 = x(f.lab) + (x.bandwidth() - bw) / 2;
      for (const sg of f.seg) {
        if (Math.abs(sg.b - sg.a) < 1e-9) continue;
        g.append('rect').attr('x', x0).attr('width', bw).attr('y', y(sg.b)).attr('height', Math.max(1, y(sg.a) - y(sg.b))).attr('rx', 2).style('fill', C[sg.k]).style('stroke', 'var(--color-panel)').attr('stroke-width', 1);
      }
    });
    const ln = d3.line().x((f) => x(f.lab) + x.bandwidth() / 2).y((f) => y(f.fcf / U));
    svg.append('path').attr('d', ln(filas)).style('fill', 'none').style('stroke', 'var(--color-fg)').attr('stroke-width', 1.5).attr('stroke-dasharray', '3 3').style('pointer-events', 'none');
    svg.selectAll('circle.fcf').data(filas).join('circle').attr('cx', (f) => x(f.lab) + x.bandwidth() / 2).attr('cy', (f) => y(f.fcf / U)).attr('r', 4).style('fill', 'var(--color-fg)').style('stroke', 'var(--color-panel)').attr('stroke-width', 1.5).style('pointer-events', 'none');
    col.append('rect').attr('x', (f) => x(f.lab)).attr('width', x.bandwidth()).attr('y', 0).attr('height', alto - 20).style('fill', 'transparent')
      .on('mousemove', (ev, f) => tipEn(tip, cont, ev, [[f.lab === 'TTM' ? 'Últimos doce meses (TTM)' : `Año ${f.lab}`, null, 'sv-tip-h'],
        [`${NOM.actual}: ${num(f.actual / U, 1)}`, C.actual], [`${NOM.nuevo}: ${num(f.nuevo / U, 1)}`, C.nuevo], [`${NOM.inv}: ${num(f.inv / U, 1)}`, C.inv],
        [`Flujo de caja libre: ${num(f.fcf / U, 1)} ${uTxt}`, 'var(--color-fg)']]))
      .on('mouseleave', () => tip.style('opacity', 0));
    return { leyenda: G.leyenda([[NOM.actual, C.actual], [NOM.nuevo, C.nuevo], [NOM.inv, C.inv], ['Flujo de caja libre', 'var(--color-fg)', 'b']]), unidad: uTxt };
  };
  G.unidad = (e) => (e.ventas_ttm > 2e5 ? 1000 : 1);

  // ---------------------------------------------------------------- empresa: flujos por escenario
  G.flujos = function (cont, e, v) {
    const U = G.unidad(e);
    const series = [['base', C1], ['pes', C2], ['opt', C3]];
    const alto = 220;
    const { svg, tip, w } = G.lienzo(cont, alto);
    const vals = series.flatMap(([sc]) => v.res[sc].filas.map((f) => f.fcff / U));
    const y = d3.scaleLinear().domain([Math.min(0, d3.min(vals)), d3.max(vals)]).nice().range([alto - 26, 10]);
    const ml = G.medir(svg, y.ticks(5).map((d) => num(d, 0)), 11) + 10, mr = 64;
    const x = d3.scaleLinear().domain([1, 10]).range([ml, w - mr]);
    ejeY(svg, y, ml, w - mr, 5);
    svg.selectAll('text.xt').data(d3.range(1, 11)).join('text').attr('x', (d) => x(d)).attr('y', alto - 6).attr('text-anchor', 'middle').attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text((d) => (d === 1 ? 'Año 1' : d));
    const ln = d3.line().x((f) => x(f.anio)).y((f) => y(f.fcff / U));
    const ends = [];
    for (const [sc, col] of series) {
      svg.append('path').attr('d', ln(v.res[sc].filas)).style('fill', 'none').style('stroke', col).attr('stroke-width', sc === 'base' ? 2.5 : 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
      const f10 = v.res[sc].filas[9];
      ends.push({ y: y(f10.fcff / U), val: f10.fcff / U });
    }
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
    for (const en of ends) svg.append('text').attr('x', w - mr + 6).attr('y', en.y).attr('dy', '0.35em').attr('font-size', 11).style('fill', 'var(--color-fg)').text(num(en.val, 0));
    const guia = svg.append('line').attr('y1', 10).attr('y2', alto - 26).style('stroke', 'var(--cds-chart-axis)').attr('opacity', 0);
    svg.append('rect').attr('x', ml).attr('width', w - ml - mr).attr('y', 0).attr('height', alto - 20).style('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx] = d3.pointer(ev); const a = Math.max(1, Math.min(10, Math.round(x.invert(mx))));
        guia.attr('x1', x(a)).attr('x2', x(a)).attr('opacity', 1);
        tipEn(tip, cont, ev, [[`Año ${a}`, null, 'sv-tip-h']].concat(series.map(([sc, col]) => [`${A.NOM_ESC[sc]}: ${num(v.res[sc].filas[a - 1].fcff / U, 1)} ${U === 1000 ? 'mil M$' : 'M$'}`, col])));
      })
      .on('mouseleave', () => { tip.style('opacity', 0); guia.attr('opacity', 0); });
    return G.leyenda(series.map(([sc, c]) => [A.NOM_ESC[sc], c]));
  };

  // ---------------------------------------------------------------- empresa: puente al valor por acción
  G.puente = function (cont, e, v) {
    const U = G.unidad(e), b = v.res.base, p = b.puente;
    const pasos = [
      { n: 'Flujos años 1–10', v: b.va, tipo: 'suma' },
      { n: 'Valor terminal', v: b.vaTv, tipo: 'suma' },
      { n: 'Deuda neta', v: -p.dfn, tipo: 'ajuste' },
      { n: 'Minoritarios y preferentes', v: -(p.minoritarios + p.preferentes), tipo: 'ajuste' },
      { n: 'Inversiones no operativas', v: p.inversiones, tipo: 'ajuste' },
      { n: 'Patrimonio', v: b.eq, tipo: 'total' },
    ].filter((s) => s.tipo !== 'ajuste' || Math.abs(s.v) > 0.5);
    let acc = 0;
    for (const s of pasos) { if (s.tipo === 'total') { s.a = 0; s.b = s.v; } else { s.a = acc; acc += s.v; s.b = acc; } }
    const alto = 250;
    const { svg, tip, w } = G.lienzo(cont, alto);
    const ys = pasos.flatMap((s) => [s.a / U, s.b / U]);
    const y = d3.scaleLinear().domain([Math.min(0, d3.min(ys)), d3.max(ys)]).nice().range([alto - 48, 18]);
    const ml = G.medir(svg, y.ticks(4).map((d) => num(d, 0)), 11) + 10;
    const x = d3.scaleBand().domain(pasos.map((s) => s.n)).range([ml, w]).padding(0.28);
    ejeY(svg, y, ml, w, 4);
    const col = (s) => (s.tipo === 'total' ? 'var(--color-fg)' : s.v >= 0 ? C1 : C2);
    const bw = Math.min(56, x.bandwidth());
    const gb = svg.selectAll('g.b').data(pasos).join('g');
    gb.append('rect').attr('x', (s) => x(s.n) + (x.bandwidth() - bw) / 2).attr('width', bw).attr('y', (s) => y(Math.max(s.a, s.b) / U)).attr('height', (s) => Math.max(1.5, Math.abs(y(s.a / U) - y(s.b / U)))).attr('rx', 3)
      .style('fill', col).attr('fill-opacity', (s) => (s.tipo === 'total' ? 0.75 : 0.9));
    gb.append('text').attr('x', (s) => x(s.n) + x.bandwidth() / 2).attr('y', (s) => y(Math.max(s.a, s.b) / U) - 5).attr('text-anchor', 'middle').attr('font-size', 11).style('fill', 'var(--color-fg)').text((s) => num(s.v / U, 0, s.tipo === 'ajuste'));
    const lab = svg.selectAll('text.xl').data(pasos).join('text').attr('x', (s) => x(s.n) + x.bandwidth() / 2).attr('y', alto - 32).attr('text-anchor', 'middle').attr('font-size', w < 480 ? 9.5 : 10.5).style('fill', 'var(--color-fg-muted)');
    lab.each(function (s) {
      const palabras = s.n.split(' '), t = d3.select(this), maxW = x.bandwidth() + 8;
      let lin = [], ts = t.append('tspan').attr('x', x(s.n) + x.bandwidth() / 2).attr('dy', 0);
      for (const pz of palabras) {
        lin.push(pz); ts.text(lin.join(' '));
        if (ts.node().getComputedTextLength() > maxW && lin.length > 1) { lin.pop(); ts.text(lin.join(' ')); lin = [pz]; ts = t.append('tspan').attr('x', x(s.n) + x.bandwidth() / 2).attr('dy', '1.15em').text(pz); }
      }
    });
    gb.on('mousemove', (ev, s) => tipEn(tip, cont, ev, [[s.n, null, 'sv-tip-h'], [`${num(s.v / U, 1, s.tipo === 'ajuste')} ${U === 1000 ? 'mil M$' : 'M$'}`], [s.tipo === 'total' ? `${usd(b.vps)} por acción` : `${pct(s.v / b.ev, 0)} del valor de la empresa`]]))
      .on('mouseleave', () => tip.style('opacity', 0));
  };

  // ---------------------------------------------------------------- empresa: sensibilidad WACC × g
  G.sensibilidad = function (cont, e, v, par, aj) {
    const pasos = [-0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.015];
    const ws = pasos.map((d) => v.w + d), gs = pasos.map((d) => v.g + d), rt = v.res.base.roicT;
    const celdas = [];
    ws.forEach((w, i) => gs.forEach((g, j) => {
      const r = w - g >= 0.005 ? MOTOR.sensibilidad(e, e.trays, par, aj, w, g, rt) : null;
      celdas.push({ i, j, w, g, vps: r ? r.vps : null });
    }));
    const alto = 34 + ws.length * 32;
    const { svg, tip, w } = G.lienzo(cont, alto);
    const ml = G.medir(svg, ws.map((x) => pct(x, 1)), 11) + 16;
    const cw = (w - ml) / gs.length, ch = 30;
    const ok = G.colorDe('var(--color-ok)'), bad = G.colorDe('var(--color-bad)');
    svg.append('text').attr('x', ml).attr('y', 10).attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text('g →');
    svg.append('text').attr('x', 0).attr('y', 10).attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text('WACC ↓');
    gs.forEach((g, j) => svg.append('text').attr('x', ml + cw * j + cw / 2).attr('y', 26).attr('text-anchor', 'middle').attr('font-size', 11).attr('font-weight', j === 3 ? 600 : 400).style('fill', j === 3 ? 'var(--color-fg)' : 'var(--color-fg-muted)').text(pct(g, 1)));
    ws.forEach((x, i) => svg.append('text').attr('x', ml - 8).attr('y', 34 + i * 32 + ch / 2).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 11).attr('font-weight', i === 3 ? 600 : 400).style('fill', i === 3 ? 'var(--color-fg)' : 'var(--color-fg-muted)').text(pct(x, 1)));
    const gc = svg.selectAll('g.c').data(celdas).join('g');
    gc.append('rect').attr('x', (c) => ml + c.j * cw + 1).attr('y', (c) => 34 + c.i * 32).attr('width', cw - 2).attr('height', ch).attr('rx', 3)
      .style('fill', (c) => (c.vps == null ? 'var(--color-bg)' : c.vps >= e.cotizacion ? ok : bad))
      .attr('fill-opacity', (c) => (c.vps == null ? 1 : 0.1 + 0.5 * Math.min(1, Math.abs(c.vps / e.cotizacion - 1))))
      .style('stroke', (c) => (c.i === 3 && c.j === 3 ? 'var(--color-fg)' : 'none')).attr('stroke-width', 1.5);
    gc.append('text').attr('x', (c) => ml + c.j * cw + cw / 2).attr('y', (c) => 34 + c.i * 32 + ch / 2).attr('dy', '0.35em').attr('text-anchor', 'middle')
      .attr('font-size', cw < 46 ? 10 : 11.5).attr('font-weight', (c) => (c.i === 3 && c.j === 3 ? 600 : 400)).style('fill', 'var(--color-fg)').text((c) => (c.vps == null ? 'n.s.' : num(c.vps, 0)));
    gc.on('mousemove', (ev, c) => tipEn(tip, cont, ev, [[`WACC ${pct(c.w, 2)} · g ${pct(c.g, 2)}`, null, 'sv-tip-h'], [c.vps == null ? 'WACC demasiado cerca de g' : `${usd(c.vps)} por acción (${pct(c.vps / e.cotizacion - 1, 0, true)})`]]))
      .on('mouseleave', () => tip.style('opacity', 0));
  };

  // ---------------------------------------------------------------- empresa: valor según el método
  G.metodos = function (cont, e, v, pesoDcf) {
    const mu = e.mu || {};
    const met = [{ n: 'DCF por escenarios', lo: v.res.pes.vps, ce: v.pond, hi: v.res.opt.vps }];
    if (mu.per_valor_mediana != null) met.push({ n: 'PER adelantado', lo: mu.per_valor_min, ce: mu.per_valor_mediana, hi: mu.per_valor_max });
    if (mu.ev_ebitda_valor_mediana != null) met.push({ n: 'EV/EBITDA adelantado', lo: mu.ev_ebitda_valor_min, ce: mu.ev_ebitda_valor_mediana, hi: mu.ev_ebitda_valor_max });
    met.push({ n: 'Valor central', lo: v.bajo, ce: v.central, hi: v.alto, total: true });
    const rowH = 36, alto = met.length * rowH + 40;
    const { svg, tip, w } = G.lienzo(cont, alto);
    const ml = G.medir(svg, met.map((m) => m.n), 12) + 14;
    const xmax = Math.max(e.cotizacion * 1.25, v.alto * 1.15, Math.min(d3.max(met, (m) => m.hi), e.cotizacion * 3));
    const x = d3.scaleLinear().domain([0, xmax]).nice().range([ml, w - 12]);
    const xm = x.domain()[1];
    const ticks = x.ticks(Math.max(3, Math.floor((w - ml) / 80)));
    svg.selectAll('line.gr').data(ticks).join('line').attr('x1', (d) => x(d)).attr('x2', (d) => x(d)).attr('y1', 14).attr('y2', alto - 22).style('stroke', 'var(--cds-chart-grid)');
    svg.selectAll('text.tk').data(ticks).join('text').attr('x', (d) => x(d)).attr('y', alto - 6).attr('text-anchor', 'middle').attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text((d) => num(d, 0));
    const y = (i) => 22 + i * rowH + rowH / 2;
    const cl = (z) => Math.max(0, Math.min(z, xm));
    const gm = svg.selectAll('g.m').data(met).join('g');
    gm.append('rect').attr('x', (m) => x(cl(Math.min(m.lo, m.hi)))).attr('width', (m) => Math.max(2, x(cl(Math.max(m.lo, m.hi))) - x(cl(Math.min(m.lo, m.hi))))).attr('y', (m, i) => y(i) - 7).attr('height', 14).attr('rx', 4)
      .style('fill', (m) => (m.total ? 'var(--color-fg)' : C1)).attr('fill-opacity', (m) => (m.total ? 0.22 : 0.26));
    gm.append('line').attr('x1', (m) => x(cl(m.ce))).attr('x2', (m) => x(cl(m.ce))).attr('y1', (m, i) => y(i) - 10).attr('y2', (m, i) => y(i) + 10).style('stroke', (m) => (m.total ? 'var(--color-fg)' : C1)).attr('stroke-width', 2.5);
    gm.append('text').attr('x', ml - 10).attr('y', (m, i) => y(i)).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 12).attr('font-weight', (m) => (m.total ? 600 : 400)).style('fill', 'var(--color-fg)').text((m) => m.n);
    gm.filter((m) => m.hi > xm).append('text').attr('x', w - 12).attr('y', (m) => y(met.indexOf(m)) - 12).attr('text-anchor', 'end').attr('font-size', 10.5).style('fill', 'var(--color-fg-muted)').text((m) => `hasta ${num(m.hi, 0)} ›`);
    svg.append('line').attr('x1', x(e.cotizacion)).attr('x2', x(e.cotizacion)).attr('y1', 10).attr('y2', alto - 22).style('stroke', C2).attr('stroke-width', 2);
    svg.append('text').attr('x', x(e.cotizacion)).attr('y', 8).attr('text-anchor', 'middle').attr('font-size', 11).style('fill', 'var(--color-fg)').text(`Cotización ${usd(e.cotizacion, 0)}`);
    gm.on('mousemove', (ev, m) => {
      const extra = m.total ? `${pct(pesoDcf, 0)} DCF + ${pct(1 - pesoDcf, 0)} múltiplos` : m.n.startsWith('DCF') ? 'Pesimista · ponderado · optimista' : 'Mínimo · mediana · máximo de los comparables';
      tipEn(tip, cont, ev, [[m.n, null, 'sv-tip-h'], [`${usd(m.lo)} · ${usd(m.ce)} · ${usd(m.hi)}`], [extra]]);
    }).on('mouseleave', () => tip.style('opacity', 0));
  };

  // ---------------------------------------------------------------- líneas de varias series (comparador)
  // series: [{n, color, puntos: [[x, y], ...]}]
  G.lineas = function (cont, series, opts = {}) {
    const alto = opts.alto || 220;
    const { svg, tip, w } = G.lienzo(cont, alto);
    const ys = series.flatMap((s) => s.puntos.map((p) => p[1])).filter((v) => isFinite(v));
    const lo = opts.cero ? Math.min(0, d3.min(ys)) : d3.min(ys), hi = d3.max(ys);
    const y = d3.scaleLinear().domain([lo, hi === lo ? lo + 1 : hi]).nice().range([alto - 26, 10]);
    const fmt = opts.fmtY || ((d) => num(d, 0));
    const ml = G.medir(svg, y.ticks(5).map(fmt), 11) + 10, mr = 16;
    const xs = series[0].puntos.map((p) => p[0]);
    const x = d3.scalePoint().domain(xs).range([ml + 6, w - mr]);
    ejeY(svg, y, ml, w - mr, 5, fmt);
    svg.selectAll('text.xt').data(xs).join('text').attr('x', (d) => x(d)).attr('y', alto - 6).attr('text-anchor', 'middle').attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text((d) => d);
    for (const s of series) {
      svg.append('path').attr('d', d3.line().x((p) => x(p[0])).y((p) => y(p[1])).defined((p) => isFinite(p[1]))(s.puntos)).style('fill', 'none').style('stroke', s.color).attr('stroke-width', 2.2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    }
    const guia = svg.append('line').attr('y1', 10).attr('y2', alto - 26).style('stroke', 'var(--cds-chart-axis)').attr('opacity', 0);
    svg.append('rect').attr('x', ml).attr('width', w - ml - mr).attr('y', 0).attr('height', alto - 20).style('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx] = d3.pointer(ev);
        const k = xs.reduce((a, b) => (Math.abs(x(b) - mx) < Math.abs(x(a) - mx) ? b : a));
        guia.attr('x1', x(k)).attr('x2', x(k)).attr('opacity', 1);
        tipEn(tip, cont, ev, [[`${opts.prefijo || ''}${k}`, null, 'sv-tip-h']].concat(series.map((s) => { const p = s.puntos.find((q) => q[0] === k); return [`${s.n}: ${p ? (opts.fmtTip || fmt)(p[1]) : '—'}`, s.color]; })));
      })
      .on('mouseleave', () => { tip.style('opacity', 0); guia.attr('opacity', 0); });
  };

  // ---------------------------------------------------------------- barras horizontales con etiqueta (sectores, etc.)
  // filas: [{id, n, v, sub}] ; v en proporción (potencial) -> verde/rojo
  G.barras = function (cont, filas, opts = {}) {
    const rowH = opts.rowH || 28, alto = filas.length * rowH + 30;
    const { svg, tip, w } = G.lienzo(cont, alto);
    const ml = Math.min(w * 0.45, G.medir(svg, filas.map((f) => f.n), 12) + 14), mr = 58;
    const vs = filas.map((f) => f.v).concat([0]);
    const x = d3.scaleLinear().domain([Math.min(0, d3.min(vs)), Math.max(0, d3.max(vs))]).nice().range([ml, w - mr]);
    const y = (i) => 8 + i * rowH;
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 2).attr('y2', alto - 18).style('stroke', 'var(--cds-chart-reference)');
    const ticks = x.ticks(Math.max(2, Math.floor((w - ml - mr) / 90)));
    svg.selectAll('text.tk').data(ticks).join('text').attr('x', (d) => x(d)).attr('y', alto - 4).attr('text-anchor', 'middle').attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text(opts.fmt || ((d) => pct(d, 0, true)));
    const g = svg.selectAll('g.f').data(filas).join('g').style('cursor', opts.clic ? 'pointer' : 'default');
    g.append('rect').attr('x', 0).attr('width', w).attr('y', (d, i) => y(i)).attr('height', rowH).style('fill', 'transparent');
    g.append('rect').attr('x', (d) => x(Math.min(0, d.v))).attr('width', (d) => Math.max(1.5, Math.abs(x(d.v) - x(0)))).attr('y', (d, i) => y(i) + rowH * 0.2).attr('height', rowH * 0.6).attr('rx', 3)
      .style('fill', (d) => d.color || (d.v >= 0 ? 'var(--color-ok)' : 'var(--color-bad)')).attr('fill-opacity', 0.75);
    g.append('text').attr('x', ml - 10).attr('y', (d, i) => y(i) + rowH / 2).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 12).style('fill', 'var(--color-fg)').text((d) => d.n);
    g.append('text').attr('x', (d) => (d.v >= 0 ? x(d.v) + 6 : x(0) + 6)).attr('y', (d, i) => y(i) + rowH / 2).attr('dy', '0.35em').attr('font-size', 11.5).attr('font-weight', 600)
      .style('fill', 'var(--color-fg)').text((d) => (opts.fmt || ((z) => pct(z, 0, true)))(d.v));
    g.on('click', (ev, d) => opts.clic && opts.clic(d))
      .on('mousemove', (ev, d) => opts.tip && tipEn(tip, cont, ev, opts.tip(d)))
      .on('mouseleave', () => tip.style('opacity', 0));
  };

  // ---------------------------------------------------------------- dispersión (oportunidades)
  // puntos: [{id, n, x, y, r?, sel?}]
  G.dispersion = function (cont, puntos, opts = {}) {
    const alto = opts.alto || 300;
    const { svg, tip, w } = G.lienzo(cont, alto);
    const xs = puntos.map((p) => p.x), ys = puntos.map((p) => p.y);
    const x = d3.scaleLinear().domain(opts.dx || [d3.min(xs), d3.max(xs)]).nice().range([0, 1]).clamp(true);
    const y = d3.scaleLinear().domain(opts.dy || [d3.min(ys), d3.max(ys)]).nice().range([alto - 30, 12]).clamp(true);
    const ml = G.medir(svg, y.ticks(5).map(opts.fmtY || ((d) => num(d, 0))), 11) + 12;
    x.range([ml, w - 12]);
    svg.selectAll('line.gy').data(y.ticks(5)).join('line').attr('x1', ml).attr('x2', w - 12).attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).style('stroke', 'var(--cds-chart-grid)');
    svg.selectAll('text.ty').data(y.ticks(5)).join('text').attr('x', ml - 8).attr('y', (d) => y(d)).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text(opts.fmtY || ((d) => num(d, 0)));
    svg.selectAll('text.tx').data(x.ticks(Math.max(3, Math.floor((w - ml) / 80)))).join('text').attr('x', (d) => x(d)).attr('y', alto - 12).attr('text-anchor', 'middle').attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text(opts.fmtX || ((d) => num(d, 0)));
    if (opts.x0 != null) svg.append('line').attr('x1', x(opts.x0)).attr('x2', x(opts.x0)).attr('y1', 8).attr('y2', alto - 30).style('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 3');
    if (opts.y0 != null) svg.append('line').attr('x1', ml).attr('x2', w - 12).attr('y1', y(opts.y0)).attr('y2', y(opts.y0)).style('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 3');
    if (opts.tituloX) svg.append('text').attr('x', w - 12).attr('y', alto - 26).attr('text-anchor', 'end').attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text(opts.tituloX);
    if (opts.tituloY) svg.append('text').attr('x', ml + 4).attr('y', 10).attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text(opts.tituloY);
    const orden = puntos.slice().sort((a, b) => (a.sel === b.sel ? 0 : a.sel ? 1 : -1));
    svg.selectAll('circle.p').data(orden).join('circle').attr('cx', (p) => x(p.x)).attr('cy', (p) => y(p.y)).attr('r', (p) => (p.sel ? 5 : 3.5))
      .style('fill', (p) => (p.sel ? C1 : 'var(--cds-chart-muted)')).attr('fill-opacity', (p) => (p.sel ? 0.9 : 0.45)).style('stroke', (p) => (p.sel ? 'var(--color-panel)' : 'none')).attr('stroke-width', 1.2)
      .style('cursor', opts.clic ? 'pointer' : 'default')
      .on('click', (ev, p) => opts.clic && opts.clic(p))
      .on('mousemove', (ev, p) => tipEn(tip, cont, ev, opts.tip ? opts.tip(p) : [[p.n, null, 'sv-tip-h']]))
      .on('mouseleave', () => tip.style('opacity', 0));
  };
})(window.APP);
