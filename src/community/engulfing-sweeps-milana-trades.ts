/**
 * Engulfing Sweeps - Milana Trades
 *
 * A bullish engulfing sweep is a bar whose low takes the previous low and whose close is above the previous open; a
 * bearish one is a bar whose high takes the previous high and whose close is below the previous open. An optional
 * volume filter keeps only bars with a volume above the SMA of the volume times a multiplier. The patterns are shown
 * as arrows below / above the bar or as a highlighted candle colour (bar colour with the highlight opacity as
 * transparency; the bullish colour wins when both patterns are true).
 *
 * Alerts: 'Bullish Engulfing Alert' and 'Bearish Engulfing Alert' (alertcondition, `alerts` of the result), true on
 * the pattern bars, and the alert() calls of the original on the same bars ("Bullish Engulfing pattern detected!" /
 * "Bearish Engulfing pattern detected!", once per bar close, `alertCalls` of the result).
 *
 * Reference: "Engulfing Sweeps - Milana Trades" by MilanaArsenovna
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © MilanaArsenovna
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, BarColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface EngulfingSweepsMilanaTradesInputs {
  /** 'Arrow' = arrow above or below the bar, 'Highlight Candle' = bar colour */
  displayStyle: 'Arrow' | 'Highlight Candle';
  bullColor: string;
  bearColor: string;
  /** Transparency of the highlighted candle colour (0-100) */
  candleOpacity: number;
  /** Keep only patterns with a volume above the volume SMA * multiplier */
  useVolumeFilter: boolean;
  volumePeriod: number;
  volumeMult: number;
}

export const defaultInputs: EngulfingSweepsMilanaTradesInputs = {
  displayStyle: 'Highlight Candle',
  bullColor: color.green,
  bearColor: color.red,
  candleOpacity: 60,
  useVolumeFilter: false,
  volumePeriod: 20,
  volumeMult: 1.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'displayStyle', type: 'string', title: 'Display Style', defval: 'Highlight Candle', options: ['Arrow', 'Highlight Candle'] },
  { id: 'bullColor', type: 'color', title: 'Bullish Color', defval: color.green },
  { id: 'bearColor', type: 'color', title: 'Bearish Color', defval: color.red },
  { id: 'candleOpacity', type: 'int', title: 'Candle Highlight Opacity', defval: 60, min: 0, max: 100 },
  { id: 'useVolumeFilter', type: 'bool', title: 'Strong Only (Volume Filter)', defval: false },
  { id: 'volumePeriod', type: 'int', title: 'Volume MA Period', defval: 20, min: 1 },
  { id: 'volumeMult', type: 'float', title: 'Volume Multiplier', defval: 1.5, min: 1.0, step: 0.1 },
];

/** No plot(): the outputs are the arrow markers and the bar colours */
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Engulfing Sweeps - Milana Trades',
  shortTitle: 'Engulfing Sweeps - Milana Trades',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<EngulfingSweepsMilanaTradesInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] }
  & { alerts: AlertConditionState[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const avgVolume = ta.sma(new Series(bars, (b) => b.volume ?? NaN), cfg.volumePeriod).toArray().map((v) => v ?? NaN);
  const showArrow = cfg.displayStyle === 'Arrow';
  const showCandle = cfg.displayStyle === 'Highlight Candle';
  const bullHighlight = String(color.new(cfg.bullColor, cfg.candleOpacity));
  const bearHighlight = String(color.new(cfg.bearColor, cfg.candleOpacity));

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bullFlags: boolean[] = [];
  const bearFlags: boolean[] = [];
  const alertCalls: AlertCall[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    // prevHigh = ta.highest(high[1], 1), prevLow = ta.lowest(low[1], 1): the previous high / low
    const prevHigh = i >= 1 ? bars[i - 1].high : NaN;
    const prevLow = i >= 1 ? bars[i - 1].low : NaN;
    const prevOpen = i >= 1 ? bars[i - 1].open : NaN;
    const isHugeVolume = gt(b.volume ?? NaN, avgVolume[i] * cfg.volumeMult);
    const bullishEngulfing = lt(b.low, prevLow) && gt(b.close, prevOpen);
    const bearishEngulfing = gt(b.high, prevHigh) && lt(b.close, prevOpen);
    const bullishConfirmed = cfg.useVolumeFilter ? bullishEngulfing && isHugeVolume : bullishEngulfing;
    const bearishConfirmed = cfg.useVolumeFilter ? bearishEngulfing && isHugeVolume : bearishEngulfing;
    bullFlags.push(bullishConfirmed);
    bearFlags.push(bearishConfirmed);
    // if bullishConfirmed / bearishConfirmed: alert("... pattern detected!", alert.freq_once_per_bar_close)
    if (bullishConfirmed) alertCalls.push({ time: b.time, message: 'Bullish Engulfing pattern detected!', freq: 'once_per_bar_close' });
    if (bearishConfirmed) alertCalls.push({ time: b.time, message: 'Bearish Engulfing pattern detected!', freq: 'once_per_bar_close' });

    // plotshape(showArrow and bullishConfirmed, "Bullish Arrow", location.belowbar, bullColor, shape.arrowup, size.tiny)
    if (showArrow && bullishConfirmed) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'arrowUp', color: cfg.bullColor, size: 'tiny' });
    }
    // plotshape(showArrow and bearishConfirmed, "Bearish Arrow", location.abovebar, bearColor, shape.arrowdown, size.tiny)
    if (showArrow && bearishConfirmed) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'arrowDown', color: cfg.bearColor, size: 'tiny' });
    }
    // barcolor(showCandle and bullishConfirmed ? color.new(bullColor, candleOpacity)
    //        : showCandle and bearishConfirmed ? color.new(bearColor, candleOpacity) : na, title = "Candle Highlight")
    if (showCandle && bullishConfirmed) barColors.push({ time: b.time, color: bullHighlight });
    else if (showCandle && bearishConfirmed) barColors.push({ time: b.time, color: bearHighlight });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    barColors,
    // alertcondition(bullishConfirmed, ...) / alertcondition(bearishConfirmed, ...)
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
    alertCalls,
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Engulfing Alert', message: 'Bullish Engulfing pattern detected!' },
  { id: 'alert1', title: 'Bearish Engulfing Alert', message: 'Bearish Engulfing pattern detected!' },
];

export const EngulfingSweepsMilanaTrades = {
  calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions, hasAlertFunction,
};
