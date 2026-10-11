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
    # clasificación fuera del alcance de la fase 1
    fa = CONF["fuera_de_alcance"]
    if c["ticker"] in CONF["clases_secundarias"]:
        e["motivo"] = f"Otra clase de acciones de la misma empresa: ver {CONF['clases_secundarias'][t]}"; e["principal"] = CONF["clases_secundarias"][t]
    elif c["subindustria"] in fa["subindustrias"]:
        e["motivo"] = fa["subindustrias"][c["subindustria"]]
    elif c["subindustria"].endswith(fa["sufijo_reit"]):
        e["motivo"] = fa["motivo_reit"]

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
    e["graham"] = gr

    if e["motivo"]:
        return e, None
    falta = [n for n, x in (("ventas", ventas), ("beneficio operativo", ebit), ("acciones", acc)) if x is None]
    if falta or not ventas or ventas <= 0:
        e["motivo"] = "Datos financieros insuficientes en Yahoo Finance (" + ", ".join(falta or ["ventas"]) + ")"; return e, None
    if (moneda_fin and moneda_fin != "USD") or (pr.get("currency") and pr.get("currency") != "USD"):
        e["avisos"].append("divisa")

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
    e.update({"rating": rating, "diferencial": dif, "cobertura": cob})
    gr["cobertura"] = cob

    # ------------------------------------------------ consenso: anclas de los años 1-2
    C = Consenso(qs)
    anc = anclas(e, C, S, tax, pre, gi, ii, sbc)
    if anc is None:
        anc = anclas_sin_consenso(e, S)
        e["avisos"].append("sin_consenso")
    elif C.n("+1y", "rev") < R["analistas_min"]:
        e["avisos"].append("pocos_analistas")
    e["_anc"] = anc
    e["consenso"] = {"n": C.n("+1y", "rev"), "fin_ejercicio": str(C.fin("0y")) if C.fin("0y") else None}
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
        if C is not None and "_anc" in e: cons[e["ticker"]] = C

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

    # salida
    desc = {}
    for e in emp:
        y = Y.get(e["ticker"]) or {}
        apf = ((y.get("qs") or {}).get("assetProfile")) or {}
        if apf:
            desc[e["ticker"]] = {"d": (apf.get("longBusinessSummary") or "")[:1400], "web": apf.get("website"), "empleados": apf.get("fullTimeEmployees"),
                                  "ciudad": apf.get("city"), "pais": apf.get("country")}
        e.pop("_anc", None)
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
              "fallos_descarga": diag.get("fallos", {}), "avisos": avisos}
    json.dump(estado, open(sal / "estado.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"Mercado del {V} · {len(emp)} componentes · {nval} valoradas · rf {rf:.4f}")


def _contar(it):
    out = {}
    for x in it: out[x] = out.get(x, 0) + 1
    return out


if __name__ == "__main__":
    main()
