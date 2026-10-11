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

  // valores por acción (medianas) de los métodos de múltiplos disponibles
  function medianasMultiplos(mul) {
    const xs = mul && mul.metodos ? mul.metodos.map((m) => m.valor && m.valor.med) : [mul && mul.per_valor_mediana, mul && mul.ev_ebitda_valor_mediana];
    return xs.filter((x) => x != null && isFinite(x) && x > 0);
  }
  // valor central, bajo y alto: peso del modelo intrínseco + resto con la media de los múltiplos (como en el DCF)
  function conciliar(emp, res, mul, par) {
    const pr = par.prob;
    const pond = pr.pes * res.pes.vps + pr.base * res.base.vps + pr.opt * res.opt.vps;
    const meds = medianasMultiplos(mul), hay = meds.length > 0;
    const mm = hay ? d3mean(meds) : null, pw = hay ? par.pesoDcf : 1;
    return { pond, mm, pesoDcf: pw, central: pw * pond + (1 - pw) * (mm || 0),
      bajo: pw * res.pes.vps + (1 - pw) * (hay ? Math.min(...meds) : 0), alto: pw * res.opt.vps + (1 - pw) * (hay ? Math.max(...meds) : 0) };
  }

  // ======================================================================= beneficio residual (bancos, seguros, eléctricas…)
  // Por acción: valor = valor contable + VA[(ROE − Ke) × valor contable inicial de cada año] + valor terminal.
  // ROE de los años 1-2 con el BPA del consenso; después converge a Ke + convergencia × (ROE del año 2 − Ke).
  // El valor contable crece con el beneficio no repartido; el reparto converge al que sostiene g a largo plazo (1 − g / ROE).
  function ke(emp, par, aj) {
    const beta = aj && aj.beta != null ? aj.beta : emp.beta;
    return { beta, ke: par.rf + beta * par.erp + (emp.prima_pais || 0) + (par.dwacc || 0) };
  }
  function riEsc(emp, i, k, g, fr, aj, roeFijo) {
    const p = emp.ri, d = emp.anios_hasta_valoracion, dm = (aj && aj.dm) || 0;
    const bv0 = p.bv0;
    let bv = bv0, va = 0, roe2 = null, roeLT = null, payoutLT = null;
    const filas = [];
    for (let t = 1; t <= 10; t++) {
      let roe;
      if (t === 1) roe = p.bpa1[i] / bv;
      else if (t === 2) {
        roe = p.bpa2[i] / bv; roe2 = roe;
        roeLT = (roeFijo != null ? roeFijo : k + fr * (roe2 - k)) + (roeFijo != null ? 0 : dm);
        payoutLT = Math.min(1, Math.max(0, roeLT > 0 ? 1 - g / roeLT : 1));
      } else roe = roe2 + (roeLT - roe2) * (t - 2) / 8;
      const payout = t <= 2 ? p.payout0 : p.payout0 + (payoutLT - p.payout0) * (t - 2) / 8;
      const bpa = roe * bv, ri = (roe - k) * bv, fd = Math.pow(1 + k, -(t - d));
      va += ri * fd;
      const dpa = bpa * payout;
      filas.push({ anio: t, roe, bpa, dpa, payout, bvIni: bv, bv: bv + bpa - dpa, ri, va: ri * fd });
      bv = bv + bpa - dpa;
    }
    const tv = (roeLT - k) * bv / (k - g), vaTv = tv * Math.pow(1 + k, -(10 - d));
    const base = bv0 * Math.pow(1 + k, d);
    const vps = base + va + vaTv;
    return { vps, eq: vps * emp.acciones_m, bv0, base, va, vaTv, pesoTv: vaTv / vps, roeLT, roe2, filas, valido: k - g >= 0.005 };
  }
  function valorarRI(emp, mul, par, aj) {
    const K = ke(emp, par, aj), k = K.ke, g = par.g;
    const res = {};
    ESC.forEach((sc, i) => { res[sc] = riEsc(emp, i, k, g, par.fr[sc], aj, null); });
    const c = conciliar(emp, res, mul, par);
    return Object.assign({ modelo: 'ri', W: { ke: k, kd: null, wd: 0, beta: K.beta, wacc: k }, w: k, g, res, cons: res, inv: null, ronicImpl: null, lag: 1,
      pot: c.central / emp.cotizacion - 1, valido: ESC.every((sc) => res[sc].valido) && emp.ri.bv0 > 0 }, c);
  }
  // ROE a largo plazo que descuenta la cotización (caso base)
  function roeImplicito(emp, par, aj, k) {
    const f = (x) => riEsc(emp, 1, k, par.g, par.fr.base, aj, x).vps - emp.cotizacion;
    return biseccion(f, -0.2, 1.0);
  }

  // ======================================================================= REIT: descuento del flujo disponible para el accionista (AFFO)
  // AFFO ≈ FFO × 85 % (el resto, CapEx de mantenimiento). Crece en los años 1-2 como los ingresos del consenso y converge a g
  // en el año 10; valor terminal de Gordon. Se descuenta el AFFO y no el dividendo: lo que no se reparte se reinvierte.
  function reitEsc(emp, i, k, g, aj, gFijo) {
    const p = emp.reit, d = emp.anios_hasta_valoracion, dg = (aj && aj.dg) || 0;
    const g1 = gFijo != null ? gFijo : p.g1[i] + dg, g2 = gFijo != null ? gFijo : p.g2[i] + dg;
    const gr = [g1, g2];
    for (let t = 3; t <= 10; t++) gr.push(gFijo != null && t <= 5 ? gFijo : (gFijo != null ? gFijo + (g - gFijo) * (t - 5) / 5 : g2 + (g - g2) * (t - 2) / 8));
    let dpa = p.affo0, va = 0;
    const filas = [];
    for (let t = 1; t <= 10; t++) {
      dpa = dpa * (1 + gr[t - 1]);
      const fd = Math.pow(1 + k, -(t - 0.5 - d));
      va += dpa * fd;
      const f = dpa / p.affo0;
      filas.push({ anio: t, crecimiento: gr[t - 1], affo: dpa, dpa: p.dps0 * f, ffo: p.ffo_ps * f, va: dpa * fd });
    }
    const tv = dpa * (1 + g) / (k - g), vaTv = tv * Math.pow(1 + k, -(10 - d));
    const vps = va + vaTv;
    return { vps, eq: vps * emp.acciones_m, va, vaTv, pesoTv: vaTv / vps, filas, valido: k - g >= 0.005 };
  }
  function valorarREIT(emp, mul, par, aj) {
    const K = ke(emp, par, aj), k = K.ke, g = par.g;
    const res = {};
    ESC.forEach((sc, i) => { res[sc] = reitEsc(emp, i, k, g, aj, null); });
    const c = conciliar(emp, res, mul, par);
    return Object.assign({ modelo: 'reit', W: { ke: k, kd: null, wd: 0, beta: K.beta, wacc: k }, w: k, g, res, cons: res, inv: null, ronicImpl: null, lag: 1,
      pot: c.central / emp.cotizacion - 1, valido: ESC.every((sc) => res[sc].valido) }, c);
  }
  // crecimiento anual del AFFO (años 1-5) que descuenta la cotización
  function crecDividendoImplicito(emp, par, aj, k) {
    return biseccion((x) => reitEsc(emp, 1, k, par.g, aj, x).vps - emp.cotizacion, -0.3, 0.6);
  }
  function biseccion(f, lo, hi) {
    let flo = f(lo);
    if (!isFinite(flo) || flo * f(hi) >= 0) return null;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2, fm = f(mid);
      if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // ======================================================================= interfaz común para la app
  // valor del caso base con otra tasa de descuento (WACC o Ke) y otro g
  function sensibilidadVps(emp, par, aj, v, tasa, g) {
    if (emp.modelo === 'ri') return riEsc(emp, 1, tasa, g, par.fr.base, aj, null).vps;
    if (emp.modelo === 'reit') return reitEsc(emp, 1, tasa, g, aj, null).vps;
    return sensibilidad(emp, emp.trays, par, aj, tasa, g, v.res.base.roicT).vps;
  }
  // lo que descuenta la cotización: crecimiento de ventas (DCF), ROE a largo plazo (beneficio residual) o crecimiento del dividendo (REIT)
  function implicito(emp, par, aj, v) {
    if (!v.valido) return null;
    if (emp.modelo === 'ri') return roeImplicito(emp, par, aj, v.w);
    if (emp.modelo === 'reit') return crecDividendoImplicito(emp, par, aj, v.w);
    return crecimientoImplicito(emp, emp.trays, par, aj, v.w, v.res.base.roicT);
  }

  // mul: {metodos: [...]} (o los campos antiguos per/ev_ebitda); si faltan, solo el modelo intrínseco.
  function valorar(emp, tray, mul, par, aj) {
    if (emp.modelo === 'ri') return valorarRI(emp, mul, par, aj);
    if (emp.modelo === 'reit') return valorarREIT(emp, mul, par, aj);
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
    const meds = medianasMultiplos(mul);
    const hayMul = meds.length > 0;
    const mm = hayMul ? d3mean(meds) : null;
    const pw = hayMul ? par.pesoDcf : 1;
    const central = pw * pond + (1 - pw) * (mm || 0);
    const bajo = pw * res.pes.vps + (1 - pw) * (hayMul ? Math.min(...meds) : 0);
    const alto = pw * res.opt.vps + (1 - pw) * (hayMul ? Math.max(...meds) : 0);
    const valido = ESC.every((sc) => res[sc].valido);
    return { modelo: 'fcff', W, w, g, res, cons, pond, mm, central, bajo, alto, pot: central / emp.cotizacion - 1, valido, inv, ronicImpl, lag, pesoDcf: pw };
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

  raiz.MOTOR = { ESC, trayectorias, wacc, camino, dcf, valorar, sensibilidad, crecimientoImplicito, ronicImplicito, valorSinCrecimiento,
    riEsc, reitEsc, roeImplicito, crecDividendoImplicito, sensibilidadVps, implicito };
})(typeof window !== 'undefined' ? window : globalThis);
