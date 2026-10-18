/**
 * Weis Wave Volume
 *
 * As the original: a Renko-like close (the box size from "Renko Assignment Method": the ATR over "Value" bars, the
 * value itself, or the close divided by it) moves to the bar's high / low (by "Price Source") when it leaves the box
 * around the previous Renko close; the wave direction is up when it rises, down when it falls, else unchanged. The
 * volume (the true range with "Use True Range instead of Volume" Always, or Auto without volume) is summed while the
 * direction does not change and restarts on a change (divided by the bar count with "Normalize"). Columns green
 * while the direction is up, red otherwise (transparency 75); negative in a down wave with "Oscillating".
 *
 * Reference: "Weis Wave Volume" (community)
 */

import { color, taCore, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

/** color=directionIsUp ? color.new(color.green, 75) : color.new(color.red, 75) */
const UP = String(color.new(color.green, 75));
const DOWN = String(color.new(color.red, 75));

export interface WeisWaveVolumeInputs {
  methodType: string;
  methodValue: number;
  priceSource: string;
  useTrueRange: string;
  isOscillating: boolean;
  normalize: boolean;
}

export const defaultInputs: WeisWaveVolumeInputs = {
  methodType: 'ATR',
  methodValue: 14.0,
  priceSource: 'Close',
  useTrueRange: 'Auto',
  isOscillating: false,
  normalize: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'methodType', type: 'string', title: 'Renko Assignment Method', defval: 'ATR', options: ['ATR', 'Traditional', 'Part of Price'] },
  { id: 'methodValue', type: 'float', title: 'Value', defval: 14.0, min: 0 },
  { id: 'priceSource', type: 'string', title: 'Price Source', defval: 'Close', options: ['Close', 'Open / Close', 'High / Low'] },
  { id: 'useTrueRange', type: 'string', title: 'Use True Range instead of Volume', defval: 'Auto', options: ['Always', 'Auto', 'Never'] },
  { id: 'isOscillating', type: 'bool', title: 'Oscillating', defval: false },
  { id: 'normalize', type: 'bool', title: 'Normalize', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Wave Volume', color: UP, lineWidth: 3, style: 'columns' },
];

export const metadata = {
  title: 'Weis Wave Volume',
  shortTitle: 'WWV',
  overlay: false,
};

const fin = (v: number | undefined | null): v is number => v !== undefined && v !== null && Number.isFinite(v);

export function calculate(bars: Bar[], inputs: Partial<WeisWaveVolumeInputs> = {}): IndicatorResult {
  const { methodType, methodValue, priceSource, useTrueRange, isOscillating, normalize } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const high = bars.map((b) => b.high), low = bars.map((b) => b.low), close = bars.map((b) => b.close);

  const useClose = priceSource === 'Close';
  const useOpenClose = priceSource === 'Open / Close' || useClose;
  const trArr = taCore.tr(false, high, low, close);
  const atr = methodType === 'ATR' ? taCore.atr(Math.round(methodValue), high, low, close) : [];

  const values: number[] = new Array(n);
  const dirs: number[] = new Array(n);
  let prevCurr = NaN, prevDir = NaN, prevVol = NaN, prevCount = NaN;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const volume = fin(b.volume) ? b.volume : NaN;
    let vol = useTrueRange === 'Always' || (useTrueRange === 'Auto' && !fin(volume)) ? trArr[i] : volume;
    const op = useClose ? b.close : b.open;
    const hi = useOpenClose ? (b.close >= op ? b.close : op) : b.high;
    const lo = useOpenClose ? (b.close <= op ? b.close : op) : b.low;
    const box = methodType === 'ATR' ? atr[i] : methodType === 'Part of Price' ? b.close / methodValue : methodValue;

    const prevclose = fin(prevCurr) ? prevCurr : 0;
    const currclose = hi > prevclose + box ? hi : lo < prevclose - box ? lo : prevclose;
    const direction = currclose > prevclose ? 1 : currclose < prevclose ? -1 : (fin(prevDir) ? prevDir : 0);
    // ta.change(direction) != 0 (na on the first bar: false)
    const changed = i > 0 && direction - prevDir !== 0;

    let barcount = 1;
    if (!changed && normalize) barcount = prevCount + barcount;
    if (!changed) vol = prevVol + vol;
    const res = barcount > 1 ? vol / barcount : vol;

    values[i] = isOscillating && direction < 0 ? -res : res;
    dirs[i] = direction;
    prevCurr = currclose;
    prevDir = direction;
    prevVol = vol;
    prevCount = barcount;
  }

  const plot0 = values.map((v, i) => ({
    time: bars[i].time,
    value: fin(v) ? v : NaN,
    color: dirs[i] > 0 ? UP : DOWN,
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0 },
  };
}

export const WeisWaveVolume = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
