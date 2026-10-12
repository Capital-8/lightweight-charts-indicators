/**
 * Global (World) Monetary Supply M2 (measured in USD)
 *
 * Sum of the M2 money supply of 21 economies in US dollars: the US M2 and 20 spreads "<country M2> * <its currency
 * in USD>" (Finland: "/ USD in markka"), each read on the chart timeframe and added on every chart bar. The line can
 * be moved by an offset in bars; on the last bar a label shows the sum in trillions ("Global M2: 123.91T").
 *
 * Other symbols: the bars of the economic series (ECONOMICS:...) and of the exchange rates (FX_IDC:..., FX:...) come
 * from the `bars` accessor of the chart context, on the chart timeframe (`requiredSymbols` lists them). A spread is
 * built as the reference platform does it: one bar per trading day of either part (from the later first bar of the
 * two), with the last close of each part at or before that day. The trading day of an exchange rate starts the
 * evening before (22:00 UTC for FX_IDC, 17:00 New York for FX): it comes from the time zone and session of each
 * symbol (`symbolInfo` of the context); without them a bar that opens at 12:00 UTC or later belongs to the next
 * UTC day. Without the bars the port throws a MissingSymbolDataError. Economic series have no intraday bars: on an
 * intraday chart the port throws the error of the original ("unsupported resolution").
 *
 * Reference: "Global (World) Monetary Supply M2 (measured in USD)" by miguefinance
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  timeframe, str, math, barInterval, barTime,
  type Bar, type IndicatorResult, type InputConfig, type PlotConfig,
} from 'oakscriptjs';
import type { LabelData } from '../types';
import { chartTimeframe, timeAfterLastBar } from '../anchor-period';
import { symbolBarsOf, type ChartContext, type SymbolRequest } from '../chart-context';
import { otherSymbolChart, securityOtherValues, spreadBars, spreadOptions, spreadSymbols } from '../other-symbol';

export interface GlobalMonetarySupplyM2Inputs {
  /** Label with the last value */
  labelsCondition: boolean;
  /** Offset of the line in bars */
  offset: number;
}

export const defaultInputs: GlobalMonetarySupplyM2Inputs = {
  labelsCondition: true,
  offset: 0,
};

export const inputConfig: InputConfig[] = [
  { id: 'labelsCondition', type: 'bool', title: 'Label', defval: true },
  {
    id: 'offset', type: 'int', title: 'Offset (move the chart horizontally in time -time shift-)', defval: 0,
    tooltip: 'For BTC as of 2025 the best correlation is on 107 days of offset ',
  },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Global (World) Money Supply M2', color: '#2962FF', lineWidth: 2 },
];

export const metadata = {
  title: 'MF Global Money Supply M2 by MigueFinance',
  shortTitle: 'MF Global M2 by MigueFinance',
  overlay: false,
};

/** The 21 requests of the original, in its order (symbol expressions) */
const SERIES = [
  'ECONOMICS:EUM2*FX:EURUSD',
  'ECONOMICS:USM2',
  'ECONOMICS:CAM2*FX_IDC:CADUSD',
  'ECONOMICS:CHM2*FX_IDC:CHFUSD',
  'ECONOMICS:GBM2*FX:GBPUSD',
  'ECONOMICS:FIM2/FX_IDC:USDFIM',
  'ECONOMICS:RUM2*FX_IDC:RUBUSD',
  'ECONOMICS:NZM2*FX_IDC:NZDUSD',
  'ECONOMICS:CNM2*FX_IDC:CNYUSD',
  'ECONOMICS:TWM2*FX_IDC:TWDUSD',
  'ECONOMICS:HKM2*FX_IDC:HKDUSD',
  'ECONOMICS:INM2*FX_IDC:INRUSD',
  'ECONOMICS:JPM2*FX_IDC:JPYUSD',
  'ECONOMICS:PHM2*FX_IDC:PHPUSD',
  'ECONOMICS:SGM2*FX_IDC:SGDUSD',
  'ECONOMICS:BRM2*FX_IDC:BRLUSD',
  'ECONOMICS:COM2*FX_IDC:COPUSD',
  'ECONOMICS:MXM2*FX_IDC:MXNUSD',
  'ECONOMICS:AEM2*FX_IDC:AEDUSD',
  'ECONOMICS:TRM2*FX_IDC:TRYUSD',
  'ECONOMICS:ZAM2*FX_IDC:ZARUSD',
];

/** Every symbol of the expressions, once */
function symbolsOf(exprs: string[]): string[] {
  const out: string[] = [];
  for (const expr of exprs) {
    for (const s of spreadSymbols(expr)) if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** Timeframe of `timeframe.period` */
function periodOf(bars: ReadonlyArray<Bar>, chart?: ChartContext): string {
  return chart?.timeframe ? timeframe.info(chart.timeframe).period : chartTimeframe(bars, chart) || '1D';
}

/** Other symbols the inputs need: every symbol of the 21 series on the chart timeframe (none on intraday charts) */
export function requiredSymbols(_inputs: Partial<GlobalMonetarySupplyM2Inputs> = {}, chart?: ChartContext): SymbolRequest[] {
  const tf = chart?.timeframe ? timeframe.info(chart.timeframe).period : '1D';
  if (timeframe.info(tf).isintraday) return [];
  return symbolsOf(SERIES).map((symbol) => ({ symbol, timeframe: tf }));
}

export function calculate(
  bars: Bar[], inputs: Partial<GlobalMonetarySupplyM2Inputs> = {}, chart?: ChartContext,
): IndicatorResult & { labels: LabelData[] } {
  const { labelsCondition, offset } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const tf = periodOf(bars, chart);
  if (timeframe.info(tf).isintraday) throw new Error(`unsupported resolution: ECONOMICS:USM2, ${tf}`);
  const symbols = symbolsOf(SERIES);
  const other = symbolBarsOf(symbols.map((symbol) => ({ symbol, timeframe: tf })), chart);
  const bySymbol = new Map(symbols.map((s, k) => [s, other[k]]));

  // request.security(expr, timeframe.period, close) of each series, added
  const glm2 = new Array<number>(n).fill(0);
  for (const expr of SERIES) {
    // a spread is built from its two tickers and trades around the clock on the UTC calendar
    const exprBars = spreadBars(expr, bySymbol, chart);
    const values = securityOtherValues(bars, exprBars, tf, exprBars.map((x) => x.close), otherSymbolChart(bars, chart),
      spreadOptions(expr, chart));
    for (let i = 0; i < n; i++) glm2[i] += values[i];
  }

  // plot(GLM2, offset = _offset): the value of bar i on bar i + offset
  const interval = barInterval(bars);
  const plot0 = [];
  for (let i = 0; i < n; i++) {
    const k = i + offset;
    if (k < 0) continue;
    plot0.push({ time: barTime(bars, k, interval), value: Number.isFinite(glm2[i]) ? glm2[i] : NaN });
  }

  const labels: LabelData[] = [];
  if (labelsCondition && n > 0) {
    const last = glm2[n - 1];
    const text = `Global M2: ${str.tostring(math.round(last / 1000000000000, 2))}T`
      + (offset !== 0 ? `, Offset= ${str.tostring(offset)}` : '');
    const x = n - 1 + 10 + offset;
    // a label at an na price is not drawn
    if (Number.isFinite(last) && x >= 0) {
      labels.push({
        time: x <= n - 1 ? bars[x].time : timeAfterLastBar(bars, x - (n - 1), chart),
        price: last, text, color: '#2962FF', textColor: '#FFFFFF', style: 'label_left',
      });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    labels,
  };
}

export const GlobalMonetarySupplyM2 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  requiredSymbols,
};
