/**
 * RCI3lines
 *
 * Three Rank Correlation Index lines (ta.rci: Spearman rank correlation of the source against time, -100..100) of the
 * source over a short, a middle and a long interval, with dashed high / low lines.
 *
 * Reference: "RCI3lines" by Jadbrother (modified by gero)
 */

import { ta, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';

export interface RCI3LinesInputs {
  /** short interval */
  shortLen: number;
  /** middle interval */
  midLen: number;
  /** long interval */
  longLen: number;
  src: SourceType;
  /** High line [%] */
  upperBand: number;
  /** Low line [%] */
  lowerBand: number;
}

export const defaultInputs: RCI3LinesInputs = {
  shortLen: 9,
  midLen: 36,
  longLen: 52,
  src: 'close',
  upperBand: 80,
  lowerBand: -80,
};

export const inputConfig: InputConfig[] = [
  { id: 'shortLen', type: 'int', title: 'short interval', defval: 9 },
  { id: 'midLen', type: 'int', title: 'middle interval', defval: 36 },
  { id: 'longLen', type: 'int', title: 'long interval', defval: 52 },
  { id: 'src', type: 'source', title: 'source', defval: 'close' },
  { id: 'upperBand', type: 'int', title: 'High line[%]', defval: 80 },
  { id: 'lowerBand', type: 'int', title: 'Low line[%]', defval: -80 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RCI short', color: color.red, lineWidth: 1 },
  { id: 'plot1', title: 'RCI middle', color: color.blue, lineWidth: 1 },
  { id: 'plot2', title: 'RCI long', color: color.green, lineWidth: 1 },
];

export const metadata = {
  title: 'RCI3lines',
  shortTitle: 'RCI3lines',
  overlay: false,
};

export function calculate(bars: Bar[], inputs: Partial<RCI3LinesInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const src = getSourceSeries(bars, cfg.src);
  const line = (len: number, c: string) =>
    ta.rci(src, len).toArray().map((v, i) => ({ time: bars[i].time, value: v ?? NaN, color: c }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(ta.rci(src, itvs / itvm / itvl), title = 'RCI short' / 'RCI middle' / 'RCI long', red / blue / green)
      plot0: line(cfg.shortLen, color.red),
      plot1: line(cfg.midLen, color.blue),
      plot2: line(cfg.longLen, color.green),
    },
    // hline(upperband / lowerband, color = color.gray, linestyle = hline.style_dashed) (untitled)
    hlines: [
      { value: cfg.upperBand, options: { title: 'Level', color: color.gray, linestyle: 'dashed', linewidth: 1 } },
      { value: cfg.lowerBand, options: { title: 'Level', color: color.gray, linestyle: 'dashed', linewidth: 1 } },
    ],
  };
}

export const RCI3Lines = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
