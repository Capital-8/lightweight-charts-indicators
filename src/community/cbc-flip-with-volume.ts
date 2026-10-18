/**
 * CBC Flip with Volume
 *
 * Candle-by-candle (CBC) flip state: it turns bullish when a bullish candle closes above the previous high with more
 * volume than the previous bar, and bearish when a bearish candle closes below the previous low with more volume
 * than the previous bar. Each flip is marked by a triangle and a background colour, strong (bigger, more opaque)
 * when the volume is above its SMA over `volLen` bars. Two hidden plots give the gain in % since the open of the
 * flip candle while the state holds.
 * Alerts (alertcondition, `alerts` of the result): 'Bull Flip' and 'Bear Flip', true on the bars of each flip.
 *
 * Reference: "CBC Flip with Volume [Pt]" by PtGambler
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © PtGambler
 */

import { taCore, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface CbcFlipWithVolumeInputs {
  /** Volume SMA lookback */
  volLen: number;
}

export const defaultInputs: CbcFlipWithVolumeInputs = {
  volLen: 50,
};

export const inputConfig: InputConfig[] = [
  { id: 'volLen', type: 'int', title: 'Volume MA Lookback', defval: 50, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Bull in Control (% gain)', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot1', title: 'Bear in Control (% gain)', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'CBC Flip with Volume [Pt]',
  shortTitle: 'CBC Flip[Pt]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<CbcFlipWithVolumeInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const volume = bars.map((b) => b.volume ?? NaN);
  const avgVol = taCore.sma(volume, cfg.volLen);

  const bullNormal = String(color.rgb(120, 206, 176));
  const bearNormal = String(color.rgb(228, 102, 102));
  const bullStrong = String(color.rgb(0, 200, 100));
  const bearStrong = String(color.rgb(200, 50, 50));
  const bgBullStrong = String(color.new(color.green, 40));
  const bgBullNormal = String(color.new(color.green, 80));
  const bgBearStrong = String(color.new(color.red, 40));
  const bgBearNormal = String(color.new(color.red, 80));

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const plot0 = [];
  const plot1 = [];
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [];
  let cbc = false; // var bool cbc = false
  let cbcOpen = 0.0; // var float cbc_open = 0.
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time;
    // volHigh = volume > ta.sma(volume, volLen)
    const volHigh = gt(volume[i], avgVol[i] ?? NaN);
    // prevCbc = cbc[1] (false on the first bar: a bool is never na)
    const prevCbc = cbc;
    const prevLow = i > 0 ? bars[i - 1].low : NaN;
    const prevHigh = i > 0 ? bars[i - 1].high : NaN;
    const prevVol = i > 0 ? volume[i - 1] : NaN;
    if (cbc && lt(b.close, prevLow) && lt(b.close, b.open) && gt(volume[i], prevVol)) {
      cbc = false;
      cbcOpen = b.open;
    }
    if (!cbc && gt(b.close, prevHigh) && gt(b.close, b.open) && gt(volume[i], prevVol)) {
      cbc = true;
      cbcOpen = b.open;
    }
    const bullFlip = cbc && !prevCbc;
    const bearFlip = !cbc && prevCbc;
    bullFlags.push(bullFlip);
    bearFlags.push(bearFlip);

    // The four plotshape calls: Bull / Bear Flip (Normal), then Bull / Bear Flip (Strong), ids shape0 .. shape3
    if (bullFlip && !volHigh) {
      markers.push({ id: 'shape0', time: t, position: 'belowBar', shape: 'triangleUp', color: bullNormal, size: 'tiny' });
    }
    if (bearFlip && !volHigh) {
      markers.push({ id: 'shape1', time: t, position: 'aboveBar', shape: 'triangleDown', color: bearNormal, size: 'tiny' });
    }
    if (bullFlip && volHigh) {
      markers.push({ id: 'shape2', time: t, position: 'belowBar', shape: 'triangleUp', color: bullStrong, size: 'small' });
    }
    if (bearFlip && volHigh) {
      markers.push({ id: 'shape3', time: t, position: 'aboveBar', shape: 'triangleDown', color: bearStrong, size: 'small' });
    }

    if (bullFlip) bgColors.push({ time: t, color: volHigh ? bgBullStrong : bgBullNormal });
    else if (bearFlip) bgColors.push({ time: t, color: volHigh ? bgBearStrong : bgBearNormal });

    // A plain division: cbc_open = 0 gives +-infinity (na in the plot)
    const bull = cbc && gt(b.close, cbcOpen) ? ((b.close - cbcOpen) / cbcOpen) * 100 : 0;
    const bear = !cbc && lt(b.close, cbcOpen) ? ((b.close - cbcOpen) / cbcOpen) * -100 : 0;
    plot0.push({ time: t, value: Number.isFinite(bull) ? bull : NaN });
    plot1.push({ time: t, value: Number.isFinite(bear) ? bear : NaN });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
    bgColors,
    // alertcondition(cbc and not prevCbc, 'Bull Flip') / alertcondition(not cbc and prevCbc, 'Bear Flip')
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bull Flip', message: 'CBC Flip: Bulls in control' },
  { id: 'alert1', title: 'Bear Flip', message: 'CBC Flip: Bears in control' },
];

export const CbcFlipWithVolume = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
