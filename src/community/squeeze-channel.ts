/**
 * Squeeze Channel
 *
 * A squeeze is on when the Bollinger Bands (SMA +- mult * stdev) are inside the Keltner Channel (SMA +- mult * ATR).
 * When a squeeze starts, a channel opens at the highest high / lowest low of the last `swingLookback` bars and widens
 * with the highs / lows of the next `swingLookfwd` bars, then locks. The channel is coloured by the squeeze strength
 * (1 - BB width / KC width, five steps) while the squeeze lasts, then with the "squeeze ended" colour. A close above
 * (below) the locked channel is a bull (bear) breakout and closes the channel; a close back beyond the opposite channel
 * side within `reversalBars` bars is a failed-breakout reversal. Each breakout also keeps the channel high and low as
 * extended resistance / support levels for `extendedBars` bars, drawn when the close is within atrProximity * ATR;
 * optional retest signals mark a close through a level (breakout) and a close back (reversal, removes the level).
 * Alerts (alertcondition, `alerts` of the result): the breakouts, reversals, extended level breakouts / reversals and
 * the start of a squeeze. Each marker has the id of its plotshape output (shape0 to shape7).
 *
 * Reference: "Squeeze Channel" by B3AR_Trades
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SqueezeChannelInputs {
  bbLength: number;
  bbMult: number;
  kcLength: number;
  kcMult: number;
  swingLookback: number;
  swingLookfwd: number;
  enableReversal: boolean;
  reversalBars: number;
  enableExtendedLevels: boolean;
  enableSRRetest: boolean;
  extendedBars: number;
  srDelayBars: number;
  atrProximity: number;
  atrLength: number;
  showChannel: boolean;
  showChannelFill: boolean;
  channelColorWaiting: string;
  bullColor: string;
  bearColor: string;
  reversalBullColor: string;
  reversalBearColor: string;
  extendedColorHigh: string;
  extendedColorLow: string;
  sqColor1: string;
  sqColor2: string;
  sqColor3: string;
  sqColor4: string;
  sqColor5: string;
}

export const defaultInputs: SqueezeChannelInputs = {
  bbLength: 12,
  bbMult: 2.0,
  kcLength: 20,
  kcMult: 2.0,
  swingLookback: 5,
  swingLookfwd: 3,
  enableReversal: true,
  reversalBars: 7,
  enableExtendedLevels: true,
  enableSRRetest: false,
  extendedBars: 75,
  srDelayBars: 5,
  atrProximity: 1.5,
  atrLength: 14,
  showChannel: true,
  showChannelFill: true,
  channelColorWaiting: color.fuchsia,
  bullColor: color.teal,
  bearColor: color.red,
  reversalBullColor: '#00FFFF',
  reversalBearColor: '#FF00FF',
  extendedColorHigh: 'rgba(242, 54, 69, 0.6)',
  extendedColorLow: 'rgba(8, 153, 129, 0.6)',
  sqColor1: '#FFFF00',
  sqColor2: '#FFCC00',
  sqColor3: '#FF9900',
  sqColor4: '#FF5500',
  sqColor5: '#FF0000',
};

const SQ = 'Squeeze Detection';
const SW = 'Swing Channel';
const RV = 'Reversal Detection';
const EX = 'Extended S/R';
const VI = 'Visuals';
const GR = 'Squeeze Gradient';

export const inputConfig: InputConfig[] = [
  { id: 'bbLength', type: 'int', title: 'Bollinger Length', defval: 12, min: 1, group: SQ },
  { id: 'bbMult', type: 'float', title: 'Bollinger Multiplier', defval: 2.0, min: 0.1, step: 0.1, group: SQ },
  { id: 'kcLength', type: 'int', title: 'Keltner Length', defval: 20, min: 1, group: SQ },
  { id: 'kcMult', type: 'float', title: 'Keltner ATR Multiplier', defval: 2.0, min: 0.1, step: 0.1, group: SQ },
  { id: 'swingLookback', type: 'int', title: 'Swing Lookback Bars', defval: 5, min: 1, group: SW },
  { id: 'swingLookfwd', type: 'int', title: 'Swing Lookforward Bars', defval: 3, min: 1, group: SW },
  { id: 'enableReversal', type: 'bool', title: 'Enable Failed Breakout Reversal', defval: true, group: RV },
  { id: 'reversalBars', type: 'int', title: 'Reversal Watch Bars', defval: 7, min: 1, group: RV },
  { id: 'enableExtendedLevels', type: 'bool', title: 'Show Extended S/R Levels', defval: true, group: EX },
  { id: 'enableSRRetest', type: 'bool', title: 'Enable S/R Retest Signals', defval: false, group: EX },
  { id: 'extendedBars', type: 'int', title: 'Extended Level Bars', defval: 75, min: 10, max: 200, group: EX },
  { id: 'srDelayBars', type: 'int', title: 'S/R Signal Delay Bars', defval: 5, min: 1, max: 20, group: EX },
  { id: 'atrProximity', type: 'float', title: 'ATR Proximity Threshold', defval: 1.5, min: 0.1, step: 0.1, group: EX },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14, min: 1, group: EX },
  { id: 'showChannel', type: 'bool', title: 'Show Swing Channel', defval: true, group: VI },
  { id: 'showChannelFill', type: 'bool', title: 'Show Channel Fill', defval: true, group: VI },
  { id: 'channelColorWaiting', type: 'color', title: 'Channel Color (Squeeze Ended)', defval: color.fuchsia, group: VI },
  { id: 'bullColor', type: 'color', title: 'Bullish Signal Color', defval: color.teal, group: VI },
  { id: 'bearColor', type: 'color', title: 'Bearish Signal Color', defval: color.red, group: VI },
  { id: 'reversalBullColor', type: 'color', title: 'Reversal Bull Color', defval: '#00FFFF', group: VI },
  { id: 'reversalBearColor', type: 'color', title: 'Reversal Bear Color', defval: '#FF00FF', group: VI },
  { id: 'extendedColorHigh', type: 'color', title: 'Extended Resistance Color', defval: 'rgba(242, 54, 69, 0.6)', group: VI },
  { id: 'extendedColorLow', type: 'color', title: 'Extended Support Color', defval: 'rgba(8, 153, 129, 0.6)', group: VI },
  { id: 'sqColor1', type: 'color', title: 'Squeeze 1 (Weak)', defval: '#FFFF00', group: GR },
  { id: 'sqColor2', type: 'color', title: 'Squeeze 2', defval: '#FFCC00', group: GR },
  { id: 'sqColor3', type: 'color', title: 'Squeeze 3 (Medium)', defval: '#FF9900', group: GR },
  { id: 'sqColor4', type: 'color', title: 'Squeeze 4', defval: '#FF5500', group: GR },
  { id: 'sqColor5', type: 'color', title: 'Squeeze 5 (Strong)', defval: '#FF0000', group: GR },
];

const MID_COLOR = String(color.new(color.gray, 40));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Channel High', color: '#FFFF00', lineWidth: 2, style: 'circles' },
  { id: 'plot1', title: 'Channel Low', color: '#FFFF00', lineWidth: 2, style: 'circles' },
  { id: 'plot2', title: 'Channel Mid', color: MID_COLOR, lineWidth: 1, style: 'circles' },
  { id: 'plot3', title: 'Reversal Level', color: String(color.new(color.red, 50)), lineWidth: 2, style: 'circles' },
  ...[1, 2, 3, 4, 5].map((k) => ({
    id: `plot${3 + k}`, title: `Ext Resistance ${k}`, color: 'rgba(242, 54, 69, 0.6)', lineWidth: 1, style: 'circles' as const,
  })),
  ...[1, 2, 3, 4, 5].map((k) => ({
    id: `plot${8 + k}`, title: `Ext Support ${k}`, color: 'rgba(8, 153, 129, 0.6)', lineWidth: 1, style: 'circles' as const,
  })),
];

export const metadata = {
  title: 'Squeeze Channel',
  shortTitle: 'Squeeze Channel',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<SqueezeChannelInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  // One flag per bar for each alertcondition, in the original's order
  const flags: boolean[][] = Array.from({ length: alertConditions.length }, () => []);
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const closeS = S(close);

  // Squeeze
  const bbBasis = A(ta.sma(closeS, cfg.bbLength));
  const bbStdev = A(ta.stdev(closeS, cfg.bbLength));
  const kcBasis = A(ta.sma(closeS, cfg.kcLength));
  const kcAtr = A(ta.atr(bars, cfg.kcLength));
  const atrValue = A(ta.atr(bars, cfg.atrLength));
  const initialSwingHigh = A(ta.highest(S(bars.map((b) => b.high)), cfg.swingLookback));
  const initialSwingLow = A(ta.lowest(S(bars.map((b) => b.low)), cfg.swingLookback));

  const getSqueezeColor = (strength: number): string | null => {
    if (isNaN(strength)) return null;
    if (lt(strength, 0.2)) return cfg.sqColor1;
    if (lt(strength, 0.4)) return cfg.sqColor2;
    if (lt(strength, 0.6)) return cfg.sqColor3;
    if (lt(strength, 0.8)) return cfg.sqColor4;
    return cfg.sqColor5;
  };

  // var state
  let channelActive = false;
  let channelHigh = NaN;
  let channelLow = NaN;
  let barsSinceEntry = 0;
  let channelLocked = false;
  let squeezeStillOn = false;
  let lastSqueezeColor: string | null = null;
  let watchingReversal = false;
  let reversalDirection = 0;
  let reversalLevel = NaN;
  let reversalBarsLeft = 0;
  let reversalTriggered = false;
  let prevSqueezeOn = false;
  let prevBreakout = false; // bullBreakout[1] or bearBreakout[1]
  let prevChannelHigh = NaN; // channelHigh[1]
  let prevChannelLow = NaN; // channelLow[1]

  type Level = { level: number; expiry: number; start: number; broken: boolean };
  const extHigh: Level[] = [];
  const extLow: Level[] = [];

  const t = (i: number) => bars[i].time;
  const plots: Record<string, Point[]> = {};
  for (let k = 0; k < 14; k++) plots[`plot${k}`] = [];
  const fillColors: string[] = new Array(n);
  const markers: MarkerData[] = [];
  const reversalColorBear = String(color.new(cfg.bearColor, 50));
  const reversalColorBull = String(color.new(cfg.bullColor, 50));
  const extBullColor = String(color.new(cfg.bullColor, 30));
  const extBearColor = String(color.new(cfg.bearColor, 30));
  const extBullRevColor = String(color.new(cfg.reversalBullColor, 30));
  const extBearRevColor = String(color.new(cfg.reversalBearColor, 30));

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const bbDev = cfg.bbMult * bbStdev[i];
    const bbUpper = bbBasis[i] + bbDev;
    const bbLower = bbBasis[i] - bbDev;
    const bbWidth = bbUpper - bbLower;
    const kcRange = cfg.kcMult * kcAtr[i];
    const kcUpper = kcBasis[i] + kcRange;
    const kcLower = kcBasis[i] - kcRange;
    const kcWidth = kcUpper - kcLower;
    const squeezeOn = gt(bbLower, kcLower) && lt(bbUpper, kcUpper);
    const squeezeEntry = squeezeOn && !prevSqueezeOn;
    const squeezeRatio = squeezeOn ? bbWidth / kcWidth : NaN;
    const squeezeStrength = squeezeOn ? 1.0 - Math.min(squeezeRatio, 1.0) : NaN;

    if (squeezeEntry) {
      channelActive = true;
      channelHigh = initialSwingHigh[i];
      channelLow = initialSwingLow[i];
      barsSinceEntry = 0;
      channelLocked = false;
      squeezeStillOn = true;
      lastSqueezeColor = getSqueezeColor(squeezeStrength);
      watchingReversal = false;
      reversalDirection = 0;
      reversalLevel = NaN;
      reversalBarsLeft = 0;
      reversalTriggered = false;
    } else if (channelActive) {
      barsSinceEntry += 1;
      if (barsSinceEntry <= cfg.swingLookfwd && !channelLocked) {
        if (gt(bar.high, channelHigh)) channelHigh = bar.high;
        if (lt(bar.low, channelLow)) channelLow = bar.low;
      }
      if (barsSinceEntry > cfg.swingLookfwd) channelLocked = true;
      if (squeezeOn) lastSqueezeColor = getSqueezeColor(squeezeStrength);
      if (!squeezeOn) squeezeStillOn = false;
    }

    // Signals
    const validBreakoutZone = channelActive && channelLocked;
    const bullBreakout = validBreakoutZone && gt(bar.close, channelHigh);
    const bearBreakout = validBreakoutZone && lt(bar.close, channelLow);
    if (bullBreakout) {
      if (cfg.enableReversal) {
        watchingReversal = true;
        reversalDirection = 1;
        reversalLevel = channelLow;
        reversalBarsLeft = cfg.reversalBars;
        reversalTriggered = false;
      }
      channelActive = false;
    }
    if (bearBreakout) {
      if (cfg.enableReversal) {
        watchingReversal = true;
        reversalDirection = -1;
        reversalLevel = channelHigh;
        reversalBarsLeft = cfg.reversalBars;
        reversalTriggered = false;
      }
      channelActive = false;
    }

    // Reversal detection
    let bearReversal = false;
    let bullReversal = false;
    if (cfg.enableReversal && watchingReversal && reversalBarsLeft > 0 && !reversalTriggered) {
      reversalBarsLeft -= 1;
      if (reversalDirection === 1 && lt(bar.close, reversalLevel)) {
        bearReversal = true;
        reversalTriggered = true;
      }
      if (reversalDirection === -1 && gt(bar.close, reversalLevel)) {
        bullReversal = true;
        reversalTriggered = true;
      }
    }
    if (reversalBarsLeft <= 0) watchingReversal = false;

    // Extended S/R levels (bar_index is only used relative to the push bar)
    if (prevBreakout) {
      extHigh.push({ level: prevChannelHigh, expiry: i + cfg.extendedBars, start: i, broken: false });
      extLow.push({ level: prevChannelLow, expiry: i + cfg.extendedBars, start: i, broken: false });
    }
    let extBullSignal = false;
    let extBearSignal = false;
    let extBullReversal = false;
    let extBearReversal = false;
    for (let k = extHigh.length - 1; k >= 0; k--) {
      const { level, expiry, start, broken } = extHigh[k];
      const delayPassed = i >= start + cfg.srDelayBars;
      if (i > expiry) {
        extHigh.splice(k, 1);
      } else if (delayPassed && cfg.enableSRRetest) {
        if (!broken && gt(bar.close, level)) {
          extHigh[k].broken = true;
          extBullSignal = true;
        }
        if (broken && lt(bar.close, level)) {
          extBearReversal = true;
          extHigh.splice(k, 1);
        }
      }
    }
    for (let k = extLow.length - 1; k >= 0; k--) {
      const { level, expiry, start, broken } = extLow[k];
      const delayPassed = i >= start + cfg.srDelayBars;
      if (i > expiry) {
        extLow.splice(k, 1);
      } else if (delayPassed && cfg.enableSRRetest) {
        if (!broken && lt(bar.close, level)) {
          extLow[k].broken = true;
          extBearSignal = true;
        }
        if (broken && gt(bar.close, level)) {
          extBullReversal = true;
          extLow.splice(k, 1);
        }
      }
    }

    // Channel plots
    const baseColor = squeezeStillOn ? lastSqueezeColor : cfg.channelColorWaiting;
    const currentChannelColor = channelActive ? baseColor : null;
    // color.new(na, 85) is black with transparency 85
    const fillColor = channelActive ? String(color.new(baseColor ?? '#000000', 85)) : null;
    const chColor = currentChannelColor ?? undefined;
    plots.plot0.push({ time: t(i), value: cfg.showChannel && channelActive ? channelHigh : NaN, color: chColor });
    plots.plot1.push({ time: t(i), value: cfg.showChannel && channelActive ? channelLow : NaN, color: chColor });
    fillColors[i] = cfg.showChannelFill && fillColor !== null ? fillColor : 'transparent';
    const channelMid = channelActive ? (channelHigh + channelLow) / 2 : NaN;
    plots.plot2.push({
      time: t(i), value: cfg.showChannel && channelActive && channelLocked ? channelMid : NaN, color: MID_COLOR,
    });
    plots.plot3.push({
      time: t(i),
      value: cfg.showChannel && cfg.enableReversal && watchingReversal && !reversalTriggered ? reversalLevel : NaN,
      color: reversalDirection === 1 ? reversalColorBear : reversalColorBull,
    });

    // Extended level plots
    const extLevel = (arr: Level[], idx: number) => {
      if (!(cfg.enableExtendedLevels && idx < arr.length)) return NaN;
      const level = arr[idx].level;
      const priceDistance = Math.abs(bar.close - level);
      return le(priceDistance, atrValue[i] * cfg.atrProximity) ? level : NaN;
    };
    for (let k = 0; k < 5; k++) {
      plots[`plot${4 + k}`].push({ time: t(i), value: extLevel(extHigh, k), color: cfg.extendedColorHigh });
      plots[`plot${9 + k}`].push({ time: t(i), value: extLevel(extLow, k), color: cfg.extendedColorLow });
    }

    // Shapes (id: shape<k>, the plotshape outputs in the original's order)
    const mk = (on: boolean, id: string, shape: MarkerData['shape'], position: MarkerData['position'], c: string, size: 'tiny' | 'small') => {
      if (on) markers.push({ time: t(i), position, shape, color: c, size, id });
    };
    mk(bullBreakout, 'shape0', 'triangleUp', 'belowBar', cfg.bullColor, 'tiny');
    mk(bearBreakout, 'shape1', 'triangleDown', 'aboveBar', cfg.bearColor, 'tiny');
    mk(cfg.enableReversal && bullReversal, 'shape2', 'diamond', 'belowBar', cfg.reversalBullColor, 'small');
    mk(cfg.enableReversal && bearReversal, 'shape3', 'diamond', 'aboveBar', cfg.reversalBearColor, 'small');
    mk(extBullSignal, 'shape4', 'triangleUp', 'belowBar', extBullColor, 'tiny');
    mk(extBearSignal, 'shape5', 'triangleDown', 'aboveBar', extBearColor, 'tiny');
    mk(extBullReversal, 'shape6', 'diamond', 'belowBar', extBullRevColor, 'small');
    mk(extBearReversal, 'shape7', 'diamond', 'aboveBar', extBearRevColor, 'small');
    [bullBreakout, bearBreakout, bullReversal, bearReversal, extBullSignal, extBearSignal, extBullReversal, extBearReversal,
      squeezeEntry].forEach((f, k) => flags[k].push(f));

    prevSqueezeOn = squeezeOn;
    prevBreakout = bullBreakout || bearBreakout;
    prevChannelHigh = channelHigh;
    prevChannelLow = channelLow;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    // fill(p_high, p_low, color = showChannelFill ? fillColor : na, title = "Channel Fill")
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'Channel Fill' }, colors: fillColors }],
    markers,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Breakout', message: 'EDRF: Bullish breakout' },
  { id: 'alert1', title: 'Bearish Breakout', message: 'EDRF: Bearish breakout' },
  { id: 'alert2', title: 'Bull Reversal', message: 'EDRF: Failed bear breakout - bull reversal' },
  { id: 'alert3', title: 'Bear Reversal', message: 'EDRF: Failed bull breakout - bear reversal' },
  { id: 'alert4', title: 'Ext Bull Breakout', message: 'EDRF: Extended resistance breakout' },
  { id: 'alert5', title: 'Ext Bear Breakout', message: 'EDRF: Extended support breakdown' },
  { id: 'alert6', title: 'Ext Bull Reversal', message: 'EDRF: Extended support reclaim' },
  { id: 'alert7', title: 'Ext Bear Reversal', message: 'EDRF: Extended resistance rejection' },
  { id: 'alert8', title: 'Squeeze Started', message: 'EDRF: Squeeze detected' },
];

export const SqueezeChannel = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
