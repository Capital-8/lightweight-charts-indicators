/**
 * Supply Demand Profiles
 *
 * A volume profile of the bars between two times ("Start Calculation" and "End Calculation", inputs). On the bar of
 * the end time, the range from the lowest low to the highest high of the profile bars is cut into rows; each bar
 * adds its volume to the rows its range covers (volume * row height / bar range) and, when it is a bullish bar
 * (close above open by default), to the bullish volume of those rows. Drawn once, on that bar:
 * - the volume profile: per row a box for the bullish volume and a box for the bearish volume (darker inside the
 *   value area),
 * - the sentiment profile: per row a box for |2 * bullish - total| (green when the buyers dominate, orange otherwise),
 * - supply (above the point of control) and demand (below) zones: rows whose volume is below a threshold % of the
 *   largest row,
 * - the developing point of control (a line segment per bar), the value area high / low lines with a fill between
 *   them, and labels with the profile high / low, value area high / low and point of control prices.
 *
 * Volume sources: bar polarity, bar buying / selling pressure (close in the upper half of the bar), Heikin-Ashi bar
 * polarity. The four "Intrabar (LTF)" sources split the volume of each bar into up and down volume from the bars of
 * a lower timeframe (request.security_lower_tf). LIMIT: the chart bars do not have these bars, so the port uses an
 * ESTIMATE where the chart bar is the only intrabar: "Intrabar Polarity" takes the up / down volume of the chart bars
 * of src/lower-tf-volume.ts (all the volume of a bar is up or down); "Intrabar Buying/Selling Pressure" applies the
 * per-intrabar formula of the original to the chart bar itself (up when close - low > high - close, down when it is
 * smaller, else by the close against the previous close, else as the previous bar). "Volume" sources then use the
 * whole bar volume and "Volume Delta" sources |up + down| (also the whole volume with one intrabar), and a bar is
 * bullish when its up volume is larger. The profiles of these sources are therefore NOT the values of the original
 * (which spreads each bar between up and down volume, and has no value where the lower timeframe has no data).
 * "Lower Timeframe Precision" is kept as an input; the estimate does not use it.
 * The label colours use the chart foreground colour (chart context, fallback #DBDBDB); prices are formatted with the
 * symbol tick.
 *
 * Reference: "Supply Demand Profiles [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, str, color, array, Series, line, box, label, linefill, heikinAshi, resetDrawings, setDrawingBar, varDrawing,
  drawingOutputs, type Label, type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { foregroundColorOf, mintickOf, type ChartContext } from '../chart-context';
import { upDownVolumeOfChartBars } from '../lower-tf-volume';

const VD_T1 = 'Volume - Bar Polarity';
const VD_T2 = 'Volume - Bar Buying/Selling Pressure';
const VD_T7 = 'Volume - Heikin Ashi Bar Polarity';
const VD_T3 = 'Volume - Intrabar Polarity (LTF)';
const VD_T4 = 'Volume - Intrabar Buying/Selling Pressure (LTF)';
const VD_T5 = 'Volume Delta - Intrabar Polarity (LTF)';
const VD_T6 = 'Volume Delta - Intrabar Buying/Selling Pressure (LTF)';

export type SupplyDemandVolumeSource =
  | typeof VD_T1 | typeof VD_T2 | typeof VD_T7 | typeof VD_T3 | typeof VD_T4 | typeof VD_T5 | typeof VD_T6;

export interface SupplyDemandProfilesInputs {
  volumeSource: SupplyDemandVolumeSource;
  /** Lower timeframe of the "Intrabar (LTF)" sources (not used by the estimate of the port) */
  lowerTimeframe: string;
  /** Value area volume % */
  valueAreaPercent: number;
  showSupplyDemand: boolean;
  showVolumeProfile: boolean;
  showSentimentProfile: boolean;
  showVah: boolean;
  vahColor: string;
  showPoc: boolean;
  pocColor: string;
  showVal: boolean;
  valColor: string;
  /** Supply & demand threshold % */
  sdThreshold: number;
  supplyColor: string;
  demandColor: string;
  profileUpColor: string;
  profileDownColor: string;
  valueAreaUpColor: string;
  valueAreaDownColor: string;
  sentimentBullColor: string;
  sentimentBearColor: string;
  valueAreaBullColor: string;
  valueAreaBearColor: string;
  rows: number;
  placement: 'Right' | 'Left';
  /** Profile width % */
  profileWidth: number;
  showPriceLevels: boolean;
  showProfileBackground: boolean;
  profileBackgroundColor: string;
  showValueAreaBackground: boolean;
  valueAreaBackgroundColor: string;
  /** Start time (UNIX ms) */
  startTime: number;
  /** End time (UNIX ms) */
  endTime: number;
}

/** timestamp("23 Jul 2023") and timestamp("21 Aug 2023") (UTC) */
const DEFAULT_START = Date.UTC(2023, 6, 23);
const DEFAULT_END = Date.UTC(2023, 7, 21);

export const defaultInputs: SupplyDemandProfilesInputs = {
  volumeSource: VD_T1,
  lowerTimeframe: 'Auto',
  valueAreaPercent: 68,
  showSupplyDemand: true,
  showVolumeProfile: true,
  showSentimentProfile: true,
  showVah: true,
  vahColor: '#2962FF',
  showPoc: true,
  pocColor: '#FF0000',
  showVal: true,
  valColor: '#2962FF',
  sdThreshold: 15,
  supplyColor: '#2157F380',
  demandColor: '#FF5D0080',
  profileUpColor: '#2962FF40',
  profileDownColor: '#FBC02D40',
  valueAreaUpColor: '#2962FFBF',
  valueAreaDownColor: '#FBC02DBF',
  sentimentBullColor: '#08998140',
  sentimentBearColor: '#FF5D0040',
  valueAreaBullColor: '#089981BF',
  valueAreaBearColor: '#FF5D00BF',
  rows: 100,
  placement: 'Left',
  profileWidth: 30,
  showPriceLevels: true,
  showProfileBackground: false,
  profileBackgroundColor: '#37A6EF0D',
  showValueAreaBackground: true,
  valueAreaBackgroundColor: '#37A6EF0D',
  startTime: DEFAULT_START,
  endTime: DEFAULT_END,
};

const CALC = 'Calculation Settings';
const PRES = 'Presentation Settings';
const OTHERS = 'Presentation, Others';
const SD = 'Supply & Demand, Others';
const VP = 'Volume Profile, Others';
const SP = 'Sentiment Profile, Others';
const OTH = 'Others';
const LTF_TOOLTIP = 'This option is applicable when any of the \'Intrabar (LTF)\' option is selected and if so then this opton sets the indicator Precision. ' +
  'If the Lower Timeframe Precision is set to AUTO, then the Lower Timeframe is determined by the following algorithm:\n\n' +
  ' - Chart Timeframe,  Lower Timeframe\n' +
  '       <= 1 min                1 Sec\n' +
  '       <= 2 min                5 Sec\n' +
  '       <= 3 min                10 Sec\n' +
  '       <= 5 min                15 Sec\n' +
  '       <= 15 min              30 Sec\n' +
  '       <= 1 hour               1 min\n' +
  '       <= 2 hour               3 min\n' +
  '       <= 4 hour               5 min\n' +
  '       <= 1 day                15 min\n' +
  '       <= 1 week              1 hour\n' +
  '       >   1 week              1 day';
const SP_TOOLTIP = 'Sentiment profile displays the dominat party at the specific price levels\n' +
  ' - orange rows : selling pressure is higher\n' +
  ' - green rows : buying pressure is higher\n\n' +
  'narrow rows does not mean no interest at that price levels but equlibrium between selling and buying trading activity';

export const inputConfig: InputConfig[] = [
  { id: 'volumeSource', type: 'string', title: 'Volume Data Source', defval: VD_T1, group: CALC,
    options: [VD_T1, VD_T2, VD_T7, VD_T3, VD_T4, VD_T5, VD_T6],
    tooltip: 'This charting tool allows usage of different volume data sources and different polarity options' },
  { id: 'lowerTimeframe', type: 'string', title: 'Lower Timeframe Precision', defval: 'Auto', group: CALC,
    options: ['Auto', '1 Sec', '5 Sec', '10 Sec', '15 Sec', '30 Sec', '1 Min', '3 Min', '5 Min', '15 Min', '30 Min', '1 Hour', '4 Hour', '1 Day'],
    tooltip: LTF_TOOLTIP },
  { id: 'valueAreaPercent', type: 'float', title: 'Value Area Volume %', defval: 68, min: 0, max: 100, group: CALC },
  { id: 'showSupplyDemand', type: 'bool', title: 'Supply & Demand Zones', defval: true, group: PRES,
    tooltip: 'Defines the relationship between the price of a given asset and the willingness of traders to either buy or sell it' },
  { id: 'showVolumeProfile', type: 'bool', title: 'Volume Profile', defval: true, group: PRES,
    tooltip: 'Volume profile displays total trading activity (both buying and selling activity) over a specified time period at specific price levels' },
  { id: 'showSentimentProfile', type: 'bool', title: 'Sentiment Profile', defval: true, group: PRES, tooltip: SP_TOOLTIP },
  { id: 'showVah', type: 'bool', title: 'Value Area High (VAH)', defval: true, inline: 'VAH', group: OTHERS,
    tooltip: 'Value Area High (VAH)\n the highest price level within the value area' },
  { id: 'vahColor', type: 'color', title: '', defval: '#2962FF', inline: 'VAH', group: OTHERS },
  { id: 'showPoc', type: 'bool', title: 'Point of Control (POC)', defval: true, inline: 'PoC', group: OTHERS,
    tooltip: 'Point of Control (POC)\n  displays developing POC, the changes of the price levels with the highest traded activity' },
  { id: 'pocColor', type: 'color', title: '', defval: '#FF0000', inline: 'PoC', group: OTHERS },
  { id: 'showVal', type: 'bool', title: 'Value Area Low (VAL) ', defval: true, inline: 'VAL', group: OTHERS,
    tooltip: 'Value Area Low (VAL)\n  the lowest price level within the value area' },
  { id: 'valColor', type: 'color', title: '', defval: '#2962FF', inline: 'VAL', group: OTHERS },
  { id: 'sdThreshold', type: 'int', title: 'Supply & Demand Threshold %', defval: 15, min: 0, max: 41, group: SD },
  { id: 'supplyColor', type: 'color', title: 'Supply Zones', defval: '#2157F380', inline: 'SD', group: SD },
  { id: 'demandColor', type: 'color', title: 'Demand Zones', defval: '#FF5D0080', inline: 'SD', group: SD },
  { id: 'profileUpColor', type: 'color', title: 'Profile,    Up Volume', defval: '#2962FF40', inline: 'ZZ2', group: VP },
  { id: 'profileDownColor', type: 'color', title: 'Down Volume', defval: '#FBC02D40', inline: 'ZZ2', group: VP },
  { id: 'valueAreaUpColor', type: 'color', title: 'Value Area, Up Volume', defval: '#2962FFBF', inline: 'ZZ1', group: VP },
  { id: 'valueAreaDownColor', type: 'color', title: 'Down Volume', defval: '#FBC02DBF', inline: 'ZZ1', group: VP },
  { id: 'sentimentBullColor', type: 'color', title: 'Sentiment,  Bullish', defval: '#08998140', inline: 'BB', group: SP },
  { id: 'sentimentBearColor', type: 'color', title: 'Bearish', defval: '#FF5D0040', inline: 'BB', group: SP },
  { id: 'valueAreaBullColor', type: 'color', title: 'Value Area, Bullish', defval: '#089981BF', inline: 'BB1', group: SP },
  { id: 'valueAreaBearColor', type: 'color', title: 'Bearish', defval: '#FF5D00BF', inline: 'BB1', group: SP },
  { id: 'rows', type: 'int', title: 'Number of Rows', defval: 100, min: 10, max: 150, step: 5, group: OTH },
  { id: 'placement', type: 'string', title: 'Placment', defval: 'Left', options: ['Right', 'Left'], group: OTH },
  { id: 'profileWidth', type: 'int', title: 'Profile Width %', defval: 30, min: 0, max: 100, group: OTH },
  { id: 'showPriceLevels', type: 'bool', title: 'Profile Price Levels', defval: true, group: OTH },
  { id: 'showProfileBackground', type: 'bool', title: 'Profile Background   ', defval: false, inline: 'BG', group: OTH },
  { id: 'profileBackgroundColor', type: 'color', title: '', defval: '#37A6EF0D', inline: 'BG', group: OTH },
  { id: 'showValueAreaBackground', type: 'bool', title: 'Value Area Background', defval: true, inline: 'vBG', group: OTH },
  { id: 'valueAreaBackgroundColor', type: 'color', title: '', defval: '#37A6EF0D', inline: 'vBG', group: OTH },
  { id: 'startTime', type: 'time', title: 'Start Calculation', defval: DEFAULT_START, inline: 'wa1', group: OTH, confirm: true },
  { id: 'endTime', type: 'time', title: 'End Calculation ', defval: DEFAULT_END, inline: 'wa2', group: OTH, confirm: true },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Supply Demand Profiles [LuxAlgo]',
  shortTitle: 'LuxAlgo - Supply Demand Profiles',
  overlay: true,
};

/** indicator(max_boxes_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;
/** Pine int(): truncation, na stays na */
const int = (x: number) => (Number.isFinite(x) ? Math.trunc(x) : NaN);

export function calculate(
  bars: Bar[],
  inputs: Partial<SupplyDemandProfilesInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const src = cfg.volumeSource;
  const n = bars.length;
  const isVA = cfg.valueAreaPercent / 100;
  const sdTH = cfg.sdThreshold / 100;
  const pWDH = cfg.profileWidth / 100;
  const pLVL = cfg.rows;
  const right = cfg.placement === 'Right';
  const mintick = mintickOf(chart);
  const fg = foregroundColorOf(chart);

  // nzV = nz(volume); bCON = bar polarity / buying pressure / Heikin-Ashi polarity
  const volume = bars.map((b) => (b.volume === undefined || isNaN(b.volume) ? 0 : b.volume));
  let nzV = volume;
  const ha = src === VD_T7 ? heikinAshi(bars) : [];
  let bCON = bars.map((b, i) => {
    if (src === VD_T2) return gt(b.close - b.low, b.high - b.close);
    if (src === VD_T7) return gt(ha[i].close, ha[i].open);
    return gt(b.close, b.open);
  });
  const polarityLtf = src === VD_T3 || src === VD_T5;
  const pressureLtf = src === VD_T4 || src === VD_T6;
  if (polarityLtf || pressureLtf) {
    // [uV, dV] = request.security_lower_tf(..., f_calcV()); tuV = uV.sum(), tdV = dV.sum(). ESTIMATE: the chart bar
    // is the only intrabar (see the header).
    let up: number[];
    let down: number[];
    if (polarityLtf) {
      ({ up, down } = upDownVolumeOfChartBars(bars));
    } else {
      // f_calcV() of the pressure sources on one intrabar
      up = [];
      down = [];
      for (let i = 0; i < n; i++) {
        const b = bars[i];
        const v = volume[i];
        const prevClose = i > 0 ? bars[i - 1].close : 0; // nz(b.c[1])
        const prevUp = i > 0 ? up[i - 1] : 0; // nz(uV[1])
        const prevDown = i > 0 ? down[i - 1] : 0; // nz(dV[1])
        let u = 0;
        let d = 0;
        if (gt(b.close - b.low, b.high - b.close)) u += v;
        else if (lt(b.close - b.low, b.high - b.close)) d -= v;
        else if (gt(b.close, prevClose)) u += v;
        else if (lt(b.close, prevClose)) d -= v;
        else if (gt(prevUp, 0)) u += v;
        else if (lt(prevDown, 0)) d -= v;
        up.push(u);
        down.push(d);
      }
    }
    // nzV := (vdT3 or vdT4) ? tuV - tdV : math.abs(tuV + tdV); bCON = tuV > math.abs(tdV)
    nzV = up.map((u, i) => (src === VD_T3 || src === VD_T4 ? u - down[i] : Math.abs(u + down[i])));
    bCON = up.map((u, i) => gt(u, Math.abs(down[i])));
  }

  // sBX / eBX = ta.valuewhen(time == pSCT / pECT, bar_index, 0)
  const sBXs = new Array<number>(n);
  const eBXs = new Array<number>(n);
  let sBX = NaN;
  let eBX = NaN;
  for (let i = 0; i < n; i++) {
    const tMs = bars[i].time * 1000;
    if (tMs === cfg.startTime) sBX = i;
    if (tMs === cfg.endTime) eBX = i;
    sBXs[i] = sBX;
    eBXs[i] = eBX;
  }
  // [sB, eB] = sBX < eBX ? [sBX, eBX] : [eBX, sBX]; pLN = eB - sB
  const sBArr = sBXs.map((s, i) => (lt(s, eBXs[i]) ? s : eBXs[i]));
  const eBArr = sBXs.map((s, i) => (lt(s, eBXs[i]) ? eBXs[i] : s));
  const pLNArr = sBArr.map((s, i) => eBArr[i] - s);
  const lenArr = pLNArr.map((p) => (gt(p, 0) ? p + 1 : 200));
  const pHSTArr = ta.highest(new Series(bars, (b) => b.high), Series.fromArray(bars, lenArr)).toArray();
  const pLSTArr = ta.lowest(new Series(bars, (b) => b.low), Series.fromArray(bars, lenArr)).toArray();

  resetDrawings({ line: MAX_OBJECTS, box: MAX_OBJECTS });
  // var line / var label of f_drawLineX / f_drawLabelX (one per call site)
  const vahLine = varDrawing<Line>();
  const valLine = varDrawing<Line>();
  const labels = [varDrawing<Label>(), varDrawing<Label>(), varDrawing<Label>(), varDrawing<Label>(), varDrawing<Label>()];

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const eB = eBArr[i];
    const pLN = pLNArr[i];
    // if (b.i == eB) and nzV and (pLN > 0)
    if (!(i === eB && nzV[i] !== 0 && gt(pLN, 0))) continue;
    const pHST = pHSTArr[i] ?? NaN;
    const pLST = pLSTArr[i] ?? NaN;
    const pSTP = (pHST - pLST) / pLVL;
    const vsT = array.new_float(pLVL + 1, 0);
    const vsB = array.new_float(pLVL + 1, 0);
    const vsD = array.new_float(pLVL + 1, 0);
    const pocIndex = () => array.indexof(vsT, array.max(vsT));

    let pir = 0;
    for (let bI = pLN; bI >= 0; bI--) {
      const b = bars[i - bI];
      let l = 0;
      // for pL = pLST to pHST by pSTP
      for (let pL = pLST; ge(pHST, pL); pL += pSTP) {
        if (ge(b.high, pL) && lt(b.low, pL + pSTP)) {
          const range = b.high - b.low;
          const add = nzV[i - bI] * (eq(range, 0) ? 1 : pSTP / range);
          array.set(vsT, l, array.get(vsT, l) + add);
          if (bCON[i - bI]) array.set(vsB, l, array.get(vsB, l) + add);
        }
        l += 1;
      }
      if (cfg.showPoc) {
        const poc = pLST + (pocIndex() + 0.5) * pSTP;
        if (bI !== pLN) {
          line.new(i - bI - 1, pir, i - bI, poc, 'bar_index', 'none', cfg.pocColor, 'solid', 2);
        }
        pir = poc;
      }
    }

    for (let l = 0; l < pLVL; l++) {
      const bbp = 2 * array.get(vsB, l) - array.get(vsT, l);
      array.set(vsD, l, array.get(vsD, l) + bbp * (gt(bbp, 0) ? 1 : -1));
    }

    const pcL = pocIndex();
    const ttV = array.sum(vsT) * isVA;
    let va = array.get(vsT, pcL);
    let laP = pcL;
    let lbP = pcL;
    while (lt(va, ttV)) {
      if (lbP === 0 && laP === pLVL - 1) break;
      const vaP = laP < pLVL - 1 ? array.get(vsT, laP + 1) : 0;
      const vbP = lbP > 0 ? array.get(vsT, lbP - 1) : 0;
      if (ge(vaP, vbP)) {
        va += vaP;
        laP += 1;
      } else {
        va += vbP;
        lbP -= 1;
      }
    }

    const vahY = pLST + (laP + 1.0) * pSTP;
    const valY = pLST + (lbP + 0.0) * pSTP;
    const pocY = pLST + (pcL + 0.5) * pSTP;
    vahLine.value = line.new(i - pLN, vahY, i, vahY, 'bar_index', 'none', cfg.showVah ? cfg.vahColor : 'transparent', 'solid', 2);
    valLine.value = line.new(i - pLN, valY, i, valY, 'bar_index', 'none', cfg.showVal ? cfg.valColor : 'transparent', 'solid', 2);

    if (cfg.showPriceLevels) {
      const x = right ? Math.min(sBXs[i], eBXs[i]) : Math.max(sBXs[i], eBXs[i]);
      const bg = String(color.new(fg, 89));
      const side = right ? 'label_right' : 'label_left';
      const mk = (k: number, y: number, style: string, tooltip: string) => {
        labels[k].value = label.new(x, y, str.tostring(y, 'mintick', mintick), 'bar_index', 'price', bg, style as 'label_left',
          fg, 'normal', 'left', tooltip);
      };
      mk(0, pHST, 'label_down', `Profile High\n %${str.tostring(((pHST - pLST) / pLST) * 100, '#.##')} higher than the Profile Low\n number of bars ${str.tostring(pLN)}`);
      mk(1, pLST, 'label_up', `Profile Low\n %${str.tostring(((pHST - pLST) / pHST) * 100, '#.##')} lower than the Profile High\n number of bars ${str.tostring(pLN)}`);
      mk(2, vahY, side, 'Value Area High Price');
      mk(3, pocY, side, 'Point Of Control Price');
      mk(4, valY, side, 'Value Area Low Price');
    }

    if (cfg.showValueAreaBackground) linefill.new(vahLine.value, valLine.value, cfg.valueAreaBackgroundColor);

    if (cfg.showProfileBackground) {
      box.new(i - pLN, pLST, i, pHST, cfg.profileBackgroundColor, 1, 'dotted', undefined, undefined, cfg.profileBackgroundColor);
    }

    const tMax = array.max(vsT);
    const dMax = array.max(vsD);
    for (let l = 0; l < pLVL; l++) {
      const top = pLST + (l + 0.9) * pSTP;
      const bottom = pLST + (l + 0.1) * pSTP;
      const inVA = l >= lbP && l <= laP;
      const vT = array.get(vsT, l);
      const vB = array.get(vsB, l);
      if (cfg.showVolumeProfile) {
        let sBI = right ? i - int((vB / tMax) * pLN * pWDH) : i - pLN;
        let eBI = right ? i : sBI + int((vB / tMax) * pLN * pWDH);
        const up = inVA ? cfg.valueAreaUpColor : cfg.profileUpColor;
        box.new(sBI, top, eBI, bottom, up, undefined, undefined, undefined, undefined, up);
        sBI = right ? sBI : eBI;
        eBI = sBI + (right ? -1 : 1) * int(((vT - vB) / tMax) * pLN * pWDH);
        const down = inVA ? cfg.valueAreaDownColor : cfg.profileDownColor;
        box.new(sBI, top, eBI, bottom, down, undefined, undefined, undefined, undefined, down);
      }
      if (cfg.showSentimentProfile) {
        const bbp = 2 * vB - vT;
        const vD = array.get(vsD, l);
        const sBI = right ? i + int(((vD / dMax) * pLN * pWDH) / 2) : i - pLN;
        const eBI = right ? i : sBI - int(((vD / dMax) * pLN * pWDH) / 2);
        const spC = gt(bbp, 0)
          ? (inVA ? cfg.valueAreaBullColor : cfg.sentimentBullColor)
          : (inVA ? cfg.valueAreaBearColor : cfg.sentimentBearColor);
        box.new(sBI, top, eBI, bottom, spC, undefined, undefined, undefined, undefined, spC);
      }
      if (cfg.showSupplyDemand && lt(vT / tMax, sdTH)) {
        const sdC = gt(pLST + (l + 0.5) * pSTP, pocY) ? cfg.supplyColor : cfg.demandColor;
        box.new(eB - pLN, pLST + (l + 1.0) * pSTP, eB, pLST + (l + 0.0) * pSTP, 'transparent', undefined, undefined,
          undefined, undefined, sdC);
      }
    }
  }
  setDrawingBar(null);

  const drawn = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: drawn.lines ?? [],
    boxes: drawn.boxes ?? [],
    labels: drawn.labels ?? [],
    linefills: drawn.linefills ?? [],
  };
}

export const SupplyDemandProfiles = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
