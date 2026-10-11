// Valoración por defecto de todas las empresas con el mismo motor que la app y registro del histórico semanal.
// Uso: node pipeline/calcular.js [carpeta de datos]   (por defecto app/datos)
const fs = require('fs');
const path = require('path');
require(path.join(__dirname, '..', 'app', 'motor.js'));
require(path.join(__dirname, '..', 'app', 'js', 'criterios.js'));
const MOTOR = globalThis.MOTOR, CRIT = globalThis.CRIT;

const dir = process.argv[2] || path.join(__dirname, '..', 'app', 'datos');
const leer = (f, def) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { if (def !== undefined) return def; throw e; } };
const emp = leer('empresas.json');
const p = leer('parametros.json')[0];
const estado = leer('estado.json', {});
const par = {
  rf: p.tipo_sin_riesgo, erp: p.prima_riesgo_mercado, spread: p.diferencial_deuda, g: p.crecimiento_perpetuo, dwacc: 0,
  prob: { pes: p.prob_pesimista, base: p.prob_base, opt: p.prob_optimista }, pesoDcf: p.peso_dcf, roicTope: p.roic_tope,
  fr: { pes: p.convergencia_roic_pesimista, base: p.convergencia_roic_base, opt: p.convergencia_roic_optimista }, metodoVt: 'inductores',
};
const r2 = (x, d = 4) => (x == null || !isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

const res = {}, VAL = {}, EV = {};
for (const e0 of emp) {
  if (!e0.valorada) continue;
  const e = e0.revisada ? CRIT.aplicarRevisada(e0) : e0;   // las 7 Magníficas, con su valoración revisada (como en la app)
  const tray = e.modelo === 'ri' || e.modelo === 'reit' ? null : (e.trays || MOTOR.trayectorias(e.tr));
  e.trays = tray;
  const aj = { beta: e.beta, dg: 0, dm: 0, invModo: 'consenso', ronic: null, lag: 1 };
  const v = MOTOR.valorar(e, tray, e.mu, par, aj);
  VAL[e.ticker] = v; EV[e.ticker] = e;
  const gi = MOTOR.implicito(e, par, aj, v);
  res[e.ticker] = {
    central: r2(v.central, 2), bajo: r2(v.bajo, 2), alto: r2(v.alto, 2), dcf: r2(v.pond, 2), multiplos: r2(v.mm, 2),
    pes: r2(v.res.pes.vps, 2), base: r2(v.res.base.vps, 2), opt: r2(v.res.opt.vps, 2), cotizacion: e.cotizacion,
    potencial: r2(v.pot), wacc: r2(v.w), peso_vt: r2(v.res.base.pesoTv), implicito: r2(gi), modelo: v.modelo, valido: v.valido,
  };
}
fs.writeFileSync(path.join(dir, 'resultados.json'), JSON.stringify(res));

// histórico: una columna por semana (fecha de mercado); se sustituye si la semana ya existe
const hist = leer('historico.json', { fechas: [], series: {} });
const f = estado.fecha_mercado || p.fecha_cotizacion;
let i = hist.fechas.indexOf(f);
if (i < 0) { hist.fechas.push(f); i = hist.fechas.length - 1; for (const t of Object.keys(hist.series)) hist.series[t].push(null); }
for (const [t, r] of Object.entries(res)) {
  const s = (hist.series[t] = hist.series[t] || hist.fechas.map(() => null));
  while (s.length < hist.fechas.length) s.push(null);
  s[i] = r.valido ? [r.central, r.cotizacion] : null;
}
const MAX = 156;
if (hist.fechas.length > MAX) {
  const k = hist.fechas.length - MAX;
  hist.fechas = hist.fechas.slice(k);
  for (const t of Object.keys(hist.series)) hist.series[t] = hist.series[t].slice(k);
}
fs.writeFileSync(path.join(dir, 'historico.json'), JSON.stringify(hist));

// ---------------------------------------------------------------- seguimiento semanal de las estrategias
// Cada semana se guardan las candidatas de cada estrategia y las cotizaciones; la rentabilidad de una estrategia en una
// semana es la media (pesos iguales) de la variación de la cotización de las candidatas de la semana anterior.
const seg = leer('seguimiento.json', { inicio: null, semanas: [] });
const precios = {};
for (const e of emp) if (e.valorada && e.cotizacion) precios[e.ticker] = Math.round(e.cotizacion * 100) / 100;
const cand = {};
for (const est of CRIT.ESTRATEGIAS) cand[est.id] = Object.keys(VAL).filter((t) => est.f(EV[t], VAL[t])).sort();
const semana = { fecha: f, sp500: estado.sp500 || null, precios, cand };
const j = seg.semanas.findIndex((s) => s.fecha === f);
if (j >= 0) seg.semanas[j] = semana; else seg.semanas.push(semana);
seg.semanas.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
if (seg.semanas.length > 156) seg.semanas = seg.semanas.slice(-156);
seg.inicio = seg.semanas[0].fecha;
seg.estrategias = CRIT.ESTRATEGIAS.map(({ id, n, d }) => ({ id, n, d }));
const media = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const serie = (fn) => {
  const out = [{ fecha: seg.semanas[0].fecha, ret: 0, indice: 100 }];
  for (let k = 1; k < seg.semanas.length; k++) {
    const r = fn(seg.semanas[k - 1], seg.semanas[k]);
    out.push({ fecha: seg.semanas[k].fecha, ret: r, indice: out[k - 1].indice * (1 + (r || 0)) });
  }
  return out;
};
const retDe = (tks, a, b) => media(tks.filter((t) => a.precios[t] && b.precios[t]).map((t) => b.precios[t] / a.precios[t] - 1));
seg.rendimiento = { sp500: serie((a, b) => (a.sp500 && b.sp500 ? b.sp500 / a.sp500 - 1 : null)), universo: serie((a, b) => retDe(Object.keys(a.precios), a, b)) };
for (const est of CRIT.ESTRATEGIAS) seg.rendimiento[est.id] = serie((a, b) => retDe(a.cand[est.id] || [], a, b));
let conf = { seguir: [], umbral: 0.1, estrategias: CRIT.ESTRATEGIAS.map((x) => x.id) };
try { conf = Object.assign(conf, JSON.parse(fs.readFileSync(path.join(__dirname, 'avisos.json'), 'utf8'))); } catch (e) {}
seg.avisos = conf;   // la app muestra qué empresas siguen los avisos por correo
fs.writeFileSync(path.join(dir, 'seguimiento.json'), JSON.stringify(seg));

// ---------------------------------------------------------------- avisos de la semana (se publican como issue de GitHub)
const salidaAvisos = process.env.AVISOS_MD;
if (salidaAvisos) {
  const URL = 'https://bigthor12-7m.github.io/simulador-sp500/#/empresa/';
  const nom = (t) => { const e = emp.find((x) => x.ticker === t); return e ? `[${e.nombre} (${t})](${URL}${t})` : t; };
  const pc = (x, d = 0) => (x == null || !isFinite(x) ? '—' : `${x > 0 ? '+' : ''}${(x * 100).toFixed(d).replace('.', ',')} %`);
  const k = seg.semanas.length - 1, prev = k > 0 ? seg.semanas[k - 1] : null;
  const L = [`${process.env.PROPIETARIO ? '@' + process.env.PROPIETARIO + ' ' : ''}Avisos del simulador S&P 500 · datos del ${f.split('-').reverse().join('/')}`, ''];
  let hay = false;
  for (const est of CRIT.ESTRATEGIAS.filter((x) => conf.estrategias.includes(x.id))) {
    const ahora = cand[est.id], antes = prev ? prev.cand[est.id] || [] : null;
    const ent = antes ? ahora.filter((t) => !antes.includes(t)) : ahora, sal = antes ? antes.filter((t) => !ahora.includes(t)) : [];
    const rs = seg.rendimiento[est.id];
    L.push(`### ${est.n} (${ahora.length} empresas)`);
    if (prev) L.push(`Semana: ${pc(rs[k].ret, 1)} · desde el ${seg.inicio.split('-').reverse().join('/')}: ${pc(rs[k].indice / 100 - 1, 1)} (S&P 500: ${pc(seg.rendimiento.sp500[k].indice / 100 - 1, 1)})`);
    if (ent.length) { hay = true; L.push(`- Entran${prev ? '' : ' (cartera inicial)'}: ${ent.map(nom).join(', ')}`); }
    if (sal.length) { hay = true; L.push(`- Salen: ${sal.map(nom).join(', ')}`); }
    if (!ent.length && !sal.length) L.push('- Sin cambios');
    L.push('');
  }
  const seguir = (conf.seguir || []).filter((t) => res[t]);
  if (seguir.length) {
    L.push('### Empresas que sigues');
    const H = hist.series, iUlt = hist.fechas.length - 1;
    for (const t of seguir) {
      const r = res[t], sAnt = H[t] && iUlt > 0 ? H[t][iUlt - 1] : null;
      const dpx = sAnt ? r.cotizacion / sAnt[1] - 1 : null, dval = sAnt ? r.central / sAnt[0] - 1 : null;
      const destaca = (dpx != null && Math.abs(dpx) >= conf.umbral) || (dval != null && Math.abs(dval) >= conf.umbral);
      if (destaca) hay = true;
      L.push(`- ${destaca ? '**' : ''}${nom(t)}${destaca ? '**' : ''}: cotización ${r.cotizacion.toFixed(2).replace('.', ',')} $ (${pc(dpx, 1)} en la semana) · valor central ${r.central.toFixed(0)} $ (${pc(dval, 1)}) · potencial ${pc(r.potencial)}`);
    }
    L.push('');
  }
  L.push(`[Abrir el simulador](https://bigthor12-7m.github.io/simulador-sp500/#/seguimiento) · las empresas que sigues y el umbral se cambian en pipeline/avisos.json.`);
  if (hay || !prev) fs.writeFileSync(salidaAvisos, L.join('\n'));
  console.log(hay || !prev ? 'Avisos de la semana preparados' : 'Sin avisos esta semana');
}

// resumen en el estado
const vals = Object.values(res).filter((r) => r.valido);
const pots = vals.map((r) => r.potencial).sort((a, b) => a - b);
estado.resumen = { valoradas: vals.length, por_debajo_central: vals.filter((r) => r.potencial > 0).length, potencial_mediano: pots.length ? pots[Math.floor(pots.length / 2)] : null };
fs.writeFileSync(path.join(dir, 'estado.json'), JSON.stringify(estado, null, 1));
console.log(`Valoradas ${vals.length} · por debajo del valor central ${estado.resumen.por_debajo_central} · potencial mediano ${(estado.resumen.potencial_mediano * 100).toFixed(1)} %`);
