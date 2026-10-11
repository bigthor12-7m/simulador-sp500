"""Descarga de Yahoo Finance: lista del S&P 500, quoteSummary y series de estados financieros (fundamentals-timeseries).

Se ejecuta en GitHub Actions. yfinance se usa solo como cliente HTTP (gestiona cookies y 'crumb'); si no está, requests.
"""
import io, json, random, threading, time
from concurrent.futures import ThreadPoolExecutor

MODULOS = ("price,summaryDetail,defaultKeyStatistics,financialData,earningsTrend,earningsHistory,"
           "calendarEvents,assetProfile")

# Estados financieros: prefijos annual / quarterly / trailing (el balance no tiene trailing)
CUENTA_RESULTADOS = ["TotalRevenue", "OperatingIncome", "EBIT", "EBITDA", "NormalizedEBITDA", "ReconciledDepreciation",
                     "InterestExpense", "InterestIncome", "PretaxIncome", "TaxProvision", "TaxRateForCalcs",
                     "NetIncomeCommonStockholders", "DilutedEPS", "DilutedAverageShares", "TotalUnusualItems",
                     "ResearchAndDevelopment", "GrossProfit", "AmortizationOfIntangiblesIncomeStatement",
                     "DepreciationAndAmortizationInIncomeStatement", "DepreciationIncomeStatement", "SpecialIncomeCharges"]
FLUJOS = ["OperatingCashFlow", "CapitalExpenditure", "FreeCashFlow", "StockBasedCompensation", "DepreciationAndAmortization",
          "DepreciationAmortizationDepletion", "ChangeInWorkingCapital", "CashDividendsPaid", "RepurchaseOfCapitalStock",
          "Depreciation", "AmortizationCashFlow", "AmortizationOfIntangibles", "GainLossOnSaleOfPPE", "GainLossOnInvestmentSecurities"]
BALANCE = ["TotalAssets", "CurrentAssets", "CurrentLiabilities", "CashAndCashEquivalents", "CashCashEquivalentsAndShortTermInvestments",
           "OtherShortTermInvestments", "Receivables", "Inventory", "AccountsPayable", "Payables", "PayablesAndAccruedExpenses",
           "CurrentDebt", "CurrentDebtAndCapitalLeaseObligation", "CurrentCapitalLeaseObligation", "LongTermDebt",
           "LongTermDebtAndCapitalLeaseObligation", "LongTermCapitalLeaseObligation", "TotalDebt", "CapitalLeaseObligations",
           "StockholdersEquity", "CommonStockEquity", "MinorityInterest", "PreferredStock", "TotalEquityGrossMinorityInterest",
           "InvestedCapital", "WorkingCapital", "NetPPE", "Goodwill", "GoodwillAndOtherIntangibleAssets", "OtherIntangibleAssets",
           "InvestmentsAndAdvances", "LongTermEquityInvestment", "InvestmentinFinancialAssets", "AvailableForSaleSecurities",
           "OtherInvestments", "OrdinarySharesNumber", "ShareIssued", "NetDebt", "TangibleBookValue", "CurrentDeferredRevenue",
           "OtherCurrentLiabilities", "OtherCurrentAssets", "Properties"]
VALORACION = ["trailingEnterprisesValueEBITDARatio", "trailingEnterpriseValue", "trailingMarketCap", "trailingPeRatio",
              "trailingPbRatio"]


ANUAL = ["TotalRevenue", "OperatingIncome", "NetIncomeCommonStockholders", "DilutedEPS", "CashDividendsPaid", "FreeCashFlow",
         "CapitalExpenditure", "StockholdersEquity", "TotalDebt", "OrdinarySharesNumber"]


def tipos_series(tam=40):
    """Grupos de tipos por frecuencia. Si se mezclan frecuencias en una petición, Yahoo recorta la historia anual a un año."""
    anual = ["annual" + x for x in ANUAL]
    trimestral = ["quarterly" + x for x in CUENTA_RESULTADOS + FLUJOS + BALANCE]
    ttm = ["trailing" + x for x in CUENTA_RESULTADOS + FLUJOS] + VALORACION
    trozos = lambda l: [l[i:i + tam] for i in range(0, len(l), tam)]
    return [anual] + trozos(trimestral) + trozos(ttm)


class Cliente:
    def __init__(self):
        self._local = threading.local()
        try:
            from yfinance.data import YfData
            yd = YfData()
            self._get = lambda url, params: yd.get_raw_json(url, params=params, timeout=30)
            self.tipo = "yfinance"
        except Exception as e:  # pragma: no cover
            print("yfinance no disponible, se usa requests:", e)
            import requests
            s = requests.Session()
            s.headers["User-Agent"] = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                                       "Chrome/128.0 Safari/537.36")
            try: s.get("https://fc.yahoo.com", timeout=20)
            except Exception: pass
            crumb = s.get("https://query1.finance.yahoo.com/v1/test/getcrumb", timeout=20).text.strip()

            def get(url, params):
                p = dict(params); p["crumb"] = crumb
                r = s.get(url, params=p, timeout=30); r.raise_for_status(); return r.json()
            self._get = get
            self.tipo = "requests"

    _ritmo = threading.Lock()
    _ultimo = [0.0]
    INTERVALO = 0.12  # segundos mínimos entre peticiones (todas las hebras)

    def get(self, url, params, intentos=7):
        for i in range(intentos):
            with Cliente._ritmo:
                espera = Cliente._ultimo[0] + self.INTERVALO - time.time()
                if espera > 0: time.sleep(espera)
                Cliente._ultimo[0] = time.time()
            try:
                return self._get(url, params)
            except Exception as e:
                if i == intentos - 1: raise
                limitado = "429" in str(e) or "Too Many" in str(e)
                time.sleep((10 if limitado else 1.5) * (i + 1) + random.random() * 2)


def quote_summary(cli, t):
    j = cli.get(f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{t}", {"modules": MODULOS})
    return j["quoteSummary"]["result"][0]


def series(cli, t, desde=1514764800):
    """Devuelve {tipo: [[fecha, valor], ...]} con todos los puntos de las series pedidas."""
    out = {}
    hasta = int(time.time()) + 86400
    for grupo in tipos_series():
        j = cli.get(f"https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{t}",
                    {"symbol": t, "type": ",".join(grupo), "period1": desde, "period2": hasta, "merge": "false",
                     "padTimeSeries": "true", "lang": "en-US", "region": "US"})
        for res in (j.get("timeseries") or {}).get("result") or []:
            tipo = ((res.get("meta") or {}).get("type") or [None])[0]
            pts = []
            for x in res.get(tipo) or []:
                if x and x.get("reportedValue") and x["reportedValue"].get("raw") is not None:
                    pts.append([x.get("asOfDate"), x["reportedValue"]["raw"]])
            if tipo and pts:
                out[tipo] = sorted(pts)
    return out


def descargar_todo(tickers, hilos=3, extra=()):
    """Descarga quoteSummary y series de cada ticker. Devuelve (datos, fallos)."""
    cli = Cliente()
    datos, fallos = {}, {}
    lock = threading.Lock()

    def uno(t):
        reg = {}
        try:
            reg["qs"] = quote_summary(cli, t)
        except Exception as e:
            with lock: fallos.setdefault(t, []).append(f"quoteSummary: {str(e)[:160]}")
        if t not in extra:
            try:
                reg["ts"] = series(cli, t)
            except Exception as e:
                with lock: fallos.setdefault(t, []).append(f"series: {str(e)[:160]}")
        time.sleep(0.25 + random.random() * 0.25)
        with lock: datos[t] = reg

    with ThreadPoolExecutor(max_workers=hilos) as ex:
        list(ex.map(uno, list(tickers) + list(extra)))
    # segunda pasada, más lenta, para los que han fallado (límite de peticiones de Yahoo)
    pendientes = [t for t in list(tickers) + list(extra) if t in fallos]
    if pendientes:
        time.sleep(45)
        for t in pendientes:
            fallos.pop(t, None)
            uno(t)
            time.sleep(1.0)
    return datos, fallos, cli.tipo


# ------------------------------------------------------------------ lista del S&P 500
def lista_sp500():
    """Lista de componentes con su clasificación GICS (sector y subindustria). Wikipedia y, si falla, el CSV de datasets."""
    import requests
    import pandas as pd
    cab = {"User-Agent": "simulador-sp500 (proyecto formativo; GitHub Actions)"}
    try:
        html = requests.get("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", headers=cab, timeout=30).text
        tabla = pd.read_html(io.StringIO(html), attrs={"id": "constituents"})[0]
        fuente = "Wikipedia (List of S&P 500 companies)"
    except Exception as e:
        print("Wikipedia no disponible, se usa el CSV de datasets:", e)
        csv = requests.get("https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv",
                           headers=cab, timeout=30).text
        tabla = pd.read_csv(io.StringIO(csv))
        fuente = "datasets/s-and-p-500-companies (GitHub)"
    col = {c.lower().strip(): c for c in tabla.columns}

    def c(*nombres):
        for n in nombres:
            if n in col: return col[n]
        return None
    filas = []
    for _, r in tabla.iterrows():
        sim = str(r[c("symbol")]).strip()
        filas.append({
            "ticker": sim.replace(".", "-"),
            "empresa": str(r[c("security", "name")]).strip(),
            "sector": str(r[c("gics sector")]).strip(),
            "subindustria": str(r[c("gics sub-industry")]).strip(),
            "sede": str(r[c("headquarters location")]).strip() if c("headquarters location") else None,
            "alta_indice": str(r[c("date added", "date first added")]).strip() if c("date added", "date first added") else None,
            "cik": str(r[c("cik")]).strip().zfill(10) if c("cik") else None,
            "fundada": str(r[c("founded")]).strip() if c("founded") else None,
        })
    return filas, fuente
