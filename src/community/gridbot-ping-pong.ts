/**
 * Gridbot Ping Pong
 *
 * A grid of 5 levels (base price +- 1 and 2 spacings, the spacing a percent of the base price) simulates a grid bot.
 * The base line can tilt in the direction of the last grid shift (tilt factor). Buy / sell signals come when the
 * trigger source crosses a grid level (or touches it, "Wick Touch"); a signal at the same level as the last signal
 * is not repeated, counter-trend signals become take profits of an open position, and a flat position only trades
 * with the trend at the inner levels. When a bar closes beyond the outer level plus an anchor buffer, the grid shifts
 * one level in that direction (an adverse position is stopped). The grid lines are hidden on the bar after a shift
 * change; a symmetrically weighted MA (SWMA) is drawn with gradient fills to the outer levels.
 * Alerts (alertcondition, `alerts` of the result): Buy, Sell, Buy TP, Sell TP, Buy Stop and Sell Stop, on the bars of
 * each signal.
 *
 * Reference: "Gridbot Ping Pong" by xxattaxx
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, array, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type GridbotTrigger = 'Auto' | 'Wick Touch' | 'Wick Reverse' | 'SWMA' | 'Close';

export interface GridbotPingPongInputs {
  /** Price data that generates the signals */
  trigger: GridbotTrigger;
  /** Percentage spacing between grid levels */
  intervals: number;
  /** Grid slope factor (positive tilts with the trend, negative against it) */
  tilt: number;
  /** Shift resistance factor */
  anchor: number;
  /** Support grid colour */
  supportCol: string;
  /** Resistance grid colour */
  resistCol: string;
  /** Upper fill colour (at the upper grid) */
  colUpperTop: string;
  /** Lower fill colour (at the lower grid) */
  colLowerTop: string;
  /** SWMA colour */
  colSWMA: string;
}

export const defaultInputs: GridbotPingPongInputs = {
  trigger: 'Auto',
  intervals: 1.0,
  tilt: 1.0,
  anchor: 1.0,
  // color.new(c, 75) as an input default: alpha 0.25
  supportCol: 'rgba(76, 175, 80, 0.25)',
  resistCol: 'rgba(255, 0, 0, 0.25)',
  colUpperTop: 'rgba(178, 34, 34, 0.25)',
  colLowerTop: 'rgba(34, 139, 34, 0.25)',
  colSWMA: 'rgba(0, 0, 255, 0.25)',
};

export const inputConfig: InputConfig[] = [
  { id: 'trigger', type: 'string', title: 'Trigger', defval: 'Auto', options: ['Auto', 'Wick Touch', 'Wick Reverse', 'SWMA', 'Close'] },
  { id: 'intervals', type: 'float', title: 'Spacing(%)', defval: 1.0, step: 0.25 },
  { id: 'tilt', type: 'float', title: 'Tilt Factor', defval: 1.0, step: 1.0 },
  { id: 'anchor', type: 'float', title: 'Anchor Strength', defval: 1.0, step: 1.0, min: 0 },
  { id: 'supportCol', type: 'color', title: 'Grids (support)', defval: 'rgba(76, 175, 80, 0.25)' },
  { id: 'resistCol', type: 'color', title: 'Grids (resistance)', defval: 'rgba(255, 0, 0, 0.25)' },
  { id: 'colUpperTop', type: 'color', title: 'Fill (upper)', defval: 'rgba(178, 34, 34, 0.25)' },
  { id: 'colLowerTop', type: 'color', title: 'Fill (lower)', defval: 'rgba(34, 139, 34, 0.25)' },
  { id: 'colSWMA', type: 'color', title: 'SWMA', defval: 'rgba(0, 0, 255, 0.25)' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Price0', color: 'rgba(76, 175, 80, 0.25)', lineWidth: 2, style: 'linebr' },
  { id: 'plot1', title: 'Price1', color: 'rgba(76, 175, 80, 0.25)', lineWidth: 2, style: 'linebr' },
  { id: 'plot2', title: 'Price2', color: 'rgba(76, 175, 80, 0.25)', lineWidth: 3, style: 'circles' },
  { id: 'plot3', title: 'Price3', color: 'rgba(255, 0, 0, 0.25)', lineWidth: 2, style: 'linebr' },
  { id: 'plot4', title: 'Price4', color: 'rgba(255, 0, 0, 0.25)', lineWidth: 2, style: 'linebr' },
  { id: 'plot5', title: 'SWMA', color: 'rgba(0, 0, 255, 0.25)', lineWidth: 4 },
];

export const metadata = {
  title: 'Gridbot Ping Pong',
  shortTitle: 'Gridbot Ping Pong',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<GridbotPingPongInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const trigger = cfg.trigger;
  const swma = ta.swma(Series.fromArray(bars, bars.map((b) => b.close))).toArray().map((v) => v ?? NaN);

  const colUpperBot = String(color.new(cfg.colUpperTop, 88));
  const colLowerBot = String(color.new(cfg.colLowerTop, 88));
  const buyCol = String(color.new('#32CD32', 0));
  const sellCol = String(color.new('#EE4B2B', 0));

  // var state
  const GI = cfg.intervals / 100;
  let bPrice = n > 0 ? bars[0].close : NaN; // var B_Price = close
  let bIndex = 0; // var int B_Index = bar_index
  let slope = 0;
  let intercept = NaN;
  let shiftCount = 0;
  let anchorUp = 0;
  let anchorDown = 0;
  let LSI = 2;
  let P = 0;
  let prevShift = NaN; // Shift[1] (na on the first bar)
  let prevBuySource = NaN; // BuySource[1]
  let prevSellSource = NaN; // SellSource[1]

  const plots: Point[][] = [[], [], [], [], [], []];
  const fill0 = { topValue: [] as number[], bottomValue: [] as number[], topColor: [] as (string | null)[], bottomColor: [] as (string | null)[] };
  const fill1 = { topValue: [] as number[], bottomValue: [] as number[], topColor: [] as (string | null)[], bottomColor: [] as (string | null)[] };
  const markers: MarkerData[] = [];
  // Buy, Sell, BuyTP, SellTP, BuyStop, SellStop per bar (the alertcondition() order)
  const flags: boolean[][] = [[], [], [], [], [], []];

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const t = bar.time as number;
    const SWMA = swma[i];
    let shift = 0; // int Shift = 0
    let buy = false;
    let sell = false;
    let buyTP = false;
    let sellTP = false;
    let buyStop = false;
    let sellStop = false;
    const dir = shiftCount >= 0 ? 1 : -1;
    const g2Color = dir === 1 ? cfg.supportCol : cfg.resistCol;
    const colorArray = [cfg.supportCol, cfg.supportCol, g2Color, cfg.resistCol, cfg.resistCol];

    // Grid calculations
    let basePrice: number;
    if (Math.abs(cfg.tilt - 0) > EPS) { // Tilt != 0
      const normTilt = (cfg.tilt * GI * bPrice) / 10000;
      slope = normTilt * dir;
      intercept = bPrice - slope * bIndex;
      basePrice = slope * i + intercept;
    } else {
      basePrice = bPrice;
    }
    const grid = [
      basePrice - GI * 2 * bPrice,
      basePrice - GI * 1 * bPrice,
      basePrice,
      basePrice + GI * 1 * bPrice,
      basePrice + GI * 2 * bPrice,
    ];

    const buySource = trigger === 'Wick Touch' || trigger === 'Wick Reverse' ? bar.low
      : trigger === 'SWMA' ? SWMA
        : trigger === 'Auto' ? (dir === 1 ? bar.low : bar.close)
          : bar.close;
    const sellSource = trigger === 'Wick Touch' || trigger === 'Wick Reverse' ? bar.high
      : trigger === 'SWMA' ? SWMA
        : trigger === 'Auto' ? (dir === -1 ? bar.high : bar.close)
          : bar.close;

    // Signal detection
    const RMB = array.binary_search_rightmost(grid, buySource);
    const LMS = array.binary_search_leftmost(grid, sellSource);
    let buyIndex = -1;
    let sellIndex = -1;
    if (trigger === 'Wick Touch') {
      buyIndex = RMB < LSI ? RMB : buyIndex;
      sellIndex = LMS > LSI ? LMS : sellIndex;
    } else {
      for (let k = 0; k <= 4; k++) {
        const value = grid[k];
        if (le(buySource, value) && gt(prevBuySource, value) && buyIndex === -1) {
          buyIndex = k;
          break;
        }
      }
      for (let k = 4; k >= 0; k--) {
        const value = grid[k];
        if (ge(sellSource, value) && lt(prevSellSource, value) && sellIndex === -1) {
          sellIndex = k;
          break;
        }
      }
    }

    // Signal filtering
    buy = buyIndex >= 0;
    sell = sellIndex >= 0;
    buy = buyIndex >= LSI ? false : buy;
    sell = sellIndex <= LSI ? false : sell;
    if (buy && sell) {
      buy = dir > 0;
      sell = !(dir > 0);
    }
    if (sell && dir > 0) {
      sellTP = P > 0;
      sell = false;
    }
    if (buy && dir < 0) {
      buyTP = P < 0;
      buy = false;
    }
    if (P === 0) {
      buy = buy && dir > 0;
      sell = sell && dir < 0;
    }
    // Shift != Shift[1]: Shift is still 0 here (false on the first bar, Shift[1] na)
    if (!isNaN(prevShift) && shift !== prevShift) {
      buy = false;
      sell = false;
      buyTP = false;
      sellTP = false;
      buyStop = shiftCount >= 1 && P < 0;
      sellStop = shiftCount <= -1 && P > 0;
    }
    if (sellIndex >= 4) sell = false;
    if (buyIndex <= 0) buy = false;
    if (P === 0 && buyIndex >= 3) buy = false;
    if (P === 0 && sellIndex <= 1) sell = false;
    buyTP = P >= 0 ? false : buyTP;
    sellTP = P <= 0 ? false : sellTP;
    buyStop = P >= 0 ? false : buyStop;
    sellStop = P <= 0 ? false : sellStop;

    // Grid shifting (historical bars are confirmed)
    const normAnchor = (cfg.anchor * GI * bPrice) / 100;
    anchorUp = shiftCount > 1 ? normAnchor / Math.max(Math.abs(shiftCount), 1) : normAnchor;
    anchorDown = shiftCount < -1 ? normAnchor / Math.max(Math.abs(shiftCount), 1) : normAnchor;
    if (gt(bar.low, grid[4] + anchorUp)) {
      bPrice = grid[3] + anchorUp;
      bIndex = i;
      shiftCount = shiftCount >= 0 ? shiftCount + 1 : 1;
      shift = 1;
    }
    if (lt(bar.high, grid[0] - anchorDown)) {
      bPrice = grid[1] - anchorDown;
      bIndex = i;
      shiftCount = shiftCount <= 0 ? shiftCount - 1 : -1;
      shift = -1;
    }

    // Plots: grid lines hidden when Shift != Shift[1]
    const plt = !isNaN(prevShift) && shift === prevShift;
    for (let k = 0; k < 5; k++) {
      const p: Point = { time: t, value: plt ? grid[k] : NaN };
      if (plt) p.color = colorArray[k];
      plots[k].push(p);
    }
    plots[5].push({ time: t, value: SWMA, color: cfg.colSWMA });
    // fill(maLine, p0, SWMA, Price0, colLowerBot, colLowerTop); fill(maLine, p4, SWMA, Price4, colUpperBot, colUpperTop)
    fill0.topValue.push(SWMA);
    fill0.bottomValue.push(grid[0]);
    fill0.topColor.push(colLowerBot);
    fill0.bottomColor.push(cfg.colLowerTop);
    fill1.topValue.push(SWMA);
    fill1.bottomValue.push(grid[4]);
    fill1.topColor.push(colUpperBot);
    fill1.bottomColor.push(cfg.colUpperTop);

    // plotchar signals: size.tiny, location.belowbar (buy) / abovebar (sell)
    const char = (on: boolean, below: boolean, text: string) => {
      if (on) {
        markers.push({ time: t, position: below ? 'belowBar' : 'aboveBar', shape: 'circle', color: 'transparent',
          text, textColor: below ? buyCol : sellCol, size: 'tiny' });
      }
    };
    char(buy, true, '▲');
    char(sell, false, '▼');
    char(buyTP, true, '△');
    char(sellTP, false, '▽');
    char(buyStop, true, '⦿');
    char(sellStop, false, '⦿');
    [buy, sell, buyTP, sellTP, buyStop, sellStop].forEach((f, k) => flags[k].push(f));

    // Position tracking
    if (buy) P = P > 0 ? P + 1 : 1;
    else if (sell) P = P < 0 ? P - 1 : -1;
    else if (buyTP || sellTP || buyStop || sellStop) P = 0;

    LSI = buy ? buyIndex : sell ? sellIndex : LSI;
    LSI = buyTP ? buyIndex : sellTP ? sellIndex : LSI;
    LSI = buyStop ? 4 : sellStop ? 0 : LSI;
    if (P === 0 && LMS > LSI) LSI = LMS;
    if (P === 0 && RMB < LSI) LSI = RMB;
    if (P !== 0 && LMS === 4) LSI = 4;
    if (P !== 0 && RMB === 0) LSI = 0;
    if (shift === 1 && P > 0) LSI = 0;
    else if (shift === 1 && P < 0) LSI = 4;
    else if (shift === -1 && P > 0) LSI = 0;
    else if (shift === -1 && P < 0) LSI = 4;
    if (!isNaN(prevShift) && shift !== prevShift && P === 0 && Math.abs(shiftCount) === 1) LSI = 2;

    prevShift = shift;
    prevBuySource = buySource;
    prevSellSource = sellSource;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: Object.fromEntries(plots.map((p, k) => [`plot${k}`, p])),
    fills: [
      { plot1: 'plot5', plot2: 'plot0', options: { title: 'Lower Fill' }, gradient: fill0 },
      { plot1: 'plot5', plot2: 'plot4', options: { title: 'Upper Fill' }, gradient: fill1 },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy', message: 'Buy' },
  { id: 'alert1', title: 'Sell', message: 'Sell' },
  { id: 'alert2', title: 'Buy TP', message: 'Buy TP' },
  { id: 'alert3', title: 'Sell TP', message: 'Sell TP' },
  { id: 'alert4', title: 'Buy Stop', message: 'Buy Stop' },
  { id: 'alert5', title: 'Sell Stop', message: 'Sell Stop' },
];

export const GridbotPingPong = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
