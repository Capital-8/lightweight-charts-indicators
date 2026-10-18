/**
 * Cycle-Synced Channel Breakout
 *
 * A Keltner channel (EMA of the close +- mult * ATR). Engulfing candles are marked with small triangles. A cycle
 * power is the EMA(5) of the square of EMA(3) of the detrended midpoint (hl2 - SMA(hl2, cycle lookback)). A buy
 * (sell) signal needs a bullish (bearish) engulfing candle or a strong body (body > 1.2 * average body), a close
 * above the upper (below the lower) band and a rising cycle power; after a signal, no new signal for the cooldown
 * bars. Signals draw BUY / SELL labels and a background colour.
 * Alerts (alertcondition, `alerts` of the result): 'Cycle Breakout BUY' / 'Cycle Breakout SELL', true on the bars of
 * the buy / sell signals (also with the signals hidden).
 *
 * Reference: "Cycle-Synced Channel Breakout-v1" by TradeTechanalysis
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © TradeTechanalysis
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface CycleSyncedChannelBreakoutInputs {
  /** Keltner length (EMA and ATR) */
  lengthKeltner: number;
  /** Keltner multiplier */
  mult: number;
  /** Cycle lookback (SMA of the midpoint and of the body) */
  cycleLength: number;
  /** Highlight engulfing candles */
  showEngulfing: boolean;
  /** Use a strong body as breakout when there is no engulfing candle */
  useBodyBreakout: boolean;
  /** Show the breakout signals */
  showBreakout: boolean;
  /** Signal cooldown (bars) */
  cooldownBars: number;
}

export const defaultInputs: CycleSyncedChannelBreakoutInputs = {
  lengthKeltner: 20,
  mult: 1.5,
  cycleLength: 20,
  showEngulfing: true,
  useBodyBreakout: true,
  showBreakout: true,
  cooldownBars: 5,
};

export const inputConfig: InputConfig[] = [
  { id: 'lengthKeltner', type: 'int', title: 'Keltner Length', defval: 20 },
  { id: 'mult', type: 'float', title: 'Keltner Multiplier', defval: 1.5 },
  { id: 'cycleLength', type: 'int', title: 'Cycle Lookback', defval: 20 },
  { id: 'showEngulfing', type: 'bool', title: 'Highlight Engulfing Candles', defval: true },
  { id: 'useBodyBreakout', type: 'bool', title: 'Use Body Breakout if No Engulfing?', defval: true },
  { id: 'showBreakout', type: 'bool', title: 'Show Breakout Signals', defval: true },
  { id: 'cooldownBars', type: 'int', title: 'Signal Cooldown (bars)', defval: 5 },
];

const UPPER = String(color.new(color.blue, 40));
const LOWER = String(color.new(color.red, 40));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Keltner', color: UPPER, lineWidth: 1 },
  { id: 'plot1', title: 'Lower Keltner', color: LOWER, lineWidth: 1 },
];

export const metadata = {
  title: 'Cycle-Synced Channel Breakout-v1',
  shortTitle: 'Cycle-Synced Channel Breakout-v1',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<CycleSyncedChannelBreakoutInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // Keltner channel
  const close = bars.map((b) => b.close);
  const basis = A(ta.ema(S(close), cfg.lengthKeltner));
  const atrRange = A(ta.atr(bars, cfg.lengthKeltner));
  const upperKC = basis.map((v, i) => v + cfg.mult * atrRange[i]);
  const lowerKC = basis.map((v, i) => v - cfg.mult * atrRange[i]);

  // Cycle momentum
  const price = bars.map((b) => (b.high + b.low) / 2);
  const priceSma = A(ta.sma(S(price), cfg.cycleLength));
  const detrender = price.map((p, i) => p - priceSma[i]);
  const hp = A(ta.ema(S(detrender), 3));
  const power = hp.map((v) => Math.pow(v, 2));
  const smoothPower = A(ta.ema(S(power), 5));

  // Body expansion
  const bodySize = bars.map((b) => Math.abs(b.close - b.open));
  const avgBody = A(ta.sma(S(bodySize), cfg.cycleLength));

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const bullBg = String(color.new(color.green, 85));
  const bearBg = String(color.new(color.red, 85));
  let lastSignalBar = NaN; // var int lastSignalBar = na
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const p = i > 0 ? bars[i - 1] : undefined;
    const c1 = p ? p.close : NaN;
    const o1 = p ? p.open : NaN;
    const bullEngulf = lt(c1, o1) && gt(b.close, b.open) && gt(b.close, o1) && lt(b.open, c1);
    const bearEngulf = gt(c1, o1) && lt(b.close, b.open) && lt(b.close, o1) && gt(b.open, c1);
    const strongBody = gt(bodySize[i], 1.2 * avgBody[i]);
    const powerUp = i > 0 && gt(smoothPower[i], smoothPower[i - 1]);
    const bullRaw = (bullEngulf || (cfg.useBodyBreakout && strongBody)) && gt(b.close, upperKC[i]) && powerUp;
    const bearRaw = (bearEngulf || (cfg.useBodyBreakout && strongBody)) && lt(b.close, lowerKC[i]) && powerUp;
    // cooldownOK = na(lastSignalBar) or (bar_index - lastSignalBar > cooldownBars)
    const cooldownOK = isNaN(lastSignalBar) || i - lastSignalBar > cfg.cooldownBars;
    const bullFinal = bullRaw && cooldownOK;
    const bearFinal = bearRaw && cooldownOK;
    if (bullFinal || bearFinal) lastSignalBar = i;
    buyFlags.push(bullFinal);
    sellFlags.push(bearFinal);

    // plotshape(showEngulfing and bullEngulf, "Bull Engulf", location.belowbar, color.green, shape.triangleup, size.tiny)
    if (cfg.showEngulfing && bullEngulf) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: color.green, size: 'tiny' });
    }
    if (cfg.showEngulfing && bearEngulf) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'tiny' });
    }
    // plotshape(showBreakout and bullFinal, "Buy Signal", location.belowbar, color.green, shape.labelup, text = "BUY"):
    // Pine default text colour (color.blue) and size (size.auto)
    if (cfg.showBreakout && bullFinal) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'BUY',
        textColor: color.blue, size: 'auto' });
    }
    if (cfg.showBreakout && bearFinal) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL',
        textColor: color.blue, size: 'auto' });
    }
    // bgcolor(bullFinal ? color.new(color.green, 85) : na); bgcolor(bearFinal ? color.new(color.red, 85) : na)
    if (bullFinal) bgColors.push({ time: b.time, color: bullBg });
    if (bearFinal) bgColors.push({ time: b.time, color: bearBg });
  }

  const t = (i: number) => bars[i].time;
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((_b, i) => ({ time: t(i), value: upperKC[i], color: UPPER })),
      plot1: bars.map((_b, i) => ({ time: t(i), value: lowerKC[i], color: LOWER })),
    },
    markers,
    bgColors,
    // alertcondition(bullFinal, "Cycle Breakout BUY") / alertcondition(bearFinal, "Cycle Breakout SELL")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Cycle Breakout BUY', message: 'Cycle-Synced Channel Breakout: BUY' },
  { id: 'alert1', title: 'Cycle Breakout SELL', message: 'Cycle-Synced Channel Breakout: SELL' },
];

export const CycleSyncedChannelBreakout = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
