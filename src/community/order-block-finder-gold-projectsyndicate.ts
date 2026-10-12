/**
 * ProjectSyndicate Gold Order Block Finder
 *
 * On a confirmed swing low (pivot of `swing_length` bars), the script looks back from `swing_length + 1` to
 * `swing_length + lookback` bars for the first bearish candle whose range is smaller than the distance from its low
 * up to the swing low divided by the displacement multiplier: that candle is a bullish order block (bearish order
 * blocks mirror it at swing highs with a bullish candle). Each block gets a strength rating (displacement in ATRs,
 * GMT session of the candle, age, zone height in ATRs; total out of 10) and is kept when it reaches the minimum
 * strength. The zone is normalised to a fixed height (ATR multiple or % of the close) around its middle, drawn as a
 * box from the candle to 100 bars after the current bar, with a "Bull OB" / "Bear OB" label and an info label
 * (strength, session, age, height and distance in pips) 25 bars to the right. A block is removed when a confirmed
 * close crosses it (below the bottom for bullish, above the top for bearish); at most `max_obs` blocks per side
 * (the oldest are removed). Pips: 0.01 for a ticker that contains "XAU" or "GOLD", else 10 ticks.
 *
 * Chart values read: the symbol ticker and price tick (pips), and whether the last bar is closed
 * (`barstate.isconfirmed`: new blocks and removals only on closed bars).
 *
 * Reference: "ProjectSyndicate Gold Order Block Finder" by ProjectSyndicate
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  taCore, color, compare, math, str, box, label, time as ptime, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { lastBarConfirmedOf, mintickOf, tickerOf, type ChartContext } from '../chart-context';

type Box = ReturnType<typeof box.new>;
type Label = ReturnType<typeof label.new>;

export interface OrderBlockFinderGoldProjectsyndicateInputs {
  useNormalizedZones: boolean;
  zoneHeightMethod: 'ATR Based' | 'Fixed Percentage';
  zoneHeightAtrMult: number;
  zoneHeightPercent: number;
  swingLength: number;
  lookback: number;
  displacementMult: number;
  maxObs: number;
  extendBars: number;
  enableStrengthRating: boolean;
  minStrengthFilter: number;
  showBullish: boolean;
  bullColor: string;
  bullBorder: string;
  showBearish: boolean;
  bearColor: string;
  bearBorder: string;
  showLabels: boolean;
  showInfo: boolean;
  labelDetail: 'Short Label' | 'Full Label';
  infoTextSize: 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
}

export const defaultInputs: OrderBlockFinderGoldProjectsyndicateInputs = {
  useNormalizedZones: true,
  zoneHeightMethod: 'ATR Based',
  zoneHeightAtrMult: 0.75,
  zoneHeightPercent: 0.3,
  swingLength: 7,
  lookback: 20,
  displacementMult: 1.3,
  maxObs: 5,
  extendBars: 100,
  enableStrengthRating: true,
  minStrengthFilter: 3.0,
  showBullish: true,
  bullColor: 'rgba(76, 175, 80, 0.15)',
  bullBorder: 'rgba(76, 175, 80, 0.7)',
  showBearish: true,
  bearColor: 'rgba(242, 54, 69, 0.15)',
  bearBorder: 'rgba(242, 54, 69, 0.7)',
  showLabels: true,
  showInfo: true,
  labelDetail: 'Full Label',
  infoTextSize: 'Large',
};

const ZONE = 'Universal Zone Settings';
const DETECT = 'Order Block Detection';
const STRENGTH = 'Strength Rating';
const VIS = 'Visualization';
const INFO = 'Extended Info Labels';

export const inputConfig: InputConfig[] = [
  { id: 'useNormalizedZones', type: 'bool', title: 'Normalize All Zone Heights', defval: true, group: ZONE,
    tooltip: 'Make all zones equal height for clean visual consistency' },
  { id: 'zoneHeightMethod', type: 'string', title: 'Zone Height Method', defval: 'ATR Based', options: ['ATR Based', 'Fixed Percentage'], group: ZONE },
  { id: 'zoneHeightAtrMult', type: 'float', title: 'Zone Height (ATR Multiplier)', defval: 0.75, min: 0.1, max: 3.0, step: 0.05, group: ZONE,
    tooltip: 'All zones will be this many ATRs tall' },
  { id: 'zoneHeightPercent', type: 'float', title: 'Zone Height (% of Price)', defval: 0.3, min: 0.05, max: 2.0, step: 0.05, group: ZONE,
    tooltip: 'All zones will be this % of current price' },
  { id: 'swingLength', type: 'int', title: 'Swing Detection Length', defval: 7, min: 3, max: 20, group: DETECT,
    tooltip: 'Number of candles to left and right for swing detection. Optimized for Gold volatility.' },
  { id: 'lookback', type: 'int', title: 'Order Block Lookback', defval: 20, min: 5, max: 50, group: DETECT,
    tooltip: 'How many candles to look back to find the OB candle after a swing is detected.' },
  { id: 'displacementMult', type: 'float', title: 'Displacement Multiplier', defval: 1.3, min: 0.5, max: 5.0, step: 0.1, group: DETECT,
    tooltip: 'Minimum price movement required to validate the OB. Higher values = stronger zones.' },
  { id: 'maxObs', type: 'int', title: 'Max Order Blocks', defval: 5, min: 1, max: 10, group: DETECT,
    tooltip: 'Maximum number of active order blocks to display per type.' },
  { id: 'extendBars', type: 'int', title: 'Extend Active Zones Right (Bars)', defval: 100, min: 10, max: 1000, group: DETECT,
    tooltip: 'Active order blocks project this many bars into the future instead of extending infinitely.' },
  { id: 'enableStrengthRating', type: 'bool', title: 'Enable Strength Rating', defval: true, group: STRENGTH },
  { id: 'minStrengthFilter', type: 'float', title: 'Minimum Strength Filter', defval: 3.0, min: 0.0, max: 10.0, step: 0.5, group: STRENGTH,
    tooltip: 'Only show zones with strength >= this value' },
  { id: 'showBullish', type: 'bool', title: 'Show Bullish OBs', defval: true, group: VIS, inline: 'bull' },
  { id: 'bullColor', type: 'color', title: '', defval: 'rgba(76, 175, 80, 0.15)', group: VIS, inline: 'bull' },
  { id: 'bullBorder', type: 'color', title: 'Border', defval: 'rgba(76, 175, 80, 0.7)', group: VIS, inline: 'bull' },
  { id: 'showBearish', type: 'bool', title: 'Show Bearish OBs', defval: true, group: VIS, inline: 'bear' },
  { id: 'bearColor', type: 'color', title: '', defval: 'rgba(242, 54, 69, 0.15)', group: VIS, inline: 'bear' },
  { id: 'bearBorder', type: 'color', title: 'Border', defval: 'rgba(242, 54, 69, 0.7)', group: VIS, inline: 'bear' },
  { id: 'showLabels', type: 'bool', title: 'Show Labels', defval: true, group: VIS },
  { id: 'showInfo', type: 'bool', title: 'Show Extended Info Labels', defval: true, group: INFO,
    tooltip: 'Display strength, session, age, pips, and distance inside the OB zone' },
  { id: 'labelDetail', type: 'string', title: 'Info Label Detail', defval: 'Full Label', options: ['Short Label', 'Full Label'], group: INFO,
    tooltip: 'Short = type, strength, session only. Full = also adds age, pips, and distance.' },
  { id: 'infoTextSize', type: 'string', title: 'Info Text Size', defval: 'Large', options: ['Tiny', 'Small', 'Normal', 'Large', 'Huge'], group: INFO,
    tooltip: 'Size of the info text displayed inside order blocks' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'ProjectSyndicate Gold Order Block Finder',
  shortTitle: 'ProjectSyndicate Gold Order Block Finder',
  overlay: true,
};

/** indicator(max_boxes_count = 50, max_labels_count = 50) */
const MAX_OBJECTS = 50;
const GREEN = '#4CAF50';
const RED = '#F23645';

interface OB {
  b: Box;
  l: Label | null;
  infoLabel: Label | null;
  top: number;
  bot: number;
  bullish: boolean;
  session: string;
  creationTime: number;
  strength: number;
}

/** get_session(): GMT session of a bar time */
function sessionOf(t: number): string {
  const minutes = ptime.hour(t, 'GMT') * 60 + ptime.minute(t, 'GMT');
  if (minutes >= 480 && minutes < 1020) return 'London';
  if (minutes >= 780 && minutes < 1320) return 'NY';
  if (minutes >= 0 && minutes < 540) return 'Asian';
  return 'Other';
}

export function calculate(
  bars: Bar[],
  inputs: Partial<OrderBlockFinderGoldProjectsyndicateInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { gt, lt, ge, le } = compare;
  const unit = n > 0 && bars[0].time < 1e12 ? 1000 : 1;
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const atrValue = taCore.atr(14, high, low, close);
  const swingHigh = taCore.pivothigh(high, cfg.swingLength, cfg.swingLength);
  const swingLow = taCore.pivotlow(low, cfg.swingLength, cfg.swingLength);
  const lastConfirmed = lastBarConfirmedOf(chart);
  const ticker = tickerOf(chart);
  const mintick = mintickOf(chart);
  const textSize = ({ Tiny: 'tiny', Small: 'small', Normal: 'normal', Large: 'large', Huge: 'huge' } as const)[cfg.infoTextSize] ?? 'large';

  // calc_pips(): math.round(price_diff / pip_value)
  const isGold = ticker.includes('XAU') || ticker.includes('GOLD');
  const pipValue = isGold ? 0.01 : mintick * 10;
  const calcPips = (diff: number) => math.round(diff / pipValue);

  const infoText = (isBull: boolean, strength: number, session: string, age: number, gapPips: number, distPips: number) => {
    const zoneType = isBull ? 'Bullish OB' : 'Bearish OB';
    const base = `${zoneType} ||| Strength: ${str.tostring(math.round(strength * 10) / 10)}/10 ||| ${session}`;
    return cfg.labelDetail === 'Short Label' ? base
      : `${base} ||| Age: ${str.tostring(age)} bars ||| ${str.tostring(gapPips)} pips ||| ${str.tostring(distPips)} pips away`;
  };

  const strengthOf = (displacement: number, zoneHeight: number, session: string, age: number, atr: number) => {
    if (!cfg.enableStrengthRating) return 5.0;
    let disp = 1.0;
    if (gt(atr, 0)) {
      const r = displacement / atr;
      disp = ge(r, 3.0) ? 3.0 : ge(r, 2.0) ? 2.5 : ge(r, 1.5) ? 2.0 : ge(r, 1.0) ? 1.5 : 1.0;
    }
    const sess = session === 'London' || session === 'NY' ? 2.0 : session === 'Asian' ? 1.0 : 0.5;
    const ageScore = age < 50 ? 2.0 : age < 100 ? 1.5 : age < 200 ? 1.0 : 0.5;
    let zone = 1.5;
    if (gt(atr, 0)) {
      const zr = zoneHeight / atr;
      zone = ge(zr, 0.5) && le(zr, 2.0) ? 3.0 : ge(zr, 0.3) && le(zr, 3.0) ? 2.0 : 1.0;
    }
    return Math.min(Math.max(disp + sess + ageScore + zone, 0.0), 10.0);
  };

  // normalize_zone(): a zone of the target height around the middle of the candle
  const normalize = (top: number, bot: number, atr: number, c: number): [number, number] => {
    if (!cfg.useNormalizedZones) return [top, bot];
    const target = cfg.zoneHeightMethod === 'ATR Based' ? atr * cfg.zoneHeightAtrMult : c * (cfg.zoneHeightPercent / 100.0);
    const mid = (top + bot) / 2;
    return [mid + target / 2, mid - target / 2];
  };

  const bullObs: OB[] = [];
  const bearObs: OB[] = [];
  const removeOb = (ob: OB) => {
    box.delete(ob.b);
    if (ob.l) label.delete(ob.l);
    if (ob.infoLabel) label.delete(ob.infoLabel);
  };

  resetDrawings({ box: MAX_OBJECTS, label: MAX_OBJECTS });
  for (let bi = 0; bi < n; bi++) {
    setDrawingBar(bi, bi === n - 1);
    const confirmed = bi < n - 1 || lastConfirmed;
    const c = close[bi];
    const atr = atrValue[bi];

    const detect = (bullish: boolean) => {
      const swing = bullish ? swingLow[bi] : swingHigh[bi];
      if (Number.isNaN(swing) || !(bullish ? cfg.showBullish : cfg.showBearish)) return;
      let found = false;
      let obTop = NaN;
      let obBot = NaN;
      let obBar = NaN;
      let offset = NaN;
      for (let i = cfg.swingLength + 1; i <= cfg.swingLength + cfg.lookback; i++) {
        if (found) continue;
        const k = bi - i;
        const hc = k >= 0 ? bars[k].close : NaN;
        const ho = k >= 0 ? bars[k].open : NaN;
        const hh = k >= 0 ? bars[k].high : NaN;
        const hl = k >= 0 ? bars[k].low : NaN;
        if (bullish ? lt(hc, ho) : gt(hc, ho)) {
          const disp = bullish ? swing - hl : hh - swing;
          const rng = hh - hl;
          if (gt(disp, rng * cfg.displacementMult) && gt(rng, 0)) {
            obTop = hh;
            obBot = hl;
            obBar = bi - i;
            offset = i;
            found = true;
          }
        }
      }
      if (!found || Number.isNaN(obTop)) return;
      const session = sessionOf(bars[bi - offset].time * unit);
      const displacement = bullish ? c - obBot : obTop - c;
      const zoneHeight = obTop - obBot;
      const strength = strengthOf(displacement, zoneHeight, session, 0, atr);
      if (!ge(strength, cfg.minStrengthFilter)) return;
      const [normTop, normBot] = normalize(obTop, obBot, atr, c);
      const col = bullish ? GREEN : RED;
      const b = box.new(obBar, normTop, bi + cfg.extendBars, normBot, bullish ? cfg.bullBorder : cfg.bearBorder, 2,
        undefined, undefined, undefined, bullish ? cfg.bullColor : cfg.bearColor, undefined, undefined, '#FFFFFF');
      let l: Label | null = null;
      if (cfg.showLabels) {
        l = label.new(obBar, bullish ? normBot : normTop, bullish ? 'Bull OB' : 'Bear OB', 'bar_index', 'price',
          String(color.new(col, 20)), bullish ? 'label_up' : 'label_down', '#FFFFFF', 'small');
      }
      let infoL: Label | null = null;
      if (cfg.showInfo) {
        const pips = calcPips(zoneHeight);
        const distancePips = calcPips(Math.abs(c - (normTop + normBot) / 2));
        const text = infoText(bullish, strength, session, 0, pips, distancePips);
        infoL = label.new(bi + 25, (normTop + normBot) / 2, text, 'bar_index', 'price', String(color.new(col, 100)),
          'label_left', String(color.new(col, 0)), textSize, 'left');
      }
      (bullish ? bullObs : bearObs).push({
        b, l, infoLabel: infoL, top: normTop, bot: normBot, bullish, session, creationTime: obBar, strength,
      });
    };
    if (confirmed) {
      detect(true);
      detect(false);
    }

    // clean_obs(): a confirmed close through the zone removes it
    const clean = (obs: OB[]) => {
      for (let i = obs.length - 1; i >= 0; i--) {
        if (i >= obs.length) continue;
        const ob = obs[i];
        const mitigated = confirmed && (ob.bullish ? lt(c, ob.bot) : gt(c, ob.top));
        if (mitigated) {
          removeOb(ob);
          obs.splice(i, 1);
        }
      }
    };
    // limit_size(): the oldest blocks above max_obs are removed
    const limit = (obs: OB[]) => {
      while (obs.length > cfg.maxObs) removeOb(obs.shift() as OB);
    };
    // update_boxes(): extend the boxes, move and rewrite the info labels
    const update = (obs: OB[]) => {
      for (const ob of obs) {
        box.set_right(ob.b, bi + cfg.extendBars);
        if (cfg.showInfo && ob.infoLabel) {
          const age = bi - ob.creationTime;
          const pips = calcPips(ob.top - ob.bot);
          const distancePips = calcPips(Math.abs(c - (ob.top + ob.bot) / 2));
          label.set_text(ob.infoLabel, infoText(ob.bullish, ob.strength, ob.session, age, pips, distancePips));
          label.set_xy(ob.infoLabel, bi + 25, (ob.top + ob.bot) / 2);
          label.set_style(ob.infoLabel, 'label_left');
          label.set_textalign(ob.infoLabel, 'left');
        }
      }
    };
    clean(bullObs);
    clean(bearObs);
    limit(bullObs);
    limit(bearObs);
    update(bullObs);
    update(bearObs);
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    ...drawingOutputs(bars),
  };
}

export const OrderBlockFinderGoldProjectsyndicate = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
