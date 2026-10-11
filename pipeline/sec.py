"""Historia de 10 años de la SEC (XBRL, API "frames"): una petición por concepto y año para todas las empresas a la vez.

La SEC pide identificarse en el User-Agent; se usa la dirección noreply de GitHub del proyecto.
Si la SEC no responde (o rechaza las peticiones), se abandona pronto: la app conserva la historia de la semana anterior.
"""
import datetime as dt, time

UA = "simulador-sp500 bigthor12-7m@users.noreply.github.com"
# concepto -> lista de (taxonomía, etiqueta, unidad, instantáneo); se usa la primera que exista para cada empresa y año
CONCEPTOS = {
    "ventas": [("us-gaap", "Revenues", "USD", False), ("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax", "USD", False),
               ("us-gaap", "SalesRevenueNet", "USD", False), ("us-gaap", "RevenuesNetOfInterestExpense", "USD", False)],
    "beneficio": [("us-gaap", "NetIncomeLoss", "USD", False), ("us-gaap", "NetIncomeLossAvailableToCommonStockholdersBasic", "USD", False)],
    "bpa": [("us-gaap", "EarningsPerShareDiluted", "USD-per-shares", False), ("us-gaap", "EarningsPerShareBasicAndDiluted", "USD-per-shares", False),
            ("us-gaap", "EarningsPerShareBasic", "USD-per-shares", False)],
    "dpa": [("us-gaap", "CommonStockDividendsPerShareDeclared", "USD-per-shares", False),
            ("us-gaap", "CommonStockDividendsPerShareCashPaid", "USD-per-shares", False)],
    "dividendos": [("us-gaap", "PaymentsOfDividendsCommonStock", "USD", False), ("us-gaap", "PaymentsOfDividends", "USD", False)],
    "ebit": [("us-gaap", "OperatingIncomeLoss", "USD", False)],
    "patrimonio": [("us-gaap", "StockholdersEquity", "USD", True)],
    "cfo": [("us-gaap", "NetCashProvidedByUsedInOperatingActivities", "USD", False)],
}
PRESUPUESTO = 15 * 60   # segundos como máximo para toda la descarga


def descargar(ciks, anios=11):
    """{"años", "empresas": {cik(int): {concepto: {año: valor}}}, "errores", "estados", "segundos"} para los CIK pedidos.
    Lanza excepción si la SEC no responde."""
    import requests
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Encoding": "gzip, deflate"})
    ciks = {int(c) for c in ciks if c}
    hoy = dt.date.today()
    ultimo = hoy.year - 1 if hoy.month > 3 else hoy.year - 2  # año natural ya cerrado y presentado
    años = list(range(ultimo - anios + 1, ultimo + 1))
    out, errores, estados, t0, ok = {}, 0, {}, time.time(), 0
    for concepto, etiquetas in CONCEPTOS.items():
        for tax, tag, unidad, inst in etiquetas:
            for a in años:
                if time.time() - t0 > PRESUPUESTO:
                    raise RuntimeError(f"La SEC no ha terminado en {PRESUPUESTO} s (estados: {estados})")
                if ok == 0 and errores >= 6:
                    raise RuntimeError(f"La SEC rechaza las peticiones (estados: {estados})")
                url = f"https://data.sec.gov/api/xbrl/frames/{tax}/{tag}/{unidad}/CY{a}{'Q4I' if inst else ''}.json"
                datos = None
                for intento in range(2):
                    try:
                        r = s.get(url, timeout=(10, 40))
                        estados[r.status_code] = estados.get(r.status_code, 0) + 1
                        if r.status_code == 404: datos = []; break
                        if r.status_code in (403, 401):   # bloqueado: no tiene sentido reintentar
                            estados.setdefault("respuesta", r.text[:400]); estados.setdefault("servidor", r.headers.get("Server"))
                            break
                        r.raise_for_status(); datos = r.json().get("data", []); break
                    except Exception as ex:
                        estados[type(ex).__name__] = estados.get(type(ex).__name__, 0) + 1
                        time.sleep(1.5 * (intento + 1))
                if datos is None:
                    errores += 1; continue
                ok += 1
                for d in datos:
                    c = d.get("cik")
                    if c in ciks:
                        dc = out.setdefault(c, {}).setdefault(concepto, {})
                        dc.setdefault(str(a), d.get("val"))  # la primera etiqueta de la lista tiene prioridad
                time.sleep(0.12)
    if errores > len(años) * 4:
        raise RuntimeError(f"La SEC no ha respondido a {errores} peticiones (estados: {estados})")
    return {"años": años, "empresas": out, "errores": errores, "estados": {str(k): v for k, v in estados.items()}, "segundos": round(time.time() - t0)}
