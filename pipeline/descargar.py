#!/usr/bin/env python3
"""Descarga semanal de los datos brutos del S&P 500 (lista GICS + Yahoo Finance).

Uso:  python pipeline/descargar.py --salida brutos [--max N]
Escribe:  brutos/lista.json, brutos/yahoo.json.gz, brutos/diagnostico.json
"""
import argparse, datetime as dt, gzip, json, pathlib, sys, time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import yahoo  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", default="brutos")
    ap.add_argument("--max", type=int, default=0, help="solo los N primeros (prueba)")
    ap.add_argument("--hilos", type=int, default=3)
    a = ap.parse_args()
    sal = pathlib.Path(a.salida); sal.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    lista, fuente = yahoo.lista_sp500()
    if a.max: lista = lista[: a.max]
    tickers = [x["ticker"] for x in lista]
    print(f"{len(tickers)} componentes ({fuente})")
    datos, fallos, cliente = yahoo.descargar_todo(tickers, hilos=a.hilos, extra=("^TNX", "^GSPC"))

    # historia de 10 años de la SEC (no imprescindible: si falla, la app conserva la de la semana anterior)
    try:
        import sec
        h = sec.descargar([x.get("cik") for x in lista])
        with gzip.open(sal / "sec.json.gz", "wt", encoding="utf-8") as f:
            json.dump(h, f, separators=(",", ":"))
        print(f"SEC: {len(h['empresas'])} empresas, años {h['años'][0]}-{h['años'][-1]}, {h['errores']} peticiones fallidas")
    except Exception as e:
        print("SEC no disponible:", e)

    # valoración revisada de las 7 Magníficas (la publica el Simulador 7M)
    try:
        import requests
        base = "https://bigthor12-7m.github.io/simulador-7mag/datos/"
        m7 = {n: requests.get(base + n + ".json", timeout=30).json() for n in ("empresas", "trayectorias", "multiplos", "parametros", "estado")}
        json.dump(m7, open(sal / "7m.json", "w", encoding="utf-8"), ensure_ascii=False)
        print("Simulador 7M: datos revisados descargados")
    except Exception as e:
        print("Simulador 7M no disponible:", e)

    json.dump({"fuente": fuente, "fecha": dt.date.today().isoformat(), "componentes": lista},
              open(sal / "lista.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    with gzip.open(sal / "yahoo.json.gz", "wt", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, separators=(",", ":"))
    sin_qs = [t for t in tickers if "qs" not in datos.get(t, {})]
    sin_ts = [t for t in tickers if not datos.get(t, {}).get("ts")]
    diag = {"descargado": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"), "cliente": cliente,
            "segundos": round(time.time() - t0), "componentes": len(tickers), "sin_quoteSummary": sin_qs,
            "sin_series": sin_ts, "fallos": fallos}
    json.dump(diag, open(sal / "diagnostico.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"Hecho en {diag['segundos']} s · sin quoteSummary: {len(sin_qs)} · sin series: {len(sin_ts)}")


if __name__ == "__main__":
    main()
