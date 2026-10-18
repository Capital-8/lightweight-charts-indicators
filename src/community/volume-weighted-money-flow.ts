/**
 * Volume-Weighted Money Flow
 *
 * A weighted average of five money flow measures on a 0..100 scale (50 = neutral): the MFI of hlc3, the CMF
 * ((sum of money flow volume / sum of volume + 1) * 50), and OBV, PVT and A/D minus their moving average (EMA or SMA),
 * each divided by the largest absolute value of that difference over the window and centred on 50. The bullish
 * strength is the share of the five measures above 50. The background is coloured by the side of the oscillator (or
 * of the strength), with an opacity that grows with the number of measures on that side.
 *
 * Alerts (alertcondition, `alerts` of the result): the oscillator crossing above / below 50, a bullish (bearish)
 * strength of 60 to 99 % and of 100 %.
 *
 * Reference: "Volume-Weighted Money Flow [sgbpulse]" by sgbpulse
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © sgbpulse
 */

import { ta, math, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface VolumeWeightedMoneyFlowInputs {
  /** Weight of the OBV (%) */
  wObv: number;
  /** Weight of the PVT (%) */
  wPvt: number;
  /** Weight of the A/D (%) */
  wAccDist: number;
  /** Weight of the CMF (%) */
  wCmf: number;
  /** Weight of the MFI (%) */
  wMfi: number;
  mfiLength: number;
  /** Moving average of OBV, PVT and A/D */
  maType: 'EMA' | 'SMA';
  /** Moving average length, normalisation window and CMF length */
  volumeFlowMaLength: number;
  /** Background opacity source: the oscillator or the bullish strength */
  bgColorLogic: 'Weighted Value' | 'Strength';
  bullishColor: string;
  bearishColor: string;
  oscillatorColor: string;
}

export const defaultInputs: VolumeWeightedMoneyFlowInputs = {
  wObv: 20.0,
  wPvt: 20.0,
  wAccDist: 20.0,
  wCmf: 20.0,
  wMfi: 20.0,
  mfiLength: 14,
  maType: 'EMA',
  volumeFlowMaLength: 20,
  bgColorLogic: 'Weighted Value',
  bullishColor: '#88b8e3',
  bearishColor: '#ae9d9d',
  oscillatorColor: color.blue,
};

export const inputConfig: InputConfig[] = [
  { id: 'wObv', type: 'float', title: 'Weight - OBV (%)', defval: 20.0, min: 0.0, max: 100.0 },
  { id: 'wPvt', type: 'float', title: 'Weight - PVT (%)', defval: 20.0, min: 0.0, max: 100.0 },
  { id: 'wAccDist', type: 'float', title: 'Weight - A/D (%)', defval: 20.0, min: 0.0, max: 100.0 },
  { id: 'wCmf', type: 'float', title: 'Weight - CMF (%)', defval: 20.0, min: 0.0, max: 100.0 },
  { id: 'wMfi', type: 'float', title: 'Weight - MFI (%)', defval: 20.0, min: 0.0, max: 100.0 },
  { id: 'mfiLength', type: 'int', title: 'MFI Length', defval: 14, min: 1, max: 100 },
  { id: 'maType', type: 'string', title: 'Moving Average Type', defval: 'EMA', options: ['EMA', 'SMA'] },
  { id: 'volumeFlowMaLength', type: 'int', title: 'Volume Flow MA Length', defval: 20, min: 10, max: 50 },
  { id: 'bgColorLogic', type: 'string', title: 'Background Color Logic', defval: 'Weighted Value', options: ['Weighted Value', 'Strength'] },
  { id: 'bullishColor', type: 'color', title: 'Bullish Consensus Color', defval: '#88b8e3' },
  { id: 'bearishColor', type: 'color', title: 'Bearish Consensus Color', defval: '#ae9d9d' },
  { id: 'oscillatorColor', type: 'color', title: 'VWMF Color', defval: color.blue },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'VWMF', color: color.blue, lineWidth: 1 },
  { id: 'plot1', title: 'Bullish Strength %', color: color.blue, lineWidth: 1, display: 'status_line' },
  { id: 'plot2', title: 'Bearish Strength %', color: color.blue, lineWidth: 1, display: 'status_line' },
  { id: 'plot3', title: 'Normalized OBV', color: '#88b8e3', lineWidth: 1, display: 'data_window' },
  { id: 'plot4', title: 'Normalized PVT', color: '#88b8e3', lineWidth: 1, display: 'data_window' },
  { id: 'plot5', title: 'Normalized A/D', color: '#88b8e3', lineWidth: 1, display: 'data_window' },
  { id: 'plot6', title: 'Normalized CMF', color: '#88b8e3', lineWidth: 1, display: 'data_window' },
  { id: 'plot7', title: 'Normalized MFI', color: '#88b8e3', lineWidth: 1, display: 'data_window' },
];

export const metadata = {
  title: 'Volume-Weighted Money Flow [sgbpulse]',
  shortTitle: 'VWMF [sgbpulse]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

const CENTER = 50.0;

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeWeightedMoneyFlowInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = cfg.volumeFlowMaLength;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

  // ma(type, source, length): SMA or EMA
  const ma = (src: number[]) => A(cfg.maType === 'SMA' ? ta.sma(S(src), len) : ta.ema(S(src), len));

  // normalizeCentered(source, length): max(|highest|, |lowest|); 50 when it is 0 or na
  const normalizeCentered = (src: number[]) => {
    const hi = A(ta.highest(S(src), len));
    const lo = A(ta.lowest(S(src), len));
    return src.map((v, i) => {
      const maxAbs = Math.max(Math.abs(hi[i]), Math.abs(lo[i]));
      return ne(maxAbs, 0) ? (v / maxAbs) * CENTER + CENTER : CENTER;
    });
  };

  const hlc3 = bars.map((b) => (b.high + b.low + b.close) / 3);
  const vol = bars.map((b) => b.volume ?? NaN);
  const stdMfi = A(ta.mfi(S(hlc3), cfg.mfiLength, S(vol)));
  const stdObv = A(ta.obv(bars));
  const stdPvt = A(ta.pvt(bars));
  const stdAccumDist = A(ta.accdist(bars));
  // close == high and close == low or high == low ? 0 : ((2 * close - low - high) / (high - low)) * volume
  const mfv = bars.map((b, i) => ((eq(b.close, b.high) && eq(b.close, b.low)) || eq(b.high, b.low)
    ? 0 : ((2 * b.close - b.low - b.high) / (b.high - b.low)) * vol[i]));
  const sumMfv = A(math.sum(S(mfv), len) as Series);
  const sumVol = A(math.sum(S(vol), len) as Series);
  const stdCmf = sumMfv.map((v, i) => v / sumVol[i]);

  const obvMa = ma(stdObv);
  const pvtMa = ma(stdPvt);
  const adMa = ma(stdAccumDist);

  const normalizedMfi = stdMfi;
  const normalizedObv = normalizeCentered(stdObv.map((v, i) => v - obvMa[i]));
  const normalizedPvt = normalizeCentered(stdPvt.map((v, i) => v - pvtMa[i]));
  const normalizedAccDist = normalizeCentered(stdAccumDist.map((v, i) => v - adMa[i]));
  const normalizedCmf = stdCmf.map((v) => (v + 1) * CENTER);

  const totalWeight = cfg.wObv + cfg.wPvt + cfg.wAccDist + cfg.wMfi + cfg.wCmf;
  const combined: number[] = new Array(n);
  const bullStrength: number[] = new Array(n);
  const bearStrength: number[] = new Array(n);
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    const comps = [normalizedMfi[i], normalizedObv[i], normalizedPvt[i], normalizedAccDist[i], normalizedCmf[i]];
    let c = normalizedMfi[i] * cfg.wMfi + normalizedObv[i] * cfg.wObv + normalizedPvt[i] * cfg.wPvt
      + normalizedAccDist[i] * cfg.wAccDist + normalizedCmf[i] * cfg.wCmf;
    if (ne(totalWeight, 0)) c = c / totalWeight;
    combined[i] = c;
    const bullishCount = comps.filter((v) => gt(v, CENTER)).length;
    const bearishCount = comps.filter((v) => lt(v, CENTER)).length;
    bullStrength[i] = (bullishCount / 5.0) * 100;
    bearStrength[i] = 100.0 - bullStrength[i];
    const active = cfg.bgColorLogic === 'Weighted Value' ? c : bullStrength[i];
    if (gt(active, CENTER)) {
      bgColors.push({ time: bars[i].time, color: String(color.new(cfg.bullishColor, 100 - bullishCount * 15)) });
    } else if (lt(active, CENTER)) {
      bgColors.push({ time: bars[i].time, color: String(color.new(cfg.bearishColor, 100 - bearishCount * 15)) });
    }
  }

  // The alertconditions of the original
  const prevOf = (i: number) => (i > 0 ? combined[i - 1] : NaN);
  const crossAbove = combined.map((v, i) => gt(v, CENTER) && le(prevOf(i), CENTER));
  const crossBelow = combined.map((v, i) => lt(v, CENTER) && ge(prevOf(i), CENTER));
  const bullHigh = bullStrength.map((v) => ge(v, 60) && lt(v, 100));
  const bullAll = bullStrength.map((v) => ge(v, 100));
  const bearHigh = bearStrength.map((v) => ge(v, 60) && lt(v, 100));
  const bearAll = bearStrength.map((v) => ge(v, 100));

  const t = (i: number) => bars[i].time;
  const sideColor = (v: number) => (gt(v, CENTER) ? cfg.bullishColor : cfg.bearishColor);
  const comp = (arr: number[]) => arr.map((v, i) => ({ time: t(i), value: fin(v), color: sideColor(v) }));
  const plots = {
    plot0: combined.map((v, i) => ({ time: t(i), value: fin(v), color: cfg.oscillatorColor })),
    plot1: bullStrength.map((v, i) => ({ time: t(i), value: v })),
    plot2: bearStrength.map((v, i) => ({ time: t(i), value: v })),
    plot3: comp(normalizedObv),
    plot4: comp(normalizedPvt),
    plot5: comp(normalizedAccDist),
    plot6: comp(normalizedCmf),
    plot7: comp(normalizedMfi),
  };

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [{ value: CENTER, options: { title: 'Center Line', color: color.gray, linestyle: 'dashed' } }],
    bgColors,
    alerts: alertStates(alertConditions, bars, [crossAbove, crossBelow, bullHigh, bullAll, bearHigh, bearAll]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'VWMF Cross Above 50', message: '{{ticker}}: Volume-Weighted Money Flow crossed above 50. Possible bullish momentum shift.' },
  { id: 'alert1', title: 'VWMF Cross Below 50', message: '{{ticker}}: Volume-Weighted Money Flow crossed below 50. Possible bearish momentum shift.' },
  { id: 'alert2', title: 'Bullish Strength: High But Not Absolute Consensus', message: '{{ticker}}: Bullish strength is high (between 60% and 80% consensus).' },
  { id: 'alert3', title: 'Bullish Strength: Absolute Consensus (100%)', message: '{{ticker}}: All 5 indicators show bullish strength.' },
  { id: 'alert4', title: 'Bearish Strength: High But Not Absolute Consensus', message: '{{ticker}}: Bearish strength is high (between 60% and 80% consensus).' },
  { id: 'alert5', title: 'Bearish Strength: Absolute Consensus (100%)', message: '{{ticker}}: All 5 indicators show bearish strength.' },
];

export const VolumeWeightedMoneyFlow = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
