/**
 * Weis Wave Volume
 *
 * Cumulative volume that resets on trend direction change.
 * Positive (green) in uptrend, negative (red) in downtrend. Colours of the original: green / red with a
 * transparency of 75 (red also before the first direction).
 *
 * Reference: "Weis Wave Volume" (community)
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

/** color=directionIsUp ? color.new(color.green, 75) : color.new(color.red, 75) */
const UP = String(color.new(color.green, 75));
const DOWN = String(color.new(color.red, 75));

export interface WeisWaveVolumeInputs {
  trendLen: number;
}

export const defaultInputs: WeisWaveVolumeInputs = {
  trendLen: 2,
};

export const inputConfig: InputConfig[] = [
  { id: 'trendLen', type: 'int', title: 'Trend Length', defval: 2, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Wave Volume', color: UP, lineWidth: 4, style: 'histogram' },
];

export const metadata = {
  title: 'Weis Wave Volume',
  shortTitle: 'WWV',
  overlay: false,
};

export function calculate(bars: Bar[], inputs: Partial<WeisWaveVolumeInputs> = {}): IndicatorResult {
  const { trendLen } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const waveArr: number[] = new Array(n);
  let cumVol = 0;
  let prevDir = 0; // 1 = up, -1 = down

  for (let i = 0; i < n; i++) {
    const vol = bars[i].volume ?? 0;

    if (i < trendLen) {
      waveArr[i] = NaN;
      continue;
    }

    let dir: number;
    if (bars[i].close > bars[i - trendLen].close) {
      dir = 1;
    } else if (bars[i].close < bars[i - trendLen].close) {
      dir = -1;
    } else {
      dir = prevDir || 1;
    }

    if (dir !== prevDir && prevDir !== 0) {
      // Direction changed, reset accumulation
      cumVol = vol;
    } else {
      cumVol += vol;
    }

    prevDir = dir;
    waveArr[i] = dir === 1 ? cumVol : -cumVol;
  }

  const plot0 = waveArr.map((v, i) => ({
    time: bars[i].time,
    value: isNaN(v) ? NaN : Math.abs(v),
    color: !isNaN(v) && v >= 0 ? UP : DOWN,
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0 },
  };
}

export const WeisWaveVolume = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
