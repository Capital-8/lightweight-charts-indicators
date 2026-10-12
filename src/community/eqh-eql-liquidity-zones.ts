/**
 * EQH/EQL Liquidity Zones [LuxAlgo]
 *
 * Equal highs and equal lows. Each pivot high (10 bars left, 2 bars right) is compared with the last 50 pivot
 * highs, newest first: the first one within the equality threshold (percent of the older price) makes an EQH zone,
 * a box from the older pivot to the current bar between the two prices, with a circle on each pivot, the volume of
 * each pivot bar and a label at the right end. Pivot lows make EQL zones the same way.
 *
 * Active zones extend to the current bar. A zone is swept when a later high goes above its top (EQH) or a low below
 * its bottom (EQL): it stops, turns to the chart foreground colour and its label says "Swept EQH (volume)"; with
 * "Delete on Sweep" it is deleted. At most "Max Active Zones" are tracked (the oldest stop being updated). The labels
 * of active zones of the same kind within three times the threshold are merged: "2x EQH (total volume)" on the
 * oldest one. At most 500 boxes, 500 lines and 500 labels are kept.
 *
 * Chart context: `chart.fg_color` (colours of the swept zones).
 *
 * Reference: "EQH/EQL Liquidity Zones [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, str, color, Series, line, box, label, resetDrawings, setDrawingBar, drawingOutputs,
  type Box, type Line, type Label, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface EqhEqlLiquidityZonesInputs {
  /** Pivot Left Length */
  leftLenInput: number;
  /** Pivot Right Length */
  rightLenInput: number;
  /** Equality Threshold (%) */
  thresholdPct: number;
  /** Max Active Zones */
  maxZones: number;
  bullColor: string;
  bearColor: string;
  zoneTransp: number;
  showMidline: boolean;
  midlineColor: string;
  showVolume: boolean;
  deleteOnSweep: boolean;
}

export const defaultInputs: EqhEqlLiquidityZonesInputs = {
  leftLenInput: 10,
  rightLenInput: 2,
  thresholdPct: 0.03,
  maxZones: 60,
  bullColor: '#089981',
  bearColor: '#F23645',
  zoneTransp: 85,
  showMidline: false,
  midlineColor: '#787B86',
  showVolume: true,
  deleteOnSweep: false,
};

const G1 = 'Liquidity Detection';
const G2 = 'Visuals';

export const inputConfig: InputConfig[] = [
  { id: 'leftLenInput', type: 'int', title: 'Pivot Left Length', defval: 10, min: 1, group: G1, tooltip: 'Number of bars to the left required for a pivot.' },
  { id: 'rightLenInput', type: 'int', title: 'Pivot Right Length', defval: 2, min: 1, group: G1, tooltip: 'Number of bars to the right required for a pivot.' },
  { id: 'thresholdPct', type: 'float', title: 'Equality Threshold (%)', defval: 0.03, min: 0, step: 0.01, group: G1, tooltip: "Maximum percentage difference to consider two highs/lows 'equal'." },
  { id: 'maxZones', type: 'int', title: 'Max Active Zones', defval: 60, min: 1, max: 100, group: G1, tooltip: 'Maximum number of active (unswept) liquidity lines to track. Increase for 1m charts.' },
  { id: 'bullColor', type: 'color', title: 'Bullish Zone Color', defval: '#089981', group: G2 },
  { id: 'bearColor', type: 'color', title: 'Bearish Zone Color', defval: '#F23645', group: G2 },
  { id: 'zoneTransp', type: 'int', title: 'Zone Transparency', defval: 85, min: 0, max: 100, group: G2 },
  { id: 'showMidline', type: 'bool', title: 'Show Midline', defval: false, group: G2 },
  { id: 'midlineColor', type: 'color', title: 'Midline Color', defval: '#787B86', group: G2 },
  { id: 'showVolume', type: 'bool', title: 'Show Volume', defval: true, group: G2 },
  { id: 'deleteOnSweep', type: 'bool', title: 'Delete on Sweep', defval: false, group: G2 },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'EQH/EQL Liquidity Zones [LuxAlgo]',
  shortTitle: 'EQH/EQL Liquidity Zones [LuxAlgo]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a <= b otherwise (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => a - b <= EPS;

interface LiquidityZone {
  id: Box;
  midline: Line | null;
  lbl: Label;
  b1: Label;
  b2: Label;
  v1: Label | null;
  v2: Label | null;
  sweepLevel: number;
  totalVol: number;
  createdIdx: number;
  isHigh: boolean;
  isSwept: boolean;
}

interface PivotPoint {
  price: number;
  idx: number;
  vol: number;
}

/** f_formatVol() */
const formatVol = (v: number): string => {
  if (v >= 1000000) return str.format('{0,number,#.#}M', v / 1000000);
  if (v >= 1000) return str.format('{0,number,#.#}K', v / 1000);
  return str.tostring(v, '#');
};

export function calculate(bars: Bar[], inputs: Partial<EqhEqlLiquidityZonesInputs> = {}, chart?: ChartContext): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const fg = foregroundColorOf(chart);
  const right = cfg.rightLenInput;

  const pHArr = ta.pivothigh(new Series(bars, (b) => b.high), cfg.leftLenInput, right).toArray();
  const pLArr = ta.pivotlow(new Series(bars, (b) => b.low), cfg.leftLenInput, right).toArray();

  resetDrawings({ line: 500, label: 500, box: 500 });

  const activeZones: LiquidityZone[] = [];
  const historicalHighs: PivotPoint[] = [];
  const historicalLows: PivotPoint[] = [];

  // Handle Highs (EQH) / Handle Lows (EQL)
  const handlePivot = (i: number, p: number, isHigh: boolean) => {
    const history = isHigh ? historicalHighs : historicalLows;
    const css = isHigh ? cfg.bearColor : cfg.bullColor;
    const currentPivotIdx = i - right;
    const currentVol = bars[i - right].volume ?? NaN;
    for (const prev of history) {
      const diff = Math.abs(p - prev.price) / prev.price * 100;
      if (le(diff, cfg.thresholdPct)) {
        const top = Math.max(p, prev.price);
        const bottom = Math.min(p, prev.price);
        const mid = (top + bottom) / 2;
        const totalVol = prev.vol + currentVol;
        const b = box.new(prev.idx, top, i, bottom, css, undefined, undefined, undefined, undefined,
          String(color.new(css, cfg.zoneTransp)));
        const ml = cfg.showMidline
          ? line.new(prev.idx, mid, i, mid, 'bar_index', undefined, cfg.midlineColor, 'dashed')
          : null;
        const lb = label.new(i, mid, '', 'bar_index', 'price', '#00000000', 'label_left', css, 'small');
        const b1 = label.new(prev.idx, prev.price, '', 'bar_index', 'price', css, 'circle', undefined, 'small');
        const b2 = label.new(currentPivotIdx, p, '', 'bar_index', 'price', css, 'circle', undefined, 'small');
        const volStyle = isHigh ? 'label_down' : 'label_up';
        const v1 = cfg.showVolume
          ? label.new(prev.idx, prev.price, formatVol(prev.vol), 'bar_index', 'price', '#00000000', volStyle, css, 'small')
          : null;
        const v2 = cfg.showVolume
          ? label.new(currentPivotIdx, p, formatVol(currentVol), 'bar_index', 'price', '#00000000', volStyle, css, 'small')
          : null;
        activeZones.push({
          id: b, midline: ml, lbl: lb, b1, b2, v1, v2, sweepLevel: isHigh ? top : bottom, totalVol,
          createdIdx: i, isHigh, isSwept: false,
        });
        break;
      }
    }
    history.unshift({ price: p, idx: currentPivotIdx, vol: currentVol });
    if (history.length > 50) history.pop();
  };

  // method update(LiquidityZone zone, bool deleteOnSweep)
  const update = (zone: LiquidityZone, i: number): boolean => {
    let shouldRemove = false;
    if (!zone.isSwept) {
      box.set_right(zone.id, i);
      if (zone.midline) line.set_x2(zone.midline, i);
      label.set_x(zone.lbl, i);
      if (i > zone.createdIdx) {
        const sweepOccurred = zone.isHigh ? gt(bars[i].high, zone.sweepLevel) : lt(bars[i].low, zone.sweepLevel);
        if (sweepOccurred) {
          zone.isSwept = true;
          shouldRemove = true;
          if (cfg.deleteOnSweep) {
            box.delete(zone.id);
            if (zone.midline) line.delete(zone.midline);
            label.delete(zone.lbl);
            label.delete(zone.b1);
            label.delete(zone.b2);
            if (zone.v1) label.delete(zone.v1);
            if (zone.v2) label.delete(zone.v2);
          } else {
            box.set_bgcolor(zone.id, String(color.new(fg, 95)));
            box.set_border_color(zone.id, String(color.new(fg, 80)));
            if (zone.midline) line.set_color(zone.midline, String(color.new(fg, 80)));
            label.set_textcolor(zone.lbl, String(color.new(fg, 75)));
            const volStr = cfg.showVolume ? str.format(' ({0})', formatVol(zone.totalVol)) : '';
            label.set_text(zone.lbl, 'Swept ' + (zone.isHigh ? 'EQH' : 'EQL') + volStr);
            label.set_color(zone.b1, String(color.new(fg, 85)));
            label.set_color(zone.b2, String(color.new(fg, 85)));
            if (zone.v1) label.set_text(zone.v1, '');
            if (zone.v2) label.set_text(zone.v2, '');
          }
        }
      }
    }
    return shouldRemove;
  };

  // f_consolidateLabels(array<LiquidityZone> zones)
  const consolidateLabels = (zones: LiquidityZone[]) => {
    const sz = zones.length;
    for (const z of zones) if (!z.isSwept) label.set_text(z.lbl, '');
    const processed: number[] = [];
    for (let k = 0; k < sz; k++) {
      if (processed.includes(k) || zones[k].isSwept) continue;
      const base = zones[k];
      processed.push(k);
      let clusterVol = base.totalVol;
      let clusterCount = 1;
      for (let j = k + 1; j < sz; j++) {
        if (processed.includes(j)) continue;
        const comp = zones[j];
        if (comp.isSwept) continue;
        if (base.isHigh === comp.isHigh
          && le(Math.abs(base.sweepLevel - comp.sweepLevel) / base.sweepLevel * 100, cfg.thresholdPct * 3)) {
          clusterVol += comp.totalVol;
          clusterCount += 1;
          processed.push(j);
        }
      }
      const typeStr = base.isHigh ? 'EQH' : 'EQL';
      const countStr = clusterCount > 1 ? str.format('{0}x ', clusterCount) : '';
      const volStr = cfg.showVolume ? str.format(' ({0})', formatVol(clusterVol)) : '';
      label.set_text(base.lbl, countStr + typeStr + volStr);
    }
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const pH = pHArr[i];
    const pL = pLArr[i];
    if (pH != null && !Number.isNaN(pH)) handlePivot(i, pH, true);
    if (pL != null && !Number.isNaN(pL)) handlePivot(i, pL, false);

    if (activeZones.length > 0) {
      for (let k = activeZones.length - 1; k >= 0; k--) {
        if (update(activeZones[k], i)) activeZones.splice(k, 1);
      }
      while (activeZones.length > cfg.maxZones) activeZones.shift();
      if (activeZones.length > 0) consolidateLabels(activeZones);
    }
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    ...drawingOutputs(bars),
  };
}

export const EqhEqlLiquidityZones = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
