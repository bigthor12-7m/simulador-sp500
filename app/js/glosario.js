// Simulador S&P 500 · glosario y ayudas (ⓘ) junto a los términos técnicos.
(function (A) {
  const { h } = A;
  // [id, término, definición, grupo]
  const T = [
    ['valor-central', 'Valor central', 'Estimación del valor por acción que usa el simulador: por defecto, un 50 % el modelo intrínseco ponderado por escenarios (DCF, beneficio residual o AFFO) y un 50 % la media de los valores por múltiplos de sus comparables.', 'Valoración'],
    ['potencial', 'Potencial', 'Diferencia entre el valor central y la cotización, en porcentaje de la cotización: valor ÷ cotización − 1. Positivo si la empresa cotiza por debajo de su valor.', 'Valoración'],
    ['margen-seguridad', 'Margen de seguridad', 'Idea central de Benjamin Graham: comprar solo cuando el valor estimado supera con holgura a la cotización, para cubrir errores de estimación. Se mide como 1 − cotización ÷ valor: un margen del 25 % significa pagar 75 $ por cada 100 $ de valor.', 'Valoración'],
    ['escenarios', 'Escenarios', 'Pesimista, base y optimista: tres proyecciones con distinto crecimiento y margen (o ROE) a largo plazo. El valor intrínseco es su media ponderada (por defecto 25 % / 50 % / 25 %).', 'Valoración'],
    ['rango', 'Rango (valor bajo y alto)', 'Valor bajo: escenario pesimista combinado con el menor de los múltiplos; valor alto: escenario optimista con el mayor. Da una idea de la incertidumbre de la valoración.', 'Valoración'],
    ['dcf', 'DCF (descuento de flujos de caja)', 'Método que valora una empresa por el valor actual de los flujos de caja que generará en el futuro, descontados a la rentabilidad que exigen sus inversores (el WACC).', 'Modelos'],
    ['fcff', 'Flujo de caja libre (FCFF)', 'Caja que genera el negocio después de impuestos y de invertir lo necesario para crecer: NOPAT + amortización − CapEx − aumento de las NOF. Es para todos los inversores (accionistas y acreedores).', 'Modelos'],
    ['beneficio-residual', 'Beneficio residual', 'Beneficio que supera al coste de los recursos propios: (ROE − Ke) × valor contable. El valor de un banco o una aseguradora es su valor contable más el valor actual de esos beneficios extra.', 'Modelos'],
    ['ffo', 'FFO', 'Funds from operations: beneficio de un REIT + amortización de los inmuebles − plusvalías por ventas y otras partidas no recurrentes. Es la medida de beneficio habitual en el sector inmobiliario cotizado.', 'Modelos'],
    ['affo', 'AFFO', 'Adjusted FFO: el FFO menos la inversión de mantenimiento de los inmuebles. El simulador lo estima en el 85 % del FFO porque Yahoo no publica esa inversión por separado.', 'Modelos'],
    ['reit', 'REIT', 'Sociedad de inversión inmobiliaria cotizada. Reparte la mayor parte de su beneficio en dividendos y se valora por su AFFO.', 'Modelos'],
    ['valor-terminal', 'Valor terminal', 'Valor de todos los flujos más allá del año 10, resumido en una cifra. Suele ser más de la mitad del valor de una empresa, por eso el simulador avisa cuando pesa más del 85 %.', 'Modelos'],
    ['g', 'Crecimiento a perpetuidad (g)', 'Crecimiento anual que se supone a partir del año 11, para siempre. No puede superar al crecimiento nominal de la economía a largo plazo; por defecto, 3 %.', 'Modelos'],
    ['inductores', 'Valor terminal por inductores', 'NOPAT del año 11 × (1 − g ÷ ROIC) ÷ (WACC − g): tiene en cuenta que para crecer hay que invertir, y cuánto, según la rentabilidad de esa inversión.', 'Modelos'],
    ['gordon', 'Valor terminal de Gordon', 'Flujo del año 11 ÷ (tasa de descuento − g). Más sencillo que el de inductores, pero supone que la inversión del año 10 se mantiene en la misma proporción.', 'Modelos'],
    ['wacc', 'WACC', 'Coste medio ponderado del capital: la rentabilidad que exigen accionistas (Ke) y acreedores (Kd después de impuestos), ponderada por el peso de cada uno. Es la tasa a la que se descuentan los flujos de caja libres.', 'Coste del capital'],
    ['ke', 'Ke (coste de los recursos propios)', 'Rentabilidad que exigen los accionistas: tipo sin riesgo + beta × prima de riesgo de mercado (modelo CAPM).', 'Coste del capital'],
    ['kd', 'Kd (coste de la deuda)', 'Tipo de interés que pagaría la empresa por su deuda: tipo sin riesgo + diferencial según su rating sintético.', 'Coste del capital'],
    ['beta', 'Beta', 'Sensibilidad de la acción a los movimientos del mercado: 1 = se mueve como el mercado; 1,5 = un 50 % más. El simulador usa la media de la beta de Yahoo y la de su industria, con un mínimo de 0,6.', 'Coste del capital'],
    ['rf', 'Tipo sin riesgo', 'Rentabilidad del bono del Tesoro de EE. UU. a 10 años: lo que se obtiene sin asumir riesgo. Se actualiza cada semana.', 'Coste del capital'],
    ['erp', 'Prima de riesgo de mercado', 'Rentabilidad adicional que exigen los inversores por invertir en bolsa en vez de en bonos del Tesoro.', 'Coste del capital'],
    ['rating', 'Rating sintético', 'Calificación crediticia estimada con la cobertura de intereses (beneficio operativo ÷ gastos financieros), con la que se fija el diferencial del coste de la deuda.', 'Coste del capital'],
    ['ebita', 'EBITA', 'Beneficio operativo antes de la amortización de los intangibles adquiridos en compras de empresas. Refleja mejor la rentabilidad del negocio que el EBIT contable.', 'Cuentas'],
    ['nopat', 'NOPAT', 'Beneficio operativo después de impuestos: EBITA × (1 − tipo impositivo). Es lo que gana el negocio sin tener en cuenta cómo se financia.', 'Cuentas'],
    ['capex', 'CapEx', 'Inversión en activos fijos (fábricas, centros de datos, equipos…).', 'Cuentas'],
    ['nof', 'NOF', 'Necesidades operativas de fondos (capital circulante): existencias y clientes menos proveedores. Si la empresa crece, normalmente aumentan y consumen caja.', 'Cuentas'],
    ['ttm', 'TTM', 'Trailing twelve months: los últimos doce meses publicados (suma de los cuatro últimos trimestres).', 'Cuentas'],
    ['bpa', 'BPA', 'Beneficio por acción: beneficio neto ÷ número de acciones.', 'Cuentas'],
    ['consenso', 'Consenso de analistas', 'Media (y mínimo y máximo) de las previsiones de ventas y BPA de los analistas que siguen a la empresa, según Yahoo Finance. El simulador lo usa en los años 1 y 2.', 'Cuentas'],
    ['roic', 'ROIC', 'Rentabilidad sobre el capital invertido: NOPAT ÷ (activo fijo + NOF). Una empresa crea valor cuando su ROIC supera al WACC.', 'Rentabilidad'],
    ['ronic', 'RONIC', 'Rentabilidad de la nueva inversión: lo que aporta al NOPAT cada dólar invertido para crecer. Con un RONIC igual al WACC, crecer no crea valor.', 'Rentabilidad'],
    ['roe', 'ROE', 'Rentabilidad sobre los recursos propios: beneficio ÷ valor contable (patrimonio).', 'Rentabilidad'],
    ['implicito', 'Lo que descuenta la cotización', 'Crecimiento (o ROE a largo plazo) con el que el caso base del modelo daría exactamente la cotización actual. Sirve para ver si el mercado espera más o menos que el modelo.', 'Rentabilidad'],
    ['per', 'PER', 'Precio ÷ beneficio por acción. El adelantado usa el BPA previsto para los próximos doce meses; el TTM, el de los últimos doce meses.', 'Múltiplos'],
    ['ev-ebitda', 'EV/EBITDA', 'Valor de la empresa (capitalización + deuda neta) ÷ beneficio antes de intereses, impuestos y amortizaciones. Compara empresas con distinta deuda.', 'Múltiplos'],
    ['pb', 'Precio / valor contable (P/VC)', 'Cotización ÷ valor contable por acción. Muy usado en bancos y aseguradoras.', 'Múltiplos'],
    ['pffo', 'P/FFO', 'Cotización ÷ FFO por acción: el PER de los REIT.', 'Múltiplos'],
    ['comparables', 'Comparables', 'Empresas del S&P 500 de la misma subindustria (o industria, o sector si hay pocas) y tamaño parecido, cuyos múltiplos medianos se aplican a la empresa.', 'Múltiplos'],
    ['graham', 'Criterios de Graham', 'Las condiciones del inversor defensivo de The Intelligent Investor: tamaño, solidez financiera, beneficios y dividendos estables, crecimiento del BPA y un precio moderado (PER ≤ 15 y P/VC ≤ 1,5).', 'Inversión en valor'],
    ['numero-graham', 'Número de Graham', '√(22,5 × BPA × valor contable por acción): el precio máximo que pagaría el inversor defensivo de Graham (PER de 15 × P/VC de 1,5).', 'Inversión en valor'],
    ['piotroski', 'Puntuación F de Piotroski', 'Nueve señales sencillas de solidez y mejora (rentabilidad, flujo de caja, deuda, liquidez, emisión de acciones, margen y rotación) que suman de 0 a 9. Joseph Piotroski la usó para separar las empresas baratas buenas de las malas.', 'Inversión en valor'],
    ['greenblatt', 'Fórmula mágica de Greenblatt', 'Ordena las empresas por rentabilidad del beneficio (EBIT ÷ valor de la empresa) y por rentabilidad del capital (EBIT ÷ activo fijo + NOF), y se queda con las que suman mejor puesto. Excluye financieras y eléctricas.', 'Inversión en valor'],
    ['fiable', 'Valoración fiable', 'Sin avisos graves: beneficio operativo positivo, patrimonio positivo en todos los escenarios, valor central entre el 20 % y el triple de la cotización, datos en dólares y un consenso comparable con las últimas cifras publicadas (sin una fusión o venta de negocio que las cuentas todavía no recojan).', 'Inversión en valor'],
    ['sec', 'SEC (historia de 10 años)', 'La Securities and Exchange Commission publica los estados financieros que presentan las empresas cotizadas en EE. UU. El simulador toma de ahí los diez últimos ejercicios para los criterios de Graham a 10 años y la historia de cada empresa.', 'Datos'],
    ['revisada', 'Valoración revisada (7M)', 'Las 7 Magníficas tienen una valoración revisada empresa a empresa en el Simulador 7M (crecimiento, márgenes, inversión, comparables). El simulador del S&P 500 la usa por defecto; se puede desactivar en los supuestos generales.', 'Datos'],
  ];
  A.GLOS = Object.fromEntries(T.map(([id, t, d, g]) => [id, { id, t, d, g }]));

  // ---------------------------------------------------------------- ayuda emergente
  let pop = null, actual = null;
  function cerrar() { if (pop) { pop.hidden = true; if (actual) actual.setAttribute('aria-expanded', 'false'); actual = null; } }
  function abrir(btn, id) {
    const g = A.GLOS[id]; if (!g) return;
    if (!pop) {
      pop = h('div', { class: 'ap-pop', role: 'dialog', hidden: true });
      document.body.append(pop);
      document.addEventListener('click', (ev) => { if (pop && !pop.hidden && !pop.contains(ev.target) && !ev.target.closest('.ap-ay')) cerrar(); });
      document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cerrar(); });
      window.addEventListener('hashchange', cerrar);
      window.addEventListener('scroll', cerrar, { passive: true });
    }
    if (actual === btn) { cerrar(); return; }
    pop.replaceChildren(h('p', { class: 'ap-pop-t' }, g.t), h('p', null, g.d), h('a', { href: '#/glosario/' + id }, 'Ver el glosario ›'));
    pop.setAttribute('aria-label', g.t);
    pop.hidden = false;
    const r = btn.getBoundingClientRect(), pw = Math.min(300, window.innerWidth - 24);
    pop.style.width = pw + 'px';
    const left = Math.max(12, Math.min(window.innerWidth - pw - 12, r.left + r.width / 2 - pw / 2));
    const ph = pop.offsetHeight;
    const top = r.bottom + 8 + ph > window.innerHeight && r.top - ph - 8 > 0 ? r.top - ph - 8 : r.bottom + 8;
    pop.style.left = left + 'px'; pop.style.top = top + window.scrollY + 'px';
    if (actual) actual.setAttribute('aria-expanded', 'false');
    actual = btn; btn.setAttribute('aria-expanded', 'true');
  }
  // botón ⓘ con la definición de un término del glosario
  A.ayuda = function (id) {
    const g = A.GLOS[id]; if (!g) return null;
    const b = h('button', { type: 'button', class: 'ap-ay', 'aria-label': `Qué es: ${g.t}`, 'aria-expanded': 'false', title: g.t }, 'i');
    b.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); abrir(b, id); });
    return b;
  };
  // etiqueta con ayuda: [texto, ⓘ]
  A.conAyuda = (txt, id) => [txt, ' ', A.ayuda(id)];

  // ---------------------------------------------------------------- página del glosario
  A.vistas.glosario = function (main, [id]) {
    const grupos = [...new Set(T.map((x) => x[3]))];
    const q = h('input', { type: 'search', class: 'ap-in ap-glos-in', placeholder: 'Buscar un término…', 'aria-label': 'Buscar en el glosario', id: 'glos-bus' });
    const lista = h('div');
    const pintarLista = () => {
      const s = A.sinAcentos(q.value.trim());
      lista.replaceChildren(...grupos.map((gr) => {
        const items = T.filter((x) => x[3] === gr && (!s || A.sinAcentos(x[1] + ' ' + x[2]).includes(s)));
        if (!items.length) return null;
        return A.tarjeta(gr, null, h('dl', { class: 'ap-glos' }, items.map(([k, t, d]) => [h('dt', { id: 'g-' + k, class: k === id ? 'ap-glos-sel' : null }, t), h('dd', null, d)])));
      }).filter(Boolean));
      if (!lista.children.length) lista.append(h('p', { class: 'sv-card-n' }, 'Ningún término coincide.'));
    };
    q.addEventListener('input', pintarLista);
    main.append(A.migas([['Método', '#/metodo'], ['Glosario']]),
      h('header', { class: 'sv-head' }, h('h1', { class: 'sv-h1' }, 'Glosario'),
        h('p', { class: 'sv-take' }, 'Los términos que usa el simulador, explicados en una o dos frases. En la app, el botón ⓘ junto a un término abre su definición.')),
      h('section', { class: 'sv-card' }, q), lista);
    pintarLista();
    if (id) requestAnimationFrame(() => { const el = document.getElementById('g-' + id); if (el) el.scrollIntoView({ block: 'center' }); });
  };
})(window.APP);
