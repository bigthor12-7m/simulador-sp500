// Simulador S&P 500 · seguimiento semanal de las estrategias frente al S&P 500, empresas que sigo y avisos por correo.
(function (A) {
  const { h, num, pct, usd, fecha, G } = A;
  const REPO = 'https://github.com/bigthor12-7m/simulador-sp500';
  let SEG = null, pendiente = null;
  A.cargarSeguimiento = function () {
    if (SEG) return Promise.resolve(SEG);
    if (!pendiente) pendiente = A.json('seguimiento', true).then((d) => (SEG = d && d.semanas ? d : { semanas: [], rendimiento: {}, estrategias: [] }));
    return pendiente;
  };
  const COL = { sp500: 'var(--color-fg)', universo: 'var(--cds-chart-muted)' };
  const colEst = (i) => G.colores[i % G.colores.length];
  const nomCorto = (t) => { const e = A.D.porT[t]; return e ? e.nombre : t; };

  A.vistas.seguimiento = function (main) {
    main.append(h('header', { class: 'sv-head' },
      h('h1', { class: 'sv-h1' }, 'Seguimiento semanal'),
      h('p', { class: 'sv-take' }, 'Cada lunes se guardan las candidatas de cada estrategia y se mide cómo evolucionan sus cotizaciones frente al S&P 500. Así se puede comprobar, semana a semana y sin mirar atrás, si los filtros del simulador aciertan.'),
      h('p', { class: 'sv-meta' }, 'Carteras de pesos iguales que se rehacen cada semana con los supuestos por defecto; variación de la cotización, sin dividendos ni costes. No es una recomendación de inversión.')));
    const cont = h('div', { class: 'ap-seg-cont' }, h('p', { class: 'sv-card-n' }, 'Cargando el seguimiento…'));
    main.append(cont);
    A.cargarSeguimiento().then((S) => { if (cont.isConnected) pintar(cont, S); })
      .catch(() => { cont.replaceChildren(h('p', { class: 'sv-warn' }, 'No se ha podido cargar el seguimiento.')); });
  };

  function pintar(cont, S) {
    cont.replaceChildren();
    const sem = S.semanas || [], n = sem.length, R = S.rendimiento || {};
    const ests = (S.estrategias && S.estrategias.length ? S.estrategias : CRIT.ESTRATEGIAS).map((x) => Object.assign({}, CRIT.ESTRATEGIAS.find((y) => y.id === x.id) || {}, x));
    if (!n) { cont.append(h('p', { class: 'sv-card-n' }, 'El seguimiento empieza con la próxima actualización semanal.')); tarjetaSigo(cont, S); return; }
    const ult = sem[n - 1], prev = n > 1 ? sem[n - 2] : null;
    const ind = (id) => (R[id] && R[id].length ? R[id][R[id].length - 1].indice / 100 - 1 : null);
    const retSem = (id) => (R[id] && R[id].length > 1 ? R[id][R[id].length - 1].ret : null);
    const sp = ind('sp500');

    cont.append(h('section', { class: 'sv-kpis' },
      A.kpi('Semanas de seguimiento', String(n), `Desde el ${fecha(S.inicio)} · última: ${fecha(ult.fecha)}`),
      A.kpi('S&P 500 desde el inicio', n > 1 ? pct(sp, 1, true) : '—', ult.sp500 ? `Índice en ${num(ult.sp500, 0)} puntos` : null, n > 1 ? A.clsPot(sp) : null),
      ...ests.slice(0, 2).map((x) => A.kpi(x.n, n > 1 ? pct(ind(x.id), 1, true) : `${(ult.cand[x.id] || []).length} empresas`, n > 1 ? `Frente al S&P 500: ${A.pp(ind(x.id) - sp, 1)}` : 'Cartera de partida de esta semana', n > 1 ? A.clsPot(ind(x.id) - sp) : null))));

    // gráfico de índices
    const series = ests.map((x, i) => ({ n: x.n, color: colEst(i), puntos: (R[x.id] || []).map((r) => [new Date(r.fecha + 'T00:00:00Z'), r.indice]) }))
      .concat([{ n: 'S&P 500', color: COL.sp500, discontinua: true, puntos: (R.sp500 || []).map((r) => [new Date(r.fecha + 'T00:00:00Z'), r.indice]) },
        { n: 'Todas las valoradas', color: COL.universo, discontinua: true, puntos: (R.universo || []).map((r) => [new Date(r.fecha + 'T00:00:00Z'), r.indice]) }]);
    cont.append(A.tarjeta('Evolución de cada estrategia (inicio = 100)', n > 1 ? 'Valor de 100 $ invertidos el primer lunes en cada estrategia, rehaciendo la cartera cada semana.' : 'Esta es la semana de partida: el gráfico se completa a partir del próximo lunes.',
      G.leyenda(series.map((s) => [s.n, s.color])), G.caja(260, (c) => G.temporal(c, series, { alto: 260, fmtY: (d) => num(d, 0), fmtTip: (d) => num(d, 1), prefijo: 'Semana del ' }))));

    // tabla de estrategias
    const filas = ests.map((x, i) => {
      const ahora = ult.cand[x.id] || [], antes = prev ? prev.cand[x.id] || [] : null;
      return { x, i, ahora, ent: antes ? ahora.filter((t) => !antes.includes(t)) : [], sal: antes ? antes.filter((t) => !ahora.includes(t)) : [], tot: ind(x.id), sem: retSem(x.id) };
    });
    cont.append(A.tarjeta('Estrategias', 'Las candidatas se calculan con las mismas reglas que el filtro de oportunidades y los supuestos por defecto.',
      A.tabla([
        { t: 'Estrategia', v: (f) => f.x.n, f: (f) => h('span', null, h('i', { class: 'ap-pt', style: { background: colEst(f.i) } }), ' ', h('b', null, f.x.n)), texto: true },
        { t: 'Empresas', v: (f) => f.ahora.length },
        { t: 'Entran · salen', f: (f) => (prev ? `+${f.ent.length} · −${f.sal.length}` : 'partida') },
        { t: 'Última semana', v: (f) => f.sem, f: (f) => (f.sem == null ? '—' : A.potSpan(f.sem, 1)) },
        { t: 'Desde el inicio', v: (f) => f.tot, f: (f) => (n > 1 ? A.potSpan(f.tot, 1) : '—') },
        { t: 'Frente al S&P 500', v: (f) => (f.tot != null && sp != null ? f.tot - sp : null), f: (f) => (n > 1 ? h('span', { class: A.clsPot(f.tot - sp) }, A.pp(f.tot - sp, 1)) : '—') },
      ], filas)));

    // carteras actuales
    const Vs = A.valores();
    cont.append(h('div', { class: 'sv-grid2' }, filas.map((f) => A.tarjeta(`${f.x.n} · ${f.ahora.length}`, f.x.d,
      f.ahora.length ? h('div', { class: 'sv-chips' }, f.ahora.map((t) => {
        const e = A.D.porT[t], v = Vs[t];
        return h('a', { class: 'sv-chip ap-chip-l' + (f.ent.includes(t) ? ' ap-nuevo' : ''), href: '#/empresa/' + t, title: e ? `${e.nombre}${v ? ` · potencial ${pct(v.pot, 0, true)}` : ''}` : t },
          t, v && v.valido ? h('span', { class: A.clsPot(v.pot) }, ' ' + pct(v.pot, 0, true)) : null);
      })) : h('p', { class: 'sv-card-n' }, 'Ninguna empresa cumple esta semana los criterios.'),
      f.ent.length ? h('p', { class: 'sv-kpi-r' }, `Nuevas esta semana (resaltadas): ${f.ent.map(nomCorto).join(', ')}.`) : null,
      f.sal.length ? h('p', { class: 'sv-kpi-r' }, `Salen: ${f.sal.map(nomCorto).join(', ')}.`) : null))));

    tarjetaSigo(cont, S);
  }

  // ---------------------------------------------------------------- empresas que sigo y avisos por correo
  function tarjetaSigo(cont, S) {
    const Vs = A.valores(), H = A.D.hist || { fechas: [], series: {} }, k = H.fechas.length - 1;
    const lista = A.S.seg.map((t) => A.D.porT[t]).filter(Boolean);
    const ult = (S.semanas || [])[(S.semanas || []).length - 1];
    const enEst = (t) => (ult ? (S.estrategias || CRIT.ESTRATEGIAS).filter((x) => (ult.cand[x.id] || []).includes(t)).map((x) => x.n) : []);
    const varSem = (t, i) => { const s = H.series[t]; return s && k > 0 && s[k] && s[k - 1] ? s[k][i] / s[k - 1][i] - 1 : null; };
    const quitar = (e) => { const b = A.botonSeg(e.ticker); b.addEventListener('click', () => A.programar()); return b; };
    cont.append(A.tarjeta(`Empresas que sigues (${lista.length})`, 'Se guardan en este navegador. Añádelas con el botón "☆ Seguir" de la ficha de cada empresa.',
      lista.length ? A.tabla([
        { t: 'Empresa', v: (e) => e.nombre, f: (e) => h('span', { class: 'ap-emp' }, h('b', null, e.nombre), ' ', h('span', { class: 'ap-tk' }, e.ticker)), texto: true },
        { t: 'Cotización', v: (e) => e.cotizacion, f: (e) => usd(e.cotizacion, 2) },
        { t: 'Semana', v: (e) => varSem(e.ticker, 1), f: (e) => { const x = varSem(e.ticker, 1); return x == null ? '—' : A.potSpan(x, 1); }, ayuda: 'Variación de la cotización desde la actualización anterior' },
        { t: 'Valor central', v: (e) => (Vs[e.ticker] ? Vs[e.ticker].central : null), f: (e) => (Vs[e.ticker] && Vs[e.ticker].valido ? usd(Vs[e.ticker].central) : '—'), cls: 'sv-strong' },
        { t: 'Potencial', v: (e) => (Vs[e.ticker] ? Vs[e.ticker].pot : null), f: (e) => (Vs[e.ticker] && Vs[e.ticker].valido ? A.potSpan(Vs[e.ticker].pot) : '—') },
        { t: 'En las estrategias', f: (e) => enEst(e.ticker).join(' · ') || '—', cls: 'sv-sec-col' },
        { t: '', f: quitar },
      ], lista, { clic: (e) => A.ir('#/empresa/' + e.ticker) }) : h('p', { class: 'sv-card-n' }, 'Todavía no sigues ninguna empresa.')));

    const conf = S.avisos || { seguir: [], umbral: 0.1 };
    const mia = A.S.seg.slice().sort(), suya = (conf.seguir || []).slice().sort();
    const igual = mia.length && mia.join(',') === suya.join(',');
    const json = JSON.stringify({ seguir: A.S.seg, umbral: conf.umbral || 0.1, estrategias: conf.estrategias || CRIT.ESTRATEGIAS.map((x) => x.id) }, null, 2);
    const copiar = h('button', { type: 'button', class: 'sv-btn' }, 'Copiar tu lista para los avisos');
    const ok = h('span', { class: 'sv-ctrl-d', role: 'status' });
    copiar.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(json); ok.textContent = 'Copiada. Pégala en el fichero de avisos y guarda el cambio (Commit changes).'; }
      catch (e) { ok.textContent = 'No se ha podido copiar: selecciona el texto de abajo.'; pre.hidden = false; }
    });
    const pre = h('pre', { class: 'ap-pre', hidden: true }, json);
    cont.append(A.tarjeta('Avisos por correo', null,
      h('p', { class: 'sv-card-n' }, `Cada lunes, al terminar la actualización, se abre un aviso (issue) en el repositorio de GitHub con las empresas que entran y salen de cada estrategia y con las empresas que sigues, resaltando las que se mueven más de un ${pct(conf.umbral || 0.1, 0)} (cotización o valor central). GitHub te lo envía por correo.`),
      h('dl', { class: 'ap-dl' },
        h('dt', null, 'Empresas en los avisos'), h('dd', null, suya.length ? suya.join(', ') : 'ninguna'),
        h('dt', null, 'Tu lista en este navegador'), h('dd', null, mia.length ? mia.join(', ') + (igual ? ' (coincide)' : '') : 'vacía')),
      h('div', { class: 'sv-bar' }, copiar, h('a', { class: 'sv-btn', href: `${REPO}/edit/main/pipeline/avisos.json`, target: '_blank', rel: 'noopener' }, 'Editar el fichero de avisos en GitHub ›'),
        h('a', { class: 'sv-btn', href: `${REPO}/issues`, target: '_blank', rel: 'noopener' }, 'Ver los avisos ›')),
      ok, pre,
      h('p', { class: 'sv-kpi-r' }, 'Si no te llegan, revisa en GitHub › Settings › Notifications que las notificaciones por correo estén activadas.')));
  }
})(window.APP);
