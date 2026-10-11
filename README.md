# Simulador de valoración · S&P 500

App web instalable (PC y móvil) para valorar cualquier empresa del S&P 500 con los mismos criterios del modelo de las 7 Magníficas: DCF a 10 años por escenarios, valor terminal por inductores de valor y múltiplos adelantados de comparables. Incluye:

- **Buscador** de empresas por nombre o ticker (tecla `/`).
- **Navegación por sectores GICS**: mercado → sector → industria → empresa.
- **Ficha de cada empresa**: valor central, escenarios, sensibilidad WACC × g, crecimiento que descuenta la cotización, retorno de la nueva inversión, comparables, criterios de Graham y consenso de analistas, con supuestos ajustables.
- **Informe** imprimible de cada empresa (se guarda en PDF desde el navegador).
- **Comparador** de hasta 5 empresas.
- **Oportunidades**: filtro de inversión en valor (margen de seguridad de Benjamin Graham) sobre el valor que elijas (bajo, DCF pesimista, central, DCF base o alto), con los criterios del inversor defensivo, y descarga en CSV.
- **Supuestos generales** (tipo sin riesgo, prima de riesgo, g, probabilidades de los escenarios, peso del DCF) que recalculan todas las empresas al momento.

La app está en `app/` y se publica en GitHub Pages. Funciona sin conexión con los últimos datos descargados.

## Instalar la app

Abre la dirección de GitHub Pages del repositorio (`https://<usuario>.github.io/simulador-sp500/`):

- **PC (Chrome o Edge)**: botón *Instalar* de la propia app o icono de instalar en la barra de direcciones.
- **Android (Chrome)**: menú ⋮ → *Instalar app*.
- **iPhone o iPad (Safari)**: *Compartir* → *Añadir a pantalla de inicio*.

## Cómo se actualiza

Cada lunes por la mañana, GitHub ejecuta el flujo **Actualizar datos** (`.github/workflows/actualizar.yml`):

1. `pipeline/descargar.py`: lista del S&P 500 con su clasificación GICS (Wikipedia) y, de Yahoo Finance, cotización, beta, consenso de analistas, estados financieros (últimos doce meses, último balance y cuatro años de historia) y múltiplos de cada empresa.
2. `pipeline/procesar.py`: aplica las reglas del modelo a todas las empresas (ver `pipeline/configuracion.json`) y escribe `app/datos/`.
3. `pipeline/calcular.js`: valora todas las empresas con el mismo motor que la app (`app/motor.js`) y añade la semana al histórico.
4. Guarda los datos, deja los datos brutos en la rama `brutos` (para revisarlos) y vuelve a publicar la app.

Si una empresa no se puede descargar una semana, se mantienen sus datos de la semana anterior y se avisa en la app. Si la descarga falla de forma general (menos de 300 empresas valoradas), no se sobrescribe nada.

Para actualizar a mano: pestaña **Actions** → **Actualizar datos** → **Run workflow**.

## Reglas del modelo (resumen)

- **Años 1–2**: consenso de ventas y BPA (mínimo, medio y máximo) llevado a doce meses desde el último trimestre publicado, como en el actualizador de las 7 Magníficas. El BPA se convierte en beneficio operativo con la diferencia que había en los últimos doce meses entre BPA publicado y beneficio operativo.
- **EBITA**: beneficio operativo antes de la amortización de intangibles adquiridos; la amortización que se suma al flujo es solo la de los activos propios.
- **Años 3–10**: crecimiento hacia el 3,5 % del año 10; margen hacia un valor de largo plazo que recorre un 30 % de la distancia hasta la mediana de sus comparables (con una banda de ±30 % sobre el del año 2). Pesimista −15 % de margen a largo plazo; optimista +10 %.
- **WACC**: CAPM con una beta que es la media de la de Yahoo y la de su industria reapalancada con su deuda (mínimo 0,6); coste de la deuda por rating sintético según la cobertura de intereses.
- **Valor terminal**: inductores de valor (ROIC terminal entre el WACC y el ROIC del año 10, tope del 40 %) o Gordon.
- **Múltiplos**: PER y EV/EBITDA adelantados de las empresas de su misma subindustria GICS (de su industria si hay menos de cinco con múltiplos válidos, o de su sector si aun así hay menos de tres), las diez más parecidas en tamaño, sin PER > 60 ni EV/EBITDA > 40.
- **Valor central**: 50 % DCF ponderado (25/50/25) + 50 % media de los dos múltiplos.
- **Fase 1**: no se valoran bancos, aseguradoras, gestoras ni REIT (necesitan un modelo de rentabilidad sobre recursos propios o de valor de los activos).

Las reglas son automáticas y no sustituyen el análisis de cada empresa: fusiones recientes, partidas extraordinarias o cambios de negocio pueden distorsionar una valoración. La app marca las valoraciones poco fiables.

## Estructura

| Carpeta | Contenido |
|---|---|
| `app/` | La app que se publica: página, estilos, motor de valoración (`motor.js`), código de las páginas (`js/`), datos, iconos, fuentes y el *service worker* |
| `app/datos/` | Empresas (datos, supuestos y múltiplos), descripciones, parámetros de mercado, resultados por defecto, histórico semanal y estado de la última actualización |
| `pipeline/` | Descarga, reglas del modelo (`configuracion.json`, `procesar.py`) y valoración por defecto (`calcular.js`) |
| `.github/workflows/` | Actualización semanal, descarga de datos brutos y publicación en GitHub Pages |

## Fuentes y licencias

Datos: Yahoo Finance y la lista de componentes del S&P 500 de Wikipedia. Fuentes tipográficas Inter y Lora (SIL Open Font License 1.1) y la librería d3 (ISC).

Herramienta con fines formativos: no constituye una recomendación de inversión.
