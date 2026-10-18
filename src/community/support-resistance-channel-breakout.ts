/**
 * Support/Resistance Channel Breakout [SuprAlgo]
 *
 * Resistance = highest high (or close) of the previous `period` bars, support = lowest low (or close) of the previous
 * `period` bars. A thin channel of +- multiplier * 0.0001 around each level is drawn with gradient fills. A breakout
 * label is drawn when the close leaves the resistance channel top (or the support channel bottom) after a close
 * inside it on the previous bar, at least `breakout_cooldown` bars after the previous breakout of the same side.
 *
 * Alerts (alertcondition, `alerts` of the result): '🔔 Breakout Resistance Channel' and '🔔 Breakout Support Channel' on
 * the bars of each breakout, '🔔 Breakout Support/Resistance Channel' on both (whether or not the labels are shown).
 *
 * Reference: "Support/Resistance Channel Breakout [SuprAlgo]" by SuprAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © SuprAlgo
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SupportResistanceChannelBreakoutInputs {
  /** Channel multiplier (1 = 0.0001 %) */
  rawChannelMultiplier: number;
  /** Number of bars of the support (lowest) and resistance (highest) */
  period: number;
  /** Price of the levels */
  src: 'High/Low' | 'Close';
  /** Minimum number of bars between two breakouts of the same side */
  breakoutCooldown: number;
  /** Support channel colour (bullish breakout label) */
  colourPositive: string;
  /** Resistance channel colour (bearish breakout label) */
  colourNegative: string;
  /** Show the breakout labels */
  showBreakout: boolean;
}

export const defaultInputs: SupportResistanceChannelBreakoutInputs = {
  rawChannelMultiplier: 5,
  period: 50,
  src: 'High/Low',
  breakoutCooldown: 10,
  colourPositive: '#00ff0a',
  colourNegative: '#ff0000',
  showBreakout: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'rawChannelMultiplier', type: 'float', title: 'Channel Multiplier (1 = 0.0001%)', defval: 5, min: 0 },
  { id: 'period', type: 'int', title: 'Period Support & Resistance', defval: 50, min: 1 },
  { id: 'src', type: 'string', title: 'Source', defval: 'High/Low', options: ['High/Low', 'Close'] },
  { id: 'breakoutCooldown', type: 'int', title: 'Minimum Bars Between Breakouts', defval: 10, min: 1 },
  { id: 'colourPositive', type: 'color', title: 'Support/Resistance Channel Color', defval: '#00ff0a' },
  { id: 'colourNegative', type: 'color', title: '', defval: '#ff0000' },
  { id: 'showBreakout', type: 'bool', title: 'Show BreakOut Labels', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Resistance Channel Top', color: String(color.new('#ff0000', 50)), lineWidth: 1 },
  { id: 'plot1', title: 'Resistance Channel Bottom', color: String(color.new('#ff0000', 50)), lineWidth: 1 },
  { id: 'plot2', title: 'Support Channel Top', color: String(color.new('#00ff0a', 50)), lineWidth: 1 },
  { id: 'plot3', title: 'Support Channel Bottom', color: String(color.new('#00ff0a', 50)), lineWidth: 1 },
  { id: 'plot4', title: 'Support', color: String(color.new('#00ff0a', 100)), lineWidth: 1 },
  { id: 'plot5', title: 'Resistance', color: String(color.new('#ff0000', 100)), lineWidth: 1 },
];

export const metadata = {
  title: 'Support/Resistance Channel Breakout [SuprAlgo]',
  shortTitle: 'Support/Resistance Channel Breakout [SuprAlgo]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<SupportResistanceChannelBreakoutInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const channelMultiplier = cfg.rawChannelMultiplier * 0.0001;
  const hl = cfg.src === 'High/Low';
  const sourceRes = bars.map((b) => (hl ? b.high : b.close));
  const sourceSup = bars.map((b) => (hl ? b.low : b.close));

  // ta.highest(source_res[1], period) / ta.lowest(source_sup[1], period)
  const resHigh = A(ta.highest(S(sourceRes.map((_v, i) => (i > 0 ? sourceRes[i - 1] : NaN))), cfg.period));
  const supLow = A(ta.lowest(S(sourceSup.map((_v, i) => (i > 0 ? sourceSup[i - 1] : NaN))), cfg.period));

  const resTop = resHigh.map((v) => v * (1 + channelMultiplier));
  const resBot = resHigh.map((v) => v * (1 - channelMultiplier));
  const supTop = supLow.map((v) => v * (1 + channelMultiplier));
  const supBot = supLow.map((v) => v * (1 - channelMultiplier));

  const neg50 = String(color.new(cfg.colourNegative, 50));
  const pos50 = String(color.new(cfg.colourPositive, 50));
  const neg100 = String(color.new(cfg.colourNegative, 100));
  const pos100 = String(color.new(cfg.colourPositive, 100));
  const neg30 = String(color.new(cfg.colourNegative, 30));
  const pos30 = String(color.new(cfg.colourPositive, 30));

  const markers: MarkerData[] = [];
  let lastTop = NaN; // var int last_top_breakout = na
  let lastBot = NaN;
  const flags: boolean[][] = [[], [], []];
  for (let i = 0; i < n; i++) {
    const close = bars[i].close;
    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    const wasInsideTop = le(prevClose, i > 0 ? resTop[i - 1] : NaN);
    const wasInsideBot = ge(prevClose, i > 0 ? supBot[i - 1] : NaN);
    const potentialTop = gt(close, resTop[i]) && wasInsideTop;
    const potentialBot = gt(supBot[i], close) && wasInsideBot;
    const canTop = isNaN(lastTop) || i - lastTop >= cfg.breakoutCooldown;
    const canBot = isNaN(lastBot) || i - lastBot >= cfg.breakoutCooldown;
    const finalTop = potentialTop && canTop;
    const finalBot = potentialBot && canBot;
    if (finalTop) lastTop = i;
    if (finalBot) lastBot = i;
    flags[0].push(finalTop);
    flags[1].push(finalBot);
    flags[2].push(finalTop || finalBot);
    if (cfg.showBreakout && finalTop) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: pos50,
        text: 'Breakout ↑', textColor: color.white, size: 'normal' });
    }
    if (cfg.showBreakout && finalBot) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: neg50,
        text: 'Breakout ↓', textColor: color.white, size: 'normal' });
    }
  }

  const P = (arr: number[], c: string) => bars.map((b, i) => ({ time: b.time, value: arr[i], color: c }));
  const fill = (c: string): string[] => new Array<string>(n).fill(c);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: P(resTop, neg50),
      plot1: P(resBot, neg50),
      plot2: P(supTop, pos50),
      plot3: P(supBot, pos50),
      plot4: P(supLow, pos100),
      plot5: P(resHigh, neg100),
    },
    fills: [
      { plot1: 'plot1', plot2: 'plot5', options: { title: 'Resistance Fill Down' },
        gradient: { topValue: resBot, bottomValue: resHigh, topColor: fill(neg30), bottomColor: fill(neg100) } },
      { plot1: 'plot0', plot2: 'plot5', options: { title: 'Resistance Fill Up' },
        gradient: { topValue: resTop, bottomValue: resHigh, topColor: fill(neg30), bottomColor: fill(neg100) } },
      { plot1: 'plot3', plot2: 'plot4', options: { title: 'Support Fill Down' },
        gradient: { topValue: supBot, bottomValue: supLow, topColor: fill(pos30), bottomColor: fill(pos100) } },
      { plot1: 'plot2', plot2: 'plot4', options: { title: 'Support Fill Up' },
        gradient: { topValue: supTop, bottomValue: supLow, topColor: fill(pos30), bottomColor: fill(pos100) } },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: '🔔 Breakout Resistance Channel', message: 'Breakout above resistance Channel detected.' },
  { id: 'alert1', title: '🔔 Breakout Support Channel', message: 'Breakout below support Channel detected.' },
  { id: 'alert2', title: '🔔 Breakout Support/Resistance Channel', message: 'Breakout Support/Resistance Channel detected.' },
];

export const SupportResistanceChannelBreakout = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
