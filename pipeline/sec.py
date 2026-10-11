"""Historia de 10 años de la SEC (XBRL, API "frames"): una petición por concepto y año para todas las empresas a la vez.

La SEC pide identificarse en el User-Agent; se usa la dirección noreply de GitHub del proyecto.
"""
import datetime as dt, json, time

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


def descargar(ciks, anios=11):
    """{cik(int): {concepto: {año: valor}}} para los CIK pedidos. Lanza excepción si la SEC no responde."""
    import requests
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Encoding": "gzip, deflate"})
    ciks = {int(c) for c in ciks if c}
    hoy = dt.date.today()
    ultimo = hoy.year - 1 if hoy.month > 3 else hoy.year - 2  # año natural ya cerrado y presentado
    años = list(range(ultimo - anios + 1, ultimo + 1))
    out, errores = {}, 0
    for concepto, etiquetas in CONCEPTOS.items():
        for tax, tag, unidad, inst in etiquetas:
            for a in años:
                url = f"https://data.sec.gov/api/xbrl/frames/{tax}/{tag}/{unidad}/CY{a}{'Q4I' if inst else ''}.json"
                for intento in range(3):
                    try:
                        r = s.get(url, timeout=60)
                        if r.status_code == 404: datos = []; break
                        r.raise_for_status(); datos = r.json().get("data", []); break
                    except Exception:
                        datos = None; time.sleep(2 * (intento + 1))
                if datos is None:
                    errores += 1; continue
                for d in datos:
                    c = d.get("cik")
                    if c in ciks:
                        dc = out.setdefault(c, {}).setdefault(concepto, {})
                        dc.setdefault(str(a), d.get("val"))  # la primera etiqueta de la lista tiene prioridad
                time.sleep(0.15)
    if errores > len(años) * 4:
        raise RuntimeError(f"La SEC no ha respondido a {errores} peticiones")
    return {"años": años, "empresas": out, "errores": errores}
