"""Diagnóstico: cuántos puntos anuales devuelve fundamentals-timeseries según los parámetros."""
import json, sys, time, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import yahoo
cli = yahoo.Cliente()
out = {}
tipos = "annualNetIncomeCommonStockholders,annualCashDividendsPaid,annualDilutedEPS,annualTotalRevenue"
for nombre, p1 in (("2016", 1451606400), ("2010", 1262304000), ("2000", 946684800)):
    for t in ("AAPL", "KO"):
        j = cli.get(f"https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{t}",
                    {"symbol": t, "type": tipos, "period1": p1, "period2": int(time.time()) + 86400, "merge": "false", "padTimeSeries": "true", "lang": "en-US", "region": "US"})
        res = {}
        for r in j["timeseries"]["result"]:
            ty = r["meta"]["type"][0]
            res[ty] = [(x or {}).get("asOfDate") for x in r.get(ty) or []]
        out[f"{nombre}-{t}"] = res
# también el módulo quoteSummary con historiales anuales
j = cli.get("https://query2.finance.yahoo.com/v10/finance/quoteSummary/AAPL", {"modules": "incomeStatementHistory,cashflowStatementHistory,earnings"})
r = j["quoteSummary"]["result"][0]
out["qs_income"] = [(x.get("endDate", {}).get("fmt"), (x.get("netIncome") or {}).get("raw")) for x in r.get("incomeStatementHistory", {}).get("incomeStatementHistory", [])]
out["qs_cash"] = [(x.get("endDate", {}).get("fmt"), (x.get("dividendsPaid") or {}).get("raw")) for x in r.get("cashflowStatementHistory", {}).get("cashflowStatements", [])]
out["qs_earnings"] = r.get("earnings", {}).get("financialsChart", {}).get("yearly")
json.dump(out, open(sys.argv[1], "w"), indent=1)
