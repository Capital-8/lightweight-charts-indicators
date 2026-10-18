/**
 * MA Ribbon 5EMA | 20EMA | 50SMA | 200EMA
 *
 * Four moving averages of the source on the price chart: EMA 5, EMA 20, SMA 50 and EMA 200. Each line can be
 * hidden; colours and widths are inputs.
 * Alerts (alertcondition, `alerts` of the result): the source crossing above / below the EMA 200 and the EMA 5
 * crossing above / below the EMA 20 (whether the lines are shown or not).
 *
 * Reference: "5 EMA | 20 EMA | 50 SMA | 200 EMA" by vamsinelluri7
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { ta, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType, type Series } from 'oakscriptjs';

export interface MaRibbon5ema20ema50sma200emaInputs {
  /** Source of the four averages */
  src: SourceType;
  show5ema: boolean;
  show20ema: boolean;
  show50sma: boolean;
  show200ema: boolean;
  col5ema: string;
  col20ema: string;
  col50sma: string;
  col200ema: string;
  /** Line widths (the plot widths of plotConfig are the defaults) */
  width5ema: number;
  width20ema: number;
  width50sma: number;
  width200ema: number;
}

export const defaultInputs: MaRibbon5ema20ema50sma200emaInputs = {
  src: 'close',
  show5ema: true,
  show20ema: true,
  show50sma: true,
  show200ema: true,
  col5ema: '#00E5FF',
  col20ema: '#8FCE00',
  col50sma: '#F6C73B',
  col200ema: '#F44336',
  width5ema: 1,
  width20ema: 1,
  width50sma: 2,
  width200ema: 2,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'show5ema', type: 'bool', title: 'Show 5 EMA', defval: true },
  { id: 'show20ema', type: 'bool', title: 'Show 20 EMA', defval: true },
  { id: 'show50sma', type: 'bool', title: 'Show 50 SMA', defval: true },
  { id: 'show200ema', type: 'bool', title: 'Show 200 EMA', defval: true },
  { id: 'col5ema', type: 'color', title: '5 EMA Color', defval: '#00E5FF' },
  { id: 'col20ema', type: 'color', title: '20 EMA Color', defval: '#8FCE00' },
  { id: 'col50sma', type: 'color', title: '50 SMA Color', defval: '#F6C73B' },
  { id: 'col200ema', type: 'color', title: '200 EMA Color', defval: '#F44336' },
  { id: 'width5ema', type: 'int', title: '5 EMA Width', defval: 1, min: 1, max: 5 },
  { id: 'width20ema', type: 'int', title: '20 EMA Width', defval: 1, min: 1, max: 5 },
  { id: 'width50sma', type: 'int', title: '50 SMA Width', defval: 2, min: 1, max: 5 },
  { id: 'width200ema', type: 'int', title: '200 EMA Width', defval: 2, min: 1, max: 5 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: '5 EMA', color: '#00E5FF', lineWidth: 1 },
  { id: 'plot1', title: '20 EMA', color: '#8FCE00', lineWidth: 1 },
  { id: 'plot2', title: '50 SMA', color: '#F6C73B', lineWidth: 2 },
  { id: 'plot3', title: '200 EMA', color: '#F44336', lineWidth: 2 },
];

export const metadata = {
  title: '5 EMA | 20 EMA | 50 SMA | 200 EMA',
  shortTitle: 'MA Ribbon 5,20,50,200',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<MaRibbon5ema20ema50sma200emaInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = getSourceSeries(bars, cfg.src);

  const ema5 = A(ta.ema(src, 5));
  const ema20 = A(ta.ema(src, 20));
  const sma50 = A(ta.sma(src, 50));
  const ema200 = A(ta.ema(src, 200));

  // plot(showX ? x : na, title, color = colX, linewidth = widthX)
  const line = (show: boolean, vals: number[], col: string) =>
    bars.map((b, i) => ({ time: b.time, value: show ? vals[i] : NaN, color: col }));

  const srcArr = A(src);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(cfg.show5ema, ema5, cfg.col5ema),
      plot1: line(cfg.show20ema, ema20, cfg.col20ema),
      plot2: line(cfg.show50sma, sma50, cfg.col50sma),
      plot3: line(cfg.show200ema, ema200, cfg.col200ema),
    },
    alerts: alertStates(alertConditions, bars, [
      crossedOver(srcArr, ema200), // ta.crossover(src, ema200)
      crossedUnder(srcArr, ema200), // ta.crossunder(src, ema200)
      crossedOver(ema5, ema20), // ta.crossover(ema5, ema20)
      crossedUnder(ema5, ema20), // ta.crossunder(ema5, ema20)
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Price Crossed Above 200 EMA', message: 'Price crossed ABOVE 200 EMA' },
  { id: 'alert1', title: 'Price Crossed Below 200 EMA', message: 'Price crossed BELOW 200 EMA' },
  { id: 'alert2', title: '5 EMA Crossed Above 20 EMA', message: '5 EMA crossed ABOVE 20 EMA — Bullish' },
  { id: 'alert3', title: '5 EMA Crossed Below 20 EMA', message: '5 EMA crossed BELOW 20 EMA — Bearish' },
];

export const MaRibbon5ema20ema50sma200ema = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
