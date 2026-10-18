/**
 * RedK Magic Ribbon
 *
 * Fast line: CoRa Wave (compound ratio weighted average of the source, weights growing from 0.01 to the length,
 * smoothed by a WMA). Slow (proxy) line: RSS_WMA (LazyLine: three chained WMAs of lengths about length / 3) or a
 * WMA, EMA, SMA or HMA. Each line is coloured by its slope; the ribbon between them is green when both rise, red when
 * none rises and gray otherwise. Mood and Bias (context) MAs give Tri-View circles on the slow line when the slow line
 * rises and slow >= mood >= bias (or falls and slow <= mood <= bias). Two more optional MAs.
 * Alerts (alertcondition, `alerts` of the result): the fast / slow line swings up (rises, did not rise on the bar
 * before) or down (falls, did not fall on the bar before).
 *
 * Reference: "RedK Magic Ribbon" by RedKTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, getSourceSeries, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type RedKMAType = 'RSS_WMA' | 'WMA' | 'EMA' | 'SMA' | 'HMA';
const MA_TYPES: RedKMAType[] = ['RSS_WMA', 'WMA', 'EMA', 'SMA', 'HMA'];

export interface RedKMagicRibbonInputs {
  /** CoRa Wave (fast MA) source */
  source1: SourceType;
  /** CoRa Wave length */
  length1: number;
  /** CoRa Wave smoothing (WMA length) */
  smooth: number;
  /** Proxy (slow) MA source */
  source2: SourceType;
  /** Proxy MA type */
  source2Type: RedKMAType;
  /** Proxy MA length */
  length2: number;
  /** Ribbon fill between the fast and the slow line */
  showFill: boolean;
  showMoodMA: boolean;
  moodMAType: RedKMAType;
  moodMASource: SourceType;
  moodMALength: number;
  showBiasMA: boolean;
  biasMAType: RedKMAType;
  biasMASource: SourceType;
  biasMALength: number;
  /** Tri-View circles when proxy, mood and bias MAs align */
  showTriFlag: boolean;
  showMA1: boolean;
  ma1Type: RedKMAType;
  ma1Source: SourceType;
  ma1Length: number;
  showMA2: boolean;
  ma2Type: RedKMAType;
  ma2Source: SourceType;
  ma2Length: number;
}

export const defaultInputs: RedKMagicRibbonInputs = {
  source1: 'close',
  length1: 10,
  smooth: 3,
  source2: 'close',
  source2Type: 'RSS_WMA',
  length2: 9,
  showFill: true,
  showMoodMA: false,
  moodMAType: 'SMA',
  moodMASource: 'close',
  moodMALength: 20,
  showBiasMA: false,
  biasMAType: 'SMA',
  biasMASource: 'close',
  biasMALength: 50,
  showTriFlag: true,
  showMA1: false,
  ma1Type: 'SMA',
  ma1Source: 'close',
  ma1Length: 100,
  showMA2: false,
  ma2Type: 'SMA',
  ma2Source: 'close',
  ma2Length: 200,
};

export const inputConfig: InputConfig[] = [
  { id: 'source1', type: 'source', title: 'Source', defval: 'close' },
  { id: 'length1', type: 'int', title: 'Length', defval: 10, min: 1 },
  { id: 'smooth', type: 'int', title: 'Smooth', defval: 3, min: 1 },
  { id: 'source2', type: 'source', title: 'Source', defval: 'close' },
  { id: 'source2Type', type: 'string', title: 'Type', defval: 'RSS_WMA', options: MA_TYPES },
  { id: 'length2', type: 'int', title: 'Length', defval: 9, min: 1 },
  { id: 'showFill', type: 'bool', title: 'Ribbon Fill?', defval: true },
  { id: 'showMoodMA', type: 'bool', title: 'Mood MA', defval: false },
  { id: 'moodMAType', type: 'string', title: 'Mood MA Type', defval: 'SMA', options: MA_TYPES },
  { id: 'moodMASource', type: 'source', title: 'Mood MA Source', defval: 'close' },
  { id: 'moodMALength', type: 'int', title: 'Mood MA Length', defval: 20, min: 1 },
  { id: 'showBiasMA', type: 'bool', title: 'Bias MA', defval: false },
  { id: 'biasMAType', type: 'string', title: 'Bias MA Type', defval: 'SMA', options: MA_TYPES },
  { id: 'biasMASource', type: 'source', title: 'Bias MA Source', defval: 'close' },
  { id: 'biasMALength', type: 'int', title: 'Bias MA Length', defval: 50, min: 1 },
  { id: 'showTriFlag', type: 'bool', title: 'MA Alignment Markers', defval: true },
  { id: 'showMA1', type: 'bool', title: 'MA #1', defval: false },
  { id: 'ma1Type', type: 'string', title: 'MA #1 Type', defval: 'SMA', options: MA_TYPES },
  { id: 'ma1Source', type: 'source', title: 'MA #1 Source', defval: 'close' },
  { id: 'ma1Length', type: 'int', title: 'MA #1 Length', defval: 100, min: 1 },
  { id: 'showMA2', type: 'bool', title: 'MA #2', defval: false },
  { id: 'ma2Type', type: 'string', title: 'MA #2 Type', defval: 'SMA', options: MA_TYPES },
  { id: 'ma2Source', type: 'source', title: 'MA #2 Source', defval: 'close' },
  { id: 'ma2Length', type: 'int', title: 'MA #2 Length', defval: 200, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast Line', color: String(color.new(color.aqua, 30)), lineWidth: 2 },
  { id: 'plot1', title: 'Slow Line', color: '#33ff00', lineWidth: 2 },
  { id: 'plot2', title: 'Mood MA', color: String(color.new('#ba68c8', 20)), lineWidth: 2 },
  { id: 'plot3', title: 'Bias MA', color: String(color.new('#2470f0', 20)), lineWidth: 2 },
  { id: 'plot4', title: 'MA Alignment Markers', color: '#33ff00', lineWidth: 3, style: 'circles', display: 'pane' },
  { id: 'plot5', title: 'MA #1', color: '#ffeb3b', lineWidth: 1 },
  { id: 'plot6', title: 'MA #2', color: String(color.new('#b2b5be', 35)), lineWidth: 2 },
];

export const metadata = {
  title: 'RedK Magic Ribbon v6.0',
  shortTitle: 'MagicRibbon v6.0',
  overlay: true,
};

// Pine compares floats with a tolerance of 1e-10 (a comparison with na is false)
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

type Arr = number[];

export function calculate(
  bars: Bar[],
  inputs: Partial<RedKMagicRibbonInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series): Arr => s.toArray().map((v) => v ?? NaN);
  const S = (a: Arr) => Series.fromArray(bars, a);
  const src = (s: SourceType): Arr => A(getSourceSeries(bars, s));

  // f_LazyLine(_data, _length): three chained WMAs when _length > 4, else one WMA
  const lazyLine = (data: Arr, length: number): Arr => {
    if (length > 4) {
      const w = length / 3;
      const w2 = Math.round(w);
      const w1 = Math.round((length - w2) / 2);
      const w3 = Math.trunc((length - w2) / 2);
      const l1 = A(ta.wma(S(data), w1));
      const l2 = A(ta.wma(S(l1), w2));
      return A(ta.wma(S(l2), w3));
    }
    return A(ta.wma(S(data), length));
  };

  // f_CoraWave(source, length, s): compound ratio weights from 0.01 to length, then ta.wma(cora_raw, s)
  const coraWave = (source: Arr, length: number, s: number): Arr => {
    const startWt = 0.01;
    const endWt = length;
    const rMulti = 2.0;
    // r = math.pow(End_Wt / Start_Wt, 1 / (length - 1)) - 1: with length 1, 1 / 0 is +infinity and math.pow uses
    // it (r = base = +infinity, the weight is infinite and cora_raw = inf / inf is na)
    const r = Math.pow(endWt / startWt, 1 / (length - 1)) - 1;
    const base = 1 + r * rMulti;
    const raw = source.map((_v, i) => {
      let numerator = 0;
      let denom = 0;
      for (let k = 0; k <= length - 1; k++) {
        const cWeight = startWt * Math.pow(base, length - k);
        numerator += (i - k >= 0 ? source[i - k] : NaN) * cWeight;
        denom += cWeight;
      }
      return numerator / denom;
    });
    return A(ta.wma(S(raw), s));
  };

  // f_getMA(source, length, mtype)
  const getMA = (source: Arr, length: number, mtype: RedKMAType): Arr =>
    mtype === 'SMA' ? A(ta.sma(S(source), length))
      : mtype === 'EMA' ? A(ta.ema(S(source), length))
        : mtype === 'WMA' ? A(ta.wma(S(source), length))
          : mtype === 'HMA' ? A(ta.hma(S(source), length))
            : lazyLine(source, length);

  const fastLine = coraWave(src(cfg.source1), cfg.length1, cfg.smooth);
  const slowLine = getMA(src(cfg.source2), cfg.length2, cfg.source2Type);
  const moodMA = getMA(src(cfg.moodMASource), cfg.moodMALength, cfg.moodMAType);
  const biasMA = getMA(src(cfg.biasMASource), cfg.biasMALength, cfg.biasMAType);
  const ma1 = getMA(src(cfg.ma1Source), cfg.ma1Length, cfg.ma1Type);
  const ma2 = getMA(src(cfg.ma2Source), cfg.ma2Length, cfg.ma2Type);

  const cFup = String(color.new(color.aqua, 30));
  const cFdn = String(color.new(color.orange, 30));
  const cSup = String(color.new('#33ff00', 0));
  const cSdn = String(color.new('#ff1111', 0));
  const cRup = String(color.new('#33ff00', 70));
  const cRdn = String(color.new('#ff1111', 70));
  const cRsw = String(color.new(color.gray, 70));
  const moodColor = String(color.new('#ba68c8', 20));
  const biasColor = String(color.new('#2470f0', 20));
  const ma1Color = String(color.new('#ffeb3b', 0));
  const ma2Color = String(color.new('#b2b5be', 35));

  type Pt = { time: number; value: number; color: string };
  const fastPlot: Pt[] = [];
  const slowPlot: Pt[] = [];
  const moodPlot: Pt[] = [];
  const biasPlot: Pt[] = [];
  const triPlot: Pt[] = [];
  const ma1Plot: Pt[] = [];
  const ma2Plot: Pt[] = [];
  const ribbon: string[] = [];
  const fastUpF: boolean[] = [];
  const fastDnF: boolean[] = [];
  const slowUpF: boolean[] = [];
  const slowDnF: boolean[] = [];
  const swingFastUp: boolean[] = [];
  const swingFastDn: boolean[] = [];
  const swingSlowUp: boolean[] = [];
  const swingSlowDn: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const fastUp = i > 0 && gt(fastLine[i], fastLine[i - 1]);
    const slowUp = i > 0 && gt(slowLine[i], slowLine[i - 1]);
    const slowDn = i > 0 && lt(slowLine[i], slowLine[i - 1]);
    const fastDn = i > 0 && lt(fastLine[i], fastLine[i - 1]);
    // Alert_Fastup = Fast_up and not Fast_up[1] (and the same for Fast_dn, Slow_up, Slow_dn)
    swingFastUp.push(fastUp && !(i > 0 && fastUpF[i - 1]));
    swingFastDn.push(fastDn && !(i > 0 && fastDnF[i - 1]));
    swingSlowUp.push(slowUp && !(i > 0 && slowUpF[i - 1]));
    swingSlowDn.push(slowDn && !(i > 0 && slowDnF[i - 1]));
    fastUpF.push(fastUp);
    fastDnF.push(fastDn);
    slowUpF.push(slowUp);
    slowDnF.push(slowDn);
    // plot(FastLine, 'Fast Line', color = Fast_up ? c_fup : c_fdn); plot(SlowLine, 'Slow Line', Slow_up ? c_sup : c_sdn)
    fastPlot.push({ time: t, value: fastLine[i], color: fastUp ? cFup : cFdn });
    slowPlot.push({ time: t, value: slowLine[i], color: slowUp ? cSup : cSdn });
    // fill colour: ShowFill ? (Ribbon_up ? c_rup : Ribbon_dn ? c_rdn : c_rsw) : na
    // Ribbon_up = Fast_up and Slow_up; Ribbon_dn = not Fast_up and not Slow_up
    ribbon.push(!cfg.showFill ? 'transparent' : fastUp && slowUp ? cRup : !fastUp && !slowUp ? cRdn : cRsw);

    moodPlot.push({ time: t, value: cfg.showMoodMA ? moodMA[i] : NaN, color: moodColor });
    biasPlot.push({ time: t, value: cfg.showBiasMA ? biasMA[i] : NaN, color: biasColor });

    // triFlag = Slow_up and SlowLine >= Mood_MA and Mood_MA >= Bias_MA ? 1
    //   : Slow_dn and SlowLine <= Mood_MA and Mood_MA <= Bias_MA ? -1 : 0
    const triFlag = slowUp && ge(slowLine[i], moodMA[i]) && ge(moodMA[i], biasMA[i]) ? 1
      : slowDn && le(slowLine[i], moodMA[i]) && le(moodMA[i], biasMA[i]) ? -1 : 0;
    // plot(triFlag == 0 or not show_triFlag ? na : SlowLine, color = Slow_up ? c_sup : c_sdn, style_circles)
    triPlot.push({ time: t, value: triFlag === 0 || !cfg.showTriFlag ? NaN : slowLine[i], color: slowUp ? cSup : cSdn });

    ma1Plot.push({ time: t, value: cfg.showMA1 ? ma1[i] : NaN, color: ma1Color });
    ma2Plot.push({ time: t, value: cfg.showMA2 ? ma2[i] : NaN, color: ma2Color });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: fastPlot,
      plot1: slowPlot,
      plot2: moodPlot,
      plot3: biasPlot,
      plot4: triPlot,
      plot5: ma1Plot,
      plot6: ma2Plot,
    },
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'Ribbon Fill' }, colors: ribbon }],
    markers: [],
    alerts: alertStates(alertConditions, bars, [swingFastUp, swingFastDn, swingSlowUp, swingSlowDn]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Fast Line Swings Up', message: 'MagicRibbon - Fast Line Swing Up Detected!' },
  { id: 'alert1', title: 'Fast Line Swings Down', message: 'MagicRibbon - Fast Line Swing Down Detected!' },
  { id: 'alert2', title: 'Slow Line Swings Up', message: 'MagicRibbon - Slow Line Swing Up Detected!' },
  { id: 'alert3', title: 'Slow Line Swings Down', message: 'MagicRibbon - Slow Line Swing Down Detected!' },
];

export const RedKMagicRibbon = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
