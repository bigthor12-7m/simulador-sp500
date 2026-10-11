// Valoración por defecto de todas las empresas con el mismo motor que la app y registro del histórico semanal.
// Uso: node pipeline/calcular.js [carpeta de datos]   (por defecto app/datos)
const fs = require('fs');
const path = require('path');
require(path.join(__dirname, '..', 'app', 'motor.js'));
const MOTOR = globalThis.MOTOR;

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

const res = {};
for (const e of emp) {
  if (!e.valorada) continue;
  const tray = MOTOR.trayectorias(e.tr);
  const aj = { beta: e.beta, dg: 0, dm: 0, invModo: 'consenso', ronic: null, lag: 1 };
  const v = MOTOR.valorar(e, tray, e.mu, par, aj);
  const gi = v.valido ? MOTOR.crecimientoImplicito(e, tray, par, aj, v.w, v.res.base.roicT) : null;
  res[e.ticker] = {
    central: r2(v.central, 2), bajo: r2(v.bajo, 2), alto: r2(v.alto, 2), dcf: r2(v.pond, 2), multiplos: r2(v.mm, 2),
    pes: r2(v.res.pes.vps, 2), base: r2(v.res.base.vps, 2), opt: r2(v.res.opt.vps, 2), cotizacion: e.cotizacion,
    potencial: r2(v.pot), wacc: r2(v.w), peso_vt: r2(v.res.base.pesoTv), crecimiento_implicito: r2(gi), valido: v.valido,
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

// resumen en el estado
const vals = Object.values(res).filter((r) => r.valido);
const pots = vals.map((r) => r.potencial).sort((a, b) => a - b);
estado.resumen = { valoradas: vals.length, por_debajo_central: vals.filter((r) => r.potencial > 0).length, potencial_mediano: pots.length ? pots[Math.floor(pots.length / 2)] : null };
fs.writeFileSync(path.join(dir, 'estado.json'), JSON.stringify(estado, null, 1));
console.log(`Valoradas ${vals.length} · por debajo del valor central ${estado.resumen.por_debajo_central} · potencial mediano ${(estado.resumen.potencial_mediano * 100).toFixed(1)} %`);
