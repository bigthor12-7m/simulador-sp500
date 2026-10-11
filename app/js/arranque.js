// Simulador S&P 500 · arranque, instalación y funcionamiento sin conexión.
(function (A) {
  A.VERSION = '1.2.0';
  const $ = A.$;
  const v = $('#ap-version'); if (v) v.textContent = `App ${A.VERSION}.`;
  const sup = $('#ap-sup');
  if (window.matchMedia('(max-width: 1099px)').matches) sup.open = false;

  // service worker: la app funciona sin conexión con los últimos datos descargados
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    let recargado = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!recargado && navigator.serviceWorker.controller) { recargado = true; location.reload(); } });
  }
  let diferido = null;
  const bi = $('#ap-instalar');
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); diferido = e; bi.hidden = false; });
  bi.addEventListener('click', async () => { if (!diferido) return; diferido.prompt(); try { await diferido.userChoice; } catch (e) {} diferido = null; bi.hidden = true; });
  window.addEventListener('appinstalled', () => { bi.hidden = true; });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let visto = false;
  try { visto = localStorage.getItem('ap-ios-visto') === '1'; } catch (e) {}
  if (ios && !instalada && !visto) $('#ap-ios').hidden = false;
  $('#ap-ios-x').addEventListener('click', () => { $('#ap-ios').hidden = true; try { localStorage.setItem('ap-ios-visto', '1'); } catch (e) {} });
  const off = $('#ap-off');
  const conexion = () => { off.hidden = navigator.onLine; };
  conexion();
  window.addEventListener('online', conexion);
  window.addEventListener('offline', conexion);

  // tema y tamaño: volver a pintar los gráficos
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => A.programar());
  let ancho = document.documentElement.clientWidth;
  window.addEventListener('resize', () => { const w = document.documentElement.clientWidth; if (w !== ancho) { ancho = w; A.programar(); } });
  window.addEventListener('hashchange', () => A.programar());

  A.cargar().then(() => {
    A.montarControles();
    A.montarBuscador();
    A.pintarEstado();
    A.pintar();
  }).catch((err) => {
    console.error(err);
    const main = $('#vista');
    main.replaceChildren(A.h('header', { class: 'sv-head' }, A.h('h1', { class: 'sv-h1' }, 'Simulador S&P 500'),
      A.h('p', { class: 'sv-warn' }, 'No se han podido cargar los datos. Comprueba la conexión y vuelve a abrir la app.')));
  });
})(window.APP);
