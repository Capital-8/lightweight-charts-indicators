/**
 * Binary Options Arrows (example)
 *
 * Binary option signals on harami candle patterns: an up arrow (CALL) on a bullish harami (a down bar followed by an
 * up bar whose body sits inside it, with open[5] above the open) and a down arrow (PUT) on a bearish harami (the
 * mirror, with open[5] below the open). The background of the expiry bar, "Expiry" bars after the signal, shows the
 * result: lime when the close moved the signal's way (WIN), red otherwise (LOSE).
 *
 * Reference: "Binary Options Arrows (example) [TheMightyChicken]" by TheMightyChicken
 */

import { type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type ArrowConfig, type ArrowData } from 'oakscriptjs';
import type { BgColorData } from '../types';

export interface BinaryOptionArrowsInputs {
  /** Expiry in bars */
  expiry: number;
}

export const defaultInputs: BinaryOptionArrowsInputs = {
  expiry: 1,
};

export const inputConfig: InputConfig[] = [
  { id: 'expiry', type: 'int', title: 'Expiry', defval: 1, min: 1 },
];

// No plot(): the outputs are the plotarrow and the background
export const plotConfig: PlotConfig[] = [];

/** plotarrow(ARROW, colorup=lime, colordown=red, transp=0, minheight=10, maxheight=10) */
export const arrowConfig: ArrowConfig[] = [
  { id: 'arrow0', title: 'Arrows', colorup: '#00FF00', colordown: '#FF0000', minheight: 10, maxheight: 10 },
];

export const metadata = {
  title: 'Binary Options Arrows (example) [TheMightyChicken]',
  shortTitle: 'BOA',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<BinaryOptionArrowsInputs> = {},
): IndicatorResult & { arrows: ArrowData[]; bgColors: BgColorData[] } {
  const { expiry } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const E = Math.max(1, Math.floor(expiry));

  // na history (bars before the first) makes every comparison false
  const call = new Array<boolean>(n).fill(false);
  const put = new Array<boolean>(n).fill(false);
  for (let i = 5; i < n; i++) {
    const b = bars[i];
    const p = bars[i - 1];
    const open5 = bars[i - 5].open;
    // Bearish_harami = close[1] > open[1] and open > close and open <= close[1] and open[1] <= close
    //                  and open - close < close[1] - open[1] and open[5] < open
    put[i] = p.close > p.open && b.open > b.close && b.open <= p.close && p.open <= b.close
      && b.open - b.close < p.close - p.open && open5 < b.open;
    // Bullish_harami = open[1] > close[1] and close > open and close <= open[1] and close[1] <= open
    //                  and close - open < open[1] - close[1] and open[5] > open
    call[i] = p.open > p.close && b.close > b.open && b.close <= p.open && p.close <= b.open
      && b.close - b.open < p.open - p.close && open5 > b.open;
  }

  const lime = '#00FF00';
  const red = '#FF0000';
  // bgcolor(..., transp=70)
  const winBg = 'rgba(0, 255, 0, 0.3)';
  const loseBg = 'rgba(255, 0, 0, 0.3)';

  const arrows: ArrowData[] = [];
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // ARROW = CALL - PUT (1, -1 or 0: no arrow on 0)
    const arrow = (call[i] ? 1 : 0) - (put[i] ? 1 : 0);
    if (arrow !== 0) arrows.push({ time: t, id: 'arrow0', value: arrow, color: arrow > 0 ? lime : red });
    // WIN = (CALL[E] and close[E] < close) or (PUT[E] and close[E] > close)
    // LOSE = (CALL[E] and close[E] >= close) or (PUT[E] and close[E] <= close)
    if (i >= E) {
      const cE = bars[i - E].close;
      const c = bars[i].close;
      const win = (call[i - E] && cE < c) || (put[i - E] && cE > c);
      const lose = (call[i - E] && cE >= c) || (put[i - E] && cE <= c);
      if (win) bgColors.push({ id: 'bgcolor0', time: t, color: winBg });
      else if (lose) bgColors.push({ id: 'bgcolor0', time: t, color: loseBg });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    arrows,
    bgColors,
  };
}

export const BinaryOptionArrows = { calculate, metadata, defaultInputs, inputConfig, plotConfig, arrowConfig };
