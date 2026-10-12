/**
 * SMT Divergences [LuxAlgo]
 *
 * Smart money technique divergences between the chart symbol and up to two comparison symbols (default the E-mini
 * S&P 500 and the E-mini Dow futures). Swing highs and lows are pivots with "Pivot Lookback" bars on each side; the
 * chart symbol's pivots come from its own highs and lows, a comparison symbol's from its highs and lows on the chart
 * timeframe. When a new swing high (low) of the chart and a new swing high (low) of the comparison symbol are found on
 * the same bar, and the chart's swing moved one way while the comparison's moved the other way since their previous
 * swings, a line joins the two chart swings (red for highs, blue for lows) and a label at the new swing names the
 * comparison symbols that diverge. A higher swing high (lower swing low) of the chart alone moves the start of the
 * next line. A dashboard (off by default) gives, per comparison symbol, the number of swing high / low divergences
 * and their share of the chart swings.
 *
 * The bars of the comparison symbols come from the chart context (`chart.bars`, chart timeframe): without them
 * `calculate` throws a `MissingSymbolDataError`. Each chart bar shows the last bar of the comparison symbol that
 * closed at or before it (no lookahead, no gaps).
 *
 * Reference: "SMT Divergences [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, str, Series, line, label, resetDrawings, setDrawingBar,
  type Bar, type IndicatorResult, type InputConfig, type PlotConfig,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData, TableCellData, TableData, TablePosition } from '../types';
import { symbolBarsOf, type ChartContext, type SymbolRequest } from '../chart-context';
import { chartTimeframe } from '../anchor-period';
import { otherSymbolChart, securityOther } from '../other-symbol';
import { barInterval, barTime } from '../bar-time';

export interface SmtDivergencesInputs {
  /** Bars on each side of a swing */
  length: number;
  /** Use comparison symbol A */
  useSym1: boolean;
  /** Comparison symbol A */
  sym1: string;
  /** Use comparison symbol B */
  useSym2: boolean;
  /** Comparison symbol B */
  sym2: string;
  /** Colour of the swing high divergences */
  bullDivCss: string;
  /** Colour of the swing low divergences */
  bearDivCss: string;
  showDash: boolean;
  dashLoc: 'Top Right' | 'Bottom Right' | 'Bottom Left';
  textSize: 'Tiny' | 'Small' | 'Normal';
}

export const defaultInputs: SmtDivergencesInputs = {
  length: 3,
  useSym1: true,
  sym1: 'CME_MINI_DL:ES1!',
  useSym2: true,
  sym2: 'CBOT_MINI_DL:YM1!',
  bullDivCss: '#ff1100',
  bearDivCss: '#2157f3',
  showDash: false,
  dashLoc: 'Top Right',
  textSize: 'Small',
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Pivot Lookback', defval: 3, min: 2 },
  { id: 'useSym1', type: 'bool', title: 'Comparison Symbol', defval: true, inline: 'symA' },
  { id: 'sym1', type: 'symbol', title: '', defval: 'CME_MINI_DL:ES1!', inline: 'symA' },
  { id: 'useSym2', type: 'bool', title: 'Comparison Symbol', defval: true, inline: 'symB' },
  { id: 'sym2', type: 'symbol', title: '', defval: 'CBOT_MINI_DL:YM1!', inline: 'symB' },
  { id: 'bullDivCss', type: 'color', title: 'Swing High', defval: '#ff1100', group: 'Style' },
  { id: 'bearDivCss', type: 'color', title: 'Swing Low', defval: '#2157f3', group: 'Style' },
  { id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: false, group: 'Dashboard' },
  {
    id: 'dashLoc', type: 'string', title: 'Location', defval: 'Top Right',
    options: ['Top Right', 'Bottom Right', 'Bottom Left'], group: 'Dashboard',
  },
  { id: 'textSize', type: 'string', title: 'Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal'], group: 'Dashboard' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'SMT Divergences [LuxAlgo]',
  shortTitle: 'LuxAlgo - SMT Divergences',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10; na compares false (also with !=) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

/** syminfo.ticker(symbol): the ticker id without the exchange prefix */
const tickerOfSymbol = (symbol: string) => (symbol.includes(':') ? symbol.slice(symbol.indexOf(':') + 1) : symbol);

/** Comparison symbols in use (a symbol that is switched off is not read) */
function usedSymbols(cfg: SmtDivergencesInputs): string[] {
  return [...(cfg.useSym1 ? [cfg.sym1] : []), ...(cfg.useSym2 ? [cfg.sym2] : [])];
}

/** Bars of other symbols the indicator needs: the comparison symbols in use, on the chart timeframe. */
export function requiredSymbols(inputs: Partial<SmtDivergencesInputs> = {}, chart?: ChartContext): SymbolRequest[] {
  const cfg = { ...defaultInputs, ...inputs };
  const tf = chartTimeframe([], chart);
  return usedSymbols(cfg).map((symbol) => ({ symbol, timeframe: tf }));
}

/** fixnan(): the last non-na value */
function fixnan(values: number[]): number[] {
  let last = NaN;
  return values.map((v) => (Number.isNaN(v) ? last : (last = v)));
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SmtDivergencesInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'lines' | 'labels' | 'tables'> & { lines: LineDrawingData[]; labels: LabelData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const length = Math.trunc(cfg.length);
  const tf = chartTimeframe(bars, chart);
  const used = usedSymbols(cfg);
  const otherBars = symbolBarsOf(used.map((symbol) => ({ symbol, timeframe: tf })), chart);

  const S = (a: number[]) => Series.fromArray(bars, a);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const ph = fixnan(A(ta.pivothigh(S(bars.map((b) => b.high)), length, length)));
  const pl = fixnan(A(ta.pivotlow(S(bars.map((b) => b.low)), length, length)));

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS });

  /** One call site of get_divergence(): its `var` state; returns smt for each bar */
  const divergence = (isHigh: boolean, y2s: number[], symY2s: number[], css: string) => {
    let y1 = NaN;
    let symY1 = NaN;
    let x1 = NaN;
    let smt = 0;
    return (i: number): number => {
      const y2 = y2s[i];
      const prevY2 = i > 0 ? y2s[i - 1] : NaN;
      const symY2 = symY2s[i];
      const prevSymY2 = i > 0 ? symY2s[i - 1] : NaN;
      const xBack = i >= length ? i - length : NaN; // n[length]
      if (ne(y2, prevY2) && ne(symY2, prevSymY2)) {
        // test for SMT: (y2 - y1) * (sym_y2 - sym_y1) < 0
        if (lt((y2 - y1) * (symY2 - symY1), 0)) {
          line.new(xBack, y2, x1, y1, 'bar_index', 'none', css);
          smt += 1;
        }
        symY1 = symY2;
        y1 = y2;
        x1 = xBack;
      } else if ((isHigh && gt(y2, prevY2)) || (!isHigh && lt(y2, prevY2))) {
        symY1 = NaN;
        y1 = y2;
        x1 = xBack;
      }
      return smt;
    };
  };

  /** Swing highs / lows of a comparison symbol and the two divergence call sites */
  const comparison = (k: number) => {
    const other = otherBars[k];
    const index = securityOther(bars, other, '', otherSymbolChart(bars, chart), { other: chart?.symbolInfo?.(used[k]) });
    const h = index.map((j) => (j < 0 ? NaN : other[j].high));
    const l = index.map((j) => (j < 0 ? NaN : other[j].low));
    const symPh = fixnan(A(ta.pivothigh(S(h), length, length)));
    const symPl = fixnan(A(ta.pivotlow(S(l), length, length)));
    return {
      high: divergence(true, ph, symPh, cfg.bullDivCss),
      low: divergence(false, pl, symPl, cfg.bearDivCss),
    };
  };
  const site1 = cfg.useSym1 ? comparison(0) : null;
  const site2 = cfg.useSym2 ? comparison(cfg.useSym1 ? 1 : 0) : null;

  const ticker1 = tickerOfSymbol(cfg.sym1);
  const ticker2 = tickerOfSymbol(cfg.sym2);
  let phN = 0;
  let plN = 0;
  let phSmt1 = 0;
  let plSmt1 = 0;
  let phSmt2 = 0;
  let plSmt2 = 0;

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const prevPh = i > 0 ? ph[i - 1] : NaN;
    const prevPl = i > 0 ? pl[i - 1] : NaN;
    phN += ne(ph[i], prevPh) ? 1 : 0;
    plN += ne(pl[i], prevPl) ? 1 : 0;

    const before = [phSmt1, plSmt1, phSmt2, plSmt2];
    if (site1) {
      phSmt1 = site1.high(i);
      plSmt1 = site1.low(i);
    }
    if (site2) {
      phSmt2 = site2.high(i);
      plSmt2 = site2.low(i);
    }

    let txt = '';
    const xBack = i >= length ? i - length : NaN;
    if (ne(ph[i], prevPh)) {
      if (gt(phSmt1, before[0])) txt += ticker1;
      if (gt(phSmt2, before[2])) {
        txt += txt !== '' ? ' | ' : '';
        txt += ticker2;
      }
      if (txt !== '') {
        label.new(xBack, ph[i], txt, 'bar_index', 'price', cfg.bullDivCss, 'label_down', '#FFFFFF', 'tiny');
      }
    } else {
      if (gt(plSmt1, before[1])) txt += ticker1;
      if (gt(plSmt2, before[3])) {
        txt += txt !== '' ? ' | ' : '';
        txt += ticker2;
      }
      if (txt !== '') {
        label.new(xBack, pl[i], txt, 'bar_index', 'price', cfg.bearDivCss, 'label_up', '#FFFFFF', 'tiny');
      }
    }
  }
  setDrawingBar(null);

  // Dashboard: the table always exists (a `var` table); its cells are set only with "Show Dashboard"
  const position: TablePosition = cfg.dashLoc === 'Bottom Left' ? 'bottom_left'
    : cfg.dashLoc === 'Top Right' ? 'top_right' : 'bottom_right';
  const cells: TableCellData[] = [];
  if (cfg.showDash && n > 0) {
    const cell = (column: number, row: number, text: string, textColor: string) =>
      cells.push({ column, row, text, textColor, textSize: 'auto' });
    cell(1, 0, 'Swing High', '#FFFFFF');
    cell(2, 0, 'Swing Low', '#FFFFFF');
    cell(0, 1, ticker1, '#FFFFFF');
    cell(0, 2, ticker2, '#FFFFFF');
    const fmt = (count: number, total: number) => str.format('{0} ({1, number, percent})', count, count / total);
    cell(1, 1, fmt(phSmt1, phN), cfg.bullDivCss);
    cell(2, 1, fmt(plSmt1, plN), cfg.bearDivCss);
    cell(1, 2, fmt(phSmt2, phN), cfg.bullDivCss);
    cell(2, 2, fmt(plSmt2, plN), cfg.bearDivCss);
  }
  const table: TableData = {
    position, columns: 3, rows: 3, cells,
    bgColor: '#1e222d', borderColor: '#373a46', borderWidth: 1, frameColor: '#373a46', frameWidth: 1,
  };

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // a line or a label with an na coordinate is not drawn
    lines: line.all().filter((l) => !isNaN(l.x1) && !isNaN(l.x2) && !isNaN(l.y1) && !isNaN(l.y2)).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color),
    })),
    labels: label.all().filter((l) => !isNaN(l.x) && !isNaN(l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text ?? '', color: String(l.color), textColor: '#FFFFFF',
      style: l.style as 'label_down' | 'label_up', size: 'tiny' as const,
    })),
    tables: n > 0 ? [table] : [],
  };
}

export const SmtDivergences = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  requiredSymbols,
};
