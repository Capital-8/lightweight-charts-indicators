/**
 * Keltner-Aroon-EFI Flow
 *
 * Three votes of -1 / 0 / 1: the close outside a Keltner channel (EMA +- ATR(10) * multiplier), an Aroon-style
 * comparison of the bars since the highest high / lowest low (above 70), and the sign of the EMA of the Elder force
 * index. The average of the active votes is smoothed by an ALMA; the flow is 1 above 0.1, -1 below -0.1, else 0.
 * A DEMA(200) signal line and the candles take the flow colour; a Supertrend(3, 10) is drawn as up / down bands, with
 * gradient fills from the Supertrend and from the close to the signal line.
 * Alerts (alertcondition, `alerts` of the result): 'KAE Long' when the smoothed vote crosses over 0.1, 'KAE Short'
 * when it crosses under -0.1.
 *
 * Reference: "Keltner-Aroon-EFI Flow" by D_QUANT
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © D_QUANT
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { PlotCandleData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface KeltnerAroonEfiFlowInputs {
  kcLength: number;
  kcMult: number;
  aroonLength: number;
  efiLength: number;
  /** ALMA smoothing of the average vote */
  useSmoothing: boolean;
  smoothLength: number;
  smoothOffset: number;
  smoothSigma: number;
  /** Include the Keltner vote */
  on1: boolean;
  /** Include the Aroon vote */
  on2: boolean;
  /** Include the EFI vote */
  on3: boolean;
}

export const defaultInputs: KeltnerAroonEfiFlowInputs = {
  kcLength: 54,
  kcMult: 1,
  aroonLength: 32,
  efiLength: 70,
  useSmoothing: true,
  smoothLength: 50,
  smoothOffset: 0.95,
  smoothSigma: 45,
  on1: true,
  on2: true,
  on3: false,
};

const G_IND = '1.1 KAE Logic Engine';
const G_SMOOTH = '1.2 Signal Processing (ALMA)';
const G_TGL = '1.3 Active Components';

export const inputConfig: InputConfig[] = [
  { id: 'kcLength', type: 'int', title: 'Keltner Length', defval: 54, group: G_IND },
  { id: 'kcMult', type: 'float', title: 'Keltner Multiplier', defval: 1, group: G_IND },
  { id: 'aroonLength', type: 'int', title: 'Aroon Length', defval: 32, group: G_IND },
  { id: 'efiLength', type: 'int', title: 'Force Index Length', defval: 70, group: G_IND },
  { id: 'useSmoothing', type: 'bool', title: 'Active Smoothing', defval: true, group: G_SMOOTH },
  { id: 'smoothLength', type: 'int', title: 'Length', defval: 50, min: 1, group: G_SMOOTH },
  { id: 'smoothOffset', type: 'float', title: 'Offset', defval: 0.95, min: 0.0, max: 1.0, step: 0.05, group: G_SMOOTH },
  { id: 'smoothSigma', type: 'float', title: 'Sigma', defval: 45, min: 1, group: G_SMOOTH },
  { id: 'on1', type: 'bool', title: 'Include Keltner (Trend)', defval: true, group: G_TGL },
  { id: 'on2', type: 'bool', title: 'Include Aroon (Strength)', defval: true, group: G_TGL },
  { id: 'on3', type: 'bool', title: 'Include EFI (Volume)', defval: false, group: G_TGL },
];

const COL_LONG_DEEP = String(color.rgb(0, 45, 92));
const COL_LONG_BBL = String(color.rgb(0, 85, 164));
const COL_SHORT = String(color.rgb(255, 255, 255));
const COL_NEUTRAL = String(color.rgb(120, 123, 134));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Signal Line', color: COL_NEUTRAL, lineWidth: 2 },
  { id: 'plot1', title: 'Source', color: String(color.new(COL_NEUTRAL, 100)), lineWidth: 1 },
  { id: 'plot2', title: 'Band-Up', color: COL_LONG_BBL, lineWidth: 1, style: 'linebr' },
  { id: 'plot3', title: 'Band-Down', color: COL_SHORT, lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Keltner-Aroon-EFI Flow',
  shortTitle: '|K| |A| |E| |F| ',
  overlay: true,
  precision: 2,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<KeltnerAroonEfiFlowInputs> = {},
): IndicatorResult & { plotCandles: Record<string, PlotCandleData[]> } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));

  // Votes (constant toggles: each function runs on every bar or on none)
  const s1: number[] = new Array(n).fill(NaN);
  const s2: number[] = new Array(n).fill(NaN);
  const s3: number[] = new Array(n).fill(NaN);
  if (cfg.on1) {
    // f_keltner: ema(close, len) +- atr(10) * mult
    const ma = A(ta.ema(close, cfg.kcLength));
    const rng = A(ta.atr(bars, 10));
    for (let i = 0; i < n; i++) {
      const upper = ma[i] + rng[i] * cfg.kcMult;
      const lower = ma[i] - rng[i] * cfg.kcMult;
      let val = 0;
      if (gt(bars[i].close, upper)) val = 1;
      if (lt(bars[i].close, lower)) val = -1;
      s1[i] = val;
    }
  }
  if (cfg.on2) {
    // f_aroon: 100 * (ta.highestbars(high, len) + len) / len, same with lowestbars(low)
    const len = cfg.aroonLength;
    const hb = A(ta.highestbars(S(bars.map((b) => b.high)), len));
    const lb = A(ta.lowestbars(S(bars.map((b) => b.low)), len));
    for (let i = 0; i < n; i++) {
      const upper = (100 * (hb[i] + len)) / len;
      const lower = (100 * (lb[i] + len)) / len;
      let val = 0;
      if (gt(upper, lower) && gt(upper, 70)) val = 1;
      if (gt(lower, upper) && gt(lower, 70)) val = -1;
      s2[i] = val;
    }
  }
  if (cfg.on3) {
    // f_efi: ema((close - close[1]) * volume, len)
    const efiRaw = bars.map((b, i) => (i > 0 ? (b.close - bars[i - 1].close) * (b.volume ?? NaN) : NaN));
    const efiSmooth = A(ta.ema(S(efiRaw), cfg.efiLength));
    for (let i = 0; i < n; i++) {
      let val = 0;
      if (gt(efiSmooth[i], 0)) val = 1;
      if (lt(efiSmooth[i], 0)) val = -1;
      s3[i] = val;
    }
  }

  const rawSignal = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let numerator = 0.0;
    let denominator = 0;
    if (cfg.on1 && !isNaN(s1[i])) { numerator += s1[i]; denominator += 1; }
    if (cfg.on2 && !isNaN(s2[i])) { numerator += s2[i]; denominator += 1; }
    if (cfg.on3 && !isNaN(s3[i])) { numerator += s3[i]; denominator += 1; }
    rawSignal[i] = denominator > 0 ? numerator / denominator : 0.0;
  }
  const avgSignal = cfg.useSmoothing
    ? A(ta.alma(S(rawSignal), cfg.smoothLength, cfg.smoothOffset, cfg.smoothSigma))
    : rawSignal;

  // Flow = avg > 0.1 ? 1 : avg < -0.1 ? -1 : 0
  const flow = avgSignal.map((v) => (gt(v, 0.1) ? 1 : lt(v, -0.1) ? -1 : 0));
  const colorMain = flow.map((f) => (f === 1 ? COL_LONG_DEEP : f === -1 ? COL_SHORT : COL_NEUTRAL));

  // Signal line: DEMA(200) of the close
  const ma1 = A(ta.ema(close, 200));
  const ma2 = A(ta.ema(S(ma1), 200));
  const sig = ma1.map((v, i) => 2 * v - ma2[i]);

  // [kaeft, kaefw] = ta.supertrend(3, 10)
  const [stS, dirS] = ta.supertrend(bars, 3, 10);
  const kaeft = A(stS);
  const kaefw = A(dirS);

  const longDeep80 = String(color.new(COL_LONG_DEEP, 80));
  const short80 = String(color.new(COL_SHORT, 80));
  const gray90 = String(color.new(color.gray, 90));
  const short90 = String(color.new(COL_SHORT, 90));
  const longDeep85 = String(color.new(COL_LONG_DEEP, 85));
  const gray95 = String(color.new(color.gray, 95));

  const num = (v: number) => (Number.isFinite(v) ? v : NaN);
  const plot0 = bars.map((b, i) => ({ time: b.time, value: num(sig[i]), color: colorMain[i] }));
  const plot1 = bars.map((b, i) => ({ time: b.time, value: b.close, color: String(color.new(colorMain[i], 100)) }));
  // kaefw < 0 (na compares false)
  const up = (i: number) => kaefw[i] < 0;
  const plot2 = bars.map((b, i) => ({ time: b.time, value: up(i) ? num(kaeft[i]) : NaN, color: COL_LONG_BBL }));
  const plot3 = bars.map((b, i) => ({ time: b.time, value: up(i) ? NaN : num(kaeft[i]), color: COL_SHORT }));

  const nulls = (): (string | null)[] => new Array(n).fill(null);
  const fills = [
    // fill(PlotSig, kaefUp, kaeft, sig, Flow == 1 ? color.new(col_long_deep, 80) : Flow == -1 ? na : gray 90, na)
    { plot1: 'plot0', plot2: 'plot2', gradient: {
      topValue: kaeft.map(num), bottomValue: sig.map(num),
      topColor: flow.map((f) => (f === 1 ? longDeep80 : f === -1 ? null : gray90)), bottomColor: nulls() } },
    // fill(PlotSig, kaefDown, kaeft, sig, Flow == -1 ? color.new(col_short, 80) : Flow == 1 ? na : gray 90, na)
    { plot1: 'plot0', plot2: 'plot3', gradient: {
      topValue: kaeft.map(num), bottomValue: sig.map(num),
      topColor: flow.map((f) => (f === -1 ? short80 : f === 1 ? null : gray90)), bottomColor: nulls() } },
    // fill(PlotSig, SRC, close, sig, Flow == -1 ? short 90 : Flow == 1 ? long_deep 85 : gray 95, na)
    { plot1: 'plot0', plot2: 'plot1', gradient: {
      topValue: bars.map((b) => b.close), bottomValue: sig.map(num),
      topColor: flow.map((f) => (f === -1 ? short90 : f === 1 ? longDeep85 : gray95)), bottomColor: nulls() } },
  ];

  // plotcandle(open, high, low, close, 'BarColor', color_main, wickcolor = color_main, bordercolor = color_main,
  //   force_overlay = true)
  const candles: PlotCandleData[] = bars.map((b, i) => ({
    time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
    color: colorMain[i], wickColor: colorMain[i], borderColor: colorMain[i], forceOverlay: true,
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: metadata.precision },
    plots: { plot0, plot1, plot2, plot3 },
    fills,
    plotCandles: { barColor: candles },
    // alertcondition(ta.crossover(avgIndicatorSignal, 0.1), "KAE Long");
    // alertcondition(ta.crossunder(avgIndicatorSignal, -0.1), "KAE Short")
    alerts: alertStates(alertConditions, bars, [crossedOver(avgSignal, 0.1), crossedUnder(avgSignal, -0.1)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'KAE Long', message: 'KAE Flow turned Bullish' },
  { id: 'alert1', title: 'KAE Short', message: 'KAE Flow turned Bearish' },
];

export const KeltnerAroonEfiFlow = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
