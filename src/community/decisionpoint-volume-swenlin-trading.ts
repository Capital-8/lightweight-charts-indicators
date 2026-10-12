/**
 * DecisionPoint Volume Swenlin Trading Oscillator [LazyBear]
 *
 * Breadth oscillator on the advancing and declining volume of a market: i = (adv - dec) / (adv + dec), then
 * sto = sma(ema(1000 * i, 4), 5). The histogram is green when sto is above 0 and rising, red when it is below 0 and
 * falling, orange otherwise; a line shows sto and a grey line marks 0.
 *
 * The advancing / declining volume are the daily closes of other symbols (the chart timeframe on daily and higher
 * charts, "D" on intraday charts): INDEX:AVVN / INDEX:DVCN for the NYSE (market 1), INDEX:AVVQ / INDEX:DVCQ for the
 * NASDAQ (2), INDEX:AVVA / INDEX:DVCA for the AMEX (3), the mean of the three (market 0, the spread
 * "(AVVN+AVVQ+AVVA)/3.0" of the original), or the two custom symbols (4). The original names the symbols without
 * the exchange ("AVVN"); they resolve to the INDEX symbols. Their bars come from the chart context (`chart.bars`):
 * without them `calculate` throws a `MissingSymbolDataError`. As in the original (Pine version 1), every chart bar
 * shows the value of the other symbol's period it belongs to, also before that period has closed.
 *
 * Reference: "DecisionPoint Volume Swenlin Trading Oscillator [LazyBear]" by LazyBear
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, timeframe, type Bar, type IndicatorResult, type InputConfig, type PlotConfig } from 'oakscriptjs';
import { symbolBarsOf, type ChartContext, type SymbolRequest } from '../chart-context';
import { chartTimeframe } from '../anchor-period';
import { securityOther } from '../other-symbol';

export interface DecisionPointVolumeSwenlinInputs {
  /** Market: 0 = AMEX / NASD / NYSE combined, 1 = NYSE, 2 = NASDAQ, 3 = AMEX, 4 = custom symbols */
  mkt: number;
  /** Custom advancing volume symbol (market 4) */
  aic: string;
  /** Custom declining volume symbol (market 4) */
  dic: string;
  /** Show the histogram */
  sh: boolean;
}

export const defaultInputs: DecisionPointVolumeSwenlinInputs = {
  mkt: 1,
  aic: 'AVVD',
  dic: 'DVCD',
  sh: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'mkt', type: 'int', title: 'Market (0=>AMEX/NASD/NYSE Combined, 1=NYSE, 2=NASDAQ, 3=AMEX, 4=CUSTOM)', defval: 1, min: 0, max: 4 },
  { id: 'aic', type: 'string', title: 'CUSTOM: Advancing Volume Symbol', defval: 'AVVD' },
  { id: 'dic', type: 'string', title: 'CUSTOM: Declining Volume Symbol', defval: 'DVCD' },
  { id: 'sh', type: 'bool', title: 'Show Histo', defval: true },
];

/** Plot colours of a Pine version 1 script: transparency 35; the colours of a series colour are opaque */
const V1 = (c: string) => String(color.new(c, 35));
const GRAY = V1('#808080');
const MAROON = V1('#800000');
const GREEN = '#008000';
const ORANGE = '#FF7F00';
const RED = '#FF0000';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MidLine', color: GRAY, lineWidth: 1 },
  { id: 'plot1', title: 'Histo', color: GREEN, lineWidth: 1, style: 'histogram' },
  { id: 'plot2', title: 'DSTO-Volume', color: MAROON, lineWidth: 2 },
];

export const metadata = {
  title: 'DecisionPoint Volume Swenlin Trading Oscillator [LazyBear]',
  shortTitle: 'DVSTO_LB',
  overlay: false,
};

/** Advancing and declining volume symbols of a market; market 0 is the mean of three symbols */
function marketSymbols(cfg: DecisionPointVolumeSwenlinInputs): { adv: string[]; dec: string[] } {
  const mkt = cfg.mkt;
  if (mkt === 0) {
    return { adv: ['INDEX:AVVN', 'INDEX:AVVQ', 'INDEX:AVVA'], dec: ['INDEX:DVCN', 'INDEX:DVCQ', 'INDEX:DVCA'] };
  }
  if (mkt === 1) return { adv: ['INDEX:AVVN'], dec: ['INDEX:DVCN'] };
  if (mkt === 2) return { adv: ['INDEX:AVVQ'], dec: ['INDEX:DVCQ'] };
  if (mkt === 3) return { adv: ['INDEX:AVVA'], dec: ['INDEX:DVCA'] };
  return { adv: [cfg.aic], dec: [cfg.dic] };
}

/** res = isintraday ? "D" : period */
function resolution(chartTf: string): string {
  return chartTf !== '' && timeframe.info(chartTf).isintraday ? '1D' : chartTf;
}

/** Bars of other symbols the indicator needs: the symbols of the market on "D" (intraday charts) or the chart timeframe. */
export function requiredSymbols(inputs: Partial<DecisionPointVolumeSwenlinInputs> = {}, chart?: ChartContext): SymbolRequest[] {
  const cfg = { ...defaultInputs, ...inputs };
  const res = resolution(chartTimeframe([], chart));
  const { adv, dec } = marketSymbols(cfg);
  return [...adv, ...dec].map((symbol) => ({ symbol, timeframe: res }));
}

/**
 * Close of the spread "(A+B+C)/3.0" on the bars of its three symbols: a bar at every time where one of them has a
 * bar, with the last close of each symbol at or before that time (from the time where all three have a bar).
 */
function spreadBars(parts: Bar[][]): Bar[] {
  const times = [...new Set(parts.flatMap((p) => p.map((b) => b.time)))].sort((a, b) => a - b);
  const pos = parts.map(() => -1);
  const out: Bar[] = [];
  for (const t of times) {
    parts.forEach((p, k) => {
      while (pos[k] + 1 < p.length && p[pos[k] + 1].time <= t) pos[k]++;
    });
    if (pos.some((j) => j < 0)) continue;
    const [a, b, c] = parts.map((p, k) => p[pos[k]].close);
    const close = (a + b + c) / 3.0;
    out.push({ time: t, open: close, high: close, low: close, close, volume: 0 });
  }
  return out;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<DecisionPointVolumeSwenlinInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const res = resolution(chartTimeframe(bars, chart));
  const { adv: advSyms, dec: decSyms } = marketSymbols(cfg);
  const all = symbolBarsOf([...advSyms, ...decSyms].map((symbol) => ({ symbol, timeframe: res })), chart);
  const advParts = all.slice(0, advSyms.length);
  const decParts = all.slice(advSyms.length);

  // security(symbol, res, close) of Pine version 1: no gaps; a chart bar shows the bar of its period (lookahead)
  const closeOf = (parts: Bar[][], syms: string[]): number[] => {
    const other = parts.length === 1 ? parts[0] : spreadBars(parts);
    // a spread trades on the calendar of its first symbol
    const index = securityOther(bars, other, res, { lookahead: true, symbol: syms[0] }, chart);
    return index.map((j) => (j < 0 ? NaN : other[j].close));
  };
  const adv = closeOf(advParts, advSyms);
  const dec = closeOf(decParts, decSyms);

  // i = (adv - dec) / (adv + dec); sto = sma(ema(i * 1000, 4), 5)
  const i1000 = bars.map((_, k) => ((adv[k] - dec[k]) / (adv[k] + dec[k])) * 1000);
  const ema = ta.ema(Series.fromArray(bars, i1000), 4);
  const sto = ta.sma(ema, 5).toArray().map((v) => v ?? NaN);

  const EPS = 1e-10;
  const gt = (a: number, b: number) => a - b > EPS;
  const value = (v: number) => (Number.isFinite(v) ? v : NaN);

  const plot0 = bars.map((b) => ({ time: b.time, value: 0 }));
  const plot1 = bars.map((b, k) => {
    const s = sto[k];
    const prev = k > 0 ? sto[k - 1] : NaN;
    const c = gt(s, 0) ? (gt(s, prev) ? GREEN : ORANGE) : gt(prev, s) ? RED : ORANGE;
    return { time: b.time, value: cfg.sh ? value(s) : NaN, color: c };
  });
  const plot2 = bars.map((b, k) => ({ time: b.time, value: value(sto[k]) }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
  };
}

export const DecisionPointVolumeSwenlin = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  requiredSymbols,
};
