/**
 * Initial Balance Breakout Signals [LuxAlgo]
 *
 * The initial balance (IB) is the price range of the first part of the trading day: with "Auto" the first hour from
 * the first bar of the regular session, else the bars inside the "Initial Balance" session. For each IB the script
 * keeps its open, its high (top) and its low (bottom). On the last bar it draws, for all IBs or the last X of them:
 * a box over the IB bars, the top and bottom lines to the end of the day, an extension line above and below (a
 * percentage of the IB range) with a filled area, Fibonacci lines inside the range (optional price labels) and two
 * forecast lines. The forecast of an IB is known when it starts: its open (or the open of the IB before) plus the
 * average distance of the top / bottom of the last "Forecast Memory" IBs to their reference open, times a
 * multiplier; "Filter By Current Day Of Week" averages the IBs of the same day of the week only.
 * A triangle marks a close that breaks out of the IB range during the breakout session (after the IB with "Auto").
 * At most 500 lines, boxes and labels are kept.
 *
 * Chart values read from the optional third argument (see src/chart-context.ts): the exchange time zone and the
 * session of the symbol for the first bar of the regular session, the session inputs and the day of the week
 * (without them: the first bar of each UTC day and UTC hours), the symbol tick for the rounding of the levels (0.01
 * without it), and the state of the last bar: while it is still open the IBs are drawn from the bar before it and
 * only the last IB follows the last bar, as in the original (without a context the last bar is taken as closed).
 *
 * Reference: "Initial Balance Breakout Signals [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { str, math, color, timeframe, time as pineTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, LinefillData, MarkerData } from '../types';
import { lastBarConfirmedOf, mintickOf, timezoneOf, type ChartContext } from '../chart-context';
import { chartTimeframe, periodStarts, sessionFlags } from '../anchor-period';

type StyleName = 'Dotted' | 'Dashed' | 'Solid';
type ForecastMode = 'IB Against Previous Open' | 'Filter By Current Day Of Week';

export interface InitialBalanceBreakoutSignalsInputs {
  initialBalanceSize: number;
  displayAll: boolean;
  /** Session of the initial balance, in the exchange time zone (used when "Auto" is off) */
  initialBalance: string;
  initialBalanceAuto: boolean;
  breakouts: boolean;
  breakoutsSession: string;
  breakoutsAuto: boolean;
  topExtension: boolean;
  /** Top extension in percent of the IB range */
  topMultiplier: number;
  bottomExtension: boolean;
  bottomMultiplier: number;
  fibonacci: boolean;
  fiboReverse: boolean;
  fiboLevel5Display: boolean;
  fiboLevel5: number;
  fiboLevel5Color: string;
  fiboLevel5Style: StyleName;
  fiboLevel4Display: boolean;
  fiboLevel4: number;
  fiboLevel4Color: string;
  fiboLevel4Style: StyleName;
  fiboLevel3Display: boolean;
  fiboLevel3: number;
  fiboLevel3Color: string;
  fiboLevel3Style: StyleName;
  fiboLevel2Display: boolean;
  fiboLevel2: number;
  fiboLevel2Color: string;
  fiboLevel2Style: StyleName;
  fiboLevel1Display: boolean;
  fiboLevel1: number;
  fiboLevel1Color: string;
  fiboLevel1Style: StyleName;
  fibosLabels: boolean;
  fibosLabelSize: number;
  forecast: boolean;
  forecastMode: ForecastMode;
  forecastLength: number;
  forecastMultiplier: number;
  forecastTopColor: string;
  forecastBottomColor: string;
  forecastStyle: StyleName;
  ibTopColor: string;
  ibBottomColor: string;
  transparency: number;
}

const GREEN = '#089981';
const RED = '#F23645';
/** input.color(color.new(color.silver, 50)) */
const SILVER_50 = 'rgba(178,181,190,0.5)';

export const defaultInputs: InitialBalanceBreakoutSignalsInputs = {
  initialBalanceSize: 10,
  displayAll: true,
  initialBalance: '0830-0930',
  initialBalanceAuto: true,
  breakouts: true,
  breakoutsSession: '0930-0830',
  breakoutsAuto: true,
  topExtension: true,
  topMultiplier: 50,
  bottomExtension: true,
  bottomMultiplier: 50,
  fibonacci: true,
  fiboReverse: false,
  fiboLevel5Display: true,
  fiboLevel5: 0.786,
  fiboLevel5Color: SILVER_50,
  fiboLevel5Style: 'Dashed',
  fiboLevel4Display: true,
  fiboLevel4: 0.618,
  fiboLevel4Color: SILVER_50,
  fiboLevel4Style: 'Dashed',
  fiboLevel3Display: true,
  fiboLevel3: 0.5,
  fiboLevel3Color: SILVER_50,
  fiboLevel3Style: 'Dashed',
  fiboLevel2Display: true,
  fiboLevel2: 0.382,
  fiboLevel2Color: SILVER_50,
  fiboLevel2Style: 'Dashed',
  fiboLevel1Display: true,
  fiboLevel1: 0.236,
  fiboLevel1Color: SILVER_50,
  fiboLevel1Style: 'Dashed',
  fibosLabels: false,
  fibosLabelSize: 10,
  forecast: true,
  forecastMode: 'IB Against Previous Open',
  forecastLength: 10,
  forecastMultiplier: 1.0,
  forecastTopColor: GREEN,
  forecastBottomColor: RED,
  forecastStyle: 'Dotted',
  ibTopColor: GREEN,
  ibBottomColor: RED,
  transparency: 80,
};

const EXTENSION_GROUP = 'EXTENSIONS';
const FIBONACCI_GROUP = 'FIBONACCI LEVELS';
const FORECAST_GROUP = 'FORECAST';
const STYLE_GROUP = 'STYLE';
const EM_SPACE = ' ';
const EN_SPACE = ' ';
const FOUR_PER_EM_SPACE = ' ';
const SIX_PER_EM_SPACE = ' ';
const STYLES = ['Dotted', 'Dashed', 'Solid'];
const FORECAST1 = 'IB Against Previous Open';
const FORECAST2 = 'Filter By Current Day Of Week';

const TIP_METHOD =
  'Select the forecast method.\nIB Against Previous Open calculates the average difference between the IB high and low and the previous day\'s IB open price.\n'
  + 'Filter by Current Day of Week option calculates the average difference between the IB high and low and the IB open price for the same day of the week.';

const fiboInputs = (k: 5 | 4 | 3 | 2 | 1): InputConfig[] => [
  { id: `fiboLevel${k}Display`, type: 'bool', title: '', defval: true, group: FIBONACCI_GROUP, inline: `fibo${k}` },
  { id: `fiboLevel${k}`, type: 'float', title: '', defval: defaultInputs[`fiboLevel${k}`], group: FIBONACCI_GROUP, inline: `fibo${k}` },
  { id: `fiboLevel${k}Color`, type: 'color', title: '', defval: SILVER_50, group: FIBONACCI_GROUP, inline: `fibo${k}` },
  { id: `fiboLevel${k}Style`, type: 'string', title: '', defval: 'Dashed', options: STYLES, group: FIBONACCI_GROUP, inline: `fibo${k}` },
];

export const inputConfig: InputConfig[] = [
  { id: 'initialBalanceSize', type: 'int', title: 'Display Last X IBs', defval: 10, min: 1, inline: 'ibAll' },
  { id: 'displayAll', type: 'bool', title: 'Display All', defval: true, inline: 'ibAll' },
  { id: 'initialBalance', type: 'session', title: `Initial Balance${SIX_PER_EM_SPACE}${SIX_PER_EM_SPACE}`, defval: '0830-0930', inline: 'ib0' },
  { id: 'initialBalanceAuto', type: 'bool', title: 'Auto', defval: true, inline: 'ib0' },
  { id: 'breakouts', type: 'bool', title: 'Breakouts', defval: true, inline: 'break0' },
  { id: 'breakoutsSession', type: 'session', title: '', defval: '0930-0830', inline: 'break0' },
  { id: 'breakoutsAuto', type: 'bool', title: 'Auto', defval: true, inline: 'break0' },
  { id: 'topExtension', type: 'bool', title: `Top Extension %${EM_SPACE}${EN_SPACE}${SIX_PER_EM_SPACE}`, defval: true, group: EXTENSION_GROUP, inline: 'top' },
  { id: 'topMultiplier', type: 'int', title: '', defval: 50, min: 1, step: 5, group: EXTENSION_GROUP, inline: 'top' },
  { id: 'bottomExtension', type: 'bool', title: 'Bottom Extension %', defval: true, group: EXTENSION_GROUP, inline: 'bottom' },
  { id: 'bottomMultiplier', type: 'int', title: '', defval: 50, min: 1, step: 5, group: EXTENSION_GROUP, inline: 'bottom' },
  { id: 'fibonacci', type: 'bool', title: 'Display Fibonnaci', defval: true, group: FIBONACCI_GROUP },
  { id: 'fiboReverse', type: 'bool', title: 'Reverse', defval: false, group: FIBONACCI_GROUP },
  ...fiboInputs(5),
  ...fiboInputs(4),
  ...fiboInputs(3),
  ...fiboInputs(2),
  ...fiboInputs(1),
  { id: 'fibosLabels', type: 'bool', title: `Display Labels${FOUR_PER_EM_SPACE}`, defval: false, group: FIBONACCI_GROUP, inline: 'fiboLabels' },
  { id: 'fibosLabelSize', type: 'int', title: `|${FOUR_PER_EM_SPACE} Text Size${FOUR_PER_EM_SPACE}`, defval: 10, group: FIBONACCI_GROUP, inline: 'fiboLabels' },
  { id: 'forecast', type: 'bool', title: `Display Forecast${EM_SPACE}${FOUR_PER_EM_SPACE}${FOUR_PER_EM_SPACE}`, defval: true, group: FORECAST_GROUP, inline: 'forecast' },
  { id: 'forecastMode', type: 'string', title: '', defval: FORECAST1, options: [FORECAST1, FORECAST2], group: FORECAST_GROUP, inline: 'forecast', tooltip: TIP_METHOD },
  { id: 'forecastLength', type: 'int', title: 'Forecast Memory', defval: 10, min: 2, group: FORECAST_GROUP, tooltip: 'The number of data points used to calculate the average.' },
  {
    id: 'forecastMultiplier', type: 'float', title: 'Forecast Multiplier', defval: 1.0, min: 0.1, step: 0.25, group: FORECAST_GROUP,
    tooltip: 'This multiplier will be applied to the average. Bigger numbers will result in wider predicted ranges.',
  },
  { id: 'forecastTopColor', type: 'color', title: 'Forecast Top Color', defval: GREEN, group: FORECAST_GROUP },
  { id: 'forecastBottomColor', type: 'color', title: 'Forecast Bottom Color', defval: RED, group: FORECAST_GROUP },
  { id: 'forecastStyle', type: 'string', title: 'Forecast Style', defval: 'Dotted', options: STYLES, group: FORECAST_GROUP },
  { id: 'ibTopColor', type: 'color', title: 'IB Top Color', defval: GREEN, group: STYLE_GROUP },
  { id: 'ibBottomColor', type: 'color', title: 'IB Bottom Color', defval: RED, group: STYLE_GROUP },
  { id: 'transparency', type: 'int', title: 'Extension Transparency', defval: 80, min: 0, max: 100, group: STYLE_GROUP },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Initial Balance Breakout Signals [LuxAlgo]',
  shortTitle: 'LuxAlgo - Initial Balance Breakout Signals',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_boxes_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;
const SILVER = '#B2B5BE';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Ln {
  x1: number;
  x2: number;
  y: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
}
interface Bx {
  x1: number;
  x2: number;
  top: number;
  bottom: number;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  textColor: string;
}
interface Balance {
  startTime: number;
  endTime: number;
  dayOfWeek: number;
  openPrice: number;
  top: number;
  bottom: number;
  endOfSession: number;
  lines: Ln[];
  background: Bx | null;
  fibos: Ln[];
  labels: Lb[];
  forecast: Ln[];
  forecastTop: number;
  forecastBottom: number;
}

/** Objects of one drawing type in creation order: above max + 5 objects the oldest are deleted until max remain */
function registry<T>() {
  let alive: T[] = [];
  return {
    add(o: T): T {
      alive.push(o);
      if (alive.length > MAX_OBJECTS + 5) alive = alive.slice(alive.length - MAX_OBJECTS);
      return o;
    },
    remove(o: T | null) {
      if (o !== null) alive = alive.filter((x) => x !== o);
    },
    all: () => alive,
  };
}

/** array.avg(): na for an empty array */
const average = (values: number[]) => (values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length);

export function calculate(
  bars: Bar[],
  inputs: Partial<InitialBalanceBreakoutSignalsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; lines: LineDrawingData[]; boxes: BoxData[]; labels: LabelData[]; linefills: LinefillData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const mintick = mintickOf(chart);
  const tz = timezoneOf(chart);
  const unit = n > 0 && bars[0].time >= 1e12 ? 1 : 1000;
  const tMs = bars.map((b) => b.time * unit);
  const roundToTick = (v: number) => math.round_to_mintick(v, mintick) as number;
  const topMultiplier = cfg.topMultiplier / 100;
  const bottomMultiplier = cfg.bottomMultiplier / 100;
  const forecastFilter = cfg.forecastMode === FORECAST2;
  const lineStyle = (s: StyleName): Ln['style'] => (s === 'Dotted' ? 'dotted' : s === 'Dashed' ? 'dashed' : 'solid');

  // session.isfirstbar_regular: the flag of the exchange calendar with the time zone and the session of the chart
  // context; without them the first bar of each UTC day
  const exchangeFirst = sessionFlags(bars, chart)?.isfirstbar_regular ?? null;
  const dayStart = exchangeFirst === null ? periodStarts(bars, 'D', chart) : [];
  const firstBarRegular = (i: number) => (exchangeFirst !== null ? exchangeFirst[i] : i === 0 ? dayStart[0] === bars[0].time : dayStart[i] !== dayStart[i - 1]);
  // time(timeframe.period, session): the bar duration is needed for the session test on the days around a clock change
  const chartTf = chartTimeframe(bars, chart);
  const barMs = chartTf === '' ? undefined : timeframe.in_seconds(chartTf) * 1000;
  const inSession = (i: number, session: string) => pineTime.inSession(tMs[i], session, tz, barMs);

  const lineRegistry = registry<Ln>();
  const boxRegistry = registry<Bx>();
  const labelRegistry = registry<Lb>();
  const linefills: Array<{ a: Ln; b: Ln; color: string }> = [];

  const balances: Balance[] = [];
  let forecastTop = NaN;
  let forecastBottom = NaN;
  const simpleForecast = { tops: [] as number[], bottoms: [] as number[] };
  const dayForecasts = Array.from({ length: 8 }, () => ({ tops: [] as number[], bottoms: [] as number[] }));

  // addForecastData()
  const addForecastData = (top: number, bottom: number, openPrice: number, dayOfWeek: number | null) => {
    const target = dayOfWeek !== null ? dayForecasts[dayOfWeek] : simpleForecast;
    target.tops.push(top - openPrice);
    target.bottoms.push(bottom - openPrice);
    if (target.tops.length > cfg.forecastLength) {
      target.tops.shift();
      target.bottoms.shift();
    }
  };

  // drawInitialBalance()
  const newLine = (ib: Balance, y: number, css: string, style: Ln['style']) =>
    lineRegistry.add({ x1: ib.startTime, x2: ib.endOfSession, y, color: css, style });
  const fiboLevels = ([1, 2, 3, 4, 5] as const).map((k) => ({
    show: cfg[`fiboLevel${k}Display`], level: cfg[`fiboLevel${k}`], css: cfg[`fiboLevel${k}Color`], style: lineStyle(cfg[`fiboLevel${k}Style`]),
  }));
  const drawLevel = (ib: Balance, level: number, extension: boolean, multiplier: number, css: string) => {
    ib.lines.push(newLine(ib, level, css, 'solid'));
    if (extension) {
      ib.lines.push(newLine(ib, roundToTick(level + multiplier * (ib.top - ib.bottom)), css, 'solid'));
      linefills.push({ a: ib.lines[ib.lines.length - 1], b: ib.lines[ib.lines.length - 2], color: String(color.new(css, cfg.transparency)) });
    }
  };
  const drawInitialBalance = (ib: Balance) => {
    if (cfg.forecast) {
      ib.forecast.forEach(lineRegistry.remove);
      ib.forecast.push(newLine(ib, ib.forecastTop, cfg.forecastTopColor, lineStyle(cfg.forecastStyle)));
      ib.forecast.push(newLine(ib, ib.forecastBottom, cfg.forecastBottomColor, lineStyle(cfg.forecastStyle)));
    }
    if (cfg.fibonacci) {
      ib.fibos.forEach(lineRegistry.remove);
      ib.labels.forEach(labelRegistry.remove);
      for (const { show, level, css, style } of fiboLevels) {
        if (!show) continue;
        const range = roundToTick(level * (ib.top - ib.bottom));
        const price = cfg.fiboReverse ? ib.bottom + range : ib.top - range;
        ib.fibos.push(newLine(ib, price, css, style));
        if (cfg.fibosLabels) {
          ib.labels.push(labelRegistry.add({ x: ib.endOfSession, y: price, text: str.format('{0} ({1})', level, price), textColor: css }));
        }
      }
    }
    ib.lines.forEach(lineRegistry.remove);
    drawLevel(ib, ib.top, cfg.topExtension, topMultiplier, cfg.ibTopColor);
    drawLevel(ib, ib.bottom, cfg.bottomExtension, -1 * bottomMultiplier, cfg.ibBottomColor);
    boxRegistry.remove(ib.background);
    ib.background = boxRegistry.add({ x1: ib.startTime, x2: ib.endTime, top: ib.top, bottom: ib.bottom });
  };

  // barstate.islastconfirmedhistory: the last bar when it is closed, else the bar before it
  const lastHistory = lastBarConfirmedOf(chart) ? last : last - 1;

  const markers: MarkerData[] = [];
  let autoStart = n > 0 ? tMs[0] : 0;
  let insideBefore = false;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = tMs[i];
    if (firstBarRegular(i)) autoStart = t;
    const autoEnd = autoStart + 3600000;
    const inside = cfg.initialBalanceAuto ? t >= autoStart && t < autoEnd : inSession(i, cfg.initialBalance);
    const start = inside && !insideBefore;
    insideBefore = inside;
    const insideBreakouts = cfg.breakoutsAuto ? t >= autoEnd : inSession(i, cfg.breakoutsSession);

    // gatherData()
    if (start) {
      const dayOfWeek = pineTime.dayofweek(t, tz);
      if (cfg.forecast) {
        // gatherForecastData()
        if (balances.length >= 2) {
          const current = balances[balances.length - 1];
          if (forecastFilter) addForecastData(current.top, current.bottom, current.openPrice, current.dayOfWeek);
          else addForecastData(current.top, current.bottom, balances[balances.length - 2].openPrice, null);
        }
        // updateCurrentForecast()
        if (balances.length > 0) {
          const source = forecastFilter ? dayForecasts[dayOfWeek] : simpleForecast;
          const openPrice = forecastFilter ? b.open : balances[balances.length - 1].openPrice;
          forecastTop = openPrice + cfg.forecastMultiplier * average(source.tops);
          forecastBottom = openPrice + cfg.forecastMultiplier * average(source.bottoms);
        }
      }
      balances.push({
        startTime: t, endTime: t, dayOfWeek, openPrice: b.open, top: b.high, bottom: b.low, endOfSession: t, lines: [], background: null,
        fibos: [], labels: [], forecast: [], forecastTop, forecastBottom,
      });
    }
    const current = balances.length > 0 ? balances[balances.length - 1] : null;
    if (current !== null) {
      current.endOfSession = t;
      if (inside) {
        current.endTime = t;
        current.top = Math.max(current.top, b.high);
        current.bottom = Math.min(current.bottom, b.low);
      }
    }

    // breakouts()
    if (cfg.breakouts && current !== null && insideBreakouts && i > 0) {
      const before = bars[i - 1].close;
      if (lt(before, current.top) && gt(b.close, current.top)) {
        markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: cfg.ibTopColor, size: 'tiny' });
      }
      if (gt(before, current.bottom) && lt(b.close, current.bottom)) {
        markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: cfg.ibBottomColor, size: 'tiny' });
      }
    }

    // drawInitialBalances()
    if (i === lastHistory && balances.length > 0) {
      const startIndex = balances.length - (cfg.displayAll ? balances.length : cfg.initialBalanceSize);
      if (startIndex < 0) {
        throw new Error(`Error on bar ${i}: In 'array.slice()' function. Index ${startIndex} is out of bounds, array size is ${balances.length}.`);
      }
      balances.slice(startIndex).forEach(drawInitialBalance);
    }
    // drawInitialBalance(initialBalances.last()): the original stops when no initial balance was found
    if (i === last) {
      if (current === null) throw new Error(`Error on bar ${i}: Cannot call \`last()\` if array is empty.`);
      drawInitialBalance(current);
    }
  }

  const boxColor = String(color.new(SILVER, 90));
  const time = (ms: number) => ms / unit;
  const toLine = (l: Ln): LineDrawingData => ({
    time1: time(l.x1), price1: l.y, time2: time(l.x2), price2: l.y, color: l.color, width: 1, ...(l.style === 'solid' ? {} : { style: l.style }),
  });
  const aliveLines = new Set(lineRegistry.all());

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    // an object with an na coordinate is not drawn
    lines: lineRegistry.all().filter((l) => !isNaN(l.y)).map(toLine),
    boxes: boxRegistry.all().map((x): BoxData => ({
      time1: time(x.x1), price1: x.top, time2: time(x.x2), price2: x.bottom, borderColor: boxColor, bgColor: boxColor,
    })),
    labels: labelRegistry.all().map((l): LabelData => ({
      time: time(l.x), price: l.y, text: l.text, color: 'transparent', textColor: l.textColor, style: 'label_left', size: cfg.fibosLabelSize,
    })),
    // a fill whose line was deleted is not drawn
    linefills: linefills.filter((f) => aliveLines.has(f.a) && aliveLines.has(f.b)).map((f) => ({ line1: toLine(f.a), line2: toLine(f.b), color: f.color })),
  };
}

export const InitialBalanceBreakoutSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
