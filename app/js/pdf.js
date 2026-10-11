// Simulador S&P 500 · informe en PDF. Se pinta el informe fuera de la pantalla (con los colores claros) y se convierte en
// un PDF A4 con portada, cabecera y pie, tablas (jsPDF-AutoTable) y los gráficos de la app como imágenes. Todo ocurre en el
// navegador: no se envía nada a ningún servidor.
(function (A) {
  const { jsPDF } = window.jspdf;
  const C = { navy: [22, 41, 74], oro: [168, 131, 74], fg: [29, 35, 43], muted: [94, 103, 115], linea: [221, 226, 232], fondo: [243, 245, 248],
    ok: [31, 122, 77], bad: [176, 58, 46], warn: [138, 94, 0], s1: [43, 99, 168], blanco: [255, 255, 255] };
  const PAG = { w: 210, h: 297, ml: 16, mr: 16, mt: 22, mb: 18 };
  const ANCHO = PAG.w - PAG.ml - PAG.mr;
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (n) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });

  // ---------------------------------------------------------------- fuentes
  let FUENTES = null;
  const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  async function fuentes() {
    if (FUENTES) return FUENTES;
    const nombres = ['Inter-Regular', 'Inter-SemiBold', 'Lora-Regular', 'Lora-SemiBold'];
    const ttf = await Promise.all(nombres.map((n) => fetch(`vendor/pdf/${n}.ttf`).then((r) => r.arrayBuffer()).then(b64)));
    const woff = await Promise.all(['Inter-Regular', 'Inter-SemiBold'].map((n) => fetch(`fuentes/${n}.woff`).then((r) => r.arrayBuffer()).then(b64)));
    FUENTES = { ttf: Object.fromEntries(nombres.map((n, i) => [n, ttf[i]])), woff };
    return FUENTES;
  }
  function registrar(doc, F) {
    for (const [n, d] of Object.entries(F.ttf)) doc.addFileToVFS(n + '.ttf', d);
    doc.addFont('Inter-Regular.ttf', 'Inter', 'normal'); doc.addFont('Inter-SemiBold.ttf', 'Inter', 'bold');
    doc.addFont('Lora-Regular.ttf', 'Lora', 'normal'); doc.addFont('Lora-SemiBold.ttf', 'Lora', 'bold');
  }
  // caracteres que no están en las fuentes
  const limpiar = (s, lang) => String(s || '').replace(/[ \t\r\n\u202f]+/g, ' ').replace(/ (%|\$|M\$)(?=[\s).,;:]|$)/g, '\u00a0$1').replace(/√\(/g, lang === 'ca' ? 'arrel de (' : 'raíz de (').replace(/[✓✔]/g, '').replace(/[✗✘]/g, '').trim();

  // ---------------------------------------------------------------- gráficos SVG -> PNG
  const PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'visibility'];
  async function svgAPng(svg, F) {
    const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    let x0 = vb[0] || 0, w = vb[2] || svg.clientWidth;
    const hgt = vb[3] || svg.clientHeight;
    try { // etiquetas que se salen por la izquierda o la derecha (p. ej., más largas al traducirlas)
      const bb = svg.getBBox();
      if (bb.width && bb.x < x0 - 0.5) { w += x0 - (bb.x - 2); x0 = bb.x - 2; }
      if (bb.width && bb.x + bb.width > x0 + w + 0.5) w = bb.x + bb.width + 2 - x0;
    } catch (e) { /* sin caja */ }
    const clon = svg.cloneNode(true);
    const orig = [svg, ...svg.querySelectorAll('*')], cop = [clon, ...clon.querySelectorAll('*')];
    orig.forEach((el, i) => {
      const cs = getComputedStyle(el), d = cop[i];
      for (const p of PROPS) { const x = cs.getPropertyValue(p); if (x) d.style.setProperty(p, x); }
      if (el.tagName === 'text' || el.tagName === 'tspan') d.style.setProperty('font-family', 'InterPdf, Arial, sans-serif');
    });
    clon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clon.setAttribute('width', w); clon.setAttribute('height', hgt); clon.setAttribute('viewBox', `${x0} ${vb[1] || 0} ${w} ${hgt}`);
    clon.removeAttribute('style');
    const st = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    st.textContent = `@font-face{font-family:InterPdf;src:url(data:font/woff;base64,${F.woff[0]}) format("woff");font-weight:400}` +
      `@font-face{font-family:InterPdf;src:url(data:font/woff;base64,${F.woff[1]}) format("woff");font-weight:600}`;
    clon.insertBefore(st, clon.firstChild);
    const txt = new XMLSerializer().serializeToString(clon);
    const url = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
      await espera(30);
      const k = 2, cv = document.createElement('canvas');
      cv.width = Math.round(w * k); cv.height = Math.round(hgt * k);
      const cx = cv.getContext('2d');
      cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      return { data: cv.toDataURL('image/png'), w, h: hgt };
    } finally { URL.revokeObjectURL(url); }
  }

  // ---------------------------------------------------------------- maquetación
  function Maqueta(doc, lang) {
    let y = PAG.mt;
    const lim = () => PAG.h - PAG.mb;
    const M = {
      get y() { return y; }, set y(v) { y = v; },
      nueva() { doc.addPage(); y = PAG.mt; },
      asegurar(alto) { if (y + alto > lim()) M.nueva(); },
      texto(s, o = {}) {
        s = limpiar(s, lang); if (!s) return;
        const tam = o.tam || 9.2, lh = tam * 0.3528 * (o.lh || 1.42);
        doc.setFont(o.fuente || 'Inter', o.estilo || 'normal'); doc.setFontSize(tam); doc.setTextColor(...(o.color || C.fg));
        const x = PAG.ml + (o.sangria || 0), ancho = ANCHO - (o.sangria || 0);
        const lineas = doc.splitTextToSize(s, ancho);
        for (const l of lineas) { M.asegurar(lh); doc.text(l, x, y + lh * 0.78); y += lh; }
        y += o.despues != null ? o.despues : 1.6;
      },
      vineta(s, o = {}) {
        s = limpiar(s, lang); if (!s) return;
        const tam = o.tam || 9.2, lh = tam * 0.3528 * 1.42;
        doc.setFont('Inter', 'normal'); doc.setFontSize(tam);
        const lineas = doc.splitTextToSize(s, ANCHO - 6);
        M.asegurar(lh * Math.min(2, lineas.length));
        doc.setTextColor(...(o.color || C.oro)); doc.text('•', PAG.ml + 1, y + lh * 0.78);
        doc.setTextColor(...C.fg);
        for (const l of lineas) { M.asegurar(lh); doc.text(l, PAG.ml + 6, y + lh * 0.78); y += lh; }
        y += 1;
      },
      h2(s, minimo) {
        M.asegurar(minimo || 60); if (y > PAG.mt + 2) y += 4;
        doc.setFont('Lora', 'bold'); doc.setFontSize(14); doc.setTextColor(...C.navy);
        doc.text(limpiar(s, lang), PAG.ml, y + 5.2);
        y += 7.6; doc.setDrawColor(...C.oro); doc.setLineWidth(0.4); doc.line(PAG.ml, y, PAG.ml + ANCHO, y); y += 4;
      },
      h3(s, minimo) {
        M.asegurar(minimo || 30); y += 1.5;
        doc.setFont('Inter', 'bold'); doc.setFontSize(10.2); doc.setTextColor(...C.navy);
        const lineas = doc.splitTextToSize(limpiar(s, lang), ANCHO);
        for (const l of lineas) { doc.text(l, PAG.ml, y + 3.8); y += 4.8; }
        y += 1.2;
      },
      nota(s) { M.texto(s, { tam: 7.8, color: C.muted, lh: 1.35, despues: 2 }); },
      imagen(im, maxAlto) {
        let w = ANCHO, hh = ANCHO * im.h / im.w;
        if (maxAlto && hh > maxAlto) { hh = maxAlto; w = hh * im.w / im.h; }
        M.asegurar(hh + 2);
        doc.addImage(im.data, 'PNG', PAG.ml + (ANCHO - w) / 2, y, w, hh, undefined, 'FAST');
        y += hh + 3;
      },
      duo(cols) {
        const gap = 6, cw = (ANCHO - gap) / 2;
        const altos = cols.map((c) => (c.titulo ? 4.5 : 0) + (c.leyenda && c.leyenda.length ? 5 : 0) + (c.img ? cw * c.img.h / c.img.w : 0));
        M.asegurar(Math.max(...altos) + 3);
        const y0 = y;
        cols.forEach((c, i) => {
          const x0 = PAG.ml + i * (cw + gap); let yy = y0;
          if (c.titulo) { doc.setFont('Inter', 'normal'); doc.setFontSize(7.8); doc.setTextColor(...C.muted); doc.text(doc.splitTextToSize(limpiar(c.titulo, lang), cw)[0], x0, yy + 3); yy += 4.5; }
          if (c.leyenda && c.leyenda.length) {
            doc.setFontSize(7.2); let x = x0;
            for (const [t, col] of c.leyenda) { const tx = limpiar(t, lang), tw = doc.getTextWidth(tx) + 6.5; doc.setFillColor(...col); doc.rect(x, yy + 1, 4, 1.5, 'F'); doc.setTextColor(...C.muted); doc.text(tx, x + 5, yy + 2.5); x += tw + 2.5; }
            yy += 5;
          }
          if (c.img) { const hh = cw * c.img.h / c.img.w; doc.addImage(c.img.data, 'PNG', x0, yy, cw, hh, undefined, 'FAST'); yy += hh; }
        });
        y = y0 + Math.max(...altos) + 4;
      },
      leyenda(items) {
        const tam = 7.6; doc.setFont('Inter', 'normal'); doc.setFontSize(tam);
        let x = PAG.ml; M.asegurar(5);
        for (const [t, col] of items) {
          const tw = doc.getTextWidth(limpiar(t, lang)) + 7;
          if (x + tw > PAG.ml + ANCHO) { x = PAG.ml; y += 4.2; M.asegurar(5); }
          doc.setFillColor(...col); doc.rect(x, y + 1, 4, 1.6, 'F');
          doc.setTextColor(...C.muted); doc.text(limpiar(t, lang), x + 5.2, y + 2.6);
          x += tw + 3;
        }
        y += 5.5;
      },
      tabla(cab, filas, o = {}) {
        const ncol = Math.max(cab ? cab.length : 0, ...filas.map((f) => f.length));
        const tam = o.tam || (ncol > 9 ? 6.6 : ncol > 6 ? 7.4 : 8);
        const est = (filas.length + (cab ? 1 : 0)) * (tam * 0.3528 * 1.25 + 2.6);
        M.asegurar(filas.length <= 8 ? Math.min(est, 120) : 14);
        const estilos = filas.map((f) => f.map((c) => c.estilo || null));
        doc.autoTable({
          startY: y, margin: { left: PAG.ml, right: PAG.mr, top: PAG.mt, bottom: PAG.mb }, theme: 'plain', rowPageBreak: 'avoid', showHead: 'everyPage',
          head: cab ? [cab.map((c) => limpiar(c.t != null ? c.t : c, lang))] : undefined,
          body: filas.map((f) => f.map((c) => limpiar(c.t, lang))),
          styles: { font: 'Inter', fontSize: tam, textColor: C.fg, cellPadding: { top: 1.2, bottom: 1.2, left: 1.4, right: 1.4 }, lineColor: C.linea, overflow: 'linebreak', valign: 'middle' },
          headStyles: { font: 'Inter', fontStyle: 'bold', textColor: C.muted, fillColor: C.fondo, halign: 'right' },
          columnStyles: Object.assign({ 0: { halign: 'left', cellWidth: o.ancho0 || 'auto' } }, o.columnas || {}),
          alternateRowStyles: o.sinAlternar ? undefined : { fillColor: [250, 251, 252] },
          didParseCell(dt) {
            if (dt.section === 'head' && dt.column.index === 0) dt.cell.styles.halign = 'left';
            if (dt.section === 'head' && o.columnas && o.columnas[dt.column.index] && o.columnas[dt.column.index].halign) dt.cell.styles.halign = o.columnas[dt.column.index].halign;
            if (dt.section !== 'body') return;
            const es = (estilos[dt.row.index] || [])[dt.column.index];
            if (dt.column.index > 0 && !(o.columnas && o.columnas[dt.column.index] && o.columnas[dt.column.index].halign)) dt.cell.styles.halign = 'right';
            if (!es) return;
            if (es.color) dt.cell.styles.textColor = es.color;
            if (es.negrita) dt.cell.styles.fontStyle = 'bold';
            if (es.marca) dt.cell.styles.minCellWidth = 6;
          },
          didDrawCell(dt) {
            if (dt.section !== 'body') return;
            const es = (estilos[dt.row.index] || [])[dt.column.index];
            if (!es || !es.marca) return;
            const cx = dt.cell.x + 3, cy = dt.cell.y + dt.cell.height / 2;
            doc.setLineWidth(0.45);
            if (es.marca === 'ok') { doc.setDrawColor(...C.ok); doc.line(cx - 1.4, cy, cx - 0.4, cy + 1.1); doc.line(cx - 0.4, cy + 1.1, cx + 1.6, cy - 1.3); }
            else if (es.marca === 'no') { doc.setDrawColor(...C.bad); doc.line(cx - 1.2, cy - 1.2, cx + 1.2, cy + 1.2); doc.line(cx - 1.2, cy + 1.2, cx + 1.2, cy - 1.2); }
            else { doc.setDrawColor(...C.muted); doc.line(cx - 1, cy, cx + 1, cy); }
          },
        });
        y = doc.lastAutoTable.finalY + (o.despues != null ? o.despues : 3.5);
      },
    };
    return M;
  }

  // ---------------------------------------------------------------- DOM del informe -> PDF
  const colorDe = (el) => { const s = el && el.querySelector && el.querySelector('.sv-pos, .sv-neg'); const k = el && el.classList; if ((k && k.contains('sv-pos')) || (s && s.classList.contains('sv-pos'))) return C.ok; if ((k && k.contains('sv-neg')) || (s && s.classList.contains('sv-neg'))) return C.bad; return null; };
  function leerTabla(t) {
    const cab = [...t.querySelectorAll('thead th')].map((th) => ({ t: th.innerText }));
    const filas = [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => ({ t: td.innerText, estilo: { color: colorDe(td), negrita: td.classList.contains('sv-strong') } })));
    return { cab, filas };
  }
  // ¿le sigue un gráfico enseguida? (para no dejar un título o una leyenda al final de la página)
  const esGraf = (x) => x.classList.contains('sv-chart') || (x.classList.contains('sv-grid2') && x.querySelector('.sv-chart'));
  function conGrafico(n, k = 3) {
    let x = n.nextElementSibling;
    for (let i = 0; x && i < k; i++, x = x.nextElementSibling) { if (esGraf(x)) return true; if (x.tagName === 'TABLE' || x.classList.contains('sv-tw') || x.tagName === 'H2' || x.tagName === 'H3') return false; }
    return false;
  }
  const RGB = (css) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || ''); return m ? [+m[1], +m[2], +m[3]] : C.s1; };
  async function recorrer(el, M, F, ctx) {
    for (const n of [...el.children]) {
      const cl = n.classList;
      if (n.hidden || cl.contains('no-print') || cl.contains('sv-seg') || cl.contains('sv-tip') || cl.contains('ap-ay') || n.tagName === 'BUTTON' || n.tagName === 'INPUT' || n.tagName === 'SELECT') continue;
      if (cl.contains('ap-inf-cab') || cl.contains('ap-inf-res')) continue;          // van en la portada
      const sig = n.nextElementSibling, prim = sig && (sig.tagName === 'H3' ? sig : sig.classList.contains('sv-card') ? sig.firstElementChild : null);
      const minimo = conGrafico(n) ? 78 : prim && conGrafico(prim) ? 95 : null;
      if (n.tagName === 'H2' && !cl.contains('sv-card-t')) { M.h2(n.innerText, minimo); continue; }
      if (n.tagName === 'H2' || n.tagName === 'H3') { M.h3(n.innerText, minimo); continue; }
      if (cl.contains('sv-detail-h')) { const t = n.querySelector('h2, h3'); if (t) M.h3(t.innerText, conGrafico(n) ? 85 : null); continue; }
      if (cl.contains('sv-grid2') && n.children.length === 2 && [...n.children].every((c) => c.querySelectorAll('.sv-chart svg').length === 1 && !c.querySelector('table'))) {
        const cols = [];
        for (const c of n.children) {
          const tit = c.querySelector('.ap-mini-t, h3'), ley = c.querySelector('.sv-legend');
          let img = null; try { img = await svgAPng(c.querySelector('.sv-chart svg'), F); } catch (e) { console.warn('gráfico', e); }
          cols.push({ titulo: tit ? tit.innerText : '', leyenda: ley ? [...ley.children].map((s) => [s.innerText, RGB(getComputedStyle(s.firstElementChild || s).backgroundColor)]) : [], img });
        }
        M.duo(cols); continue;
      }
      if (cl.contains('sv-chart')) {
        const svg = n.querySelector('svg');
        if (svg) { try { M.imagen(await svgAPng(svg, F), ctx.maxImg); } catch (e) { console.warn('gráfico', e); } }
        else if (n.innerText.trim()) M.nota(n.innerText);
        continue;
      }
      if (cl.contains('sv-legend')) { if (conGrafico(n, 1)) M.asegurar(70); M.leyenda([...n.children].map((s) => [s.innerText, RGB(getComputedStyle(s.firstElementChild || s).backgroundColor)])); continue; }
      if (cl.contains('sv-card-n') || cl.contains('sv-kpi-r') || cl.contains('ap-mini-t') || cl.contains('sv-ctrl-d')) { M.nota(n.innerText); continue; }
      if (cl.contains('ap-inf-pie')) { M.y += 2; M.nota(n.innerText); continue; }
      if (cl.contains('ap-f')) { M.texto(n.innerText, { fuente: 'Lora', estilo: 'bold', tam: 13, color: C.navy, despues: 1 }); continue; }
      if (cl.contains('ap-inf-av')) {
        const items = [...n.querySelectorAll('li')].map((li) => li.innerText);
        M.asegurar(10); const y0 = M.y;
        M.texto(n.querySelector('p') ? n.querySelector('p').innerText : '', { estilo: 'bold', tam: 8.6, color: C.warn, sangria: 3, despues: 0.6 });
        for (const it of items) M.texto('· ' + it, { tam: 8.2, sangria: 3, despues: 0.4 });
        ctx.doc.setDrawColor(...C.oro); ctx.doc.setLineWidth(0.8); if (M.y > y0) ctx.doc.line(PAG.ml, y0, PAG.ml, M.y);
        M.y += 2; continue;
      }
      if (n.tagName === 'TABLE' || cl.contains('sv-tw')) {
        const t = n.tagName === 'TABLE' ? n : n.querySelector('table');
        if (!t) continue;
        const { cab, filas } = leerTabla(t);
        const opc = {};
        if (t.classList.contains('ap-ratios')) opc.columnas = { 1: { halign: 'right', cellWidth: 26 }, 2: { halign: 'left' } }, opc.ancho0 = 58;
        if (t.classList.contains('ap-hist') || t.classList.contains('ap-proy')) opc.ancho0 = cab.length > 9 ? 34 : 'auto';
        M.tabla(cab.length ? cab : null, filas, opc);
        continue;
      }
      if (n.tagName === 'DL') {
        const dts = [...n.querySelectorAll('dt')], dds = [...n.querySelectorAll('dd')];
        M.tabla(null, dts.map((dt, i) => [{ t: dt.innerText, estilo: { color: C.muted } }, { t: dds[i] ? dds[i].innerText : '', estilo: { color: colorDe(dds[i]) } }]),
          { columnas: { 0: { halign: 'left', cellWidth: 72 }, 1: { halign: 'left' } }, sinAlternar: true, tam: 8 });
        continue;
      }
      if (n.tagName === 'UL' && cl.contains('ap-checks')) {
        const filas = [...n.children].map((li) => {
          const marca = li.classList.contains('ap-ok') ? 'ok' : li.classList.contains('ap-no') ? 'no' : 'na';
          const t = (li.querySelector('.ap-check-t') || li).innerText, v = (li.querySelector('.ap-check-v') || {}).innerText || '';
          return [{ t: '', estilo: { marca } }, { t, estilo: { color: marca === 'no' || marca === 'na' ? C.muted : null } }, { t: v, estilo: { color: C.muted } }];
        });
        M.tabla(null, filas, { columnas: { 0: { cellWidth: 6 }, 1: { halign: 'left' }, 2: { halign: 'right', cellWidth: 52 } }, sinAlternar: true, tam: 8 });
        continue;
      }
      if (n.tagName === 'UL' || n.tagName === 'OL') {
        const col = cl.contains('ap-fuertes') ? C.ok : cl.contains('ap-riesgos') ? C.bad : C.oro;
        for (const li of n.children) M.vineta(li.innerText, { color: col, tam: cl.contains('ap-fuentes') ? 8 : 9.2 });
        M.y += 1; continue;
      }
      if (n.tagName === 'P') { if (n.innerText.trim()) M.texto(n.innerText); continue; }
      await recorrer(n, M, F, ctx);
    }
  }

  // ---------------------------------------------------------------- portada, cabecera y pie
  function portada(doc, art, lang, e, imgMetodo) {
    const L = (es, ca) => (lang === 'ca' ? ca : es);
    doc.setFillColor(...C.navy); doc.rect(0, 0, PAG.w, 92, 'F');
    doc.setFillColor(...C.oro); doc.rect(0, 92, PAG.w, 1.2, 'F');
    const mini = art.querySelector('.ap-inf-mini'), h1 = art.querySelector('.ap-inf-cab h1'), sub = art.querySelector('.ap-inf-sub');
    doc.setFont('Inter', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...C.oro);
    doc.text(limpiar(mini ? mini.innerText : '', lang).toUpperCase(), PAG.ml, 22, { charSpace: 0.3 });
    doc.setFont('Lora', 'bold'); doc.setFontSize(25); doc.setTextColor(...C.blanco);
    const tl = doc.splitTextToSize(limpiar(h1 ? h1.innerText : e.empresa, lang), ANCHO);
    let y = 38; for (const l of tl.slice(0, 3)) { doc.text(l, PAG.ml, y); y += 10; }
    doc.setFont('Inter', 'normal'); doc.setFontSize(9.5); doc.setTextColor(214, 222, 233);
    for (const l of doc.splitTextToSize(limpiar(sub ? sub.innerText : '', lang), ANCHO).slice(0, 3)) { doc.text(l, PAG.ml, y + 2); y += 5; }
    // indicadores
    const cajas = [...art.querySelectorAll('.ap-inf-res > div')];
    const bw = (ANCHO - 3 * 4) / 4;
    cajas.forEach((cj, i) => {
      const [lab, val, ref] = [...cj.querySelectorAll('p')].map((p) => limpiar(p.innerText, lang));
      const x = PAG.ml + i * (bw + 4), y0 = 102;
      doc.setFillColor(...C.fondo); doc.setDrawColor(...C.linea); doc.roundedRect(x, y0, bw, 30, 2, 2, 'FD');
      doc.setFont('Inter', 'normal'); doc.setFontSize(7.4); doc.setTextColor(...C.muted); doc.text(doc.splitTextToSize(lab || '', bw - 6)[0], x + 3, y0 + 6);
      const val_ = cj.querySelector('.ap-inf-n, .ap-inf-v');
      const esN = val_ && val_.classList.contains('ap-inf-n');
      doc.setFont(esN ? 'Lora' : 'Inter', esN ? 'normal' : 'bold'); doc.setFontSize(esN ? 17 : 9.6);
      doc.setTextColor(...(colorDe(val_) || C.navy));
      const vl = doc.splitTextToSize(val || '', bw - 6);
      vl.slice(0, esN ? 1 : 3).forEach((l, k) => doc.text(l, x + 3, y0 + (esN ? 17 : 13) + k * 4.3));
      doc.setFont('Inter', 'normal'); doc.setFontSize(7.2); doc.setTextColor(...C.muted);
      doc.splitTextToSize(ref || '', bw - 6).slice(0, 2).forEach((l, k) => doc.text(l, x + 3, y0 + 24.5 + k * 3.2));
    });
    // resumen, puntos fuertes y riesgos, y valor por método (si cabe)
    const res = art.querySelector('h2 + p');
    const tope = PAG.h - 22;
    let yy = 142;
    doc.setFont('Lora', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...C.navy); doc.text(L('En pocas palabras', 'En poques paraules'), PAG.ml, yy); yy += 6;
    doc.setFont('Inter', 'normal'); doc.setFontSize(9.2); doc.setTextColor(...C.fg);
    const lineas = doc.splitTextToSize(limpiar(res ? res.innerText : '', lang), ANCHO);
    for (const l of lineas.slice(0, 8)) { doc.text(l, PAG.ml, yy); yy += 4.5; }
    const cols = [[L('A favor', 'A favor'), art.querySelectorAll('.ap-fuertes li'), C.ok], [L('En contra', 'En contra'), art.querySelectorAll('.ap-riesgos li'), C.bad]];
    if (cols.some(([, li]) => li.length)) {
      yy += 4;
      const cw = (ANCHO - 8) / 2;
      let fin = yy;
      cols.forEach(([tit, lis, col], i) => {
        const x0 = PAG.ml + i * (cw + 8); let y1 = yy;
        doc.setFont('Inter', 'bold'); doc.setFontSize(9.4); doc.setTextColor(...col); doc.text(tit, x0, y1); y1 += 5;
        doc.setFont('Inter', 'normal'); doc.setFontSize(8.2);
        for (const li of [...lis].slice(0, 3)) {
          const ls = doc.splitTextToSize(limpiar(li.innerText, lang), cw - 4).slice(0, 3);
          if (y1 + ls.length * 3.7 > tope - 40) break;
          doc.setTextColor(...col); doc.text('•', x0, y1);
          doc.setTextColor(...C.fg); ls.forEach((l, k) => doc.text(l, x0 + 3.5, y1 + k * 3.7));
          y1 += ls.length * 3.7 + 1.4;
        }
        if (!lis.length) { doc.setTextColor(...C.muted); doc.text(L('Nada destacable con los datos disponibles.', 'Res destacable amb les dades disponibles.'), x0, y1); y1 += 4; }
        fin = Math.max(fin, y1);
      });
      yy = fin + 2;
    }
    if (imgMetodo && tope - yy > 38) {
      yy += 4;
      doc.setFont('Inter', 'bold'); doc.setFontSize(9.6); doc.setTextColor(...C.navy); doc.text(L('Valor por acción según el método', 'Valor per acció segons el mètode'), PAG.ml, yy); yy += 3;
      const hh = Math.min(58, tope - yy, ANCHO * imgMetodo.h / imgMetodo.w), w = hh * imgMetodo.w / imgMetodo.h;
      doc.addImage(imgMetodo.data, 'PNG', PAG.ml + (ANCHO - w) / 2, yy, w, hh, undefined, 'FAST');
    }
    doc.setFont('Inter', 'normal'); doc.setFontSize(7.4); doc.setTextColor(...C.muted);
    const pie = L('Simulador S&P 500 · modelo automático con datos de Yahoo Finance y de la SEC. Herramienta formativa: no es una recomendación de inversión.',
      'Simulador S&P 500 · model automàtic amb dades de Yahoo Finance i de la SEC. Eina formativa: no és una recomanació d\'inversió.');
    doc.splitTextToSize(pie, ANCHO).forEach((l, k) => doc.text(l, PAG.ml, PAG.h - 14 + k * 3.4));
  }
  function cabecerasYPies(doc, e, lang, fechaTxt) {
    const n = doc.getNumberOfPages();
    for (let i = 2; i <= n; i++) {
      doc.setPage(i);
      doc.setFont('Inter', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...C.muted);
      doc.text(`${e.empresa} (${e.ticker}) · ${lang === 'ca' ? 'Informe de valoració' : 'Informe de valoración'}`, PAG.ml, 12);
      doc.text(fechaTxt, PAG.w - PAG.mr, 12, { align: 'right' });
      doc.setDrawColor(...C.oro); doc.setLineWidth(0.3); doc.line(PAG.ml, 14.5, PAG.w - PAG.mr, 14.5);
      doc.setDrawColor(...C.linea); doc.line(PAG.ml, PAG.h - 12, PAG.w - PAG.mr, PAG.h - 12);
      doc.text(lang === 'ca' ? 'Simulador S&P 500 · eina formativa: no és una recomanació d\'inversió' : 'Simulador S&P 500 · herramienta formativa: no es una recomendación de inversión', PAG.ml, PAG.h - 7.5);
      doc.text(`${i} / ${n}`, PAG.w - PAG.mr, PAG.h - 7.5, { align: 'right' });
    }
  }

  // ---------------------------------------------------------------- informe completo
  A.pdfInforme = async function (t, lang) {
    const e = A.D.porT[t];
    const F = await fuentes();
    const H = await A.cargarHistoria();
    // el informe, pintado fuera de la pantalla con los colores claros
    const cont = document.createElement('div');
    cont.className = 'pdf-claro pdf-lienzo';
    document.body.append(cont);
    try {
      const art = A.vistas.informe(cont, [t], { sinBarra: true, historia: H, lang });
      if (!art) throw new Error('Sin informe');
      if (lang === 'ca') A.catala(art);
      await frames(3); await espera(900); await frames(2);   // gráficos (se dibujan en el siguiente fotograma) y cotizaciones
      if (lang === 'ca') { await espera(150); A.catala(art); }
      art.querySelectorAll('.ap-ay, .sv-tip').forEach((x) => x.remove());
      const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
      registrar(doc, F);
      doc.setProperties({ title: `${e.empresa} (${e.ticker}) · ${lang === 'ca' ? 'Informe de valoració' : 'Informe de valoración'}`, subject: 'Simulador S&P 500', creator: 'Simulador S&P 500' });
      // portada
      const caja = [...art.querySelectorAll('h3')].find((x) => /^Valor (por|per) /.test(x.innerText));
      let imgMet = null;
      const chM = caja && caja.nextElementSibling && caja.nextElementSibling.classList.contains('sv-chart') ? caja.nextElementSibling.querySelector('svg') : null;
      if (chM) imgMet = await svgAPng(chM, F);
      portada(doc, art, lang, e, imgMet);
      // cuerpo
      doc.addPage();
      const M = Maqueta(doc, lang);
      await recorrer(art, M, F, { doc, maxImg: 95 });
      const fechaTxt = (art.querySelector('.ap-inf-mini') || {}).innerText || '';
      cabecerasYPies(doc, e, lang, limpiar(fechaTxt.split('·').pop(), lang));
      const nombre = `${lang === 'ca' ? 'informe-valoracio' : 'informe-valoracion'}-${e.ticker}-${((A.D.estado || {}).fecha_mercado || 'hoy')}.pdf`;
      doc.save(nombre);
      return nombre;
    } finally { cont.remove(); }
  };
})(window.APP);
