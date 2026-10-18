/**
 * Directional Movement Index + ADX + Ploted KEYLEVEL
 *
 * Wilder's directional movement: +DM = change(high) when it is above -change(low) and positive, else 0 (also 0 on
 * the first bar), -DM likewise; +DI / -DI = fixnan(100 * RMA(DM, DI Length) / RMA(TR, DI Length)) and
 * ADX = 100 * RMA(|+DI - -DI| / (+DI + -DI, 1 when 0), ADX Smoothing). Draws ADX, +DI, -DI and the key level
 * (a constant plot, 23 by default).
 *
 * Reference: "Directional Movement Index + ADX + Ploted KEYLEVEL" by console
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface DMIADXInputs {
  /** ADX smoothing (RMA length of the DX) */
  adxLen: number;
  /** DI length */
  diLen: number;
  /** Key level plotted for the ADX */
  keyLevel: number;
}

export const defaultInputs: DMIADXInputs = {
  adxLen: 14,
  diLen: 14,
  keyLevel: 23,
};

export const inputConfig: InputConfig[] = [
  { id: 'adxLen', type: 'int', title: 'ADX Smoothing', defval: 14 },
  { id: 'diLen', type: 'int', title: 'DI Length', defval: 14 },
  { id: 'keyLevel', type: 'int', title: 'key level for ADX', defval: 23 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ADX', color: '#FF0000', lineWidth: 1 },
  { id: 'plot1', title: '+DI', color: '#0000FF', lineWidth: 1 },
  { id: 'plot2', title: '-DI', color: '#808080', lineWidth: 1 },
  { id: 'plot3', title: 'Key Level', color: '#FFFFFF', lineWidth: 1 },
];

export const metadata = {
  title: 'Directional Movement Index + ADX + Ploted KEYLEVEL',
  shortTitle: 'DMI/ADX/KEYLEVEL',
  overlay: false,
};

export function calculate(bars: Bar[], inputs: Partial<DMIADXInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const fixnan = (x: number[]) => {
    let last = NaN;
    return x.map((v) => (isNaN(v) ? last : (last = v)));
  };

  // dirmov(len): up = change(high), down = -change(low); a comparison with na is false, so DM = 0 on bar 0
  const up = bars.map((b, i) => (i > 0 ? b.high - bars[i - 1].high : NaN));
  const down = bars.map((b, i) => (i > 0 ? -(b.low - bars[i - 1].low) : NaN));
  const plusDM = up.map((u, i) => (u > down[i] && u > 0 ? u : 0));
  const minusDM = down.map((d, i) => (d > up[i] && d > 0 ? d : 0));
  // truerange = rma(tr, len): tr is na on bar 0
  const truerange = A(ta.rma(ta.tr(bars), cfg.diLen));
  const rp = A(ta.rma(S(plusDM), cfg.diLen));
  const rm = A(ta.rma(S(minusDM), cfg.diLen));
  // fixnan(100 * rma(dm, len) / truerange): a plain division (x / 0 is +-infinity, 0 / 0 is na)
  const plus = fixnan(rp.map((v, i) => (100 * v) / truerange[i]));
  const minus = fixnan(rm.map((v, i) => (100 * v) / truerange[i]));
  // adx = 100 * rma(abs(plus - minus) / (sum == 0 ? 1 : sum), adxlen)
  const dx = plus.map((p, i) => {
    const sum = p + minus[i];
    return Math.abs(p - minus[i]) / (sum === 0 ? 1 : sum);
  });
  const adx = A(ta.rma(S(dx), cfg.adxLen)).map((v) => 100 * v);

  const line = (vals: number[]) => bars.map((b, i) => ({ time: b.time, value: vals[i] }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(adx),
      plot1: line(plus),
      plot2: line(minus),
      plot3: bars.map((b) => ({ time: b.time, value: cfg.keyLevel })),
    },
  };
}

export const DMIADX = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
