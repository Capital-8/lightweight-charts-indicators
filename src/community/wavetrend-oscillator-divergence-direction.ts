/**
 * WaveTrend Oscillator + Divergence + Direction Detection
 *
 * WaveTrend of hlc3: esa = ema(hlc3, n1), d = ema(|hlc3 - esa|, n1), ci = (hlc3 - esa) / (0.015 * d),
 * wt1 = ema(ci, n2), wt2 = sma(wt1, 4). The wt1 line is green while it rises and red while it falls (rising /
 * falling over "Reaccion En Cambio De Direccion" bars). Eight stacked red bands above the overbought level and eight
 * green bands below the oversold level (fills between invisible level plots). Crosses of wt1 and wt2 give circles
 * (only in the overbought / oversold zone, or all of them) and bar colours; the histogram is wt1 - wt2.
 * Optional divergences between wt1 fractals (5 bars) and the price, drawn 2 bars back with "R" / "O" labels, and an
 * optional extra moving average of wt1 (11 types) coloured by its direction.
 * Alerts (alertcondition, `alerts` of the result): the sell / buy crosses (overbought / oversold only, or all), both
 * sides together, and the change of the wt1 direction, declared twice as the original (Spanish then English titles).
 *
 * Reference: "Oscilador WaveTrend" (WaveTrend Oscillator + Divergence + Direction Detection + Alerts) by Dreadblitz
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, taCore, callsite, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type WaveTrendMaType = 'SMA' | 'EMA' | 'WMA' | 'VWMA' | 'SMMA' | 'DEMA' | 'TEMA' | 'HullMA' | 'ZEMA' | 'TMA' | 'SSMA';

export interface WaveTrendOscillatorDivergenceDirectionInputs {
  /** Longitud Del Canal (channel length) */
  n1: number;
  /** Periodo Movil (average length) */
  n2: number;
  /** Reaccion En Cambio De Direccion: bars of rise / fall for a direction change */
  reactionWt: number;
  /** Nivel Sobre Compra (overbought level) */
  nsc: number;
  /** Nivel Sobre Venta (oversold level) */
  nsv: number;
  /** Solo Ventas en Sobre Compra: sell circles only in the overbought zone */
  ventasEnSobreCompra: boolean;
  /** Solo Compras en Sobre Venta: buy circles only in the oversold zone */
  comprasEnSobreVenta: boolean;
  /** Ver Histograma */
  histograma: boolean;
  /** Ver Media de Señal (signal line) */
  senal: boolean;
  /** Pintar Barras (bar colours) */
  barras: boolean;
  /** Regular bullish divergences */
  divRegAl: boolean;
  /** Regular bearish divergences */
  divRegBa: boolean;
  /** Hidden bullish divergences */
  divOcuAl: boolean;
  /** Hidden bearish divergences */
  divOcuBa: boolean;
  /** Divergence labels */
  etiquetas: boolean;
  /** Extra moving average of wt1 */
  amme: boolean;
  maType: WaveTrendMaType;
  maLen: number;
  /** MA Extra Reaccion */
  reaction: number;
}

export const defaultInputs: WaveTrendOscillatorDivergenceDirectionInputs = {
  n1: 10,
  n2: 21,
  reactionWt: 1,
  nsc: 53,
  nsv: -53,
  ventasEnSobreCompra: true,
  comprasEnSobreVenta: true,
  histograma: true,
  senal: false,
  barras: true,
  divRegAl: false,
  divRegBa: false,
  divOcuAl: false,
  divOcuBa: false,
  etiquetas: true,
  amme: false,
  maType: 'EMA',
  maLen: 200,
  reaction: 1,
};

export const inputConfig: InputConfig[] = [
  { id: 'n1', type: 'int', title: 'Longitud Del Canal', defval: 10 },
  { id: 'n2', type: 'int', title: 'Periodo Movil', defval: 21 },
  { id: 'reactionWt', type: 'int', title: 'Reaccion En Cambio De Direccion', defval: 1, min: 1 },
  { id: 'nsc', type: 'int', title: 'Nivel Sobre Compra', defval: 53, min: 0 },
  { id: 'nsv', type: 'int', title: 'Nivel Sobre Venta', defval: -53, max: 0 },
  { id: 'ventasEnSobreCompra', type: 'bool', title: 'Solo Ventas en Sobre Compra', defval: true },
  { id: 'comprasEnSobreVenta', type: 'bool', title: 'Solo Compras en Sobre Venta', defval: true },
  { id: 'histograma', type: 'bool', title: 'Ver Histograma', defval: true },
  { id: 'senal', type: 'bool', title: 'Ver Media de Señal', defval: false },
  { id: 'barras', type: 'bool', title: 'Pintar Barras', defval: true },
  { id: 'divRegAl', type: 'bool', title: 'Ver Divergencias Regulares Alcistas', defval: false },
  { id: 'divRegBa', type: 'bool', title: 'Ver Divergencias Regulares Bajistas', defval: false },
  { id: 'divOcuAl', type: 'bool', title: 'Ver Divergencias Ocultas Alcistas', defval: false },
  { id: 'divOcuBa', type: 'bool', title: 'Ver Divergencias Ocultas Bajistas', defval: false },
  { id: 'etiquetas', type: 'bool', title: 'Ver Etiquetas De Divergencias', defval: true },
  { id: 'amme', type: 'bool', title: 'Activar media movil Extra para WT', defval: false },
  {
    id: 'maType', type: 'string', title: 'MA Extra Tipo: ', defval: 'EMA',
    options: ['SMA', 'EMA', 'WMA', 'VWMA', 'SMMA', 'DEMA', 'TEMA', 'HullMA', 'ZEMA', 'TMA', 'SSMA'],
  },
  { id: 'maLen', type: 'int', title: 'MA Extra Periodo', defval: 200, min: 1 },
  { id: 'reaction', type: 'int', title: 'MA Extra Reaccion', defval: 1, min: 1 },
];

const BLANCO = '#FDFEFE';
const NEGRO = '#000000';
const ROJO = '#FF0000';
const VERDE = '#00FF13';
const VERDE_FUERTE = '#0AAC00';
const VERDE_1 = '#00FF00';
const CELESTE_1 = '#009BBA';
const NARANJA = '#FF8B00';
/** plot(..., transp = 100): an invisible line */
const ROJO_100 = String(color.new(ROJO, 100));
const VERDE_100 = String(color.new(VERDE, 100));

const levelPlots = (prefix: string, zone: string, col: string): PlotConfig[] => Array.from({ length: 8 }, (_v, k) => ({
  id: `${prefix}${k + 1}`, title: `Nivel ${k + 1} ${zone}`, color: col, lineWidth: 1,
}));

export const plotConfig: PlotConfig[] = [
  { id: 'wt1', title: 'Media WT', color: VERDE_FUERTE, lineWidth: 1 },
  { id: 'wt2', title: 'Media Señal', color: NARANJA, lineWidth: 1 },
  { id: 'zero', title: 'Nivel 0', color: String(color.new(NEGRO, 50)), lineWidth: 1 },
  ...levelPlots('nsc', 'Sobre Compra', ROJO_100),
  ...levelPlots('nsv', 'Sobre Venta', VERDE_100),
  { id: 'venta', title: 'Ventas En Sobre Compra', color: ROJO, lineWidth: 3, style: 'circles' },
  { id: 'venta1', title: 'Todas Las Ventas', color: ROJO, lineWidth: 3, style: 'circles' },
  { id: 'compra', title: 'Compras En Sobre Venta', color: VERDE_FUERTE, lineWidth: 3, style: 'circles' },
  { id: 'compra1', title: 'Todas Las Compras', color: VERDE_FUERTE, lineWidth: 3, style: 'circles' },
  { id: 'hist', title: 'Histograma', color: String(color.new(CELESTE_1, 80)), lineWidth: 1, style: 'area' },
  { id: 'divBear', title: 'Divergencias Bajistas', color: ROJO, lineWidth: 2, offset: -2 },
  { id: 'divBull', title: 'Divergencias Alcistas', color: VERDE_FUERTE, lineWidth: 2, offset: -2 },
  { id: 'ma', title: 'MA PLOT', color: String(color.new('#2E8B57', 10)), lineWidth: 3 },
];

export const metadata = {
  title: 'Oscilador WaveTrend',
  shortTitle: 'WT_X',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);
/** A float used as a condition: na and 0 are false */
const truthy = (x: number) => !Number.isNaN(x) && x !== 0;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<WaveTrendOscillatorDivergenceDirectionInputs> = {},
): Omit<IndicatorResult, 'markers' | 'barColors'> & { markers: MarkerData[]; barColors: BarColorData[] }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : Number(v)));
  const B = (s: Series) => s.toArray().map((v) => !!v);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);

  // WaveTrend
  const ap = bars.map((b) => (b.high + b.low + b.close) / 3);
  const esa = A(ta.ema(S(ap), cfg.n1));
  const d = A(ta.ema(S(ap.map((v, i) => Math.abs(v - esa[i]))), cfg.n1));
  // a plain division: x / 0 is +-infinity, which ta.ema skips like na
  const ci = ap.map((v, i) => (v - esa[i]) / (0.015 * d[i]));
  const wt1 = A(ta.ema(S(ci), cfg.n2));
  const wt2 = A(ta.sma(S(wt1), 4));
  const wt1S = S(wt1);

  // direction := rising(wt1, reaction_wt) ? 1 : falling(wt1, reaction_wt) ? -1 : nz(direction[1])
  // falling() is in the ternary branch: it only runs (and keeps its history) on the bars where rising() is false
  const rising = B(ta.rising(wt1S, cfg.reactionWt));
  const falling = callsite.whenCalled(rising.map((r) => !r), (x) => taCore.falling(x, cfg.reactionWt), wt1)
    .map((v) => v === true || v === 1);
  const direction: number[] = new Array(n);
  for (let i = 0; i < n; i++) direction[i] = rising[i] ? 1 : falling[i] ? -1 : i > 0 ? direction[i - 1] : 0;

  // Cross signals (crossover / crossunder compare exactly)
  const crossUnder = B(ta.crossunder(wt1S, S(wt2)));
  const crossOver = B(ta.crossover(wt1S, S(wt2)));
  const midpoint = (cfg.nsc + cfg.nsv) / 2;
  const ploff = (cfg.nsc - midpoint) / 8;

  // Fractals of wt1 (bar i - 2 is the top / bottom of 5 bars). f_bot_fractal() is in the ternary branch of
  // f_fractalize(): it only runs on the bars without a top fractal, and its _src[k] reads the value of its last call
  // at bar i - k or before (user-function history).
  const topFractal = (i: number) => lt(at(wt1, i - 4), at(wt1, i - 2)) && lt(at(wt1, i - 3), at(wt1, i - 2))
    && gt(at(wt1, i - 2), at(wt1, i - 1)) && gt(at(wt1, i - 2), wt1[i]);
  const botKept: number[] = new Array(n);
  const botSrc = (i: number, k: number) => (i - k >= 0 ? botKept[i - k] : NaN);
  const fractalTop: number[] = new Array(n);
  const fractalBot: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let f = 0;
    if (topFractal(i)) {
      f = 1;
      botKept[i] = i > 0 ? botKept[i - 1] : NaN;
    } else {
      botKept[i] = wt1[i];
      const bot = gt(botSrc(i, 4), botSrc(i, 2)) && gt(botSrc(i, 3), botSrc(i, 2))
        && lt(botSrc(i, 2), botSrc(i, 1)) && lt(botSrc(i, 2), botSrc(i, 0));
      if (bot) f = -1;
    }
    fractalTop[i] = f > 0 ? at(wt1, i - 2) : NaN;
    fractalBot[i] = f < 0 ? at(wt1, i - 2) : NaN;
  }
  // valuewhen(cond, x, 0): x on the last bar where cond (a float: na and 0 are false) was true
  const valuewhen = (cond: number[], x: (i: number) => number) => {
    const out: number[] = new Array(n);
    let last = NaN;
    for (let i = 0; i < n; i++) {
      if (truthy(cond[i])) last = x(i);
      out[i] = last;
    }
    return out;
  };
  const highAt = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const lowAt = (i: number) => (i >= 0 ? bars[i].low : NaN);
  const highPrev = valuewhen(fractalTop, (i) => at(wt1, i - 2));
  const highPrice = valuewhen(fractalTop, (i) => highAt(i - 2));
  const lowPrev = valuewhen(fractalBot, (i) => at(wt1, i - 2));
  const lowPrice = valuewhen(fractalBot, (i) => lowAt(i - 2));

  // Extra moving average of wt1: variant(ma_type, wt1, ma_len) (every type is computed on every bar), coloured by
  // its direction (falling() is called on every bar here); the colour is set also when the plot is off
  const maSeries = variant(cfg.maType, wt1, cfg.maLen, bars);
  const maS = S(maSeries);
  const maRising = B(ta.rising(maS, cfg.reaction));
  const maFalling = B(ta.falling(maS, cfg.reaction));
  let dirA = 0;
  const maUp = String(color.new('#2E8B57', 10));
  const maDown = String(color.new('#FF4500', 10));
  const maColors = maSeries.map((_v, i) => {
    dirA = maRising[i] ? 1 : maFalling[i] ? -1 : dirA;
    return dirA > 0 ? maUp : dirA < 0 ? maDown : 'transparent';
  });

  const interval = barInterval(bars);
  const t = (i: number) => bars[i].time;
  const plots: Record<string, Point[]> = {};
  const P = (f: (i: number) => Point | null): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < n; i++) {
      const p = f(i);
      if (p) out.push(p);
    }
    return out;
  };
  const num = (v: number) => (Number.isFinite(v) ? v : NaN);
  plots.wt1 = P((i) => ({
    time: t(i), value: num(wt1[i]),
    color: direction[i] > 0 ? VERDE_FUERTE : direction[i] < 0 ? ROJO : 'transparent',
  }));
  plots.wt2 = P((i) => ({ time: t(i), value: cfg.senal ? num(wt2[i]) : NaN }));
  plots.zero = P((i) => ({ time: t(i), value: 0 }));
  for (let k = 0; k < 8; k++) {
    plots[`nsc${k + 1}`] = P((i) => ({ time: t(i), value: cfg.nsc + 5 * k }));
    plots[`nsv${k + 1}`] = P((i) => ({ time: t(i), value: cfg.nsv - 5 * (k + 1) }));
  }

  const venta: boolean[] = new Array(n);
  const venta1: boolean[] = new Array(n);
  const compra: boolean[] = new Array(n);
  const compra1: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    venta[i] = crossUnder[i] && ge(wt1[i], cfg.nsc) && cfg.ventasEnSobreCompra;
    venta1[i] = crossUnder[i] && !cfg.ventasEnSobreCompra;
    compra[i] = crossOver[i] && le(wt1[i], cfg.nsv) && cfg.comprasEnSobreVenta;
    compra1[i] = crossOver[i] && !cfg.comprasEnSobreVenta;
  }
  plots.venta = P((i) => ({ time: t(i), value: venta[i] ? num(at(wt2, i - 1) + ploff) : NaN }));
  plots.venta1 = P((i) => ({ time: t(i), value: venta1[i] ? num(at(wt2, i - 1) + ploff) : NaN }));
  plots.compra = P((i) => ({ time: t(i), value: compra[i] ? num(at(wt2, i - 1) - ploff) : NaN }));
  plots.compra1 = P((i) => ({ time: t(i), value: compra1[i] ? num(at(wt2, i - 1) - ploff) : NaN }));
  plots.hist = P((i) => ({ time: t(i), value: cfg.histograma ? num(wt1[i] - wt2[i]) : NaN }));

  // barcolor(... compra ... ? verde_1 : na), then barcolor(... venta ... ? rojo : na): the later call is on top
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    if (cfg.barras && (venta[i] || venta1[i])) barColors.push({ time: t(i), color: ROJO });
    else if (cfg.barras && (compra[i] || compra1[i])) barColors.push({ time: t(i), color: VERDE_1 });
  }

  // Divergences
  const markers: MarkerData[] = [];
  const divBear: Point[] = [];
  const divBull: Point[] = [];
  for (let i = 2; i < n; i++) {
    const top = truthy(fractalTop[i]);
    const bot = truthy(fractalBot[i]);
    const w2 = at(wt1, i - 2);
    const h2 = highAt(i - 2);
    const l2 = lowAt(i - 2);
    const hPrev = at(highPrev, i - 2);
    const hPrice = at(highPrice, i - 2);
    const lPrev = at(lowPrev, i - 2);
    const lPrice = at(lowPrice, i - 2);
    const regularBearish = top && gt(h2, hPrice) && lt(w2, hPrev) && cfg.divRegBa;
    const hiddenBearish = top && lt(h2, hPrice) && gt(w2, hPrev) && cfg.divOcuBa;
    const regularBullish = bot && lt(l2, lPrice) && gt(w2, lPrev) && cfg.divRegAl;
    const hiddenBullish = bot && gt(l2, lPrice) && lt(w2, lPrev) && cfg.divOcuAl;
    const col1 = regularBearish || hiddenBearish ? ROJO : 'transparent';
    const col2 = regularBullish || hiddenBullish ? VERDE_FUERTE : 'transparent';
    // plot(..., offset = -2): the value of bar i is drawn on bar i - 2
    const time = barTime(bars, i - 2, interval);
    divBear.push({ time, value: top ? num(fractalTop[i]) : NaN, color: col1 });
    divBull.push({ time, value: bot ? num(fractalBot[i]) : NaN, color: col2 });
    // plotshape(... ? wt1[1] +- ploff : na, location.absolute, offset = -2)
    const label = (on: boolean, price: number, text: string, bear: boolean, id: string) => {
      if (!on || !Number.isFinite(price)) return;
      markers.push({
        time, position: bear ? 'atPriceTop' : 'atPriceBottom', price, shape: bear ? 'labelDown' : 'labelUp',
        color: bear ? ROJO : VERDE_FUERTE, text, textColor: BLANCO, size: 'tiny', id,
      });
    };
    const w1 = at(wt1, i - 1);
    label(regularBearish && cfg.etiquetas, w1 + ploff, '🐻 R', true, 'shape0');
    label(hiddenBearish && cfg.etiquetas, w1 + ploff, '🐻 O', true, 'shape1');
    label(regularBullish && cfg.etiquetas, w1 - ploff, '🐂 R', false, 'shape2');
    label(hiddenBullish && cfg.etiquetas, w1 - ploff, '🐂 O', false, 'shape3');
  }
  plots.divBear = divBear;
  plots.divBull = divBull;
  plots.ma = P((i) => ({ time: t(i), value: cfg.amme ? num(maSeries[i]) : NaN, color: maColors[i] }));

  const fillColors = (col: string, transp: number) => bars.map(() => String(color.new(col, transp)));
  const fills = [];
  for (let k = 0; k < 7; k++) {
    fills.push({ plot1: `nsc${k + 1}`, plot2: `nsc${k + 2}`, colors: fillColors(ROJO, 75 - 5 * k) });
  }
  for (let k = 0; k < 7; k++) {
    fills.push({ plot1: `nsv${k + 1}`, plot2: `nsv${k + 2}`, colors: fillColors(VERDE, 75 - 5 * k) });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    markers,
    barColors,
    alerts: alertStates(alertConditions, bars, alertFlags(venta, venta1, compra, compra1, direction)),
  };
}

/** The original's alertcondition() expressions per bar, in its declaration order */
function alertFlags(venta: boolean[], venta1: boolean[], compra: boolean[], compra1: boolean[], direction: number[]): boolean[][] {
  const any = venta.map((v, i) => v || compra[i]);
  const any1 = venta1.map((v, i) => v || compra1[i]);
  // cambio_direccion = change(direction, 1) as a condition: na (bar 0) and 0 are false
  const change = direction.map((d, i) => i > 0 && d !== direction[i - 1]);
  const set = [venta, venta1, compra, compra1, any, any1, change];
  return [...set, ...set];
}

/** The original's alertconditions (no message: the default one) */
export const alertConditions: AlertConditionDecl[] = [
  'Ventas en Sobre Compra', 'Todas las Ventas', 'Compras en Sobre Venta', 'Todas las Compras',
  'Compras/Ventas en Sobre Compra/Venta', 'Todas las Ventas/Compras', 'Cambio Direccion WT',
  'Overbought Sales', 'All Sales', 'Oversold Buys', 'All Buys', 'Buys/Sales Overbought/Oversold', 'All Sales/Buys',
  'WT Direction Change',
].map((title, k) => ({ id: `alert${k}`, title, message: 'Alert Fired!' }));

/** variant(type, src, len) of the original: the extra moving average of wt1 */
function variant(type: WaveTrendMaType, src: number[], len: number, bars: Bar[]): number[] {
  const n = src.length;
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : Number(v)));
  const S = (a: number[]) => Series.fromArray(bars, a);
  const ema = (x: number[], l: number) => A(ta.ema(S(x), l));
  const sma = (x: number[], l: number) => A(ta.sma(S(x), l));
  const wma = (x: number[], l: number) => A(ta.wma(S(x), l));
  switch (type) {
    case 'EMA':
      return ema(src, len);
    case 'WMA':
      return wma(src, len);
    case 'VWMA':
      return A(ta.vwma(S(src), len, S(bars.map((b) => b.volume ?? NaN))));
    case 'SMMA': {
      // v5 := na(v5[1]) ? sma(src, len) : (v5[1] * (len - 1) + src) / len
      const s = sma(src, len);
      const out: number[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const prev = i > 0 ? out[i - 1] : NaN;
        out[i] = Number.isNaN(prev) ? s[i] : (prev * (len - 1) + src[i]) / len;
      }
      return out;
    }
    case 'DEMA': {
      const v2 = ema(src, len);
      const e = ema(v2, len);
      return v2.map((v, i) => 2 * v - e[i]);
    }
    case 'TEMA': {
      const v2 = ema(src, len);
      const e = ema(v2, len);
      const ee = ema(e, len);
      return v2.map((v, i) => 3 * (v - e[i]) + ee[i]);
    }
    case 'HullMA': {
      // wma(2 * wma(src, len / 2) - wma(src, len), round(sqrt(len)))
      const w2 = wma(src, len / 2);
      const w3 = wma(src, len);
      return wma(w2.map((v, i) => 2 * v - w3[i]), Math.round(Math.sqrt(len)));
    }
    case 'SSMA': {
      // SuperSmoother filter, (c) 2013 John F. Ehlers
      const a1 = Math.exp((-1.414 * 3.14159) / len);
      const b1 = 2 * a1 * Math.cos((1.414 * 3.14159) / len);
      const c2 = b1;
      const c3 = -a1 * a1;
      const c1 = 1 - c2 - c3;
      const nz = (x: number) => (Number.isNaN(x) ? 0 : x);
      const out: number[] = new Array(n);
      for (let i = 0; i < n; i++) {
        out[i] = (c1 * (src[i] + nz(i > 0 ? src[i - 1] : NaN))) / 2
          + c2 * nz(i > 0 ? out[i - 1] : NaN) + c3 * nz(i > 1 ? out[i - 2] : NaN);
      }
      return out;
    }
    case 'ZEMA': {
      const e1 = ema(src, len);
      const e2 = ema(e1, len);
      return e1.map((v, i) => v + v - e2[i]);
    }
    case 'TMA':
      return sma(sma(src, len), len);
    default:
      return sma(src, len);
  }
}

export const WaveTrendOscillatorDivergenceDirection = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
