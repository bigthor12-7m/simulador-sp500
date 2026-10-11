# Simulador de valoración · S&P 500

App web instalable (PC y móvil) para valorar cualquier empresa del S&P 500 con los mismos criterios del modelo de las 7 Magníficas: DCF a 10 años por escenarios, valor terminal por inductores de valor y múltiplos adelantados de comparables. Incluye:

- **Buscador** de empresas por nombre o ticker (tecla `/`).
- **Navegación por sectores GICS**: mercado → sector → industria → empresa.
- **Mapa del mercado**: todas las empresas por sector, con un tamaño proporcional a su capitalización y el color de su potencial.
- **Ficha de cada empresa**: valor central, escenarios, sensibilidad WACC × g, crecimiento que descuenta la cotización, retorno de la nueva inversión, cotización de 5 años frente al S&P 500, historia de 10 años de la SEC, comparables, criterios de Graham, puntuación F de Piotroski, puesto en la fórmula mágica de Greenblatt y consenso de analistas, con supuestos ajustables.
- **Resultados y consenso**: próxima fecha de resultados, BPA esperado, sorpresas de los últimos trimestres y revisiones de las previsiones de los analistas; **dividendo** con su rentabilidad, payout, fecha ex-dividendo y años seguidos subiéndolo.
- **Excel con fórmulas** de la valoración de cada empresa (supuestos, tres escenarios, valor terminal, múltiplos y valor central).
- **Informe en PDF** de cada empresa, en castellano o en catalán, que se descarga con un botón desde su ficha: portada, resumen con puntos fuertes y riesgos, catalizadores, análisis financiero de 10 años, valoración, comparables, inversión en valor y calidad, conclusiones y fuentes. Se genera en el navegador (jsPDF) con los supuestos que tengas en el simulador; también se puede ver e imprimir en pantalla.
- **Mi cartera**: tus compras con su valor en dólares y euros, ganancia, potencial ponderado, dividendos, beta, peso por sector y próximos resultados.
- **Notas y alertas por empresa**: tu tesis y tus precios de compra, de venta o el margen de seguridad mínimo, con aviso en la app y, opcionalmente, por correo.
- **Tus datos en varios dispositivos**: un enlace o un fichero para pasar la cartera, las notas, las alertas y los escenarios al móvil o a otro ordenador (todo se guarda solo en el navegador).
- **Comparador** de hasta 5 empresas.
- **Oportunidades**: filtro de inversión en valor (margen de seguridad de Benjamin Graham) sobre el valor que elijas (bajo, DCF pesimista, central, DCF base o alto), con los criterios del inversor defensivo (a 10 años), Piotroski y Greenblatt, y descarga en CSV.
- **Seguimiento semanal** de cuatro estrategias frente al S&P 500, empresas que sigues, agenda de resultados y **avisos por correo** (un *issue* de GitHub cada lunes con las altas y bajas de cada estrategia, los movimientos de las empresas de `pipeline/avisos.json`, tus alertas y los próximos resultados; y otro cualquier día laborable en que una de tus alertas pase a cumplirse).
- **Supuestos generales** (tipo sin riesgo, prima de riesgo, g, probabilidades de los escenarios, peso del DCF) que recalculan todas las empresas al momento; se recuerdan en el navegador y se pueden guardar como escenarios con nombre.
- **Las 7 Magníficas** usan por defecto su valoración revisada en el [Simulador 7M](https://bigthor12-7m.github.io/simulador-7mag/) (se puede volver al modelo automático).
- **Glosario** y ayudas (ⓘ) junto a los términos técnicos.

La app está en `app/` y se publica en GitHub Pages. Funciona sin conexión con los últimos datos descargados.

## Instalar la app

Abre la dirección de GitHub Pages del repositorio (`https://<usuario>.github.io/simulador-sp500/`):

- **PC (Chrome o Edge)**: botón *Instalar* de la propia app o icono de instalar en la barra de direcciones.
- **Android (Chrome)**: menú ⋮ → *Instalar app*.
- **iPhone o iPad (Safari)**: *Compartir* → *Añadir a pantalla de inicio*.

## Cómo se actualiza

Cada lunes por la mañana, GitHub ejecuta el flujo **Actualizar datos** (`.github/workflows/actualizar.yml`):

1. `pipeline/descargar.py`: lista del S&P 500 con su clasificación GICS (Wikipedia); de Yahoo Finance, cotización, beta, consenso de analistas, estados financieros (últimos doce meses, último balance y cuatro años de historia), múltiplos y cotizaciones semanales de 5 años; de la SEC (`pipeline/sec.py`), diez años de ventas, beneficio, BPA, dividendos, patrimonio y flujo de explotación; y la valoración revisada de las 7 Magníficas que publica el Simulador 7M.
2. `pipeline/procesar.py`: aplica las reglas del modelo a todas las empresas (ver `pipeline/configuracion.json`), calcula Graham a 10 años, Piotroski y Greenblatt, detecta fusiones recientes y escribe `app/datos/`.
3. `pipeline/calcular.js`: valora todas las empresas con el mismo motor que la app (`app/motor.js`), añade la semana al histórico y al seguimiento de las estrategias y prepara los avisos.
4. Guarda los datos, abre el aviso semanal (issue), deja los datos brutos en la rama `brutos` (para revisarlos) y vuelve a publicar la app.

Además, de lunes a viernes a las 21:45 UTC (después del cierre de Wall Street), el flujo **Actualización diaria** (`.github/workflows/diario.yml`) ejecuta `pipeline/diario.py`, que actualiza solo las cotizaciones, la capitalización, el tipo sin riesgo y los múltiplos, y `pipeline/calcular.js --diario`, que recalcula las valoraciones con esos precios y comprueba tus alertas. Tarda un par de minutos y no consume nada de la parte de pago de GitHub (los repositorios públicos tienen Actions gratis).

Para cambiar los avisos por correo, edita `pipeline/avisos.json`: lista `seguir` y `umbral` de variación para el aviso del lunes, y `alertas` (`[{"t": "AAPL", "compra": 180, "venta": 260, "margen": 0.25}]`) para los avisos diarios. La página *Seguimiento › Tus datos* de la app te deja copiar tu configuración.

La consulta a la SEC necesita un *User-Agent* con un correo de contacto: se guarda en el secreto del repositorio `SEC_USER_AGENT` (*Settings › Secrets and variables › Actions*).

Si una empresa no se puede descargar una semana, se mantienen sus datos de la semana anterior y se avisa en la app. Si la descarga falla de forma general (menos de 300 empresas valoradas), no se sobrescribe nada.

Para actualizar a mano: pestaña **Actions** → **Actualizar datos** → **Run workflow**.

## Reglas del modelo (resumen)

- **Años 1–2**: consenso de ventas y BPA (mínimo, medio y máximo) llevado a doce meses desde el último trimestre publicado, como en el actualizador de las 7 Magníficas. El BPA se convierte en beneficio operativo con la diferencia que había en los últimos doce meses entre BPA publicado y beneficio operativo.
- **EBITA**: beneficio operativo antes de la amortización de intangibles adquiridos; la amortización que se suma al flujo es solo la de los activos propios.
- **Años 3–10**: crecimiento hacia el 3,5 % del año 10; margen hacia un valor de largo plazo que recorre un 30 % de la distancia hasta la mediana de sus comparables (con una banda de ±30 % sobre el del año 2). Pesimista −15 % de margen a largo plazo; optimista +10 %.
- **WACC**: CAPM con una beta que es la media de la de Yahoo y la de su industria reapalancada con su deuda (mínimo 0,6); coste de la deuda por rating sintético según la cobertura de intereses.
- **Valor terminal**: inductores de valor (ROIC terminal entre el WACC y el ROIC del año 10, tope del 40 %) o Gordon.
- **Múltiplos (empresas no financieras)**: PER y EV/EBITDA adelantados de las empresas de su misma subindustria GICS (de su industria si hay menos de cinco con múltiplos válidos, o de su sector si aun así hay menos de tres), las diez más parecidas en tamaño, sin PER > 60 ni EV/EBITDA > 40.
- **Valor central**: 50 % DCF ponderado (25/50/25) + 50 % media de los dos múltiplos.
- **Bancos, aseguradoras, gestoras, financieras y eléctricas reguladas**: modelo de **beneficio residual** (valor contable + valor actual de (ROE − Ke) × valor contable). ROE de los años 1–2 con el BPA del consenso, convergencia a Ke + 25/50/75 % del diferencial del año 2 según el escenario y reparto que converge a 1 − g / ROE. Múltiplos: PER adelantado y precio / valor contable.
- **REIT**: descuento del **AFFO** (≈ 85 % del FFO = beneficio + amortización − plusvalías), que crece como los ingresos del consenso en los años 1–2 y converge a g; múltiplos P/FFO y EV/EBITDA.
- **Beta de financieras, eléctricas y REIT**: media de la de Yahoo y la mediana de su industria (sin desapalancar), mínimo 0,6.

- **Fusiones, adquisiciones y consensos no comparables**: si el consenso del próximo trimestre prevé un salto de ventas incompatible con el último trimestre publicado, o parte de unas ventas del año anterior distintas de las publicadas (pro forma), los años 1–2 siguen la tendencia histórica y la valoración se marca como poco fiable para revisarla.
- **Graham a 10 años, Piotroski y Greenblatt**: beneficios y dividendos de los 10 últimos ejercicios (SEC) y crecimiento del BPA de al menos un tercio (medias de 3 años); nueve señales de Piotroski con los dos últimos ejercicios; fórmula mágica por EBIT / EV y EBIT / (activo fijo + NOF).

Las reglas son automáticas y no sustituyen el análisis de cada empresa: partidas extraordinarias o cambios de negocio pueden distorsionar una valoración. La app marca las valoraciones poco fiables.

## Estructura

| Carpeta | Contenido |
|---|---|
| `app/` | La app que se publica: página, estilos, motor de valoración (`motor.js`), código de las páginas (`js/`), datos, iconos, fuentes y el *service worker* |
| `app/datos/` | Empresas (datos, supuestos y múltiplos), descripciones, parámetros de mercado, resultados por defecto, histórico semanal, seguimiento de las estrategias, historia de la SEC (`historia.json`), cotizaciones de 5 años (`precios/`) y estado de la última actualización |
| `pipeline/` | Descarga, reglas del modelo (`configuracion.json`, `procesar.py`) y valoración por defecto (`calcular.js`) |
| `app/vendor/pdf/` | jsPDF y jsPDF-AutoTable y las fuentes en TTF para el informe en PDF (se cargan solo al pedir un PDF) |
| `.github/workflows/` | Actualización semanal, cotizaciones diarias, descarga de datos brutos y publicación en GitHub Pages |

## Fuentes y licencias

Datos: Yahoo Finance, SEC (EDGAR XBRL) y la lista de componentes del S&P 500 de Wikipedia. Fuentes tipográficas Inter y Lora (SIL Open Font License 1.1), la librería d3 (ISC) y jsPDF y jsPDF-AutoTable (MIT).

Herramienta con fines formativos: no constituye una recomendación de inversión.
