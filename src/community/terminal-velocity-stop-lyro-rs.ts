/**
 * Terminal Velocity Stop
 *
 * A trailing stop that chases an ATR target (close - mult * ATR in an uptrend, close + multm * ATR in a downtrend)
 * but moves at most `Terminal Velocity` * ATR per bar, and only in the trend direction. When the close crosses the
 * stop the direction flips and the stop restarts at the target of the new direction. Bull / bear stop lines with a
 * glow, a gradient cloud between the stop and the close, a dot on the flips and candles coloured by the direction.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Flip' and 'Bearish Flip', true on the bars where the
 * direction flips up / down.
 *
 * Reference: "Terminal Velocity Stop | Lyro RS" by LyroRS
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LyroRS
 */

import { ta, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface TerminalVelocityStopLyroRsInputs {
  /** ATR length */
  atrLen: number;
  /** Stop distance (ATR multiples) in uptrends */
  mult: number;
  /** Stop distance (ATR multiples) in downtrends */
  multm: number;
  /** Terminal velocity: maximum stop move per bar, in ATR */
  vmax: number;
  /** Predefined colour palette */
  colMode: 'Classic' | 'Mystic' | 'Accented' | 'Royal';
  /** Use the custom up / down colours */
  useCustomPalette: boolean;
  customUpColor: string;
  customDownColor: string;
}

export const defaultInputs: TerminalVelocityStopLyroRsInputs = {
  atrLen: 14,
  mult: 3.0,
  multm: 3.0,
  vmax: 0.3,
  colMode: 'Mystic',
  useCustomPalette: false,
  customUpColor: '#00ff00',
  customDownColor: '#ff0000',
};

export const inputConfig: InputConfig[] = [
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 14, min: 1 },
  { id: 'mult', type: 'float', title: '+ Multiplier', defval: 3.0, min: 0.5, step: 0.25 },
  { id: 'multm', type: 'float', title: '- Multiplier', defval: 3.0, min: 0.5, step: 0.25 },
  { id: 'vmax', type: 'float', title: 'Terminal Velocity', defval: 0.3, min: 0.05, max: 2, step: 0.05 },
  { id: 'colMode', type: 'string', title: 'Custom Color Palette', defval: 'Mystic', options: ['Classic', 'Mystic', 'Accented', 'Royal'] },
  { id: 'useCustomPalette', type: 'bool', title: 'Use Custom Palette', defval: false },
  { id: 'customUpColor', type: 'color', title: 'Custom Up', defval: '#00ff00' },
  { id: 'customDownColor', type: 'color', title: 'Custom Down', defval: '#ff0000' },
];

const PALETTES: Record<string, [string, string]> = {
  Classic: ['#00E676', '#880E4F'],
  Mystic: ['#30FDCF', '#E117B7'],
  Accented: ['#9618F7', '#FF0078'],
  Royal: ['#FFC107', '#673AB7'],
};

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Bull Stop [Glow]', color: String(color.new('#30FDCF', 80)), lineWidth: 6, style: 'linebr' },
  { id: 'plot1', title: 'Bull Stop', color: '#30FDCF', lineWidth: 2, style: 'linebr' },
  { id: 'plot2', title: 'Bear Stop [Glow]', color: String(color.new('#E117B7', 80)), lineWidth: 6, style: 'linebr' },
  { id: 'plot3', title: 'Bear Stop', color: '#E117B7', lineWidth: 2, style: 'linebr' },
  { id: 'plot4', title: 'Stop Anchor', color: 'transparent', lineWidth: 1 },
  { id: 'plot5', title: 'Price Anchor', color: 'transparent', lineWidth: 1 },
  { id: 'plot6', title: 'Flip Dot', color: '#30FDCF', lineWidth: 4, style: 'circles' },
];

export const metadata = {
  title: 'Terminal Velocity Stop | Lyro RS',
  shortTitle: 'TVS | Lyro RS',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<TerminalVelocityStopLyroRsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  let [upC, dnC] = PALETTES[cfg.colMode] ?? ['transparent', 'transparent'];
  if (cfg.useCustomPalette) {
    upC = cfg.customUpColor;
    dnC = cfg.customDownColor;
  }

  const atr = ta.atr(bars, cfg.atrLen).toArray().map((v) => v ?? NaN);
  const stopArr: number[] = new Array(n);
  const dirArr: number[] = new Array(n);
  let stop = NaN; // var float stop = na
  let dir = 1; // var int dir = 1
  for (let i = 0; i < n; i++) {
    const close = bars[i].close;
    const a = atr[i];
    const target = dir === 1 ? close - cfg.mult * a : close + cfg.multm * a;
    if (isNaN(stop)) {
      stop = target;
    } else {
      const step = Math.max(Math.min(target - stop, cfg.vmax * a), -cfg.vmax * a);
      if (dir === 1) {
        stop = Math.max(stop, stop + step);
        if (lt(close, stop)) {
          dir = -1;
          stop = close + cfg.multm * a;
        }
      } else {
        stop = Math.min(stop, stop + step);
        if (gt(close, stop)) {
          dir = 1;
          stop = close - cfg.mult * a;
        }
      }
    }
    stopArr[i] = stop;
    dirArr[i] = dir;
  }

  const upGlow = String(color.new(upC, 80));
  const dnGlow = String(color.new(dnC, 80));
  const up90 = String(color.new(upC, 90));
  const up50 = String(color.new(upC, 50));
  const dn90 = String(color.new(dnC, 90));
  const dn50 = String(color.new(dnC, 50));
  const flipUp = (i: number) => dirArr[i] === 1 && i > 0 && dirArr[i - 1] === -1;
  const flipDown = (i: number) => dirArr[i] === -1 && i > 0 && dirArr[i - 1] === 1;
  const css = (i: number) => (dirArr[i] === 1 ? upC : dnC);
  const bull = (i: number) => (dirArr[i] === 1 && !flipUp(i) ? stopArr[i] : NaN);
  const bear = (i: number) => (dirArr[i] === -1 && !flipDown(i) ? stopArr[i] : NaN);

  const plots = {
    plot0: bars.map((b, i) => ({ time: b.time, value: bull(i), color: upGlow })),
    plot1: bars.map((b, i) => ({ time: b.time, value: bull(i), color: upC })),
    plot2: bars.map((b, i) => ({ time: b.time, value: bear(i), color: dnGlow })),
    plot3: bars.map((b, i) => ({ time: b.time, value: bear(i), color: dnC })),
    plot4: bars.map((b, i) => ({ time: b.time, value: stopArr[i] })),
    plot5: bars.map((b) => ({ time: b.time, value: b.close })),
    plot6: bars.map((b, i) => ({
      time: b.time, value: flipUp(i) || flipDown(i) ? stopArr[i] : NaN, color: String(color.new(css(i), 0)),
    })),
  };

  // fill(pStop, pPrice, top = dir == 1 ? stop : close, bottom = dir == 1 ? close : stop, topColor, bottomColor)
  const up = (i: number) => dirArr[i] === 1;
  const fills = [{
    plot1: 'plot4', plot2: 'plot5',
    gradient: {
      topValue: bars.map((b, i) => (up(i) ? stopArr[i] : b.close)),
      bottomValue: bars.map((b, i) => (up(i) ? b.close : stopArr[i])),
      topColor: bars.map((_b, i) => (up(i) ? up90 : dn50)),
      bottomColor: bars.map((_b, i) => (up(i) ? up50 : dn90)),
    },
  }];

  // plotcandle(open, high, low, close, color = css, wickcolor = css, bordercolor = css)
  const candles: PlotCandleData[] = bars.map((b, i) => ({
    time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
    color: css(i), wickColor: css(i), borderColor: css(i),
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    markers: [],
    plotCandles: { candles },
    // alertcondition(flipUp, 'Bullish Flip') / alertcondition(flipDown, 'Bearish Flip')
    alerts: alertStates(alertConditions, bars, [bars.map((_b, i) => flipUp(i)), bars.map((_b, i) => flipDown(i))]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Flip', message: 'TVS | Lyro RS: Bullish stop flip on {{ticker}} ({{interval}})' },
  { id: 'alert1', title: 'Bearish Flip', message: 'TVS | Lyro RS: Bearish stop flip on {{ticker}} ({{interval}})' },
];

export const TerminalVelocityStopLyroRs = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
