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
    ap.add_argument("--hilos", type=int, default=4)
    a = ap.parse_args()
    sal = pathlib.Path(a.salida); sal.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    lista, fuente = yahoo.lista_sp500()
    if a.max: lista = lista[: a.max]
    tickers = [x["ticker"] for x in lista]
    print(f"{len(tickers)} componentes ({fuente})")
    datos, fallos, cliente = yahoo.descargar_todo(tickers, hilos=a.hilos, extra=("^TNX",))

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
