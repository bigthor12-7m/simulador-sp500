// Motor de valoración del simulador S&P 500: el mismo que el simulador de las 7 Magníficas (réplica en JavaScript de
// motor3.py): DCF a 10 años desde las cifras TTM, valor terminal por inductores o Gordon, escenarios ponderados y
// conciliación con múltiplos adelantados de comparables. Incluye el modo de "retorno explícito de la inversión".
// Novedades para el S&P 500: (1) las trayectorias de los escenarios se generan aquí a partir de sus anclas (años 1-2 del
// consenso y convergencia lineal al año 10), con la misma regla que el actualizador de las 7 Magníficas; (2) el coste de
// la deuda usa el diferencial de cada empresa (rating sintético por cobertura de intereses).
(function (raiz) {
  const ESC = ['pes', 'base', 'opt'];

  // Anclas por escenario -> trayectorias de 10 años (crecimiento, margen EBIT, amortización, CapEx y NOF sobre ventas).
  function trayectorias(p) {
    const lin = (a, b) => Array.from({ length: 10 }, (_, k) => a + (b - a) * k / 9);
    const out = {};
    ESC.forEach((sc, i) => {
      const g1 = p.g1[i], g2 = p.g2[i], m1 = p.m1[i], m2 = p.m2[i], m10 = p.m10[i];
      const gr = [g1, g2], mg = [m1, m2];
      for (let j = 1; j <= 8; j++) { gr.push(g2 + (p.g10 - g2) * j / 8); mg.push(m2 + (m10 - m2) * j / 8); }
      out[sc] = { gr, mg, da: lin(p.da, p.da), cx: lin(p.cx0, p.cx10), nf: lin(p.nof, p.nof) };
    });
    return out;
  }

  function wacc(emp, par, aj) {
    const beta = aj && aj.beta != null ? aj.beta : emp.beta;
    const ke = par.rf + beta * par.erp + (emp.prima_pais || 0);
    const kd = par.rf + (emp.diferencial != null ? emp.diferencial : par.spread) + (par.dspread || 0);
    const D = emp.deuda_bruta, E = emp.cotizacion * emp.acciones_m;
    const wd = D + E > 0 ? D / (D + E) : 0;
    const w = (1 - wd) * ke + wd * kd * (1 - emp.tipo_impositivo) + (par.dwacc || 0);
    return { ke, kd, wd, beta, wacc: w };
  }

  // Ajustes de la empresa: dg = puntos de crecimiento en los años 1-9 (se desvanece hasta 0 en el año 10);
  // dm = puntos de margen EBIT a largo plazo (los años 1-2 siguen al consenso; el ajuste llega entero al año 10).
  function camino(base, aj) {
    const dg = (aj && aj.dg) || 0, dm = (aj && aj.dm) || 0;
    return {
      gr: base.gr.map((x, k) => x + dg * (1 - k / 9)),
      mg: base.mg.map((x, k) => (k < 2 ? x : x + dm * (k - 1) / 8)),
      da: base.da, cx: base.cx, nf: base.nf,
    };
  }

  // inv (opcional): {ronic, lag} activa el retorno explícito de la inversión.
  function dcf(emp, cam, w, g, fr, roicTope, metodoVt, roicFijo, inv) {
    const tax = emp.tipo_impositivo, d = emp.anios_hasta_valoracion;
    const nopat0 = emp.ebit_ttm * (1 - tax), reinv0 = emp.inversion_neta_ttm;
    let vPrev = emp.ventas_ttm, nofPrev = vPrev * emp.nof_ventas_ttm;
    const base = [];
    for (let k = 0; k < 10; k++) {
      const v = vPrev * (1 + cam.gr[k]);
      const da = v * cam.da[k], cx = v * cam.cx[k], nof = v * cam.nf[k], dnof = nof - nofPrev;
      base.push({ v, da, cx, nof, dnof, reinv: cx - da + dnof });
      vPrev = v; nofPrev = nof;
    }
    const inversiones = [reinv0].concat(base.map((b) => b.reinv));
    let ic = emp.capital_invertido, va = 0;
    const filas = [];
    for (let k = 0; k < 10; k++) {
      const b = base[k], anio = k + 1;
      let nopat, ebit;
      if (inv) {
        let acum = 0;
        for (let j = 0; j <= anio - inv.lag; j++) acum += inversiones[j];
        nopat = nopat0 + inv.ronic * acum; ebit = nopat / (1 - tax);
      } else {
        ebit = b.v * cam.mg[k]; nopat = ebit * (1 - tax);
      }
      const fcff = nopat - b.reinv;
      const fd = Math.pow(1 + w, -(k + 0.5 - d));
      va += fcff * fd;
      filas.push({ anio, ventas: b.v, ebit, margen: ebit / b.v, crecimiento: cam.gr[k], nopat, nopatActual: nopat0, nopatNuevo: nopat - nopat0,
        reinv: b.reinv, capex: b.cx, amort: b.da, fcff, va: fcff * fd, icIni: ic });
      ic += b.reinv;
    }
    const f10 = filas[9];
    const roic10 = f10.icIni > 0 ? f10.nopat / f10.icIni : null;
    let rt = roicFijo;
    if (rt == null) {
      const cap = Math.min(Math.max(roic10 || w, w), roicTope);
      rt = w + fr * (cap - w);
    }
    rt = Math.max(rt, g + 0.005);
    const nopat11 = f10.ebit * (1 + g) * (1 - tax);
    const tv = metodoVt === 'gordon' ? f10.fcff * (1 + g) / (w - g) : nopat11 * (1 - g / rt) / (w - g);
    const fdTv = Math.pow(1 + w, -(10 - d));
    const ev = va + tv * fdTv;
    const puente = { dfn: emp.deuda_financiera_neta, minoritarios: emp.minoritarios, preferentes: emp.preferentes, inversiones: emp.inversiones_no_operativas };
    const eq = ev - puente.dfn - puente.minoritarios - puente.preferentes + puente.inversiones;
    return { vps: eq / emp.acciones_m, ev, eq, va, vaTv: tv * fdTv, pesoTv: (tv * fdTv) / ev, roicT: rt, roic10, filas, puente, nopat0, reinv0, inversiones,
      valido: w - g >= 0.005 };
  }

  function ronicImplicito(r, lag) {
    let acum = 0;
    for (let j = 0; j <= 10 - lag; j++) acum += r.inversiones[j];
    const x = acum > 0 ? (r.filas[9].nopat - r.nopat0) / acum : null;
    return x != null && x > -0.5 && x < 1 ? x : null;
  }

  function valorSinCrecimiento(emp, w) {
    const ev = (emp.ebit_ttm * (1 - emp.tipo_impositivo)) / w;
    return (ev - emp.deuda_financiera_neta - emp.minoritarios - emp.preferentes + emp.inversiones_no_operativas) / emp.acciones_m;
  }

  function invDe(aj) { return aj && aj.invModo === 'explicito' && aj.ronic != null ? { ronic: aj.ronic, lag: aj.lag || 1 } : null; }

  // mul: {per_valor_mediana, ev_ebitda_valor_mediana}; si falta uno se usa el otro y, si faltan los dos, solo el DCF.
  function valorar(emp, tray, mul, par, aj) {
    const W = wacc(emp, par, aj), w = W.wacc, g = par.g, inv = invDe(aj);
    const cons = {};
    for (const sc of ESC) cons[sc] = dcf(emp, camino(tray[sc], aj), w, g, par.fr[sc], par.roicTope, par.metodoVt, null, null);
    const lag = (aj && aj.lag) || 1;
    const ronicImpl = ronicImplicito(cons.base, lag);
    let res = cons;
    if (inv) {
      res = {};
      for (const sc of ESC) {
        const rs = ronicImplicito(cons[sc], inv.lag), f = ronicImpl && rs ? rs / ronicImpl : 1;
        res[sc] = dcf(emp, camino(tray[sc], aj), w, g, par.fr[sc], par.roicTope, par.metodoVt, null, { ronic: inv.ronic * f, lag: inv.lag });
      }
    }
    const pr = par.prob;
    const pond = pr.pes * res.pes.vps + pr.base * res.base.vps + pr.opt * res.opt.vps;
    const meds = [mul && mul.per_valor_mediana, mul && mul.ev_ebitda_valor_mediana].filter((x) => x != null && isFinite(x) && x > 0);
    const hayMul = meds.length > 0;
    const mm = hayMul ? d3mean(meds) : null;
    const pw = hayMul ? par.pesoDcf : 1;
    const central = pw * pond + (1 - pw) * (mm || 0);
    const bajo = pw * res.pes.vps + (1 - pw) * (hayMul ? Math.min(...meds) : 0);
    const alto = pw * res.opt.vps + (1 - pw) * (hayMul ? Math.max(...meds) : 0);
    const valido = ESC.every((sc) => res[sc].valido);
    return { W, w, g, res, cons, pond, mm, central, bajo, alto, pot: central / emp.cotizacion - 1, valido, inv, ronicImpl, lag, pesoDcf: pw };
  }
  function d3mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }

  function sensibilidad(emp, tray, par, aj, w, g, roicT) {
    return dcf(emp, camino(tray.base, aj), w, g, par.fr.base, par.roicTope, par.metodoVt, roicT, invDe(aj));
  }

  function crecimientoImplicito(emp, tray, par, aj, w, roicT) {
    const c0 = camino(tray.base, aj), g10 = c0.gr[9], inv = invDe(aj);
    const f = (x) => {
      const gr = [x, x, x, x, x].concat([1, 2, 3, 4, 5].map((j) => x + (g10 - x) * j / 5));
      return dcf(emp, Object.assign({}, c0, { gr }), w, par.g, par.fr.base, par.roicTope, par.metodoVt, roicT, inv).vps - emp.cotizacion;
    };
    let lo = -0.3, hi = 1.5, flo = f(lo);
    if (flo * f(hi) >= 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, fm = f(mid);
      if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
    }
    return (lo + hi) / 2;
  }

  raiz.MOTOR = { ESC, trayectorias, wacc, camino, dcf, valorar, sensibilidad, crecimientoImplicito, ronicImplicito, valorSinCrecimiento };
})(typeof window !== 'undefined' ? window : globalThis);
