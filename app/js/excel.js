// Simulador S&P 500 · exporta la valoración de una empresa a Excel (.xlsx) construida con fórmulas.
// Sin dependencias: escribe el SpreadsheetML a mano y lo empaqueta en un ZIP sin comprimir. Cada fórmula lleva además su
// valor calculado (para los visores que no recalculan); Excel, LibreOffice, Numbers y Google Sheets recalculan al abrir.
(function (raiz) {
  // ======================================================================= ZIP (método "store") y CRC-32
  const TABLA = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TABLA[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(ficheros) {
    const enc = new TextEncoder(), trozos = [], central = [];
    const ahora = new Date();
    const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
    const dia = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
    let off = 0;
    for (const f of ficheros) {
      const nom = enc.encode(f.nombre), d = typeof f.datos === 'string' ? enc.encode(f.datos) : f.datos, crc = crc32(d);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, hora, true); lh.setUint16(12, dia, true); lh.setUint32(14, crc, true); lh.setUint32(18, d.length, true); lh.setUint32(22, d.length, true);
      lh.setUint16(26, nom.length, true); lh.setUint16(28, 0, true);
      trozos.push(new Uint8Array(lh.buffer), nom, d);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, hora, true); ch.setUint16(14, dia, true); ch.setUint32(16, crc, true); ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true);
      ch.setUint16(28, nom.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nom);
      off += 30 + nom.length + d.length;
    }
    const tamC = central.reduce((s, x) => s + x.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(4, 0, true); fin.setUint16(6, 0, true); fin.setUint16(8, ficheros.length, true); fin.setUint16(10, ficheros.length, true);
    fin.setUint32(12, tamC, true); fin.setUint32(16, off, true); fin.setUint16(20, 0, true);
    const partes = trozos.concat(central, [new Uint8Array(fin.buffer)]);
    const out = new Uint8Array(partes.reduce((s, x) => s + x.length, 0));
    let p = 0; for (const x of partes) { out.set(x, p); p += x.length; }
    return out;
  }

  // ======================================================================= libro de Excel mínimo
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const letra = (c) => { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
  // estilos (índices de cellXfs)
  const S = { txt: 0, b: 1, tit: 2, nota: 3, cab: 4, n0: 5, n2: 6, p1: 7, p2: 8, f4: 9, in0: 10, in2: 11, ip1: 12, ip2: 13, r2: 14, rp: 15, b0: 16, x1: 17, ix1: 18, b2: 19, cabn: 20 };
  const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="6"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0.00"/><numFmt numFmtId="166" formatCode="0.0%"/><numFmt numFmtId="167" formatCode="0.00%"/><numFmt numFmtId="168" formatCode="0.0000"/><numFmt numFmtId="169" formatCode="0.0&quot;x&quot;"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="14"/><color rgb="FF16294A"/><name val="Calibri"/><family val="2"/></font><font><i/><sz val="10"/><color rgb="FF666666"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="21">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="165" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="166" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="167" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="165" fontId="1" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf numFmtId="166" fontId="1" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="169" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="169" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  class Hoja {
    constructor(nombre) { this.nombre = nombre; this.celdas = new Map(); this.anchos = {}; this.congelar = null; }
    // valor: número, texto o {f: 'fórmula sin =', v: valor calculado}
    set(c, r, valor, estilo = 0) { if (!this.celdas.has(r)) this.celdas.set(r, new Map()); this.celdas.get(r).set(c, { valor, estilo }); return this.ref(c, r); }
    ref(c, r) { return `'${this.nombre}'!$${letra(c)}$${r}`; }
    loc(c, r) { return `${letra(c)}${r}`; }
    xml(activa) {
      const filas = [...this.celdas.keys()].sort((a, b) => a - b).map((r) => {
        const cs = [...this.celdas.get(r).entries()].sort((a, b) => a[0] - b[0]).map(([c, { valor, estilo }]) => {
          const at = `r="${letra(c)}${r}"${estilo ? ` s="${estilo}"` : ''}`;
          if (valor == null || valor === '') return `<c ${at}/>`;
          if (typeof valor === 'number') return isFinite(valor) ? `<c ${at}><v>${valor}</v></c>` : `<c ${at}/>`;
          if (typeof valor === 'object') {
            const v = valor.v;
            if (typeof v === 'string') return `<c ${at} t="str"><f>${esc(valor.f)}</f><v>${esc(v)}</v></c>`;
            return `<c ${at}><f>${esc(valor.f)}</f>${v != null && isFinite(v) ? `<v>${v}</v>` : ''}</c>`;
          }
          return `<c ${at} t="inlineStr"><is><t xml:space="preserve">${esc(valor)}</t></is></c>`;
        }).join('');
        return `<row r="${r}">${cs}</row>`;
      }).join('');
      const cols = Object.keys(this.anchos).sort((a, b) => a - b).map((c) => `<col min="${c}" max="${c}" width="${this.anchos[c]}" customWidth="1"/>`).join('');
      const pane = this.congelar ? `<pane xSplit="${this.congelar[0]}" ySplit="${this.congelar[1]}" topLeftCell="${letra(this.congelar[0] + 1)}${this.congelar[1] + 1}" activePane="bottomRight" state="frozen"/>` : '';
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${activa ? ' tabSelected="1"' : ''} showGridLines="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${filas}</sheetData></worksheet>`;
    }
  }
  function libro(hojas) {
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((h, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${hojas.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
    const wbr = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((h, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    return zip([{ nombre: '[Content_Types].xml', datos: ct }, { nombre: '_rels/.rels', datos: rels }, { nombre: 'xl/workbook.xml', datos: wb },
      { nombre: 'xl/_rels/workbook.xml.rels', datos: wbr }, { nombre: 'xl/styles.xml', datos: ESTILOS }].concat(hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: h.xml(i === 0) }))));
  }

  // ======================================================================= la valoración
  const ESC = ['pes', 'base', 'opt'], NOM = { pes: 'pesimista', base: 'base', opt: 'optimista' };
  const COLS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];   // años 1 a 10 en las columnas C a L

  // hoja de supuestos con filas que se van añadiendo; R guarda la referencia absoluta de cada dato y V su valor
  function hojaSupuestos(titulo) {
    const h = new Hoja('Supuestos'), R = {}, V = {};
    h.anchos = { 1: 58, 2: 16, 3: 70 };
    h.set(1, 1, titulo, S.tit);
    h.set(1, 2, 'Celdas amarillas: supuestos que puedes cambiar; el resto son fórmulas. Importes en millones de dólares salvo indicación.', S.nota);
    let r = 3;
    const api = {
      h, R, V,
      cab(t) { r++; h.set(1, r, t, S.cab); h.set(2, r, '', S.cab); h.set(3, r, '', S.cab); r++; },
      dato(k, et, v, st, nota) { h.set(1, r, et); h.set(2, r, v == null ? 0 : v, st); if (nota) h.set(3, r, nota, S.nota); R[k] = h.ref(2, r); V[k] = v == null ? 0 : v; r++; },
      calc(k, et, f, v, st, nota) { h.set(1, r, et, S.b); h.set(2, r, { f, v }, st); if (nota) h.set(3, r, nota, S.nota); R[k] = h.ref(2, r); V[k] = v; r++; },
    };
    return api;
  }
  // cabecera de una hoja de escenario: años 1–10 en C–L
  function hojaAnual(nombre, titulo, nota, col0) {
    const h = new Hoja(nombre);
    h.anchos = { 1: 46, 2: 14 }; for (const c of COLS) h.anchos[c] = 12;
    h.congelar = [1, 4];
    h.set(1, 1, titulo, S.tit); h.set(1, 2, nota, S.nota);
    h.set(1, 4, 'Año', S.cab); h.set(2, 4, col0, S.cabn);
    COLS.forEach((c, k) => h.set(c, 4, k + 1, S.cabn));
    return h;
  }
  const pow = Math.pow;

  // ---------------------------------------------------------------- DCF de flujos de caja libres
  function supuestosFcff(e, par, aj, U) {
    const beta = aj && aj.beta != null ? aj.beta : e.beta, dif = e.diferencial != null ? e.diferencial : par.spread;
    U.cab('Mercado y coste del capital');
    U.dato('cot', 'Cotización ($ por acción)', e.cotizacion, S.in2);
    U.dato('acc', 'Acciones diluidas (millones)', e.acciones_m, S.in2);
    U.dato('rf', 'Tipo sin riesgo (Treasury a 10 años)', par.rf, S.ip2);
    U.dato('erp', 'Prima de riesgo de mercado', par.erp, S.ip2);
    U.dato('beta', 'Beta', beta, S.in2);
    U.dato('pp', 'Prima por riesgo país', e.prima_pais || 0, S.ip2);
    const R = U.R, V = U.V;
    U.calc('ke', 'Ke = tipo sin riesgo + beta × prima + prima país', `${R.rf}+${R.beta}*${R.erp}+${R.pp}`, V.rf + V.beta * V.erp + V.pp, S.p2);
    U.dato('dif', `Diferencial de la deuda${e.revisada_activa ? ' (Simulador 7M)' : e.rating ? ` (rating sintético ${e.rating})` : ''}`, dif, S.ip2);
    U.calc('kd', 'Kd = tipo sin riesgo + diferencial', `${R.rf}+${R.dif}`, V.rf + V.dif, S.p2);
    U.dato('deuda', 'Deuda financiera bruta', e.deuda_bruta, S.in0);
    U.calc('capb', 'Capitalización bursátil', `${R.cot}*${R.acc}`, V.cot * V.acc, S.n0);
    const wd = V.deuda + V.capb > 0 ? V.deuda / (V.deuda + V.capb) : 0;
    U.calc('wd', 'Peso de la deuda', `IF(${R.deuda}+${R.capb}>0,${R.deuda}/(${R.deuda}+${R.capb}),0)`, wd, S.p1);
    U.dato('t', 'Tipo impositivo', e.tipo_impositivo, S.ip1);
    U.dato('dw', 'Ajuste adicional al WACC', par.dwacc || 0, S.ip2);
    U.calc('w', 'WACC', `(1-${R.wd})*${R.ke}+${R.wd}*${R.kd}*(1-${R.t})+${R.dw}`, (1 - wd) * V.ke + wd * V.kd * (1 - V.t) + V.dw, S.rp);
    U.cab('Valor terminal y escenarios');
    U.dato('g', 'Crecimiento a perpetuidad (g)', par.g, S.ip2);
    U.dato('vt', 'Método del valor terminal (1 = inductores, 0 = Gordon)', par.metodoVt === 'gordon' ? 0 : 1, S.in0);
    U.dato('tope', 'ROIC terminal máximo', par.roicTope, S.ip1);
    for (const sc of ESC) U.dato('fr_' + sc, `Convergencia del ROIC terminal · ${NOM[sc]}`, par.fr[sc], S.ip1, sc === 'pes' ? 'Parte de la distancia entre el ROIC del año 10 y el WACC que se mantiene a perpetuidad' : null);
    probabilidades(U, par);
    U.cab('Cifras de partida (últimos doce meses)');
    U.dato('v0', 'Ventas', e.ventas_ttm, S.in0);
    U.dato('ebit0', 'EBITA (beneficio operativo antes de amortizar intangibles adquiridos)', e.ebit_ttm, S.in0);
    U.dato('nof0', 'NOF / ventas', e.nof_ventas_ttm, S.ip1);
    U.dato('ic0', 'Capital invertido', e.capital_invertido, S.in0);
    U.dato('d', 'Años desde el último cierre hasta la fecha de valoración', e.anios_hasta_valoracion, S.in2);
    U.cab('Del valor de la empresa al del accionista');
    U.dato('dfn', 'Deuda financiera neta', e.deuda_financiera_neta, S.in0);
    U.dato('min', 'Minoritarios', e.minoritarios || 0, S.in0);
    U.dato('pref', 'Preferentes', e.preferentes || 0, S.in0);
    U.dato('inv', 'Inversiones no operativas', e.inversiones_no_operativas || 0, S.in0);
  }
  function probabilidades(U, par) {
    const R = U.R, V = U.V;
    U.dato('pr_pes', 'Probabilidad del escenario pesimista', par.prob.pes, S.ip1);
    U.dato('pr_opt', 'Probabilidad del escenario optimista', par.prob.opt, S.ip1);
    U.calc('pr_base', 'Probabilidad del caso base', `1-${R.pr_pes}-${R.pr_opt}`, 1 - V.pr_pes - V.pr_opt, S.p1);
    U.dato('peso', 'Peso del modelo intrínseco en el valor central (el resto, múltiplos)', par.pesoDcf, S.ip1);
  }

  function hojaFcff(e, sc, cam, U) {
    const R = U.R, V = U.V;
    const h = hojaAnual(`DCF ${NOM[sc]}`, `DCF · escenario ${NOM[sc]}`, 'Millones de dólares. En amarillo, los supuestos de cada año: crecimiento, margen EBITA y amortización, CapEx y NOF sobre ventas.', 'TTM');
    const fila = (r, et, st) => h.set(1, r, et, st || S.txt);
    const L = (c, r) => h.loc(c, r);
    // valores
    const X = []; let vPrev = V.v0, nofPrev = V.v0 * V.nof0, ic = V.ic0;
    for (let k = 0; k < 10; k++) {
      const v = vPrev * (1 + cam.gr[k]), ebit = v * cam.mg[k], nopat = ebit * (1 - V.t), da = v * cam.da[k], cx = v * cam.cx[k], nof = v * cam.nf[k];
      const dnof = nof - nofPrev, reinv = cx - da + dnof, fcff = nopat - reinv, fd = pow(1 + V.w, -(k + 1 - 0.5 - V.d));
      X.push({ v, ebit, nopat, da, cx, nof, dnof, reinv, fcff, fd, va: fcff * fd, ic });
      ic += reinv; vPrev = v; nofPrev = nof;
    }
    fila(5, 'Crecimiento de las ventas'); fila(6, 'Ventas', S.b); fila(7, 'Margen EBITA'); fila(8, 'EBITA'); fila(9, 'NOPAT = EBITA × (1 − tipo impositivo)', S.b);
    fila(10, 'Amortización / ventas'); fila(11, 'Amortización'); fila(12, 'CapEx / ventas'); fila(13, 'CapEx'); fila(14, 'NOF / ventas'); fila(15, 'NOF');
    fila(16, 'Variación de las NOF'); fila(17, 'Inversión neta = CapEx − amortización + variación NOF'); fila(18, 'Flujo de caja libre = NOPAT − inversión neta', S.b);
    fila(19, 'Factor de descuento (mitad de año)'); fila(20, 'Valor actual del flujo'); fila(21, 'Capital invertido al inicio del año');
    h.set(2, 6, { f: R.v0, v: V.v0 }, S.n0);
    h.set(2, 7, { f: `${R.ebit0}/${R.v0}`, v: V.ebit0 / V.v0 }, S.p1);
    h.set(2, 8, { f: R.ebit0, v: V.ebit0 }, S.n0);
    h.set(2, 9, { f: `B8*(1-${R.t})`, v: V.ebit0 * (1 - V.t) }, S.n0);
    h.set(2, 14, { f: R.nof0, v: V.nof0 }, S.p1);
    h.set(2, 15, { f: 'B6*B14', v: V.v0 * V.nof0 }, S.n0);
    COLS.forEach((c, k) => {
      const x = X[k], p = c - 1;
      h.set(c, 5, cam.gr[k], S.ip1);
      h.set(c, 6, { f: `${L(p, 6)}*(1+${L(c, 5)})`, v: x.v }, S.n0);
      h.set(c, 7, cam.mg[k], S.ip1);
      h.set(c, 8, { f: `${L(c, 6)}*${L(c, 7)}`, v: x.ebit }, S.n0);
      h.set(c, 9, { f: `${L(c, 8)}*(1-${R.t})`, v: x.nopat }, S.n0);
      h.set(c, 10, cam.da[k], S.ip1);
      h.set(c, 11, { f: `${L(c, 6)}*${L(c, 10)}`, v: x.da }, S.n0);
      h.set(c, 12, cam.cx[k], S.ip1);
      h.set(c, 13, { f: `${L(c, 6)}*${L(c, 12)}`, v: x.cx }, S.n0);
      h.set(c, 14, cam.nf[k], S.ip1);
      h.set(c, 15, { f: `${L(c, 6)}*${L(c, 14)}`, v: x.nof }, S.n0);
      h.set(c, 16, { f: `${L(c, 15)}-${L(p, 15)}`, v: x.dnof }, S.n0);
      h.set(c, 17, { f: `${L(c, 13)}-${L(c, 11)}+${L(c, 16)}`, v: x.reinv }, S.n0);
      h.set(c, 18, { f: `${L(c, 9)}-${L(c, 17)}`, v: x.fcff }, S.b0);
      h.set(c, 19, { f: `(1+${R.w})^-(${L(c, 4)}-0.5-${R.d})`, v: x.fd }, S.f4);
      h.set(c, 20, { f: `${L(c, 18)}*${L(c, 19)}`, v: x.va }, S.n0);
      h.set(c, 21, k === 0 ? { f: R.ic0, v: x.ic } : { f: `${L(p, 21)}+${L(p, 17)}`, v: x.ic }, S.n0);
    });
    const f10 = X[9], sumaVa = X.reduce((s, x) => s + x.va, 0);
    const roic10 = f10.ic > 0 ? f10.nopat / f10.ic : V.w;
    const rt = Math.max(V.w + V['fr_' + sc] * (Math.min(Math.max(roic10, V.w), V.tope) - V.w), V.g + 0.005);
    const nopat11 = f10.ebit * (1 + V.g) * (1 - V.t);
    const tv = V.vt === 1 ? nopat11 * (1 - V.g / rt) / (V.w - V.g) : f10.fcff * (1 + V.g) / (V.w - V.g);
    const vaTv = tv * pow(1 + V.w, -(10 - V.d)), ev = sumaVa + vaTv, eq = ev - V.dfn - V.min - V.pref + V.inv;
    const B = [
      [23, 'Suma del valor actual de los flujos (años 1–10)', { f: 'SUM(C20:L20)', v: sumaVa }, S.n0],
      [24, 'ROIC del año 10 = NOPAT ÷ capital invertido', { f: `IF(L21>0,L9/L21,${R.w})`, v: roic10 }, S.p1],
      [25, 'ROIC terminal = WACC + convergencia × (ROIC del año 10 acotado − WACC)', { f: `MAX(${R.w}+${R['fr_' + sc]}*(MIN(MAX(B24,${R.w}),${R.tope})-${R.w}),${R.g}+0.005)`, v: rt }, S.p1],
      [26, 'NOPAT del año 11', { f: `L8*(1+${R.g})*(1-${R.t})`, v: nopat11 }, S.n0],
      [27, 'Valor terminal en el año 10', { f: `IF(${R.vt}=1,B26*(1-${R.g}/B25)/(${R.w}-${R.g}),L18*(1+${R.g})/(${R.w}-${R.g}))`, v: tv }, S.n0],
      [28, 'Valor actual del valor terminal', { f: `B27*(1+${R.w})^-(10-${R.d})`, v: vaTv }, S.n0],
      [29, 'Valor de la empresa', { f: 'B23+B28', v: ev }, S.b0],
      [30, '− Deuda financiera neta', { f: `-${R.dfn}`, v: -V.dfn }, S.n0],
      [31, '− Minoritarios', { f: `-${R.min}`, v: -V.min }, S.n0],
      [32, '− Preferentes', { f: `-${R.pref}`, v: -V.pref }, S.n0],
      [33, '+ Inversiones no operativas', { f: R.inv, v: V.inv }, S.n0],
      [34, 'Valor del patrimonio', { f: 'SUM(B29:B33)', v: eq }, S.b0],
      [35, 'Valor por acción ($)', { f: `B34/${R.acc}`, v: eq / V.acc }, S.r2],
      [36, 'Peso del valor terminal', { f: 'B28/B29', v: vaTv / ev }, S.p1],
    ];
    for (const [r, et, v, st] of B) { h.set(1, r, et, r === 35 || r === 29 || r === 34 ? S.b : S.txt); h.set(2, r, v, st); }
    h.set(1, 38, 'Valor terminal por inductores: NOPAT del año 11 × (1 − g ÷ ROIC terminal) ÷ (WACC − g). Gordon: flujo del año 10 × (1 + g) ÷ (WACC − g).', S.nota);
    return { hoja: h, vps: { ref: h.ref(2, 35), v: eq / V.acc } };
  }

  // ---------------------------------------------------------------- beneficio residual
  function supuestosKe(e, par, aj, U) {
    const beta = aj && aj.beta != null ? aj.beta : e.beta;
    U.cab('Mercado y coste de los recursos propios');
    U.dato('cot', 'Cotización ($ por acción)', e.cotizacion, S.in2);
    U.dato('acc', 'Acciones diluidas (millones)', e.acciones_m, S.in2);
    U.dato('rf', 'Tipo sin riesgo (Treasury a 10 años)', par.rf, S.ip2);
    U.dato('erp', 'Prima de riesgo de mercado', par.erp, S.ip2);
    U.dato('beta', 'Beta', beta, S.in2);
    U.dato('pp', 'Prima por riesgo país', e.prima_pais || 0, S.ip2);
    U.dato('dw', 'Ajuste adicional a la tasa de descuento', par.dwacc || 0, S.ip2);
    const R = U.R, V = U.V;
    U.calc('ke', 'Ke = tipo sin riesgo + beta × prima + prima país + ajuste', `${R.rf}+${R.beta}*${R.erp}+${R.pp}+${R.dw}`, V.rf + V.beta * V.erp + V.pp + V.dw, S.rp);
    U.cab('Valor terminal y escenarios');
    U.dato('g', 'Crecimiento a perpetuidad (g)', par.g, S.ip2);
  }
  function supuestosRi(e, par, aj, U) {
    supuestosKe(e, par, aj, U);
    for (const sc of ESC) U.dato('fr_' + sc, `Convergencia del ROE a largo plazo · ${NOM[sc]}`, par.fr[sc], S.ip1, sc === 'pes' ? 'Parte del diferencial del ROE del año 2 sobre Ke que se mantiene a largo plazo' : null);
    U.dato('dm', 'Ajuste al ROE a largo plazo', (aj && aj.dm) || 0, S.ip2);
    probabilidades(U, par);
    U.cab('Datos de partida');
    U.dato('bv0', 'Valor contable por acción del último balance ($)', e.ri.bv0, S.in2);
    U.dato('payout0', 'Reparto actual (dividendos y recompras ÷ beneficio)', e.ri.payout0, S.ip1);
    U.dato('d', 'Años desde el último cierre hasta la fecha de valoración', e.anios_hasta_valoracion, S.in2);
  }
  function hojaRi(e, sc, i, U) {
    const R = U.R, V = U.V, p = e.ri;
    const h = hojaAnual(`Beneficio residual ${NOM[sc]}`, `Beneficio residual · escenario ${NOM[sc]}`, 'Dólares por acción. En amarillo, el BPA del consenso de los años 1 y 2; después el ROE converge al de largo plazo.', 'Hoy');
    const L = (c, r) => h.loc(c, r);
    const k = V.ke, g = V.g, fr = V['fr_' + sc], d = V.d;
    // valores (misma lógica que el simulador)
    const X = []; let bv = V.bv0, roe2 = null, roeLT = null, payLT = null;
    for (let t = 1; t <= 10; t++) {
      let roe;
      if (t === 1) roe = p.bpa1[i] / bv;
      else if (t === 2) { roe = p.bpa2[i] / bv; roe2 = roe; roeLT = k + fr * (roe2 - k) + V.dm; payLT = Math.min(1, Math.max(0, roeLT > 0 ? 1 - g / roeLT : 1)); }
      else roe = roe2 + (roeLT - roe2) * (t - 2) / 8;
      const pay = t <= 2 ? V.payout0 : V.payout0 + (payLT - V.payout0) * (t - 2) / 8;
      const bpa = roe * bv, dpa = bpa * pay, ri = (roe - k) * bv, fd = pow(1 + k, -(t - d));
      X.push({ roe, bpa, dpa, pay, bvIni: bv, bvFin: bv + bpa - dpa, ri, fd, va: ri * fd });
      bv = bv + bpa - dpa;
    }
    [[5, 'BPA del consenso'], [6, 'Valor contable al inicio del año', S.b], [7, 'ROE'], [8, 'BPA = ROE × valor contable inicial', S.b], [9, 'Reparto (dividendos y recompras)'],
      [10, 'Dividendos y recompras por acción'], [11, 'Beneficio residual = (ROE − Ke) × valor contable inicial', S.b], [12, 'Valor contable al final del año'], [13, 'Factor de descuento'], [14, 'Valor actual del beneficio residual']]
      .forEach(([r, et, st]) => h.set(1, r, et, st || S.txt));
    COLS.forEach((c, j) => {
      const x = X[j], pc = c - 1, t = j + 1;
      if (t <= 2) h.set(c, 5, t === 1 ? p.bpa1[i] : p.bpa2[i], S.in2);
      h.set(c, 6, t === 1 ? { f: R.bv0, v: x.bvIni } : { f: L(pc, 12), v: x.bvIni }, S.n2);
      h.set(c, 7, t <= 2 ? { f: `${L(c, 5)}/${L(c, 6)}`, v: x.roe } : { f: `$D$7+($B$16-$D$7)*(${L(c, 4)}-2)/8`, v: x.roe }, S.p1);
      h.set(c, 8, { f: `${L(c, 7)}*${L(c, 6)}`, v: x.bpa }, S.n2);
      h.set(c, 9, t <= 2 ? { f: R.payout0, v: x.pay } : { f: `${R.payout0}+($B$17-${R.payout0})*(${L(c, 4)}-2)/8`, v: x.pay }, S.p1);
      h.set(c, 10, { f: `${L(c, 8)}*${L(c, 9)}`, v: x.dpa }, S.n2);
      h.set(c, 11, { f: `(${L(c, 7)}-${R.ke})*${L(c, 6)}`, v: x.ri }, S.n2);
      h.set(c, 12, { f: `${L(c, 6)}+${L(c, 8)}-${L(c, 10)}`, v: x.bvFin }, S.n2);
      h.set(c, 13, { f: `(1+${R.ke})^-(${L(c, 4)}-${R.d})`, v: x.fd }, S.f4);
      h.set(c, 14, { f: `${L(c, 11)}*${L(c, 13)}`, v: x.va }, S.n2);
    });
    const base = V.bv0 * pow(1 + k, d), suma = X.reduce((s, x) => s + x.va, 0), tv = (roeLT - k) * X[9].bvFin / (k - g), vaTv = tv * pow(1 + k, -(10 - d)), vps = base + suma + vaTv;
    const B = [
      [16, 'ROE a largo plazo = Ke + convergencia × (ROE del año 2 − Ke) + ajuste', { f: `${R.ke}+${R['fr_' + sc]}*(D7-${R.ke})+${R.dm}`, v: roeLT }, S.p1],
      [17, 'Reparto a largo plazo = 1 − g ÷ ROE', { f: `MIN(1,MAX(0,IF(B16>0,1-${R.g}/B16,1)))`, v: payLT }, S.p1],
      [18, 'Valor contable de hoy (actualizado a la fecha de valoración)', { f: `${R.bv0}*(1+${R.ke})^${R.d}`, v: base }, S.n2],
      [19, 'Suma del valor actual del beneficio residual (años 1–10)', { f: 'SUM(C14:L14)', v: suma }, S.n2],
      [20, 'Valor terminal = (ROE a largo plazo − Ke) × valor contable del año 10 ÷ (Ke − g)', { f: `(B16-${R.ke})*L12/(${R.ke}-${R.g})`, v: tv }, S.n2],
      [21, 'Valor actual del valor terminal', { f: `B20*(1+${R.ke})^-(10-${R.d})`, v: vaTv }, S.n2],
      [22, 'Valor por acción ($)', { f: 'B18+B19+B21', v: vps }, S.r2],
      [23, 'Peso del valor terminal', { f: 'B21/B22', v: vaTv / vps }, S.p1],
    ];
    for (const [r, et, v, st] of B) { h.set(1, r, et, r === 22 ? S.b : S.txt); h.set(2, r, v, st); }
    return { hoja: h, vps: { ref: h.ref(2, 22), v: vps } };
  }

  // ---------------------------------------------------------------- REIT: descuento del AFFO
  function supuestosReit(e, par, aj, U) {
    supuestosKe(e, par, aj, U);
    probabilidades(U, par);
    U.cab('Datos de partida (por acción, últimos doce meses)');
    U.dato('affo0', 'AFFO por acción (≈ 85 % del FFO)', e.reit.affo0, S.in2);
    U.dato('ffo0', 'FFO por acción', e.reit.ffo_ps, S.in2);
    U.dato('dps0', 'Dividendo anual por acción', e.reit.dps0, S.in2);
    U.dato('d', 'Años desde el último cierre hasta la fecha de valoración', e.anios_hasta_valoracion, S.in2);
  }
  function hojaReit(e, sc, i, aj, U) {
    const R = U.R, V = U.V, p = e.reit, dg = (aj && aj.dg) || 0;
    const h = hojaAnual(`AFFO ${NOM[sc]}`, `Descuento del AFFO · escenario ${NOM[sc]}`, 'Dólares por acción. En amarillo, el crecimiento de los años 1 y 2 (ingresos del consenso); después converge a g.', 'Hoy');
    const L = (c, r) => h.loc(c, r);
    const k = V.ke, g = V.g, d = V.d;
    const gr = [p.g1[i] + dg, p.g2[i] + dg];
    for (let t = 3; t <= 10; t++) gr.push(gr[1] + (g - gr[1]) * (t - 2) / 8);
    const X = []; let a = V.affo0;
    for (let t = 1; t <= 10; t++) { a = a * (1 + gr[t - 1]); const fd = pow(1 + k, -(t - 0.5 - d)); X.push({ g: gr[t - 1], affo: a, ffo: V.ffo0 * a / V.affo0, dpa: V.dps0 * a / V.affo0, fd, va: a * fd }); }
    [[5, 'Crecimiento del AFFO'], [6, 'AFFO por acción', S.b], [7, 'FFO por acción'], [8, 'Dividendo (mismo reparto que hoy)'], [9, 'Factor de descuento (mitad de año)'], [10, 'Valor actual del AFFO']]
      .forEach(([r, et, st]) => h.set(1, r, et, st || S.txt));
    h.set(2, 6, { f: R.affo0, v: V.affo0 }, S.n2); h.set(2, 7, { f: R.ffo0, v: V.ffo0 }, S.n2); h.set(2, 8, { f: R.dps0, v: V.dps0 }, S.n2);
    COLS.forEach((c, j) => {
      const x = X[j], pc = c - 1, t = j + 1;
      h.set(c, 5, t <= 2 ? gr[j] : { f: `$D$5+(${R.g}-$D$5)*(${L(c, 4)}-2)/8`, v: x.g }, t <= 2 ? S.ip1 : S.p1);
      h.set(c, 6, { f: `${L(pc, 6)}*(1+${L(c, 5)})`, v: x.affo }, S.n2);
      h.set(c, 7, { f: `$B$7*${L(c, 6)}/$B$6`, v: x.ffo }, S.n2);
      h.set(c, 8, { f: `$B$8*${L(c, 6)}/$B$6`, v: x.dpa }, S.n2);
      h.set(c, 9, { f: `(1+${R.ke})^-(${L(c, 4)}-0.5-${R.d})`, v: x.fd }, S.f4);
      h.set(c, 10, { f: `${L(c, 6)}*${L(c, 9)}`, v: x.va }, S.n2);
    });
    const suma = X.reduce((s, x) => s + x.va, 0), tv = X[9].affo * (1 + g) / (k - g), vaTv = tv * pow(1 + k, -(10 - d)), vps = suma + vaTv;
    const B = [
      [12, 'Suma del valor actual del AFFO (años 1–10)', { f: 'SUM(C10:L10)', v: suma }, S.n2],
      [13, 'Valor terminal = AFFO del año 10 × (1 + g) ÷ (Ke − g)', { f: `L6*(1+${R.g})/(${R.ke}-${R.g})`, v: tv }, S.n2],
      [14, 'Valor actual del valor terminal', { f: `B13*(1+${R.ke})^-(10-${R.d})`, v: vaTv }, S.n2],
      [15, 'Valor por acción ($)', { f: 'B12+B14', v: vps }, S.r2],
      [16, 'Peso del valor terminal', { f: 'B14/B15', v: vaTv / vps }, S.p1],
    ];
    for (const [r, et, v, st] of B) { h.set(1, r, et, r === 15 ? S.b : S.txt); h.set(2, r, v, st); }
    return { hoja: h, vps: { ref: h.ref(2, 15), v: vps } };
  }

  // ---------------------------------------------------------------- múltiplos y resumen
  function metodosDe(mu) {
    mu = mu || {};
    if (mu.metodos) return mu.metodos.map((m) => ({ n: m.n, mult: (m.mult || {}).med, min: (m.valor || {}).min, med: (m.valor || {}).med, max: (m.valor || {}).max }));
    return [{ n: 'PER adelantado', mult: mu.per_mediana, min: mu.per_valor_min, med: mu.per_valor_mediana, max: mu.per_valor_max },
      { n: 'EV/EBITDA adelantado', mult: mu.ev_ebitda_mediana, min: mu.ev_ebitda_valor_min, med: mu.ev_ebitda_valor_mediana, max: mu.ev_ebitda_valor_max }];
  }
  function hojaMultiplos(e, comparables, columnas) {
    const h = new Hoja('Múltiplos');
    h.anchos = { 1: 40, 2: 16, 3: 16, 4: 16, 5: 16 };
    h.set(1, 1, 'Valor por múltiplos de comparables', S.tit);
    h.set(1, 2, 'Valor por acción ($) que da la mediana de los múltiplos de las empresas comparables (y el mínimo y el máximo). Puedes cambiar los valores en amarillo.', S.nota);
    ['Método', 'Múltiplo mediano', 'Valor mínimo', 'Valor mediano', 'Valor máximo'].forEach((t, i) => h.set(i + 1, 4, t, i ? S.cabn : S.cab));
    const M = metodosDe(e.mu).filter((m) => m.med != null && isFinite(m.med));
    let r = 5;
    for (const m of M) {
      h.set(1, r, m.n); if (m.mult != null && isFinite(m.mult)) h.set(2, r, m.mult, S.x1);
      h.set(3, r, m.min != null && isFinite(m.min) ? m.min : m.med, S.in2); h.set(4, r, m.med, S.in2); h.set(5, r, m.max != null && isFinite(m.max) ? m.max : m.med, S.in2);
      r++;
    }
    const r0 = 5, r1 = Math.max(5, r - 1), rango = `D${r0}:D${r1}`;
    const meds = M.map((m) => m.med).filter((x) => x > 0);
    const n = meds.length, media = n ? meds.reduce((s, x) => s + x, 0) / n : 0;
    const filasD = M.map((m, j) => `D${r0 + j}`);
    r++;
    h.set(1, r, 'Métodos con valor positivo', S.b); const refN = h.set(2, r, { f: `COUNTIF(${rango},">0")`, v: n }, S.n0); r++;
    h.set(1, r, 'Valor por múltiplos (media de las medianas)', S.b); const refMedia = h.set(2, r, { f: `IF(${refN}>0,AVERAGEIF(${rango},">0"),0)`, v: media }, S.r2); r++;
    h.set(1, r, 'Menor de las medianas', S.txt); const refMin = h.set(2, r, { f: filasD.length ? `IF(${refN}>0,MIN(${filasD.map((x) => `IF(${x}>0,${x},1E+99)`).join(',')}),0)` : '0', v: n ? Math.min(...meds) : 0 }, S.n2); r++;
    h.set(1, r, 'Mayor de las medianas', S.txt); const refMax = h.set(2, r, { f: filasD.length ? `MAX(${filasD.map((x) => `IF(${x}>0,${x},0)`).join(',')})` : '0', v: n ? Math.max(...meds) : 0 }, S.n2); r++;
    if (comparables && comparables.length) {
      r += 1;
      h.set(1, r, 'Comparables', S.cab); columnas.forEach((c, i) => h.set(i + 2, r, c.t, S.cabn)); r++;
      for (const x of comparables) { h.set(1, r, `${x.n} (${x.t})`); columnas.forEach((c, i) => { const v = c.v(x); if (v != null && isFinite(v)) h.set(i + 2, r, v, c.st); }); r++; }
    }
    return { hoja: h, n: { ref: refN, v: n }, media: { ref: refMedia, v: media }, min: { ref: refMin, v: n ? Math.min(...meds) : 0 }, max: { ref: refMax, v: n ? Math.max(...meds) : 0 } };
  }
  function hojaResumen(e, info, U, esc, mul, nota) {
    const R = U.R, V = U.V;
    const h = new Hoja('Resumen');
    h.anchos = { 1: 46, 2: 18, 3: 14 };
    h.set(1, 1, `Valoración de ${e.empresa || e.nombre} (${e.ticker})`, S.tit);
    h.set(1, 2, `Simulador S&P 500 · datos del ${info.fecha} · ${info.modelo}`, S.nota);
    h.set(1, 3, 'Las celdas amarillas de las demás hojas son supuestos: cámbialos y todo se recalcula.', S.nota);
    ['Escenario', 'Valor por acción ($)', 'Probabilidad'].forEach((t, i) => h.set(i + 1, 5, t, i ? S.cabn : S.cab));
    ESC.forEach((sc, j) => { h.set(1, 6 + j, `Escenario ${NOM[sc]}`); h.set(2, 6 + j, { f: esc[sc].ref, v: esc[sc].v }, S.n2); h.set(3, 6 + j, { f: R['pr_' + sc], v: V['pr_' + sc] }, S.p1); });
    const pond = ESC.reduce((s, sc) => s + esc[sc].v * V['pr_' + sc], 0);
    const pw = mul.n.v > 0 ? V.peso : 1;
    const central = pw * pond + (1 - pw) * mul.media.v;
    const bajo = pw * esc.pes.v + (1 - pw) * (mul.n.v > 0 ? mul.min.v : 0), alto = pw * esc.opt.v + (1 - pw) * (mul.n.v > 0 ? mul.max.v : 0);
    const F = [
      [9, `${info.intr} ponderado por escenarios`, { f: 'SUMPRODUCT(B6:B8,C6:C8)', v: pond }, S.n2, S.txt],
      [10, 'Valor por múltiplos de comparables', { f: mul.media.ref, v: mul.media.v }, S.n2, S.txt],
      [11, 'Peso del modelo intrínseco (100 % si no hay múltiplos)', { f: `IF(${mul.n.ref}>0,${R.peso},1)`, v: pw }, S.p1, S.txt],
      [12, 'Valor central ($ por acción)', { f: 'B11*B9+(1-B11)*B10', v: central }, S.r2, S.b],
      [13, 'Valor bajo (pesimista y menor de los múltiplos)', { f: `B11*B6+(1-B11)*IF(${mul.n.ref}>0,${mul.min.ref},0)`, v: bajo }, S.n2, S.txt],
      [14, 'Valor alto (optimista y mayor de los múltiplos)', { f: `B11*B8+(1-B11)*IF(${mul.n.ref}>0,${mul.max.ref},0)`, v: alto }, S.n2, S.txt],
      [15, 'Cotización ($)', { f: R.cot, v: V.cot }, S.n2, S.txt],
      [16, 'Potencial', { f: 'B12/B15-1', v: central / V.cot - 1 }, S.rp, S.b],
      [17, 'Margen de seguridad = 1 − cotización ÷ valor central', { f: 'IF(B12>0,1-B15/B12,"")', v: central > 0 ? 1 - V.cot / central : '' }, S.p1, S.txt],
    ];
    for (const [r, et, v, st, se] of F) { h.set(1, r, et, se); h.set(2, r, v, st); }
    let r = 19;
    for (const t of nota) { h.set(1, r, t, S.nota); r++; }
    return { hoja: h, central };
  }

  // ---------------------------------------------------------------- libro completo
  function construir(e, v, par, aj, info) {
    const titulo = `Supuestos de la valoración de ${e.empresa || e.nombre} (${e.ticker})`;
    const U = hojaSupuestos(titulo);
    let esc = {}, hojasEsc = [], intr, columnas;
    if (e.modelo === 'ri') {
      supuestosRi(e, par, aj, U);
      ESC.forEach((sc, i) => { const x = hojaRi(e, sc, i, U); esc[sc] = x.vps; hojasEsc.push(x.hoja); });
      intr = 'Beneficio residual';
      columnas = [{ t: 'PER adelantado', v: (x) => x.per, st: S.x1 }, { t: 'Precio / valor contable', v: (x) => x.pb, st: S.x1 }, { t: 'Capitalización (M$)', v: (x) => x.cap, st: S.n0 }];
    } else if (e.modelo === 'reit') {
      supuestosReit(e, par, aj, U);
      ESC.forEach((sc, i) => { const x = hojaReit(e, sc, i, aj, U); esc[sc] = x.vps; hojasEsc.push(x.hoja); });
      intr = 'Descuento del AFFO';
      columnas = [{ t: 'P/FFO', v: (x) => x.pffo, st: S.x1 }, { t: 'EV/EBITDA', v: (x) => x.ev_ebitda_ttm, st: S.x1 }, { t: 'Capitalización (M$)', v: (x) => x.cap, st: S.n0 }];
    } else {
      supuestosFcff(e, par, aj, U);
      ESC.forEach((sc) => { const x = hojaFcff(e, sc, raiz.MOTOR.camino(e.trays[sc], aj), U); esc[sc] = x.vps; hojasEsc.push(x.hoja); });
      intr = 'DCF';
      columnas = [{ t: 'PER adelantado', v: (x) => x.per, st: S.x1 }, { t: 'EV/EBITDA adelantado', v: (x) => x.ev_ebitda, st: S.x1 }, { t: 'Capitalización (M$)', v: (x) => x.cap, st: S.n0 }];
    }
    const mul = hojaMultiplos(e, info.comparables, columnas);
    const nota = ['Herramienta formativa: no es una recomendación de inversión.'];
    const explicito = e.modelo === 'fcff' && aj && aj.invModo === 'explicito';
    if (explicito) nota.push('En el simulador tienes activado el modo "retorno de la inversión"; este libro proyecta el beneficio con el margen de cada año.');
    if (info.revisada) nota.push('Valoración revisada en el Simulador 7M: trayectorias, beta y comparables revisados a mano.');
    const res = hojaResumen(e, { fecha: info.fecha, modelo: info.modelo, intr }, U, esc, mul, nota);
    if (!explicito && v && isFinite(v.central)) {
      res.hoja.set(1, 19 + nota.length, `Comprobación: el simulador da un valor central de ${v.central.toFixed(2).replace('.', ',')} $ con estos mismos supuestos.`, S.nota);
    }
    const hojas = [res.hoja, U.h].concat(hojasEsc, [mul.hoja]);
    return { bytes: libro(hojas), central: res.central, hojas };
  }

  const EXCEL = { construir, zip, crc32 };
  raiz.EXCEL = EXCEL;

  // ---------------------------------------------------------------- en la app: descarga
  const A = raiz.APP;
  if (A) {
    A.excel = function (e, v, par, aj) {
      const a = (x) => x.adelantados || {};
      const comparables = ((e.mu || {}).comparables || []).map((t) => A.D.porT[t]).filter(Boolean)
        .map((x) => ({ t: x.ticker, n: x.nombre, cap: x.cap, per: a(x).per, ev_ebitda: a(x).ev_ebitda, pb: a(x).pb, pffo: a(x).pffo, ev_ebitda_ttm: a(x).ev_ebitda_ttm }));
      const fecha = A.fecha((A.D.estado || {}).fecha_mercado || A.D.pa.fecha_cotizacion);
      const r = construir(e, v, par, aj, { fecha, comparables, modelo: ((A.MODELOS || {})[e.modelo] || {}).n || 'DCF', revisada: !!e.revisada_activa });
      const nombre = `valoracion-${e.ticker}-${((A.D.estado || {}).fecha_mercado || 'hoy')}.xlsx`;
      const blob = new Blob([r.bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const enl = document.createElement('a');
      enl.href = URL.createObjectURL(blob); enl.download = nombre;
      document.body.append(enl); enl.click();
      setTimeout(() => { URL.revokeObjectURL(enl.href); enl.remove(); }, 1000);
      return nombre;
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
