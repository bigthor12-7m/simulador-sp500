#!/usr/bin/env python3
"""Actualización diaria ligera (de lunes a viernes, después del cierre de Wall Street).

Descarga solo las cotizaciones (empresas, S&P 500, Treasury a 10 años y euro) y actualiza lo que depende del precio:
capitalización, PER, precio / valor contable, rentabilidad por dividendo, múltiplos propios y el último punto de la
cotización semanal. Los estados financieros, el consenso, los comparables y la historia de la SEC se actualizan los lunes
(pipeline/descargar.py + procesar.py). Después se ejecuta `node pipeline/calcular.js app/datos --diario`.

Uso:  python pipeline/diario.py [--datos app/datos]
"""
import argparse, datetime as dt, json, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import yahoo  # noqa: E402

EXTRA = ["^GSPC", "^TNX", "EURUSD=X"]


def cotizaciones(tickers):
    """{ticker: {"px", "t"}}: primero en bloques de 50 (/v7/finance/quote); los que falten, uno a uno con el gráfico diario."""
    cli = yahoo.Cliente()
    out = {}
    for i in range(0, len(tickers), 50):
        grupo = tickers[i:i + 50]
        try:
            j = cli.get("https://query2.finance.yahoo.com/v7/finance/quote",
                        {"symbols": ",".join(grupo), "fields": "regularMarketPrice,regularMarketTime,currency"}, intentos=3)
            for q in (j.get("quoteResponse") or {}).get("result") or []:
                if q.get("regularMarketPrice"):
                    out[q["symbol"]] = {"px": float(q["regularMarketPrice"]), "t": q.get("regularMarketTime")}
        except Exception as ex:
            print("quote:", str(ex)[:200])
    faltan = [t for t in tickers if t not in out]
    print(f"{len(out)} cotizaciones en bloque; {len(faltan)} una a una")
    for t in faltan:
        try:
            j = cli.get(f"https://query2.finance.yahoo.com/v8/finance/chart/{t}", {"range": "5d", "interval": "1d"}, intentos=3)
            m = j["chart"]["result"][0]["meta"]
            if m.get("regularMarketPrice"):
                out[t] = {"px": float(m["regularMarketPrice"]), "t": m.get("regularMarketTime")}
        except Exception as ex:
            print("chart", t, str(ex)[:120])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", default=str(pathlib.Path(__file__).resolve().parent.parent / "app" / "datos"))
    a = ap.parse_args()
    d = pathlib.Path(a.datos)
    emp = json.load(open(d / "empresas.json", encoding="utf-8"))
    par = json.load(open(d / "parametros.json", encoding="utf-8"))
    est = json.load(open(d / "estado.json", encoding="utf-8"))
    tickers = [e["ticker"] for e in emp]
    Q = cotizaciones(tickers + EXTRA)
    n_ok = sum(1 for t in tickers if t in Q)
    if n_ok < 0.8 * len(tickers):
        raise SystemExit(f"Solo {n_ok} cotizaciones de {len(tickers)}: no se actualiza nada hoy.")
    tiempos = [Q[t]["t"] for t in tickers if t in Q and Q[t].get("t")]
    fecha = max(dt.datetime.fromtimestamp(x, dt.timezone.utc).date() for x in tiempos) if tiempos else dt.date.today()

    cambiadas = 0
    for e in emp:
        q = Q.get(e["ticker"])
        p_old = e.get("cotizacion")
        if not q or not p_old: continue
        p = q["px"]
        f = p / p_old
        if abs(f - 1) < 1e-9: continue
        cambiadas += 1
        cap_old = e.get("cap")
        e["cotizacion"] = round(p, 4)
        if e.get("acciones_m"): e["cap"] = p * e["acciones_m"]
        g = e.get("graham") or {}
        for k in ("per", "pb"):
            if g.get(k): g[k] = g[k] * f
        g["per_pb"] = g["per"] * g["pb"] if g.get("per") and g.get("pb") else None
        if g.get("div"): g["div"] = g["div"] / f
        ad = e.get("adelantados") or {}
        for k in ("per", "pb", "pffo"):
            if ad.get(k): ad[k] = ad[k] * f
        if ad.get("rent_dividendo"): ad["rent_dividendo"] = ad["rent_dividendo"] / f
        if cap_old and e.get("cap"):   # EV = capitalización + deuda neta + minoritarios + preferentes − inversiones no operativas
            resto = (e.get("deuda_financiera_neta") or 0) + (e.get("minoritarios") or 0) + (e.get("preferentes") or 0) - (e.get("inversiones_no_operativas") or 0)
            ev_old, ev_new = cap_old + resto, e["cap"] + resto
            if ev_old > 0 and ev_new > 0:
                for k in ("ev_ebitda", "ev_ebitda_ttm"):
                    if ad.get(k): ad[k] = ad[k] * ev_new / ev_old
        dv = e.get("dividendo")
        if dv and dv.get("dpa"): dv["rent"] = dv["dpa"] / p

    # último punto de la cotización semanal (la semana empieza en lunes, como las barras semanales de Yahoo)
    lunes = (fecha - dt.timedelta(days=fecha.weekday())).isoformat()
    dp = d / "precios"
    for t in tickers + ["^GSPC"]:
        q = Q.get(t)
        fp = dp / (t.replace("^", "_") + ".json")
        if not q or not fp.exists(): continue
        serie = json.load(open(fp))
        if serie and serie[-1][0] == lunes: serie[-1][1] = round(q["px"], 2)
        elif not serie or serie[-1][0] < lunes: serie.append([lunes, round(q["px"], 2)])
        json.dump(serie, open(fp, "w"), separators=(",", ":"))

    p0 = par[0] if isinstance(par, list) else par
    if Q.get("^TNX"): p0["tipo_sin_riesgo"] = round(Q["^TNX"]["px"] / 100, 4)
    p0["fecha_cotizacion"] = fecha.isoformat()
    json.dump(par, open(d / "parametros.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    est.update({"fecha_mercado": fecha.isoformat(), "actualizado_diario": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
                "sp500": Q.get("^GSPC", {}).get("px") or est.get("sp500"), "eurusd": Q.get("EURUSD=X", {}).get("px") or est.get("eurusd"),
                "cotizaciones_diarias": n_ok})
    json.dump(est, open(d / "estado.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(emp, open(d / "empresas.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"Cotizaciones del {fecha}: {n_ok} de {len(tickers)} empresas · {cambiadas} con precio nuevo · rf {p0.get('tipo_sin_riesgo')}")


if __name__ == "__main__":
    main()
