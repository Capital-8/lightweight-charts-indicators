/**
 * Average True Range Trailing Stops Colored
 *
 * ATR trailing stop (Sylvain Vervoort): loss = multiplier x ATR(period). While the close and the previous close
 * stay on one side of the previous stop, the stop ratchets (max(stop, close - loss) above, min(stop, close + loss)
 * below); when the close crosses it, the stop restarts at close -/+ loss. A missing previous stop counts as 0, so
 * the stop exists from the first bar of the ATR.
 * The line is coloured by the position: green after the close crosses above the stop, red after it crosses below,
 * blue until the first cross. The original draws only this line (no bar colours, no markers).
 *
 * Reference: "Average True Range Trailing Stops Strategy, by Sylvain Vervoort" (community, HPotter)
 */

import { ta, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface ATRTrailingColoredInputs {
  length: number;
  mult: number;
}

export const defaultInputs: ATRTrailingColoredInputs = {
  length: 5,
  mult: 3.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'ATR Length', defval: 5, min: 1 },
  { id: 'mult', type: 'float', title: 'Multiplier', defval: 3.5, min: 0.1, step: 0.1 },
];

// Colours of the script (red / green / blue constants of Pine version 1) with that version's default plot
// transparency (35)
const V1 = (hex: string) => String(color.new(hex, 35));
const RED = V1('#FF0000');
const GREEN = V1('#008000');
const BLUE = V1('#0000FF');

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ATR Trailing Stop', color: V1('#3BB3E4'), lineWidth: 1 },
];

export const metadata = {
  title: 'Average True Range Trailing Stops Colored',
  shortTitle: 'ATRTSC',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<ATRTrailingColoredInputs> = {}): Omit<IndicatorResult, 'markers'> {
  const { length, mult } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const atrArr = ta.atr(bars, length).toArray();

  const stopArr: number[] = new Array(n);
  const posArr: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const a = atrArr[i];
    const nLoss = a == null ? NaN : mult * a;
    const close = bars[i].close;
    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    // nz(xATRTrailingStop[1], 0)
    const prevStop = i > 0 && !isNaN(stopArr[i - 1]) ? stopArr[i - 1] : 0;

    let stop: number;
    if (close > prevStop && prevClose > prevStop) stop = Math.max(prevStop, close - nLoss);
    else if (close < prevStop && prevClose < prevStop) stop = Math.min(prevStop, close + nLoss);
    else stop = close > prevStop ? close - nLoss : close + nLoss;
    stopArr[i] = stop;

    if (prevClose < prevStop && close > prevStop) posArr[i] = 1;
    else if (prevClose > prevStop && close < prevStop) posArr[i] = -1;
    else posArr[i] = i > 0 ? posArr[i - 1] : 0;
  }

  const plot0 = stopArr.map((v, i) => {
    if (isNaN(v)) return { time: bars[i].time, value: NaN };
    const c = posArr[i] === -1 ? RED : posArr[i] === 1 ? GREEN : BLUE;
    return { time: bars[i].time, value: v, color: c };
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0 },
  } as Omit<IndicatorResult, 'markers'>;
}

export const ATRTrailingColored = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
