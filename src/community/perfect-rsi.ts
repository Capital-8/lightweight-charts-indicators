/**
 * Perfect RSI (Enhanced RSI)
 *
 * The average of thirteen RSI variants. Set 1 (on the close): RSI of the source, a "dynamic" RSI (RSI of
 * (high + close) / 2 when the close fell, else of (low + close) / 2), an EMA-based Wilder RSI, the RSI of the momentum
 * src - src[len], the RSI of the close (PPO group) and the RSI of the TSI (EMA 10 then EMA 5 of the change, over the
 * same of its absolute value). Set 2 does the same on hlcc4 and adds the RSI of the +DI (DMI on hlcc4 changes, true
 * range RMA). The line is the average of the two set averages. The background is red when the line is above
 * OB - |line - RSI of TSI| * (0.972741476 - 0.95) (not below 0) and green when it is below
 * OS + |line - RSI of TSI| * (0.972741476 - 0.95) (not above 100).
 * Alerts (alertcondition, `alerts` of the result): 'RSI Oversold' / 'RSI Overbought', true on the bars of each zone.
 *
 * Reference: "Perfect RSI" by HabibiBudo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, fixnan, getSourceSeries, type InputConfig, type PlotConfig, type Bar, type IndicatorResult, type SourceType } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PerfectRsiInputs {
  /** RSI length (Regular) - 1 */
  len: number;
  /** Source (Regular) - 1 */
  src: SourceType;
  /** RSI length (Dynamic) - 1 */
  rsiLength: number;
  /** RSI length (DMI) - 1: not used by the outputs (the set 1 DMI RSI is not in the average) */
  len1: number;
  /** RSI length (Wilder) - 1 */
  rsiLength2: number;
  /** Long length (TSI) - 1 */
  long: number;
  /** Short length (TSI) - 1 */
  short: number;
  /** RSI length (Momentum) - 1 */
  len4: number;
  /** Source (Momentum) - 1 */
  src2: SourceType;
  /** Short length (PPO) - 1: not used by the outputs */
  shortlen: number;
  /** Long length (PPO) - 1: not used by the outputs */
  longlen: number;
  /** Source (PPO) - 1: not used by the outputs */
  src3: SourceType;
  /** exponential (PPO) - 1: not used by the outputs */
  exp: boolean;
  /** RSI length (PPO) - 1 (RSI of the close) */
  lengthRsi: number;
  /** RSI length (Regular) - 2 */
  len3_1: number;
  /** Source (Regular) - 2 */
  src_1: SourceType;
  /** RSI length (Dynamic) - 2 */
  rsiLength_2: number;
  /** RSI length (DMI) - 2 */
  len_3: number;
  /** RSI length (Wilder) - 2 */
  rsiLength2_2: number;
  /** Long length (TSI) - 2 */
  long_3: number;
  /** Short length (TSI) - 2 */
  short_3: number;
  /** RSI length (Momentum) - 2 */
  len4_4: number;
  /** Source (Momentum) - 2 */
  src4_4: SourceType;
  /** Short length (PPO) - 2: not used by the outputs */
  shortlen_5: number;
  /** Long length (PPO) - 2: not used by the outputs */
  longlen_5: number;
  /** Source (PPO) - 2: not used by the outputs */
  src2_5: SourceType;
  /** exponential (PPO) - 2: not used by the outputs */
  exp_5: boolean;
  /** RSI length (PPO) - 2 (RSI of hlcc4) */
  lengthRsi_5: number;
  /** OB level */
  ob: number;
  /** OS level */
  os: number;
}

export const defaultInputs: PerfectRsiInputs = {
  len: 5,
  src: 'close',
  rsiLength: 5,
  len1: 5,
  rsiLength2: 5,
  long: 10,
  short: 5,
  len4: 5,
  src2: 'close',
  shortlen: 5,
  longlen: 10,
  src3: 'close',
  exp: false,
  lengthRsi: 5,
  len3_1: 5,
  src_1: 'hlcc4',
  rsiLength_2: 5,
  len_3: 5,
  rsiLength2_2: 5,
  long_3: 10,
  short_3: 5,
  len4_4: 5,
  src4_4: 'hlcc4',
  shortlen_5: 5,
  longlen_5: 10,
  src2_5: 'hlcc4',
  exp_5: false,
  lengthRsi_5: 5,
  ob: 70,
  os: 30,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'RSI Length (Regular) - 1', defval: 5, min: 1, group: 'RSI' },
  { id: 'src', type: 'source', title: 'Source (Regular) - 1', defval: 'close' },
  { id: 'rsiLength', type: 'int', title: 'RSI Length (Dynamic) - 1', defval: 5, min: 1, group: 'Dynamic RSI' },
  { id: 'len1', type: 'int', title: 'RSI Length (DMI) - 1', defval: 5, min: 1, group: 'DMI RSI' },
  { id: 'rsiLength2', type: 'int', title: 'RSI Length (Wilder) - 1', defval: 5, group: 'Wilder RSI' },
  { id: 'long', type: 'int', title: 'Long Length (TSI) - 1', defval: 10, group: 'TSI RSI' },
  { id: 'short', type: 'int', title: 'Short Length (TSI) - 1', defval: 5, group: 'TSI RSI' },
  { id: 'len4', type: 'int', title: 'RSI Length (Momentum) - 1', defval: 5, min: 1, group: 'Momentum RSI' },
  { id: 'src2', type: 'source', title: 'Source (Momentum) - 1', defval: 'close', group: 'Momentum RSI' },
  { id: 'shortlen', type: 'int', title: 'Short Length (PPO) - 1', defval: 5, min: 1, group: 'PPO RSI' },
  { id: 'longlen', type: 'int', title: 'Long Length (PPO) - 1', defval: 10, min: 1, group: 'PPO RSI' },
  { id: 'src3', type: 'source', title: 'Source (PPO) - 1', defval: 'close', group: 'PPO RSI' },
  { id: 'exp', type: 'bool', title: 'exponential (PPO) - 1', defval: false, group: 'PPO RSI' },
  { id: 'lengthRsi', type: 'int', title: 'RSI Length (PPO) - 1', defval: 5, min: 1, group: 'PPO RSI' },
  { id: 'len3_1', type: 'int', title: 'RSI Length (Regular - 2)', defval: 5, min: 1, group: 'RSI' },
  { id: 'src_1', type: 'source', title: 'Source (Regular) - 2', defval: 'hlcc4', group: 'RSI' },
  { id: 'rsiLength_2', type: 'int', title: 'RSI Length (Dynamic) - 2', defval: 5, min: 1, group: 'Dynamic RSI' },
  { id: 'len_3', type: 'int', title: 'RSI Length (DMI) - 2', defval: 5, min: 1, group: 'DMI RSI' },
  { id: 'rsiLength2_2', type: 'int', title: 'RSI Length (Wilder) - 2', defval: 5, group: 'Wilder RSI' },
  { id: 'long_3', type: 'int', title: 'Long Length (TSI) - 2', defval: 10, group: 'TSI RSI' },
  { id: 'short_3', type: 'int', title: 'Short Length (TSI) - 2', defval: 5, group: 'TSI RSI' },
  { id: 'len4_4', type: 'int', title: 'RSI Length (Momentum) - 2', defval: 5, min: 1, group: 'Momentum RSI' },
  { id: 'src4_4', type: 'source', title: 'Source (Momentum) - 2', defval: 'hlcc4', group: 'Momentum RSI' },
  { id: 'shortlen_5', type: 'int', title: 'Short Length (PPO) - 2', defval: 5, min: 1, group: 'PPO RSI' },
  { id: 'longlen_5', type: 'int', title: 'Long Length (PPO) - 2', defval: 10, min: 1, group: 'PPO RSI' },
  { id: 'src2_5', type: 'source', title: 'Source (PPO) - 2', defval: 'hlcc4', group: 'PPO RSI' },
  { id: 'exp_5', type: 'bool', title: 'exponential (PPO) - 2', defval: false, group: 'PPO RSI' },
  { id: 'lengthRsi_5', type: 'int', title: 'RSI Length (PPO) - 2', defval: 5, min: 1, group: 'PPO RSI' },
  { id: 'ob', type: 'int', title: 'OB Level', defval: 70, group: 'OB/OS Levels' },
  { id: 'os', type: 'int', title: 'OS Level', defval: 30, group: 'OB/OS Levels' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Improved RSI', color: 'rgb(246, 249, 252)', lineWidth: 1 },
];

export const metadata = {
  title: 'Enhanced RSI',
  shortTitle: 'Enhanced RSI',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
/** Pine math.max / math.min: na when an argument is na */
const max = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));
const min = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));

/** Correlation coefficient of the dynamic levels */
const CC = 0.972741476;
const CORRELATION_THRESHOLD = 0.95;

export function calculate(
  bars: Bar[],
  inputs: Partial<PerfectRsiInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = (s: SourceType) => A(getSourceSeries(bars, s));
  const rsi = (a: number[], len: number) => A(ta.rsi(S(a), len));
  const ema = (a: number[], len: number) => A(ta.ema(S(a), len));
  const at = (a: number[], i: number, k: number) => (i - k >= 0 ? a[i - k] : NaN);
  const change = (a: number[]) => a.map((v, i) => v - at(a, i, 1));

  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const hlcc4 = bars.map((b) => (b.high + b.low + b.close + b.close) / 4);
  const tr = A(ta.tr(bars, false));

  // Dynamic RSI: priceDiff = p[1] - p; priceDiff > 0 ? rsi((high + p) / 2) : rsi((low + p) / 2)
  const dynamic = (p: number[], len: number) => {
    const rHigh = rsi(p.map((v, i) => (high[i] + v) / 2), len);
    const rLow = rsi(p.map((v, i) => (low[i] + v) / 2), len);
    return p.map((v, i) => (gt(at(p, i, 1) - v, 0) ? rHigh[i] : rLow[i]));
  };
  // Wilder's RSI: EMA of the gains / losses, 100 - 100 / (1 + avgGains / avgLosses) (plain division)
  const wilder = (p: number[], len: number) => {
    const d = change(p);
    const avgGains = ema(d.map((v) => max(v, 0)), len);
    const avgLosses = ema(d.map((v) => Math.abs(min(v, 0))), len);
    return avgGains.map((g, i) => 100 - 100 / (1 + g / avgLosses[i]));
  };
  // TSI RSI: tsi = 100 * ema(ema(pc, long), short) / ema(ema(|pc|, long), short); rsi(tsi, short)
  const tsiRsi = (p: number[], long: number, short: number) => {
    const pc = change(p);
    const num = ema(ema(pc, long), short);
    const den = ema(ema(pc.map((v) => Math.abs(v)), long), short);
    return rsi(num.map((v, i) => 100 * (v / den[i])), short);
  };
  // Momentum RSI: rsi(p - p[len], len)
  const momRsi = (p: number[], len: number) => rsi(p.map((v, i) => v - at(p, i, len)), len);
  // DMI RSI (+DI): plusDM on the changes of p, plus = fixnan(100 * rma(plusDM, len) / rma(ta.tr, len)); rsi(plus, len)
  const dmiPlusRsi = (p: number[], len: number) => {
    const up = change(p);
    const plusDM = up.map((u) => (isNaN(u) ? NaN : gt(u, -u) && gt(u, 0) ? u : 0));
    const trur = A(ta.rma(S(tr), len));
    const rmaPlus = A(ta.rma(S(plusDM), len));
    const plus = fixnan(rmaPlus.map((v, i) => (100 * v) / trur[i]));
    return rsi(plus, len);
  };

  // Set 1
  const rsiValue = rsi(src(cfg.src), cfg.len);
  const rsiPlusDynamic = dynamic(close, cfg.rsiLength);
  const rsi2Advanced = wilder(close, cfg.rsiLength2);
  const RSITSI = tsiRsi(close, cfg.long, cfg.short);
  const rsimom = momRsi(src(cfg.src2), cfg.len4);
  const rsiPpo = rsi(close, cfg.lengthRsi);
  // Set 2
  const rsiValue1 = rsi(src(cfg.src_1), cfg.len3_1);
  const rsiPlusDynamic2 = dynamic(hlcc4, cfg.rsiLength_2);
  const rsiPlus1 = dmiPlusRsi(hlcc4, cfg.len_3);
  const rsi2Advanced2 = wilder(hlcc4, cfg.rsiLength2_2);
  const RSITSI3 = tsiRsi(hlcc4, cfg.long_3, cfg.short_3);
  const rsimom4 = momRsi(src(cfg.src4_4), cfg.len4_4);
  const rsiPpo5 = rsi(hlcc4, cfg.lengthRsi_5);

  const plot0: { time: number; value: number; color: string }[] = [];
  const bgColors: BgColorData[] = [];
  const osFlags: boolean[] = [], obFlags: boolean[] = [];
  const lineColor = 'rgb(246, 249, 252)';
  for (let i = 0; i < n; i++) {
    const RSI1 = (rsiPlusDynamic[i] + rsi2Advanced[i] + rsimom[i] + rsiPpo[i] + RSITSI[i] + rsiValue[i]) / 6;
    const RSI2 = (rsiValue1[i] + rsiPlusDynamic2[i] + rsimom4[i] + rsiPpo5[i] + RSITSI3[i] + rsi2Advanced2[i] + rsiPlus1[i]) / 7;
    const RSI = (RSI1 + RSI2) / 2;
    const rsiDiff = Math.abs(RSI - RSITSI[i]);
    const overboughtLevel = max(cfg.ob - rsiDiff * (CC - CORRELATION_THRESHOLD), 0);
    const oversoldLevel = min(cfg.os + rsiDiff * (CC - CORRELATION_THRESHOLD), 100);
    const overboughtZone = gt(RSI, overboughtLevel);
    const oversoldZone = lt(RSI, oversoldLevel);
    obFlags.push(overboughtZone);
    osFlags.push(oversoldZone);
    // bgcolor(overboughtZone ? #ff000080 : oversoldZone ? #00ff0880 : na)
    if (overboughtZone) bgColors.push({ time: bars[i].time, color: '#ff000080' });
    else if (oversoldZone) bgColors.push({ time: bars[i].time, color: '#00ff0880' });
    plot0.push({ time: bars[i].time, value: Number.isFinite(RSI) ? RSI : NaN, color: lineColor });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    hlines: [
      { value: cfg.ob, options: { title: 'Overbought', color: '#6a00ff', linestyle: 'dashed' } },
      { value: cfg.os, options: { title: 'Oversold', color: '#6a00ff', linestyle: 'dashed' } },
    ],
    bgColors,
    // alertcondition(oversoldZone, 'RSI Oversold') / alertcondition(overboughtZone, 'RSI Overbought')
    alerts: alertStates(alertConditions, bars, [osFlags, obFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'RSI Oversold', message: 'RSI is oversold!' },
  { id: 'alert1', title: 'RSI Overbought', message: 'RSI is overbought!' },
];

export const PerfectRsi = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
