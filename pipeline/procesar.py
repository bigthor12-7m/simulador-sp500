#!/usr/bin/env python3
"""Del dato bruto (lista GICS + Yahoo Finance) a los ficheros de la app del S&P 500.

Aplica a todas las empresas las mismas reglas automáticas, con los criterios del modelo de las 7 Magníficas:
  - cifras de los últimos doce meses (TTM) y del último balance trimestral (estados financieros normalizados de Yahoo);
  - años 1-2 con el consenso de analistas (ventas y BPA mínimo, medio y máximo), igual que el actualizador de las 7M;
  - años 3-10: convergencia lineal a un crecimiento del 3,5 % y a un margen que revierte en parte a la mediana de su
    subindustria; CapEx que converge a 1,25 veces la amortización;
  - WACC con la beta de Yahoo, prima de riesgo común y coste de la deuda por rating sintético (cobertura de intereses);
  - múltiplos adelantados (PER y EV/EBITDA) de los comparables de la misma subindustria GICS;
  - indicadores de Benjamin Graham para el filtro de oportunidades.

Uso:  python pipeline/procesar.py --brutos brutos --salida app/datos
"""
import argparse, datetime as dt, gzip, json, math, pathlib, re, statistics as stt

BASE = pathlib.Path(__file__).resolve().parent
CONF = json.load(open(BASE / "configuracion.json", encoding="utf-8"))
R = CONF["reglas"]
D = lambda s: dt.date.fromisoformat(str(s)[:10])


def raw(x):
    return x.get("raw") if isinstance(x, dict) else x


def clip(x, lo, hi):
    return None if x is None else max(lo, min(hi, x))


def med(xs):
    xs = [x for x in xs if x is not None and math.isfinite(x)]
    return stt.median(xs) if xs else None


# ======================================================================= series de Yahoo
class Serie:
    """Acceso a las series de estados financieros (importes en millones de dólares)."""

    def __init__(self, ts):
        self.ts = ts or {}

    def ultimo(self, k):
        s = self.ts.get(k)
        return (s[-1][1], s[-1][0]) if s else (None, None)

    def ttm(self, k):
        t, ft = self.ultimo("trailing" + k)
        q = self.ts.get("quarterly" + k) or []
        fq = q[-1][0] if q else None
        if t is not None and (fq is None or ft >= fq):
            return t / 1e6, ft
        if len(q) >= 4 and (D(q[-1][0]) - D(q[-4][0])).days < 300:
            return sum(x[1] for x in q[-4:]) / 1e6, q[-1][0]
        if t is not None:
            return t / 1e6, ft
        a, fa = self.ultimo("annual" + k)
        return (a / 1e6, fa) if a is not None else (None, None)

    def bal(self, k):
        q, fq = self.ultimo("quarterly" + k)
        if q is not None: return q / 1e6, fq
        a, fa = self.ultimo("annual" + k)
        return (a / 1e6, fa) if a is not None else (None, None)

    def v(self, k, modo="ttm", defecto=None):
        x = (self.ttm(k) if modo == "ttm" else self.bal(k))[0]
        return defecto if x is None else x

    def anual(self, k):
        return [(f, v) for f, v in self.ts.get("annual" + k) or []]


def nombre_corto(s):
    s = re.sub(r"\s*\(The\)$", "", s.strip())
    s = re.sub(r"\s*\(Class [A-Z]\)$", "", s)
    s = re.sub(r"^The\s+", "", s)
    for suf in [", Inc.", " Inc.", " Incorporated", " Corporation", " Corp.", " Corp", " plc", " PLC", " Ltd.", " Limited", " N.V.", " S.A.",
                " Co.", " Company", " & Co", ", L.P.", " Holdings", " Group"]:
        if s.endswith(suf) and len(s) > len(suf) + 2 and not s[: -len(suf)].rstrip().endswith("&"): s = s[: -len(suf)].rstrip(",")
    return s.strip()


# ======================================================================= consenso
class Consenso:
    def __init__(self, qs):
        self.tr = {x["period"]: x for x in (qs.get("earningsTrend") or {}).get("trend") or []}
        self.hist = [(h.get("quarter", {}).get("fmt"), raw(h.get("epsActual"))) for h in (qs.get("earningsHistory") or {}).get("history") or []]

    def est(self, per, campo, k="avg"):
        e = self.tr.get(per)
        if not e: return None
        v = raw((e["earningsEstimate" if campo == "eps" else "revenueEstimate"] or {}).get(k))
        if v is None: return None
        return v if campo == "eps" else v / 1e6

    def n(self, per, campo):
        e = self.tr.get(per)
        return (raw((e["earningsEstimate" if campo == "eps" else "revenueEstimate"] or {}).get("numberOfAnalysts")) or 0) if e else 0

    def fin(self, per):
        e = self.tr.get(per)
        return D(e["endDate"]) if e and e.get("endDate") else None

    def ntm(self, campo, V):
        """Estimación a doce meses desde la fecha de mercado (misma regla que las 7 Magníficas)."""
        if "0y" not in self.tr or "+1y" not in self.tr: return None
        f0, f1 = self.est("0y", campo), self.est("+1y", campo)
        if f0 is None or f1 is None: return None
        E0 = self.fin("0y")
        if E0 <= V:
            if f0 <= 0 or f1 <= 0: return f1
            return f1 * (f1 / f0) ** ((V - E0).days / 365)
        rem = (E0 - V).days
        q0e, q1e = self.fin("0q"), self.fin("+1q")
        v0q, v1q = self.est("0q", campo), self.est("+1q", campo)
        if q1e == E0 and v1q is not None and q0e and (q0e < V or v0q is not None):
            stub = v0q * (q0e - V).days / 92 + v1q if q0e >= V else v1q * (q1e - V).days / max(1, (q1e - q0e).days)
            return stub + f1 * (365 - rem) / 365
        if q0e == E0 and v0q is not None:
            return v0q * (q0e - V).days / 92 + f1 * (365 - rem) / 365
        return f0 * rem / 365 + f1 * (365 - rem) / 365


# ======================================================================= una empresa
def datos_empresa(c, y, V, avisos_globales):
    t = c["ticker"]
    qs, S = y.get("qs") or {}, Serie(y.get("ts"))
    pr, sd, ks, fd = qs.get("price") or {}, qs.get("summaryDetail") or {}, qs.get("defaultKeyStatistics") or {}, qs.get("financialData") or {}
    sec_es = CONF["sectores"].get(c["sector"], c["sector"])
    sub_es, ind_es = CONF["subindustrias"].get(c["subindustria"], [c["subindustria"], c["subindustria"]])
    e = {"ticker": t, "empresa": c["empresa"], "nombre": nombre_corto(c["empresa"]), "sector": sec_es, "industria": ind_es, "subindustria": sub_es,
         "sector_gics": c["sector"], "subindustria_gics": c["subindustria"], "sede": c.get("sede"), "alta_indice": c.get("alta_indice"),
         "valorada": False, "motivo": None, "avisos": []}
    px = raw(pr.get("regularMarketPrice"))
    e["cotizacion"] = px
    if not px:
        e["motivo"] = "Sin cotización en Yahoo Finance esta semana"; return e, None
    # modelo de valoración según la subindustria
    e["modelo"] = modelo_de(c["subindustria"])
    if c["ticker"] in CONF["clases_secundarias"]:
        e["motivo"] = f"Otra clase de acciones de la misma empresa: ver {CONF['clases_secundarias'][t]}"; e["principal"] = CONF["clases_secundarias"][t]

    # ------------------------------------------------ cuenta de resultados TTM y balance
    ventas, f_ttm = S.ttm("TotalRevenue")
    ebit = S.v("OperatingIncome")
    if ebit is None: ebit = S.v("EBIT")
    da = S.v("DepreciationAndAmortization")
    if da is None: da = S.v("DepreciationAmortizationDepletion")
    if da is None: da = S.v("ReconciledDepreciation")
    ebitda = S.v("EBITDA")
    if da is None and ebitda is not None and ebit is not None: da = max(0.0, ebitda - ebit)
    if ebitda is None and ebit is not None: ebitda = ebit + (da or 0)
    # base EBITA: se suma la amortización de intangibles adquiridos (no es un coste recurrente de explotación) y se quita
    # de la amortización que se suma al flujo de caja, para no contarla dos veces
    amort = next((x for x in (S.v("AmortizationOfIntangibles"), S.v("AmortizationCashFlow"), S.v("AmortizationOfIntangiblesIncomeStatement")) if x is not None), 0.0)
    amort = max(0.0, min(amort, da or 0.0))
    ebit_contable = ebit
    if ebit is not None: ebit = ebit + amort
    if da is not None: da = da - amort
    sbc = S.v("StockBasedCompensation", "ttm", 0.0) or 0.0
    capex = S.v("CapitalExpenditure")
    capex = -capex if capex is not None else None
    pre, prov = S.v("PretaxIncome"), S.v("TaxProvision")
    gi, ii = S.v("InterestExpense"), S.v("InterestIncome")
    tasa = prov / pre if pre and pre > 0 and prov is not None else (S.ultimo("trailingTaxRateForCalcs")[0])
    tax = clip(tasa, R["impuesto_min"], R["impuesto_max"]) if tasa is not None and pre and pre > 0 else R["impuesto_defecto"]
    caja = S.v("CashCashEquivalentsAndShortTermInvestments", "bal")
    if caja is None: caja = S.v("CashAndCashEquivalents", "bal", 0.0)
    deuda = S.v("TotalDebt", "bal", 0.0)
    invs = max([x for x in (S.v("InvestmentinFinancialAssets", "bal"), S.v("AvailableForSaleSecurities", "bal"), S.v("InvestmentsAndAdvances", "bal")) if x is not None] or [0.0])
    mino, pref = S.v("MinorityInterest", "bal", 0.0), S.v("PreferredStock", "bal", 0.0)
    patrimonio = S.v("StockholdersEquity", "bal")
    ca, cl = S.v("CurrentAssets", "bal"), S.v("CurrentLiabilities", "bal")
    cdeuda = S.v("CurrentDebtAndCapitalLeaseObligation", "bal")
    if cdeuda is None: cdeuda = S.v("CurrentDebt", "bal", 0.0)
    nof = (ca - caja) - (cl - cdeuda) if ca is not None and cl is not None else 0.0
    f_bal = S.bal("TotalAssets")[1] or f_ttm
    acc = S.ultimo("quarterlyDilutedAverageShares")[0]
    acc = acc / 1e6 if acc else None
    mcap = raw(pr.get("marketCap"))
    implied = raw(ks.get("impliedSharesOutstanding"))
    if mcap and px:
        imp = mcap / px / 1e6
        if not acc or not (0.8 <= acc / imp <= 1.25): acc = imp
    elif not acc and implied:
        acc = implied / 1e6
    moneda_fin = fd.get("financialCurrency")

    e.update({"moneda": pr.get("currency"), "acciones_m": acc, "cap": px * acc if acc else None,
              "ventas_ttm": ventas, "ebit_ttm": ebit, "ebitda_ttm": ebitda, "da_ttm": da, "capex_ttm": capex,
              "ebit_contable": ebit_contable, "amortizacion_intangibles": amort, "sbc_ttm": sbc,
              "fecha_ttm": f_ttm, "fecha_balance": f_bal})
    cal = (qs.get("calendarEvents") or {}).get("earnings") or {}
    fechas = cal.get("earningsDate") or []
    e["proximos_resultados"] = (fechas[0].get("fmt") if isinstance(fechas[0], dict) else None) if fechas else None
    e["analistas"] = {"objetivo": raw(fd.get("targetMeanPrice")), "bajo": raw(fd.get("targetLowPrice")), "alto": raw(fd.get("targetHighPrice")),
                      "n": raw(fd.get("numberOfAnalystOpinions")), "recomendacion": fd.get("recommendationKey"), "media": raw(fd.get("recommendationMean"))}
    bb = sd.get("beta")
    beta = float(bb["fmt"]) if isinstance(bb, dict) and bb.get("fmt") else raw(bb) or raw(ks.get("beta"))
    e["beta_yahoo"] = beta

    # ------------------------------------------------ indicadores de Graham (también para las no valoradas)
    bpa, vc = raw(ks.get("trailingEps")), raw(ks.get("bookValue"))
    ni = [v for f, v in S.anual("NetIncomeCommonStockholders")][-4:]
    dv = [v for f, v in S.anual("CashDividendsPaid")][-4:]
    ep = [v for f, v in S.anual("DilutedEPS")][-4:]
    gr = {"bpa": bpa, "vc": vc, "per": px / bpa if bpa and bpa > 0 else None, "pb": px / vc if vc and vc > 0 else None,
          "ng": math.sqrt(22.5 * bpa * vc) if bpa and vc and bpa > 0 and vc > 0 else None, "rc": raw(fd.get("currentRatio")),
          "dn_ebitda": (deuda - caja) / ebitda if ebitda and ebitda > 0 else None,
          "div": raw(sd.get("dividendYield")) or raw(sd.get("trailingAnnualDividendYield")) or 0.0,
          "ben_pos": sum(1 for v in ni if v and v > 0), "ben_n": len(ni),
          "div_anios": sum(1 for v in dv if v and v < 0), "div_n": max(len(ni), len(dv)),
          "cbpa": (ep[-1] / ep[0] - 1) if len(ep) >= 3 and ep[0] and ep[0] > 0 and ep[-1] is not None else None,
          "cbpa_anios": len(ep) - 1 if len(ep) >= 3 else None}
    gr["per_pb"] = gr["per"] * gr["pb"] if gr["per"] and gr["pb"] else None
    gr["deuda_patrimonio"] = deuda / patrimonio if patrimonio and patrimonio > 0 else None
    e["graham"] = gr
    e["piotroski"] = piotroski(S)

    if e["motivo"]:
        return e, None
    if (moneda_fin and moneda_fin != "USD") or (pr.get("currency") and pr.get("currency") != "USD"):
        e["avisos"].append("divisa")
    if e["modelo"] in ("ri", "reit"):
        e.update({"deuda_bruta": max(0.0, deuda), "deuda_financiera_neta": deuda - caja, "prima_pais": 0.0})
        return (datos_ri if e["modelo"] == "ri" else datos_reit)(e, S, qs, V)
    falta = [n for n, x in (("ventas", ventas), ("beneficio operativo", ebit), ("acciones", acc)) if x is None]
    if falta or not ventas or ventas <= 0:
        e["motivo"] = "Datos financieros insuficientes en Yahoo Finance (" + ", ".join(falta or ["ventas"]) + ")"; return e, None

    # ------------------------------------------------ insumos del DCF (mismos nombres que el modelo de las 7M)
    if da is None: da = 0.0
    if capex is None: capex = 0.0
    ic = (patrimonio or 0) + deuda - caja - invs + mino
    if patrimonio is None or ic <= 0.05 * ventas:
        ic_op = nof + S.v("NetPPE", "bal", 0.0) + S.v("GoodwillAndOtherIntangibleAssets", "bal", 0.0)
        ic = max(ic_op, 0.1 * ventas)
    e.update({
        "ventas_ttm": ventas, "ebit_ttm": ebit, "da_ttm": da, "capex_ttm": capex,
        "nof_ventas_ttm": clip(nof / ventas, R["nof_min"], R["nof_max"]),
        "capital_invertido": ic, "tipo_impositivo": round(tax, 4),
        "deuda_financiera_neta": deuda - caja, "deuda_bruta": max(0.0, deuda), "minoritarios": mino, "preferentes": pref,
        "inversiones_no_operativas": invs, "prima_pais": 0.0,
        "anios_hasta_valoracion": max(0.0, (V - D(f_bal)).days / 365.25),
        "inversion_neta_ttm": capex - da,
    })
    if ebit <= 0: e["avisos"].append("ebit_negativo")
    if (V - D(f_bal)).days > 200: e["avisos"].append("balance_antiguo")

    # rating sintético -> diferencial de la deuda
    rs = CONF["rating_sintetico"]
    if gi and gi > 0:
        cob = ebit / gi
        rating, dif = next((n, s) for lim, n, s in rs["tramos"] if cob > lim)
    else:
        cob = None
        x = (deuda / ebitda) if ebitda and ebitda > 0 else 99
        rating = next(n for lim, n in rs["por_deuda_ebitda"] if x <= lim) if x < 99 else "B"
        dif = next(s for lim, n, s in rs["tramos"] if n == rating)
    e.update({"rating": rating, "diferencial": dif, "cobertura": cob, "ppe": S.v("NetPPE", "bal", 0.0), "nof": nof})
    gr["cobertura"] = cob

    # ------------------------------------------------ consenso: anclas de los años 1-2
    C = Consenso(qs)
    perimetro = cambio_perimetro(C, S)
    anc = None if perimetro else anclas(e, C, S, tax, pre, gi, ii, sbc)
    if perimetro:
        anc = anclas_sin_consenso(e, S)
        e["avisos"].append("cambio_perimetro"); e["perimetro"] = perimetro
    elif anc is None:
        anc = anclas_sin_consenso(e, S)
        e["avisos"].append("sin_consenso")
    elif C.n("+1y", "rev") < R["analistas_min"]:
        e["avisos"].append("pocos_analistas")
    e["_anc"] = anc
    e["consenso"] = {"n": C.n("+1y", "rev"), "fin_ejercicio": str(C.fin("0y")) if C.fin("0y") else None}
    return e, C


def cambio_perimetro(C, S):
    """Detecta un cambio de perímetro (fusión o adquisición) que el consenso ya incluye y los estados financieros todavía no:
    salto brusco entre el crecimiento del último trimestre publicado y el previsto para el siguiente, o una base del
    consenso (ingresos del mismo trimestre del año anterior) distinta de la publicada. Devuelve un texto o None."""
    q = S.ts.get("quarterlyTotalRevenue") or []
    e0 = C.tr.get("0q")
    if not e0 or len(q) < 5 or not e0.get("endDate"): return None
    re_ = e0.get("revenueEstimate") or {}
    est, ya = raw(re_.get("avg")), raw(re_.get("yearAgoRevenue"))
    if not est or not ya or ya <= 0: return None
    g_cons = est / ya - 1
    g_last = q[-1][1] / q[-5][1] - 1 if q[-5][1] > 0 else None
    if g_last is not None and g_last > -0.9:
        salto = (1 + g_cons) / (1 + g_last)
        if salto > 1.5 or salto < 0.6:
            return f"el consenso prevé un crecimiento del {g_cons:.0%} para el próximo trimestre frente al {g_last:.0%} del último publicado"
    objetivo = D(e0["endDate"]) - dt.timedelta(days=365)
    mismo = [v for f, v in q if abs((D(f) - objetivo).days) <= 20]
    if mismo and mismo[0] > 0 and abs(ya / mismo[0] - 1) > 0.2:
        return "el consenso parte de unos ingresos del año anterior distintos de los publicados (cifras pro forma)"
    return None


def piotroski(S):
    """Puntuación F de Piotroski con los dos últimos ejercicios anuales de Yahoo. Cada señal: True, False o None (sin datos)."""
    def serie(k):
        return {f: v for f, v in S.anual(k) if v is not None}
    ni, ta, cfo, ca, cl = serie("NetIncomeCommonStockholders"), serie("TotalAssets"), serie("OperatingCashFlow"), serie("CurrentAssets"), serie("CurrentLiabilities")
    gp, rev, ltd, sh = serie("GrossProfit"), serie("TotalRevenue"), serie("LongTermDebt"), serie("DilutedAverageShares")
    fechas = sorted(set(ni) & set(ta))
    if len(fechas) < 2: return None
    t1, t0 = fechas[-1], fechas[-2]
    div = lambda a, b: a / b if a is not None and b else None
    roa1, roa0 = div(ni[t1], ta[t1]), div(ni[t0], ta[t0])
    cmp = lambda a, b, op: None if a is None or b is None else op(a, b)
    lev = lambda t: div(ltd.get(t, 0.0), ta.get(t))
    d = {
        "roa": cmp(roa1, 0, lambda a, b: a > b),
        "cfo": cmp(cfo.get(t1), 0, lambda a, b: a > b),
        "droa": cmp(roa1, roa0, lambda a, b: a > b),
        "devengo": cmp(cfo.get(t1), ni.get(t1), lambda a, b: a > b),
        "deuda": cmp(lev(t1), lev(t0), lambda a, b: a <= b),
        "liquidez": cmp(div(ca.get(t1), cl.get(t1)), div(ca.get(t0), cl.get(t0)), lambda a, b: a > b),
        "acciones": cmp(sh.get(t1), sh.get(t0), lambda a, b: a <= b * 1.005),
        "margen": cmp(div(gp.get(t1), rev.get(t1)), div(gp.get(t0), rev.get(t0)), lambda a, b: a > b),
        "rotacion": cmp(div(rev.get(t1), ta.get(t1)), div(rev.get(t0), ta.get(t0)), lambda a, b: a > b),
    }
    return {"f": sum(1 for v in d.values() if v), "n": sum(1 for v in d.values() if v is not None), "d": d, "ejercicio": t1}


def modelo_de(sub):
    m = CONF["modelos"]
    if sub in m["beneficio_residual"]: return "ri"
    if sub.endswith(m["sufijo_reit"]): return "reit"
    return "fcff"


def bpa_anclas(C, f_ttm):
    """BPA de los años 1 y 2 (doce meses desde el último trimestre publicado) en los tres escenarios. None si no hay consenso."""
    if C.est("+1y", "eps") is None or C.n("+1y", "eps") < 2: return None
    if C.est("0y", "eps") is None:
        if C.est("0y", "rev") and C.est("+1y", "rev"):
            e1 = C.tr["+1y"]["earningsEstimate"]; f = C.est("0y", "rev") / C.est("+1y", "rev")
            e0 = C.tr["0y"].setdefault("earningsEstimate", {})
            for k in ("avg", "low", "high"):
                if raw(e1.get(k)) is not None: e0[k] = {"raw": raw(e1[k]) * f}
        else: return None
    E0 = C.fin("0y")
    qrem = max(0, min(4, round((E0 - f_ttm).days / 91.31)))
    ytd = [v for f, v in C.hist if f and v is not None and D(f) > E0 - dt.timedelta(days=350) and D(f) <= f_ttm + dt.timedelta(days=20)]
    ytd = sum(ytd) if len(ytd) == 4 - qrem and qrem < 4 else (0.0 if qrem == 4 else None)
    out = {}
    for k in ("avg", "low", "high"):
        ev = lambda p: C.est(p, "eps", k) if C.est(p, "eps", k) is not None else C.est(p, "eps")
        e0y, e1y = ev("0y"), ev("+1y")
        if qrem == 4: e1 = e0y
        elif qrem == 0: e1 = e1y
        elif qrem == 2 and C.fin("+1q") == E0 and ev("0q") is not None and ev("+1q") is not None: e1 = ev("0q") + ev("+1q") + e1y / 2
        elif qrem == 1 and C.fin("0q") == E0 and ev("0q") is not None: e1 = ev("0q") + e1y * 3 / 4
        else: e1 = (e0y - ytd if ytd is not None else e0y * qrem / 4) + e1y * (4 - qrem) / 4
        g = clip(e1y / e0y - 1, R["ri_crec_bpa_min"], R["ri_crec_bpa_max"]) if e0y and e0y > 0 else 0.05
        out[k] = (e1, e1y if qrem == 4 else e1 * (1 + g))
    b1, b2 = out["avg"]
    banda = R["ri_banda_escenarios"]
    lo = (min(max(out["low"][0], b1 * (1 - banda)), b1), min(max(out["low"][1], b2 * (1 - banda)), b2))
    hi = (max(min(out["high"][0], b1 * (1 + banda)), b1), max(min(out["high"][1], b2 * (1 + banda)), b2))
    return {"bpa1": [lo[0], b1, hi[0]], "bpa2": [lo[1], b2, hi[1]], "qrem": qrem}


def crec_anclas(C, S, ventas, f_ttm):
    """Crecimiento de las ventas de los años 1 y 2 en los tres escenarios (misma regla que el DCF). None si no hay consenso."""
    if not ventas or any(C.est(p, "rev") is None for p in ("0y", "+1y")) or C.n("+1y", "rev") < 2: return None
    E0, E1 = C.fin("0y"), C.fin("+1y")
    qrem = max(0, min(4, round((E0 - f_ttm).days / 91.31)))
    q = S.ts.get("quarterlyTotalRevenue") or []
    ytd_q = [v / 1e6 for f, v in q if D(f) > E0 - dt.timedelta(days=350) and D(f) <= f_ttm + dt.timedelta(days=5)]
    ytd = sum(ytd_q) if len(ytd_q) == 4 - qrem and qrem < 4 else (0.0 if qrem == 4 else None)
    out = {}
    v0 = C.est("0y", "rev")
    for k in ("avg", "low", "high"):
        rv = lambda p: C.est(p, "rev", k) or C.est(p, "rev")
        v0y, v1y = rv("0y"), rv("+1y")
        s_ = (ytd / v0) if ytd and qrem in (1, 2, 3) else (4 - qrem) / 4
        y1 = v0y if qrem == 4 else v1y if qrem == 0 else (v0y - (ytd if ytd is not None else v0y * (4 - qrem) / 4)) + v1y * s_
        out[k] = [y1 / ventas - 1, v1y / v0 - 1]
    return out


def datos_ri(e, S, qs, V):
    """Modelo de beneficio residual (bancos, aseguradoras, gestoras, financieras y eléctricas reguladas), por acción."""
    C = Consenso(qs)
    cse, f_bal = S.bal("CommonStockEquity")
    if cse is None: cse, f_bal = S.bal("StockholdersEquity")
    acc = e.get("acciones_m")
    if not cse or cse <= 0 or not acc:
        e["motivo"] = "Valor contable negativo o sin datos: no se puede aplicar el modelo de beneficio residual"; return e, None
    bv0 = cse / acc
    ni, f_ttm = S.ttm("NetIncomeCommonStockholders")
    f_ttm = D(f_ttm or f_bal)
    dv = abs(S.v("CashDividendsPaid", "ttm", 0.0) or 0.0); rp = abs(S.v("RepurchaseOfCapitalStock", "ttm", 0.0) or 0.0)
    payout0 = clip((dv + rp) / ni, R["ri_payout_min"], R["ri_payout_max"]) if ni and ni > 0 else 0.6
    hist = [v for f, v in C.hist if v is not None]
    bpa_ttm = sum(hist) if len(hist) == 4 else (ni / acc if ni is not None else None)
    anc = bpa_anclas(C, f_ttm)
    if anc is not None:
        b1 = anc["bpa1"][1]
        if not (b1 > 0 and -0.2 < b1 / bv0 < 1.2): anc = None
    if anc is None:
        base = bpa_ttm if bpa_ttm is not None else 0.0
        anc = {"bpa1": [base * 0.9, base, base * 1.1], "bpa2": [base * 0.9, base, base * 1.1], "qrem": None}
        e["avisos"].append("sin_consenso")
    elif C.n("+1y", "eps") < R["analistas_min"]:
        e["avisos"].append("pocos_analistas")
    if anc["bpa1"][1] <= 0: e["avisos"].append("beneficio_negativo")
    elif anc["bpa1"][1] / bv0 > R["ri_roe_max_fiable"]: e["avisos"].append("valor_contable_bajo")
    e.update({"fecha_balance": str(f_bal), "fecha_ttm": str(f_ttm), "anios_hasta_valoracion": max(0.0, (V - D(f_bal)).days / 365.25),
              "patrimonio_comun": cse, "beneficio_ttm": ni, "dividendos_ttm": dv, "recompras_ttm": rp})
    if (V - D(f_bal)).days > 200: e["avisos"].append("balance_antiguo")
    e["ri"] = {"bv0": bv0, "bpa1": anc["bpa1"], "bpa2": anc["bpa2"], "payout0": payout0, "bpa_ttm": bpa_ttm,
               "roe_ttm": ni / cse if ni is not None else None, "tbv": (S.v("TangibleBookValue", "bal") or 0) / acc}
    e["consenso"] = {"n": C.n("+1y", "eps"), "fin_ejercicio": str(C.fin("0y")) if C.fin("0y") else None}
    e["_ri"] = True
    return e, C


def datos_reit(e, S, qs, V):
    """Modelo de REIT: descuento de dividendos con crecimiento del consenso de ingresos; FFO = beneficio + amortización − plusvalías."""
    C = Consenso(qs)
    sd = qs.get("summaryDetail") or {}
    acc = e.get("acciones_m")
    ni, f_ttm = S.ttm("NetIncomeCommonStockholders")
    da = next((x for x in (S.v("DepreciationAndAmortization"), S.v("DepreciationAmortizationDepletion"), S.v("ReconciledDepreciation")) if x is not None), None)
    # partidas no recurrentes: plusvalías por venta de inmuebles, deterioros, etc. (se quitan del FFO)
    inusual = S.v("TotalUnusualItems")
    if inusual is None: inusual = -(S.v("GainLossOnSaleOfPPE", "ttm", 0.0) or 0.0)
    if ni is None or da is None or not acc:
        e["motivo"] = "Datos insuficientes para calcular el FFO"; return e, None
    ffo = ni + da - inusual
    gan = -inusual
    ffo_ps = ffo / acc
    dps0 = raw(sd.get("dividendRate")) or raw(sd.get("trailingAnnualDividendRate"))
    if not dps0 or dps0 <= 0:
        dps0 = max(0.0, 0.7 * ffo_ps); e["avisos"].append("sin_dividendo")
    ventas, fv = S.ttm("TotalRevenue")
    f_ttm = D(f_ttm or fv or e["fecha_balance"])
    perimetro = cambio_perimetro(C, S)
    anc = None if perimetro else crec_anclas(C, S, ventas, f_ttm)
    if perimetro: e["avisos"].append("cambio_perimetro"); e["perimetro"] = perimetro
    lo_, hi_ = R["reit_crec_min"], R["reit_crec_max"]
    if anc is None or not (-0.3 < anc["avg"][0] < 0.5):
        tr = S.ts.get("trailingTotalRevenue") or []
        g = tr[-1][1] / tr[-2][1] - 1 if len(tr) >= 2 and tr[-2][1] else 0.03
        g = clip(g, lo_, hi_)
        anc = {"avg": [g, g], "low": [g - 0.03, g - 0.03], "high": [g + 0.03, g + 0.03]}
        if not perimetro: e["avisos"].append("sin_consenso")
    banda = R["reit_banda_escenarios"]
    b = [clip(x, lo_, hi_) for x in anc["avg"]]
    l = [clip(min(max(anc["low"][i], b[i] - banda), b[i]), lo_, hi_) for i in range(2)]
    h = [clip(max(min(anc["high"][i], b[i] + banda), b[i]), lo_, hi_) for i in range(2)]
    if ffo <= 0: e["avisos"].append("ffo_negativo")
    elif dps0 > 1.05 * ffo_ps: e["avisos"].append("dividendo_no_cubierto")
    f_bal = e["fecha_balance"]
    e.update({"fecha_ttm": str(f_ttm), "anios_hasta_valoracion": max(0.0, (V - D(f_bal)).days / 365.25), "beneficio_ttm": ni})
    if (V - D(f_bal)).days > 200: e["avisos"].append("balance_antiguo")
    affo_ps = R["reit_affo_sobre_ffo"] * ffo_ps
    e["reit"] = {"dps0": dps0, "ffo_ps": ffo_ps, "affo0": affo_ps, "ffo": ffo, "g1": [l[0], b[0], h[0]], "g2": [l[1], b[1], h[1]],
                 "cobertura": ffo_ps / dps0 if dps0 else None, "ebitda": e.get("ebitda_ttm"), "plusvalias": gan}
    e["consenso"] = {"n": C.n("+1y", "rev"), "fin_ejercicio": str(C.fin("0y")) if C.fin("0y") else None}
    e["_reit"] = True
    return e, C


def anclas(e, C, S, tax, pre, gi, ii, sbc=0.0):
    """Años 1-2 (crecimiento y margen EBIT) en los tres escenarios desde el consenso. None si no es utilizable."""
    if any(C.est(p, "rev") is None for p in ("0y", "+1y")) or C.est("+1y", "eps") is None: return None
    if C.est("0y", "eps") is None:  # algunos BPA del ejercicio en curso faltan en Yahoo: se deduce del siguiente
        e1 = C.tr["+1y"]["earningsEstimate"]; f = C.est("0y", "rev") / C.est("+1y", "rev")
        e0 = C.tr["0y"].setdefault("earningsEstimate", {})
        for k in ("avg", "low", "high"):
            if raw(e1.get(k)) is not None: e0[k] = {"raw": raw(e1[k]) * f}
    if C.n("+1y", "rev") < 2: return None
    ventas, ebit, acc = e["ventas_ttm"], e["ebit_ttm"], e["acciones_m"]
    f_ttm = D(e["fecha_ttm"])
    E0, E1 = C.fin("0y"), C.fin("+1y")
    qrem = max(0, min(4, round((E0 - f_ttm).days / 91.31)))
    # ventas y BPA ya publicados del ejercicio en curso
    q = S.ts.get("quarterlyTotalRevenue") or []
    ytd_q = [v / 1e6 for f, v in q if D(f) > E0 - dt.timedelta(days=350) and D(f) <= f_ttm + dt.timedelta(days=5)]
    ytd_rev = sum(ytd_q) if len(ytd_q) == 4 - qrem and qrem < 4 else (0.0 if qrem == 4 else None)
    ytd_e = [v for f, v in C.hist if f and v is not None and D(f) > E0 - dt.timedelta(days=350) and D(f) <= f_ttm + dt.timedelta(days=20)]
    ytd_eps = sum(ytd_e) if len(ytd_e) == 4 - qrem and qrem < 4 else (0.0 if qrem == 4 else None)
    eps_act = [v for f, v in C.hist if v is not None]
    hist_ok = len(eps_act) == 4 and C.hist and C.hist[-1][0] and abs((D(C.hist[-1][0]) - f_ttm).days) <= 20
    eps_ttm = sum(eps_act) if hist_ok else None
    gross = lambda eps: eps * acc / (1 - tax)
    # ajuste entre el BPA del consenso (a menudo "ajustado") y el EBIT contable: se calibra con los últimos doce meses
    pre_op = (pre + amort_de(e)) if pre is not None else None
    if eps_ttm is not None and eps_ttm > 0 and ebit > 0 and (pre_op is None or pre_op <= 1.2 * ebit) and abs(gross(eps_ttm) - ebit) <= 0.6 * ebit:
        # el BPA publicado y el EBITA contable son comparables: la diferencia (intereses, partidas ajustadas) se mantiene
        ajuste, modo = gross(eps_ttm) - ebit, "calibrado"
    elif eps_ttm is not None and eps_ttm > 0 and ebit > 0 and (pre_op is None or pre_op <= 1.2 * ebit):
        # BPA "ajustado" muy por encima del contable (cargos no recurrentes, etc.): base ajustada menos la remuneración en acciones
        ajuste, modo = -((gi or 0) - (ii or 0)) + sbc, "ajustado"
    else:
        # sin histórico comparable o con plusvalías extraordinarias en los últimos doce meses: BPA bruto + intereses netos
        ajuste, modo = -((gi or 0) - (ii or 0)), "bruto"
    ebit_de = lambda eps, v: gross(eps) - ajuste * v / ventas

    def anio1(k):
        rv = lambda p: C.est(p, "rev", k) if C.est(p, "rev", k) is not None else (C.est(p, "rev") * C.est("0y", "rev", k) / C.est("0y", "rev") if C.est(p, "rev") is not None and C.est("0y", "rev", k) else None)
        ev = lambda p: C.est(p, "eps", k) if C.est(p, "eps", k) is not None else C.est(p, "eps")
        v0y, v1y, e0y, e1y = rv("0y"), rv("+1y"), ev("0y"), ev("+1y")
        if None in (v0y, v1y, e0y, e1y): return None
        s = (ytd_rev / C.est("0y", "rev")) if ytd_rev and qrem in (1, 2, 3) else (4 - qrem) / 4
        if qrem == 4:
            return v0y, ebit_de(e0y, v0y)
        if qrem == 0:
            return v1y, ebit_de(e1y, v1y)
        if qrem == 3 or C.fin("+1q") is None:
            vr = v0y - ytd_rev if ytd_rev is not None else v0y * qrem / 4
            er = e0y - ytd_eps if ytd_eps is not None else e0y * qrem / 4
            return vr + v1y * s, ebit_de(er, vr) + ebit_de(e1y, v1y) * s
        if qrem == 2:
            vq0, vq1, eq0, eq1 = rv("0q"), rv("+1q"), ev("0q"), ev("+1q")
            if None in (vq0, vq1, eq0, eq1) or C.fin("+1q") != E0:
                vr = v0y - (ytd_rev or v0y / 2); er = e0y - (ytd_eps if ytd_eps is not None else e0y / 2)
                return vr + v1y * s, ebit_de(er, vr) + ebit_de(e1y, v1y) * s
            return vq0 + vq1 + v1y * s, ebit_de(eq0, vq0) + ebit_de(eq1, vq1) + ebit_de(e1y, v1y) * s
        vq0, eq0 = rv("0q"), ev("0q")  # qrem == 1
        if vq0 is None or eq0 is None or C.fin("0q") != E0:
            vq0 = v0y - (ytd_rev or v0y * 3 / 4); eq0 = e0y - (ytd_eps if ytd_eps is not None else e0y * 3 / 4)
        return vq0 + v1y * s, ebit_de(eq0, vq0) + ebit_de(e1y, v1y) * s

    out = {}
    for k in ("avg", "low", "high"):
        a1 = anio1(k)
        if a1 is None: return None
        va, ea = a1
        v1y = C.est("+1y", "rev", k) or C.est("+1y", "rev")
        e1y = C.est("+1y", "eps", k) if C.est("+1y", "eps", k) is not None else C.est("+1y", "eps")
        out[k] = {"g1": va / ventas - 1, "m1": ea / va, "m2": ebit_de(e1y, v1y) / v1y}
    v0 = C.est("0y", "rev")
    ya = raw((C.tr["0y"].get("revenueEstimate") or {}).get("yearAgoRevenue"))
    g_fy0 = v0 / (ya / 1e6) - 1 if ya else None
    g_fy1 = C.est("+1y", "rev") / v0 - 1
    offset = max(0.0, ((f_ttm + dt.timedelta(days=548)) - (E1 - dt.timedelta(days=182))).days / 365.25) if E1 else 0.0
    decel = min(0.0, g_fy1 - g_fy0) if g_fy0 is not None else 0.0
    if qrem == 0: offset = 1.0
    ajuste_g2 = max(min(1.0, offset) * decel, -0.10)  # la desaceleración del año 2 se limita a 10 puntos
    out["avg"]["g2"] = g_fy1 + ajuste_g2
    out["low"]["g2"] = (C.est("+1y", "rev", "low") or C.est("+1y", "rev")) / v0 - 1 + ajuste_g2
    out["high"]["g2"] = (C.est("+1y", "rev", "high") or C.est("+1y", "rev")) / v0 - 1 + ajuste_g2
    # control de coherencia del caso medio; los extremos del consenso (un solo analista) se acotan alrededor de él
    o, m_ttm = out["avg"], ebit / ventas
    if not (-0.5 < o["g1"] < 3 and -0.6 < o["g2"] < 3 and -0.6 < o["m1"] < 0.9 and -0.6 < o["m2"] < 0.9): return None
    tol = 0.40 if modo == "ajustado" else 0.25
    if ebit > 0 and (abs(o["m1"] - m_ttm) > tol or abs(o["m2"] - m_ttm) > tol + 0.05): return None
    for k, sg in (("low", -1), ("high", 1)):
        for x, lim in (("g1", 0.25), ("g2", 0.25), ("m1", 0.10), ("m2", 0.10)):
            d = (out[k][x] - o[x]) * sg
            out[k][x] = o[x] + sg * min(max(d, 0.0), lim)
    out["_modo"] = modo; out["_qrem"] = qrem
    return out


def amort_de(e):
    return e.get("amortizacion_intangibles") or 0.0


def anclas_sin_consenso(e, S):
    t = S.ts.get("trailingTotalRevenue") or []
    g = None
    if len(t) >= 2 and 300 < (D(t[-1][0]) - D(t[-2][0])).days < 430: g = t[-1][1] / t[-2][1] - 1
    if g is None:
        a = S.ts.get("annualTotalRevenue") or []
        if len(a) >= 2 and a[-2][1] > 0: g = a[-1][1] / a[-2][1] - 1
    g = clip(g if g is not None else 0.03, R["sin_consenso_crec_min"], R["sin_consenso_crec_max"])
    m = e["ebit_ttm"] / e["ventas_ttm"]
    dg, dm = R["sin_consenso_dif_crec"], abs(m) * R["sin_consenso_dif_margen_rel"]
    return {"avg": {"g1": g, "g2": g, "m1": m, "m2": m}, "low": {"g1": g - dg, "g2": g - dg, "m1": m - dm, "m2": m - dm},
            "high": {"g1": g + dg, "g2": g + dg, "m1": m + dm, "m2": m + dm}, "_modo": "historico", "_qrem": None}


def trayectoria(e, med_margen):
    """Anclas compactas de los tres escenarios [pesimista, base, optimista] para MOTOR.trayectorias()."""
    a = e["_anc"]
    m2b = a["avg"]["m2"]
    m10 = m2b + R["peso_reversion_margen"] * (med_margen - m2b) if med_margen is not None else m2b
    if m2b > 0:  # la reversión no lleva el margen más de un 30 % por encima o por debajo del del año 2
        m10 = min(max(m10, m2b * (1 - R["margen10_banda_rel"])), m2b * (1 + R["margen10_banda_rel"]))
    m10p = m10 - max(abs(m10) * -R["margen10_pesimista_rel"], R["margen10_dif_min"])
    m10o = m10 + max(abs(m10) * R["margen10_optimista_rel"], R["margen10_dif_min"])
    da = clip(e["da_ttm"] / e["ventas_ttm"], 0.0, 0.4)
    cx0 = clip(e["capex_ttm"] / e["ventas_ttm"], 0.0, 0.6)
    cx10 = min(cx0, R["capex10_sobre_amortizacion"] * da) if cx0 > R["capex10_sobre_amortizacion"] * da else cx0
    lo, b, hi = a["low"], a["avg"], a["high"]
    r4 = lambda x: round(x, 5)
    return {
        "g1": [r4(lo["g1"]), r4(b["g1"]), r4(hi["g1"])], "g2": [r4(lo["g2"]), r4(b["g2"]), r4(hi["g2"])],
        "m1": [r4(min(lo["m1"], b["m1"])), r4(b["m1"]), r4(max(hi["m1"], b["m1"]))],
        "m2": [r4(min(lo["m2"], b["m2"])), r4(b["m2"]), r4(max(hi["m2"], b["m2"]))],
        "m10": [r4(m10p), r4(m10), r4(m10o)], "g10": R["crecimiento_anio10"],
        "da": r4(da), "cx0": r4(cx0), "cx10": r4(cx10), "nof": r4(e["nof_ventas_ttm"]),
        "modo": a.get("_modo"),
    }


# ======================================================================= múltiplos adelantados
def adelantados(e, C, y, V):
    """PER y EV/EBITDA a doce meses de una empresa (para usarla como comparable) y sus datos NTM."""
    if C is None or not e.get("ventas_ttm"): return None
    px = e["cotizacion"]
    eps, rev = C.ntm("eps", V), C.ntm("rev", V)
    ratio = rev / e["ventas_ttm"] if rev and e["ventas_ttm"] else None
    n1 = C.n("+1y", "eps")
    ts = (y.get("ts") or {})
    evs = ts.get("trailingEnterprisesValueEBITDARatio")
    evt = evs[-1][1] if evs else None
    per_f = px / eps if eps and eps > 0 else None
    if per_f and per_f > R["per_max"]: per_f = None
    eve_f = evt / ratio if evt and evt > 0 and ratio else None
    if ratio and not (0.7 <= ratio <= 2.5): eve_f = None
    if (n1 or 0) < R["analistas_min"]: per_f = eve_f = None
    if eve_f is not None and eve_f > R["ev_ebitda_max"]: eve_f = None
    ev, mc = ts.get("trailingEnterpriseValue"), ts.get("trailingMarketCap")
    nd = (ev[-1][1] - mc[-1][1]) / 1e6 if ev and mc else e.get("deuda_financiera_neta", 0) + e.get("minoritarios", 0) - e.get("inversiones_no_operativas", 0)
    return {"eps_ntm": eps, "ratio": ratio, "per_fwd": per_f, "ev_ebitda_fwd": eve_f, "evt": evt, "nd": nd, "n": n1}


def multiplos(e, F, por_sub, por_ind, por_sec):
    t = e["ticker"]; own = F.get(t)
    if not own: return None, []
    validos = lambda grupo: [x for x in grupo if x["ticker"] != t and F.get(x["ticker"]) and (F[x["ticker"]]["per_fwd"] or F[x["ticker"]]["ev_ebitda_fwd"])]
    nivel, peers = "subindustria", validos(por_sub[e["subindustria_gics"]])
    if len(peers) < R.get("comparables_min_subindustria", 5):  # con pocas, la mediana es muy sensible: se amplía a la industria
        nivel, peers = "industria", validos(por_ind[e["industria"]])
    if len(peers) < R["comparables_min"]:
        nivel, peers = "sector", validos(por_sec[e["sector"]])
    if len(peers) > R["comparables_max"]:
        lc = math.log(max(e["cap"], 1))
        peers = sorted(peers, key=lambda x: abs(math.log(max(x["cap"] or 1, 1)) - lc))[: R["comparables_max"]]
    eps, ratio = own["eps_ntm"], own["ratio"]
    ebitda_ntm = e["ebitda_ttm"] * ratio if e.get("ebitda_ttm") and ratio else None
    fila = {"bpa_ntm": eps, "comparables": [p["ticker"] for p in peers], "nivel": nivel}
    for key, nom in (("per_fwd", "per"), ("ev_ebitda_fwd", "ev_ebitda")):
        xs = sorted(F[p["ticker"]][key] for p in peers if F[p["ticker"]][key] is not None)
        if len(xs) < 2:
            fila.update({f"{nom}_mediana": None, f"{nom}_valor_min": None, f"{nom}_valor_mediana": None, f"{nom}_valor_max": None}); continue
        md = stt.median(xs)
        if nom == "per":
            f = (lambda x: x * eps) if eps and eps > 0 else None
        else:
            f = (lambda x: (x * ebitda_ntm - own["nd"]) / e["acciones_m"]) if ebitda_ntm and ebitda_ntm > 0 else None
        val = lambda x: (f(x) if f and f(x) > 0 else None)
        fila.update({f"{nom}_mediana": md, f"{nom}_valor_min": val(xs[0]), f"{nom}_valor_mediana": val(md), f"{nom}_valor_max": val(xs[-1])})
    return fila, peers


def _rango(md):
    return {"min": None, "med": md, "max": None} if md is not None else None


def multiplos_gen(e, F, grupos, defs):
    """Múltiplos de comparables con el mismo modelo: subindustria (5 o más), industria (3 o más) o sector."""
    t = e["ticker"]
    validos = lambda g: [x for x in g if x["ticker"] != t and F.get(x["ticker"]) and any(F[x["ticker"]].get(d[2]) for d in defs)]
    nivel, peers = "subindustria", validos(grupos[0])
    if len(peers) < R.get("comparables_min_subindustria", 5): nivel, peers = "industria", validos(grupos[1])
    if len(peers) < R["comparables_min"]: nivel, peers = "sector", validos(grupos[2])
    if len(peers) > R["comparables_max"]:
        lc = math.log(max(e.get("cap") or 1, 1))
        peers = sorted(peers, key=lambda x: abs(math.log(max(x.get("cap") or 1, 1)) - lc))[: R["comparables_max"]]
    metodos = []
    for id_, nombre, key, fv in defs:
        xs = sorted(F[p["ticker"]][key] for p in peers if F[p["ticker"]].get(key) is not None)
        if len(xs) < 2 or fv is None:
            metodos.append({"id": id_, "n": nombre, "mult": None, "valor": None}); continue
        md = stt.median(xs)
        val = lambda x: (fv(x) if fv(x) > 0 else None)
        metodos.append({"id": id_, "n": nombre, "mult": {"min": xs[0], "med": md, "max": xs[-1]}, "valor": {"min": val(xs[0]), "med": val(md), "max": val(xs[-1])}})
    return {"comparables": [p["ticker"] for p in peers], "nivel": nivel, "metodos": metodos}


# ======================================================================= principal
def redondear(o, d=6):
    if isinstance(o, float): return round(o, d) if math.isfinite(o) else None
    if isinstance(o, dict): return {k: redondear(v, d) for k, v in o.items()}
    if isinstance(o, list): return [redondear(v, d) for v in o]
    return o


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brutos", default="brutos")
    ap.add_argument("--salida", default=str(BASE.parent / "app" / "datos"))
    a = ap.parse_args()
    br, sal = pathlib.Path(a.brutos), pathlib.Path(a.salida)
    sal.mkdir(parents=True, exist_ok=True)
    lista = json.load(open(br / "lista.json", encoding="utf-8"))
    Y = json.load(gzip.open(br / "yahoo.json.gz", "rt", encoding="utf-8"))
    diag = json.load(open(br / "diagnostico.json", encoding="utf-8")) if (br / "diagnostico.json").exists() else {}

    tiempos = [raw((Y.get(c["ticker"], {}).get("qs") or {}).get("price", {}).get("regularMarketTime")) for c in lista["componentes"]]
    tiempos = [x for x in tiempos if x]
    V = max(dt.datetime.fromtimestamp(x, dt.timezone.utc).date() for x in tiempos) if tiempos else dt.date.today()
    tnx = raw(((Y.get("^TNX") or {}).get("qs") or {}).get("price", {}).get("regularMarketPrice"))
    avisos = []
    rf = round(tnx / 100, 4) if tnx else CONF["parametros"]["tipo_sin_riesgo_inicial"]
    if not tnx: avisos.append("No se pudo leer el Treasury a 10 años: se usa el tipo sin riesgo de referencia.")

    # registros de la semana anterior: se reutilizan si la descarga de una empresa falla esta semana
    try:
        previo = {e["ticker"]: e for e in json.load(open(sal / "empresas.json", encoding="utf-8"))}
    except Exception:
        previo = {}
    reutilizadas = []
    emp, cons = [], {}
    for c in lista["componentes"]:
        y = Y.get(c["ticker"]) or {}
        if (not y.get("qs") or not y.get("ts")) and c["ticker"] in previo:
            e = dict(previo[c["ticker"]]); e["avisos"] = list(e.get("avisos") or []) + ["datos_anteriores"]
            emp.append(e); reutilizadas.append(c["ticker"]); continue
        if not y.get("qs"):
            sec_es = CONF["sectores"].get(c["sector"], c["sector"])
            sub_es, ind_es = CONF["subindustrias"].get(c["subindustria"], [c["subindustria"], c["subindustria"]])
            emp.append({"ticker": c["ticker"], "empresa": c["empresa"], "nombre": nombre_corto(c["empresa"]), "sector": sec_es, "industria": ind_es,
                        "subindustria": sub_es, "sector_gics": c["sector"], "subindustria_gics": c["subindustria"], "valorada": False,
                        "motivo": "Sin datos de Yahoo Finance esta semana", "avisos": [], "cotizacion": None})
            continue
        try:
            e, C = datos_empresa(c, y, V, avisos)
        except Exception as ex:  # una empresa con datos raros no debe parar la actualización
            e = {"ticker": c["ticker"], "empresa": c["empresa"], "nombre": nombre_corto(c["empresa"]),
                 "sector": CONF["sectores"].get(c["sector"], c["sector"]), "industria": CONF["subindustrias"].get(c["subindustria"], [c["subindustria"]] * 2)[1],
                 "subindustria": CONF["subindustrias"].get(c["subindustria"], [c["subindustria"]] * 2)[0], "sector_gics": c["sector"],
                 "subindustria_gics": c["subindustria"], "valorada": False, "motivo": f"Error al procesar los datos ({type(ex).__name__})", "avisos": [],
                 "cotizacion": raw(((y.get("qs") or {}).get("price") or {}).get("regularMarketPrice"))}
            C = None
        emp.append(e)
        if C is not None: cons[e["ticker"]] = C

    cand = [e for e in emp if "_anc" in e]
    previas = [e for e in emp if "datos_anteriores" in (e.get("avisos") or []) and e.get("valorada")]
    # betas que faltan: mediana de la subindustria
    por_sub, por_ind, por_sec = {}, {}, {}
    for e in cand:
        por_sub.setdefault(e["subindustria_gics"], []).append(e)
    for e in previas:
        por_sub.setdefault(e["subindustria_gics"], [])
        por_ind.setdefault(e["industria"], [])
        por_sec.setdefault(e["sector"], [])
    for e in cand:
        por_ind.setdefault(e["industria"], []).append(e)
        por_sec.setdefault(e["sector"], []).append(e)
    def mediana_grupo(e, f):
        for g in (por_sub[e["subindustria_gics"]], por_ind[e["industria"]], por_sec[e["sector"]]):
            xs = [f(x) for x in g if f(x) is not None]
            if len(xs) >= 3: return stt.median(xs)
        return None
    margen = lambda x: x["ebit_ttm"] / x["ventas_ttm"] if x["ebit_ttm"] > 0 else None
    de = lambda x: x["deuda_bruta"] / x["cap"] if x.get("cap") else 0.0
    for e in cand:
        b = e.get("beta_yahoo")
        e["beta_desapalancada"] = clip(b, R["beta_min"], R["beta_max"]) / (1 + (1 - e["tipo_impositivo"]) * de(e)) if b is not None and math.isfinite(b) else None
    def mediana_amplia(e, f):  # industria GICS (5 o más empresas) o sector: menos ruido que la subindustria
        for g in (por_ind[e["industria"]], por_sec[e["sector"]]):
            xs = [f(x) for x in g if f(x) is not None]
            if len(xs) >= 5: return stt.median(xs)
        return None
    for e in cand:
        # beta ajustada: media entre la beta de mercado de la empresa (Yahoo, 5 años) y la beta de su industria
        # desapalancada y vuelta a apalancar con la deuda de la empresa (enfoque "bottom-up" de Damodaran)
        bu = mediana_amplia(e, lambda x: x.get("beta_desapalancada"))
        if bu is None: bu = e["beta_desapalancada"] or 1.0
        bl = clip(bu * (1 + (1 - e["tipo_impositivo"]) * de(e)), R["beta_relevada_min"], R["beta_relevada_max"])
        by = clip(e["beta_yahoo"], R["beta_min"], R["beta_max"]) if e.get("beta_yahoo") is not None and math.isfinite(e["beta_yahoo"]) else bl
        e["beta_desapalancada_sector"] = round(bu, 3); e["beta_sector_apalancada"] = round(bl, 3)
        e["beta"] = round(max((by + bl) / 2, R["beta_final_min"]), 2)
        e["margen_referencia"] = mediana_grupo(e, margen)
        e["tr"] = trayectoria(e, e["margen_referencia"])
        e["valorada"] = True

    # múltiplos adelantados de comparables de la misma subindustria
    F = {}
    for e in cand:
        try: F[e["ticker"]] = adelantados(e, cons.get(e["ticker"]), Y[e["ticker"]], V)
        except Exception: F[e["ticker"]] = None
    for e in cand:
        mu, peers = multiplos(e, F, por_sub, por_ind, por_sec)
        e["mu"] = mu or {"comparables": [], "nivel": None}
        if not mu or (mu.get("per_valor_mediana") is None and mu.get("ev_ebitda_valor_mediana") is None): e["avisos"].append("sin_multiplos")
        f = F.get(e["ticker"]) or {}
        e["adelantados"] = {"per": f.get("per_fwd"), "ev_ebitda": f.get("ev_ebitda_fwd"), "bpa_ntm": f.get("eps_ntm"), "ev_ebitda_ttm": f.get("evt")}
        mu = e["mu"]
        e["mu"]["metodos"] = [
            {"id": "per", "n": "PER adelantado", "mult": _rango(mu.get("per_mediana")), "valor": {"min": mu.get("per_valor_min"), "med": mu.get("per_valor_mediana"), "max": mu.get("per_valor_max")}},
            {"id": "ev_ebitda", "n": "EV/EBITDA adelantado", "mult": _rango(mu.get("ev_ebitda_mediana")), "valor": {"min": mu.get("ev_ebitda_valor_min"), "med": mu.get("ev_ebitda_valor_mediana"), "max": mu.get("ev_ebitda_valor_max")}}]

    # ---------------- fase 2: beneficio residual y REIT
    for modelo in ("ri", "reit"):
        lista_m = [e for e in emp if e.get("_" + modelo)]
        gs, gi_, gc = {}, {}, {}
        for e in lista_m:
            gs.setdefault(e["subindustria_gics"], []).append(e); gi_.setdefault(e["industria"], []).append(e); gc.setdefault(e["sector"], []).append(e)
        todos = lista_m
        def med_beta(e):
            for g in (gi_[e["industria"]], gc[e["sector"]], todos):
                xs = [clip(x["beta_yahoo"], R["beta_min"], R["beta_max"]) for x in g if x.get("beta_yahoo") is not None and math.isfinite(x["beta_yahoo"])]
                if len(xs) >= 5: return stt.median(xs)
            return 1.0
        for e in lista_m:
            # beta: media de la de Yahoo y la mediana de su industria (sin desapalancar: en estos negocios la deuda es parte de la actividad)
            bm = med_beta(e)
            by = clip(e["beta_yahoo"], R["beta_min"], R["beta_max"]) if e.get("beta_yahoo") is not None and math.isfinite(e["beta_yahoo"]) else bm
            e["beta_sector_apalancada"] = round(bm, 3)
            e["beta"] = round(max((by + bm) / 2, R["beta_final_min"]), 2)
            C = cons.get(e["ticker"])
            if modelo == "ri":
                eps = C.ntm("eps", V) if C else None
                per = e["cotizacion"] / eps if eps and eps > 0 and C.n("+1y", "eps") >= R["analistas_min"] else None
                if per and per > R["per_max"]: per = None
                pb = e["cotizacion"] / e["ri"]["bv0"] if e["ri"]["bv0"] > 0 else None
                if pb and pb > R["pb_max"]: pb = None
                F[e["ticker"]] = {"per": per, "pb": pb, "eps_ntm": eps}
                e["adelantados"] = {"per": per, "pb": pb, "bpa_ntm": eps}
            else:
                pffo = e["cotizacion"] / e["reit"]["ffo_ps"] if e["reit"]["ffo_ps"] > 0 else None
                if pffo and pffo > R["pffo_max"]: pffo = None
                ts = (Y.get(e["ticker"]) or {}).get("ts") or {}
                evs, ev, mc = ts.get("trailingEnterprisesValueEBITDARatio"), ts.get("trailingEnterpriseValue"), ts.get("trailingMarketCap")
                evt = evs[-1][1] if evs else None
                if evt is not None and not (0 < evt <= R["ev_ebitda_max"]): evt = None
                nd = (ev[-1][1] - mc[-1][1]) / 1e6 if ev and mc else e["deuda_financiera_neta"]
                e["reit"]["nd"] = nd
                F[e["ticker"]] = {"pffo": pffo, "ev_ebitda": evt}
                e["adelantados"] = {"pffo": pffo, "ev_ebitda_ttm": evt, "rent_dividendo": e["reit"]["dps0"] / e["cotizacion"]}
        for e in lista_m:
            if modelo == "ri":
                eps = F[e["ticker"]]["eps_ntm"]; bv = e["ri"]["bv0"]
                defs = [("per", "PER adelantado", "per", (lambda x, eps=eps: x * eps) if eps and eps > 0 else None),
                        ("pb", "Precio / valor contable", "pb", lambda x, bv=bv: x * bv)]
            else:
                ffo, eb, nd, acc = e["reit"]["ffo_ps"], e["reit"]["ebitda"], e["reit"]["nd"], e["acciones_m"]
                defs = [("pffo", "P/FFO", "pffo", (lambda x, f=ffo: x * f) if ffo > 0 else None),
                        ("ev_ebitda", "EV/EBITDA", "ev_ebitda", (lambda x, eb=eb, nd=nd, acc=acc: (x * eb - nd) / acc) if eb and eb > 0 else None)]
            e["mu"] = multiplos_gen(e, F, (gs[e["subindustria_gics"]], gi_[e["industria"]], gc[e["sector"]]), defs)
            if not any(m["valor"] and m["valor"]["med"] for m in e["mu"]["metodos"]): e["avisos"].append("sin_multiplos")
            e["valorada"] = True

    # ---------------- fórmula mágica de Greenblatt (no financieras ni eléctricas)
    eleg = [e for e in emp if e.get("valorada") and e.get("modelo") == "fcff" and e.get("sector_gics") not in ("Financials", "Utilities")
            and (e.get("ebit_contable") or 0) > 0 and e.get("cap")]
    for e in eleg:
        ev = e["cap"] + e.get("deuda_financiera_neta", 0) + e.get("minoritarios", 0) + e.get("preferentes", 0)
        cap_op = max(e.get("nof") or 0.0, 0.0) + (e.get("ppe") or 0.0)
        e["_ey"] = e["ebit_contable"] / ev if ev > 0 else None
        e["_roc"] = e["ebit_contable"] / cap_op if cap_op > 0 else None
    eleg = [e for e in eleg if e["_ey"] is not None and e["_roc"] is not None]
    for clave in ("_ey", "_roc"):
        for i, e in enumerate(sorted(eleg, key=lambda x: -x[clave])): e[clave + "_r"] = i + 1
    for i, e in enumerate(sorted(eleg, key=lambda x: (x["_ey_r"] + x["_roc_r"], x["_ey_r"]))):
        e["greenblatt"] = {"ey": e["_ey"], "roc": e["_roc"], "pos": i + 1, "n": len(eleg)}
    for e in emp:
        for k in ("_ey", "_roc", "_ey_r", "_roc_r"): e.pop(k, None)

    # ---------------- historia de 10 años (SEC) y criterios de Graham a 10 años
    historia = historia_sec(br, emp, lista, sal)
    for e in emp:
        h = historia.get(e["ticker"])
        if h and e.get("graham") is not None: e["graham"].update(graham10(h))

    # ---------------- cotizaciones semanales de 5 años (un fichero por empresa, para cargarlo solo al abrir su ficha)
    dp = sal / "precios"; dp.mkdir(exist_ok=True)
    for t, y in list(Y.items()):
        px = y.get("px")
        if px: json.dump([[f, round(c, 2)] for f, c in px], open(dp / (t.replace("^", "_") + ".json"), "w"), separators=(",", ":"))
    sp500 = raw((((Y.get("^GSPC") or {}).get("qs") or {}).get("price") or {}).get("regularMarketPrice"))

    # ---------------- valoración revisada de las 7 Magníficas (Simulador 7M)
    revisadas_7m(br, emp)

    # salida
    desc = {}
    for e in emp:
        y = Y.get(e["ticker"]) or {}
        apf = ((y.get("qs") or {}).get("assetProfile")) or {}
        if apf:
            desc[e["ticker"]] = {"d": (apf.get("longBusinessSummary") or "")[:1400], "web": apf.get("website"), "empleados": apf.get("fullTimeEmployees"),
                                  "ciudad": apf.get("city"), "pais": apf.get("country")}
        for k in ("_anc", "_ri", "_reit"): e.pop(k, None)
    nval = sum(1 for e in emp if e.get("valorada"))
    if nval < R.get("minimo_valoradas", 300):
        raise SystemExit(f"Solo {nval} empresas valoradas: la descarga parece incompleta; no se sobrescriben los datos.")
    if reutilizadas:
        avisos.append(f"{len(reutilizadas)} empresas sin datos nuevos de Yahoo esta semana ({', '.join(reutilizadas[:12])}{'…' if len(reutilizadas) > 12 else ''}): se mantienen sus datos de la semana anterior.")
    salida = [redondear(e) for e in emp]
    json.dump(salida, open(sal / "empresas.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(desc, open(sal / "descripciones.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    p = dict(CONF["parametros"]); p.pop("tipo_sin_riesgo_inicial", None)
    p.update({"tipo_sin_riesgo": rf, "fecha_cotizacion": V.isoformat(), "fecha_valoracion": V.isoformat()})
    json.dump([p], open(sal / "parametros.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    estado = {"actualizado": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"), "fecha_mercado": V.isoformat(),
              "fuente_lista": lista.get("fuente"), "componentes": len(emp), "valoradas": nval,
              "no_valoradas": {m: n for m, n in _contar(e.get("motivo") for e in emp if not e.get("valorada")).items()},
              "sin_consenso": [e["ticker"] for e in emp if "sin_consenso" in (e.get("avisos") or [])],
              "fallos_descarga": diag.get("fallos", {}), "avisos": avisos, "sp500": sp500,
              "historia_sec": bool(historia), "revisadas_7m": sorted(e["ticker"] for e in emp if e.get("revisada"))}
    json.dump(estado, open(sal / "estado.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"Mercado del {V} · {len(emp)} componentes · {nval} valoradas · rf {rf:.4f}")


SPLITS = [2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 50]


def historia_sec(br, emp, lista, sal):
    """historia.json: {ticker: {años, ventas, beneficio, ebit, bpa, dpa, patrimonio, cfo}} (importes en M$, por acción ajustado
    por splits). Si esta semana no hay datos de la SEC, se conserva el fichero anterior."""
    f = br / "sec.json.gz"
    previo = sal / "historia.json"
    if not f.exists():
        try: return json.load(open(previo, encoding="utf-8"))
        except Exception: return {}
    h = json.load(gzip.open(f, "rt", encoding="utf-8"))
    años = [str(a) for a in h["años"]]
    por_cik = {int(c["cik"]): c["ticker"] for c in lista["componentes"] if c.get("cik")}
    out = {}
    for cik, d in h["empresas"].items():
        t = por_cik.get(int(cik))
        if not t: continue
        serie = lambda k, esc=1e6: [(d.get(k, {}).get(a) / esc if d.get(k, {}).get(a) is not None else None) for a in años]
        bpa, dpa, ni = serie("bpa", 1), serie("dpa", 1), serie("beneficio")
        # ajuste por splits: las acciones implícitas (beneficio / BPA) saltan un múltiplo entero de un año a otro
        f_ = 1.0
        for i in range(len(años) - 2, -1, -1):
            a1 = ni[i + 1] / bpa[i + 1] if ni[i + 1] and bpa[i + 1] and ni[i + 1] * bpa[i + 1] > 0 else None
            a0 = ni[i] / bpa[i] if ni[i] and bpa[i] and ni[i] * bpa[i] > 0 else None
            if a1 and a0:
                r = a1 / a0
                k = min(SPLITS, key=lambda s_: abs(r / s_ - 1)) if r >= 1.8 else None
                if k and abs(r / k - 1) < 0.25: f_ *= k
            if bpa[i] is not None: bpa[i] /= f_
            if dpa[i] is not None: dpa[i] /= f_
        dv = serie("dividendos")
        out[t] = {"años": [int(a) for a in años], "ventas": serie("ventas"), "beneficio": ni, "ebit": serie("ebit"), "bpa": bpa,
                  "dpa": dpa, "dividendos": dv, "patrimonio": serie("patrimonio"), "cfo": serie("cfo")}
        out[t] = redondear(out[t], 4)
    # las clases secundarias comparten historia con la principal
    for e in emp:
        if e.get("principal") and e["principal"] in out: out[e["ticker"]] = out[e["principal"]]
    json.dump(out, open(previo, "w", encoding="utf-8"), separators=(",", ":"))
    return out


def graham10(h):
    """Criterios de Graham con 10 años: beneficios todos los años, dividendos ininterrumpidos y crecimiento del BPA de al
    menos un tercio (medias de tres años al principio y al final)."""
    ni = [x for x in h["beneficio"] if x is not None]
    pagos = [(a or 0) > 0 or (b or 0) > 0 for a, b in zip(h["dpa"], h["dividendos"])]
    bpa = [x for x in h["bpa"] if x is not None]
    out = {}
    if len(ni) >= 6:
        out.update({"ben_pos": sum(1 for x in ni if x > 0), "ben_n": len(ni), "ben_fuente": "SEC"})
    disp = [i for i, (a, b) in enumerate(zip(h["dpa"], h["dividendos"])) if a is not None or b is not None]
    if len(disp) >= 6:
        out.update({"div_anios": sum(1 for i in disp if pagos[i]), "div_n": len(disp)})
    if len(bpa) >= 6:
        ini, fin = sum(bpa[:3]) / 3, sum(bpa[-3:]) / 3
        out.update({"cbpa": (fin / ini - 1) if ini > 0 else None, "cbpa_anios": len(bpa) - 3, "cbpa_medias": True})
    return out


def revisadas_7m(br, emp):
    """Para las 7 Magníficas, los datos y supuestos revisados del Simulador 7M (mismo motor), que la app usa por defecto."""
    f = br / "7m.json"
    if not f.exists(): return
    try:
        m = json.load(open(f, encoding="utf-8"))
        par = m["parametros"][0]
        tray = {}
        for r in m["trayectorias"]:
            d = tray.setdefault(r["ticker"], {}).setdefault(r["escenario"], {"gr": [], "mg": [], "da": [], "cx": [], "nf": []})
            d["gr"].append(r["crecimiento"]); d["mg"].append(r["margen_ebit"]); d["da"].append(r["amortizacion_ventas"])
            d["cx"].append(r["capex_ventas"]); d["nf"].append(r["nof_ventas"])
        mul = {r["ticker"]: r for r in m["multiplos"]}
        campos = ["acciones_m", "ventas_ttm", "ebit_ttm", "da_ttm", "nof_ventas_ttm", "capital_invertido", "anios_hasta_valoracion", "tipo_impositivo",
                  "deuda_financiera_neta", "deuda_bruta", "minoritarios", "preferentes", "inversiones_no_operativas", "beta", "prima_pais",
                  "fecha_balance", "capex_ttm", "inversion_neta_ttm"]
        por_t = {e["ticker"]: e for e in emp}
        for r in m["empresas"]:
            e = por_t.get(r["ticker"])
            if not e or not e.get("valorada") or r["ticker"] not in tray: continue
            mu = dict(mul.get(r["ticker"], {}))
            mu["comparables"] = [x.strip() for x in str(mu.get("comparables", "")).split(",") if x.strip()]
            mu["nivel"] = "revisado"
            e["revisada"] = {"emp": {k: r[k] for k in campos if k in r}, "diferencial": par.get("diferencial_deuda"),
                             "trays": tray[r["ticker"]], "mu": mu, "fecha": (m.get("estado") or {}).get("valoracion_completa") or par.get("fecha_valoracion")}
    except Exception as ex:
        print("No se pudieron usar las valoraciones revisadas de las 7M:", ex)


def _contar(it):
    out = {}
    for x in it: out[x] = out.get(x, 0) + 1
    return out


if __name__ == "__main__":
    main()
