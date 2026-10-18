/**
 * UM EMA SMA WMA HMA with Directional Color Change
 *
 * A moving average (EMA, SMA, WMA or HMA) of the selected price, and a smoothing line: the same MA type of the MA.
 * Both lines are green when the MA is above the smoothing line and red otherwise (for the HMA: green when the MA is
 * below the smoothing line). The area between the two lines is filled green when the MA is above the smoothing line,
 * red otherwise; the area between the price and the MA is filled green when the MA rises, red otherwise. Optional
 * arrows mark the colour changes (red to green, green to red).
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Color Change' / 'Bearish Color Change' on the bars of the
 * red-to-green / green-to-red changes, when "Enable Alerts" is on.
 *
 * Reference: "UM EMA SMA WMA HMA with Directional Color Change" by UnderwearMillionaire
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © UnderwearMillionaire
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { barInterval, barTime } from '../bar-time';

export type UmSourceOption = 'Close' | 'Open' | 'High' | 'Low' | 'OHLC4';
export type UmMaMethod = 'EMA' | 'SMA' | 'WMA' | 'HMA';

export interface UmEmaSmaWmaHmaWithDirectionalColorChangeInputs {
  /** Price source of the MA */
  srcOption: UmSourceOption;
  /** MA length */
  len: number;
  /** Plot offset (bars) of the MA, the smoothing line and the price plot */
  offset: number;
  /** MA type */
  typeMA: UmMaMethod;
  /** Length of the smoothing line (the same MA type of the MA) */
  smoothingLength: number;
  /** Show the colour change arrows */
  showArrows: boolean;
  /** Enable the alerts (the two alert conditions are false when off) */
  enableAlerts: boolean;
}

export const defaultInputs: UmEmaSmaWmaHmaWithDirectionalColorChangeInputs = {
  srcOption: 'OHLC4',
  len: 65,
  offset: 0,
  typeMA: 'EMA',
  smoothingLength: 2,
  showArrows: false,
  enableAlerts: true,
};

export const inputConfig: InputConfig[] = [
  {
    id: 'srcOption', type: 'string', title: 'Source', defval: 'OHLC4', options: ['Close', 'Open', 'High', 'Low', 'OHLC4'],
    tooltip: 'Select the price source for the MA calculation.',
  },
  { id: 'len', type: 'int', title: 'Length', defval: 65, min: 1 },
  { id: 'offset', type: 'int', title: 'Offset', defval: 0, min: -500, max: 500 },
  { id: 'typeMA', type: 'string', title: 'Method', defval: 'EMA', options: ['EMA', 'SMA', 'WMA', 'HMA'] },
  { id: 'smoothingLength', type: 'int', title: 'Smoothing Length', defval: 2, min: 1, max: 100 },
  { id: 'showArrows', type: 'bool', title: 'Show Arrows', defval: false },
  { id: 'enableAlerts', type: 'bool', title: 'Enable Alerts', defval: true },
];

const PRICE_COL = String(color.new(color.gray, 100));
const FILL_UP_80 = String(color.new(color.green, 80));
const FILL_DN_80 = String(color.new(color.red, 80));
const FILL_UP_90 = String(color.new(color.green, 90));
const FILL_DN_90 = String(color.new(color.red, 90));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MA', color: color.green, lineWidth: 1 },
  { id: 'plot1', title: 'Smoothing Line', color: color.green, lineWidth: 1 },
  { id: 'plot2', title: 'Price', color: PRICE_COL, lineWidth: 1 },
];

export const metadata = {
  title: 'UM EMA SMA WMA HMA with Directional Color Change',
  shortTitle: 'UM-MA-w-Color-Change',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<UmEmaSmaWmaHmaWithDirectionalColorChangeInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series | number[]) => (Array.isArray(s) ? s : s.toArray()).map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // src = switch srcOption
  const src = bars.map((b) => {
    switch (cfg.srcOption) {
      case 'Close': return b.close;
      case 'Open': return b.open;
      case 'High': return b.high;
      case 'Low': return b.low;
      default: return (b.open + b.high + b.low + b.close) / 4;
    }
  });

  // ma(source, length, type): the type is an input, so the taken switch branch runs on every bar
  const ma = (source: number[], length: number): number[] => {
    switch (cfg.typeMA) {
      case 'SMA': return A(ta.sma(S(source), length));
      case 'WMA': return A(ta.wma(S(source), length));
      case 'HMA': {
        // ta.wma(2 * ta.wma(source, length / 2) - ta.wma(source, length), math.round(math.sqrt(length))):
        // length / 2 keeps the fraction in Pine v6, ta.wma truncates it; length 1 gives ta.wma(source, 0.5): a Pine
        // runtime error on the first bar
        if (Math.floor(length / 2) < 1) {
          throw new Error("Error on bar 0: Invalid value of the 'length' argument (0.0) in the 'wma' function. It must be > 0.");
        }
        const half = A(ta.wma(S(source), length / 2));
        const full = A(ta.wma(S(source), length));
        return A(ta.wma(S(half.map((h, i) => 2 * h - full[i])), Math.round(Math.sqrt(length))));
      }
      default: return A(ta.ema(S(source), length));
    }
  };
  const out = ma(src, cfg.len);
  const smoothingLine = ma(out, cfg.smoothingLength);
  const isHMA = cfg.typeMA === 'HMA';

  // outCurrColor = isHMA ? (out < smoothingLine ? green : red) : (out > smoothingLine ? green : red)
  const up = out.map((o, i) => (isHMA ? lt(o, smoothingLine[i]) : gt(o, smoothingLine[i])));
  const currColor = up.map((u) => (u ? color.green : color.red));

  const interval = barInterval(bars);
  const k = cfg.offset;
  // plot(..., offset = k): the value (and colour) of bar i is drawn on bar i + k
  const shifted = (values: number[], colorAt: (i: number) => string): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i < n; i++) {
      if (i + k < 0) continue;
      pts.push({ time: barTime(bars, i + k, interval), value: Number.isFinite(values[i]) ? values[i] : NaN, color: colorAt(i) });
    }
    return pts;
  };

  const markers: MarkerData[] = [];
  const maFill: string[] = new Array(n);
  const priceFill: string[] = new Array(n);
  const longFlags: boolean[] = [];
  const shortFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    // plotLong = outPrevColor == red and outCurrColor == green (outPrevColor: the same test on bar i - 1, red on bar 0)
    const prevUp = i > 0 && up[i - 1];
    const plotLong = !prevUp && up[i];
    const plotShort = prevUp && !up[i];
    longFlags.push(plotLong && cfg.enableAlerts);
    shortFlags.push(plotShort && cfg.enableAlerts);
    if (cfg.showArrows && plotLong) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: color.green });
    }
    if (cfg.showArrows && plotShort) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'triangleDown', color: color.red });
    }
    // fill(emaPlot, smoothingPlot, color = out > smoothingLine ? color.new(green, 80) : color.new(red, 80))
    maFill[i] = gt(out[i], smoothingLine[i]) ? FILL_UP_80 : FILL_DN_80;
    // fill(pricePlot, emaPlot, color = out > out[1] ? color.new(green, 90) : color.new(red, 90))
    priceFill[i] = i > 0 && gt(out[i], out[i - 1]) ? FILL_UP_90 : FILL_DN_90;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: shifted(out, (i) => currColor[i]),
      plot1: shifted(smoothingLine, (i) => currColor[i]),
      plot2: shifted(src, () => PRICE_COL),
    },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', colors: maFill },
      { plot1: 'plot2', plot2: 'plot0', colors: priceFill },
    ],
    markers,
    // alertcondition(plotLong and enableAlerts) / alertcondition(plotShort and enableAlerts)
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Color Change', message: 'MA and Smoothing Line Bullish Color Change (Red to Green)' },
  { id: 'alert1', title: 'Bearish Color Change', message: 'MA and Smoothing Line Bearish Color Change (Green to Red)' },
];

export const UmEmaSmaWmaHmaWithDirectionalColorChange = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
