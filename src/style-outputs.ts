/**
 * The outputs of the built-ins a user can style (the Style tab of the study settings), as the reference app declares
 * them: line plots it does not list (`editable: false`), titles of the hlines, the fills (between plots: their id on
 * the result's fills), the shapes / characters, the background / bar colours, the candles and the drawing kinds. The
 * colours are the ones the built-in draws (a colour override replaces them). Generated from the reference metadata
 * and one run of each built-in; edit by hand only with that source.
 */
import type { BarColorConfig, CandleConfig, FillConfig, HLineConfig, ShapeConfig } from 'oakscriptjs';
import { COMMUNITY_STYLE_OUTPUTS } from './style-outputs-community';

/** Kind of drawing object of a study (`label.new`, `line.new`, ...): one show / hide row per kind */
export type StudyDrawingKind = 'label' | 'line' | 'box' | 'linefill' | 'polyline' | 'table';

/** A shape / character output */
export type StyleShapeConfig = ShapeConfig;

export interface StyleOutputs {
  /** Plots not listed in the Style settings */
  hiddenPlots?: string[];
  /** The palette of plots coloured per bar from a fixed set of colours (by plot id) */
  plotPalettes?: Record<string, string[]>;
  /** hlineConfig changes by hline id */
  hlines?: Record<string, { title?: string; editable?: boolean; linestyle?: 'solid' | 'dotted' | 'dashed'; linewidth?: number; color?: string }>;
  /** The fills: between hlines (the fillConfig ids) and between plots (the id the result's fills get) */
  fills?: FillConfig[];
  shapes?: StyleShapeConfig[];
  /**
   * Markers the built-in emits without an id: the shape output each belongs to, by its marker shape, position, text,
   * character and colour (one of `colors`); the first rule that fits gives the id
   */
  markerMatch?: { id: string; shape?: string; position?: string; text?: string; char?: string; colors?: string[] }[];
  /** The hlines a built-in gives in its result (no hlineConfig), by index: their Style declarations (id `hline<k>`) */
  resultHlines?: HLineConfig[];
  /** Markers not in `shapes` are drawings of this kind (the reference draws them as labels): shown and hidden with them */
  markerDrawing?: StudyDrawingKind;
  barColors?: BarColorConfig[];
  /** plotCandleConfig changes by candle id */
  candles?: Record<string, Partial<CandleConfig>>;
  drawings?: StudyDrawingKind[];
}

export const STYLE_OUTPUTS: Record<string, StyleOutputs> = {
  "sma": {"hiddenPlots":["plot1","plot2","plot3"]},
  "bb": {"fills":[{"id":"fill_0","plot1":"plot1","plot2":"plot2","title":"Background","color":"rgba(33, 150, 243, 0.05)"}]},
  "cci": {"hiddenPlots":["plot2","plot3"],"hlines":{"hline_mid":{"linestyle":"dashed"}},"fills":[{"id":"fill_band","plot1":"hline_upper","plot2":"hline_lower","title":"Background","color":"#2962FF1A"}]},
  "ema": {"hiddenPlots":["plot1","plot2","plot3"]},
  "ichimoku": {"fills":[{"id":"fill_0","plot1":"plot3","plot2":"plot4","title":"Cloud Fill","palette":["#43A0471A","#F443361A"]}]},
  "keltner": {"fills":[{"id":"fill_0","plot1":"plot0","plot2":"plot2","title":"Background","color":"rgba(33, 150, 243, 0.05)"}]},
  "macd": {"plotPalettes":{"plot0":["#26A69A","#B2DFDB","#FFCDD2","#FF5252"]}},
  "obv": {"hiddenPlots":["plot1","plot2","plot3"]},
  "roc": {"hlines":{"hline_zero":{"linestyle":"dashed"}}},
  "rsi": {"hiddenPlots":["plot6","plot2","plot3","plot4","plot5"],"plotPalettes":{"plot4":["rgba(76,175,80,1)","rgba(255,255,255,0)"],"plot5":["rgba(242,54,69,1)","rgba(255,255,255,0)"]},"hlines":{"hline_upper":{"linestyle":"dashed"},"hline_mid":{"linestyle":"dashed"},"hline_lower":{"linestyle":"dashed"}},"fills":[{"id":"fill_band","plot1":"hline_upper","plot2":"hline_lower","title":"RSI Background Fill","color":"#7E57C219"},{"id":"fill_1","plot1":"plot0","plot2":"plot6","title":"Overbought Gradient Fill","topColor":"#4CAF50","bottomColor":"#4CAF5000"},{"id":"fill_2","plot1":"plot0","plot2":"plot6","title":"Oversold Gradient Fill","topColor":"#F2364500","bottomColor":"#F23645"}],"shapes":[{"id":"bullLabel","kind":"shape","title":"Regular Bullish Label","location":"absolute","style":"labelup","color":"#4CAF50","editable":false},{"id":"bearLabel","kind":"shape","title":"Regular Bearish Label","location":"absolute","style":"labeldown","color":"#F23645","editable":false}]},
  "stoch": {"hlines":{"hline_upper":{"linestyle":"dashed"},"hline_mid":{"linestyle":"dashed"},"hline_lower":{"linestyle":"dashed"}},"fills":[{"id":"fill_band","plot1":"hline_upper","plot2":"hline_lower","title":"Background","color":"#2962FF1A"}]},
  "donchian": {"fills":[{"id":"fill_0","plot1":"plot1","plot2":"plot2","title":"Background","color":"rgba(33, 150, 243, 0.05)"}]},
  "supertrend": {"fills":[{"id":"fill_0","plot1":"plot2","plot2":"plot0","title":"Uptrend background","color":"rgba(8, 153, 129, 0.1)"},{"id":"fill_1","plot1":"plot2","plot2":"plot1","title":"Downtrend background","color":"rgba(242, 54, 69, 0.1)"}]},
  "awesome-oscillator": {"plotPalettes":{"plot0":["#F44336","#009688"]}},
  "bbtrend": {"plotPalettes":{"plot0":["#089981BF","#08998180","#F2364580","#F23645BF"]},"hlines":{"hline_zero":{"linestyle":"dashed"}}},
  "bull-bear-power": {"plotPalettes":{"plot0":["#089981","#f23645"]},"hlines":{"hline_zero":{"linestyle":"dashed"}}},
  "dpo": {"hlines":{"hline_zero":{"linestyle":"dashed"}}},
  "ma-ribbon": {"plotPalettes":{"plot0":["#F6C309"],"plot1":["#FB9800"],"plot2":["#FB6500"],"plot3":["#F60C0C"]}},
  "median": {"fills":[{"id":"fill_0","plot1":"plot0","plot2":"plot3","title":"Fill color","palette":["#00E676E6","#E040FBE6"]}]},
  "mfi": {"fills":[{"id":"fill_band","plot1":"hline_upper","plot2":"hline_lower","title":"Background","color":"#7E57C21A"}]},
  "stoch-rsi": {"hlines":{"hline_upper":{"linestyle":"dashed"},"hline_mid":{"linestyle":"dashed"},"hline_lower":{"linestyle":"dashed"}},"fills":[{"id":"fill_band","plot1":"hline_upper","plot2":"hline_lower","title":"Background","color":"#2962FF1A"}]},
  "trend-strength": {"hiddenPlots":["plot3"],"fills":[{"id":"fill_0","plot1":"plot0","plot2":"plot3","title":"Bullish Gradient Fill"},{"id":"fill_1","plot1":"plot0","plot2":"plot3","title":"Bearish Gradient Fill"}]},
  "tsi": {"hlines":{"hline_zero":{"linestyle":"dashed"}}},
  "volume-osc": {"plotPalettes":{"histogram":["#26A69A","#B2DFDB","#FFCDD2","#FF5252"]}},
  "williams-r": {"hlines":{"hline_upper":{"linestyle":"dashed"},"hline_lower":{"linestyle":"dashed"}},"fills":[{"id":"fill_band","plot1":"hline_upper","plot2":"hline_lower","title":"Background","color":"#7E57C219"}]},
  "woodies-cci": {"plotPalettes":{"plot0":["#009688","#F44336"]}},
  "bb-percent-b": {"hlines":{"hline_top":{"title":"Level","linestyle":"dashed","editable":false},"hline_mid":{"linestyle":"dashed"},"hline_bottom":{"title":"Level","linestyle":"dashed","editable":false}},"fills":[{"id":"fill_mid","plot1":"hline_upper","plot2":"hline_lower","title":"Middle Background","color":"#2962FF19"},{"id":"fill_ob","plot1":"hline_top","plot2":"hline_upper","title":"Overbought background","color":"#F2364519"},{"id":"fill_os","plot1":"hline_lower","plot2":"hline_bottom","title":"Oversold background","color":"#08998119"}]},
  "envelope": {"fills":[{"id":"fill_0","plot1":"plot1","plot2":"plot2","title":"Background","color":"rgba(33, 150, 243, 0.05)"}]},
  "price-oscillator": {"plotPalettes":{"plot0":["#26A69A","#B2DFDB","#FFCDD2","#FF5252"]}},
  "choppiness": {"hlines":{"hline_mid":{"linestyle":"dashed"}},"fills":[{"id":"fill_band","plot1":"hline_upper","plot2":"hline_lower","title":"Background","color":"#2962FF1A"}]},
  "zigzag": {"drawings":["label","line"]},
  "trix": {"hlines":{"hline_zero":{"linestyle":"dashed"}}},
  "relative-volume-at-time": {"hlines":{"hline_one":{"title":"Level"}}},
  "rci-ribbon": {"hlines":{"hline_upper":{"title":"Upper Band"},"hline_lower":{"title":"Lower Band"}},"fills":[{"id":"fill_band","plot1":"hline_upper","plot2":"hline_lower","title":"Hlines Background","color":"#2962FF1A"}]},
  "volume-delta": {"hlines":{"hline_zero":{"title":"Level"}},"candles":{"delta":{"title":"Volume Delta","palettes":{"color":["#089981","#F23645"],"wickColor":["#089981","#F23645"],"borderColor":["#089981","#F23645"]}}}},
  "cvd": {"hlines":{"hline_zero":{"title":"Level"}},"candles":{"cvd":{"title":"CVD","palettes":{"color":["#089981","#F23645"],"wickColor":["#089981","#F23645"],"borderColor":["#089981","#F23645"]}}}},
  "net-volume": {"hlines":{"hline_zero":{"title":"Level"}}},
  "kst": {"hlines":{"hline_zero":{"linestyle":"dashed"}}},
  "connors-rsi": {"hlines":{"hline_upper":{"linestyle":"dashed"},"hline_mid":{"linestyle":"dashed"},"hline_lower":{"linestyle":"dashed"}},"fills":[{"id":"fill_band","plot1":"hline_upper","plot2":"hline_lower","title":"Background","color":"#2962FF1A"}]},
  "chop-zone": {"plotPalettes":{"plot0":["#26C6DA","#43A047","#A5D6A7","#009688","#D50000","#E91E63","#FF6D00","#FFB74D","#FDD835"]}},
  "rci": {"hiddenPlots":["plot2","plot3"],"hlines":{"hline_upper":{"title":"Upper Band"},"hline_lower":{"title":"Lower Band"}},"fills":[{"id":"fill_band","plot1":"hline_upper","plot2":"hline_lower","title":"Hlines Background","color":"#2962FF1A"},{"id":"fill_bb","plot1":"plot2","plot2":"plot3","title":"Bollinger Bands Background Fill","color":"#4CAF501A","editable":false}]},
  "rvol": {"hiddenPlots":["plot2","plot3"],"fills":[{"id":"fill_band","plot1":"hline_upper","plot2":"hline_lower","title":"Background","color":"#7E57C219"}]},
  "williams-fractals": {"shapes":[{"id":"downFractal","kind":"shape","title":"Shapes","location":"belowbar","style":"triangledown","color":"#F44336"},{"id":"upFractal","kind":"shape","title":"Shapes","location":"abovebar","style":"triangleup","color":"#009688"}]},
  "bb-bars": {"candles":{"wicks":{"title":"Bollinger Bars Wicks","color":"#0D349E","wickColor":"rgba(0,0,0,0)","borderColor":"#0D349E"},"body":{"title":"Bollinger Bars Body","wickColor":"rgba(0,0,0,0)","palettes":{"color":["#089981","#F23645"],"borderColor":["#089981","#F23645"]}}}},
  "moon-phases": {"shapes":[{"id":"newMoon","kind":"shape","title":"New Moon","location":"abovebar","style":"circle"},{"id":"fullMoon","kind":"shape","title":"Full Moon","location":"belowbar","style":"circle"}],"barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color"}]},
  "auto-fib-extension": {"drawings":["label","linefill","line"]},
  "auto-fib-retracement": {"drawings":["label","linefill","line"]},
  "auto-pitchfork": {"drawings":["label","linefill","line"]},
  "correlation-coefficient": {"hlines":{"hline_1":{"title":"Level"},"hline_0":{"title":"Level"},"hline_minus1":{"title":"Level"}}},
  "gaps": {"drawings":["box","table"]},
  "linreg-channel": {"drawings":["label","linefill","line"]},
  "multi-time-period-charts": {"drawings":["box"]},
  "performance": {"drawings":["table"]},
  "pivot-points-high-low": {"drawings":["label"]},
  "pivot-points-standard": {"drawings":["label","line"]},
  "rob-booker-ziv-ghost-pivots": {"shapes":[{"id":"pivot240","kind":"char","title":"Chars","location":"absolute","char":"8","color":"#00BCD4"},{"id":"pivotD","kind":"char","title":"Chars","location":"absolute","char":"d","color":"#2962FF"},{"id":"pivotW","kind":"char","title":"Chars","location":"absolute","char":"w","color":"#673AB7"},{"id":"pivotM","kind":"char","title":"Chars","location":"absolute","char":"m","color":"#E91E63"}]},
  "rsi-divergence-indicator": {"hiddenPlots":["plot2","plot4"],"plotPalettes":{"plot1":["#4CAF50","#FFFFFF00"],"plot2":["rgba(76,175,80,0.2)","#FFFFFF00"],"plot3":["#F23645","#FFFFFF00"],"plot4":["rgba(242,54,69,0.2)","#FFFFFF00"]},"fills":[{"id":"fill_background","plot1":"hline_ob","plot2":"hline_os","title":"Background","color":"#2196F31A"}],"shapes":[{"id":"bullLabel","kind":"shape","title":"Regular Bullish Label","location":"absolute","style":"labelup","color":"#4CAF50"},{"id":"hiddenBullLabel","kind":"shape","title":"Hidden Bullish Label","location":"absolute","style":"labelup","color":"#4CAF50","editable":false},{"id":"bearLabel","kind":"shape","title":"Regular Bearish Label","location":"absolute","style":"labeldown","color":"#F23645"},{"id":"hiddenBearLabel","kind":"shape","title":"Hidden Bearish Label","location":"absolute","style":"labeldown","color":"#F23645","editable":false}]},
  "seasonality": {"drawings":["box","table"]},
  "smi": {"hiddenPlots":["plot2"],"fills":[{"id":"fill_hlines","plot1":"hline_overbought","plot2":"hline_oversold","title":"Background","color":"#2962FF1A"},{"id":"fill_1","plot1":"plot0","plot2":"plot2","title":"Overbought Gradient Fill","topColor":"#4CAF4F80","bottomColor":"#4CAF5000"},{"id":"fill_2","plot1":"plot0","plot2":"plot2","title":"Oversold Gradient Fill","topColor":"#F2364500","bottomColor":"#F2364580"}]},
  "technicals": {"drawings":["table"]},
  "trading-sessions": {"drawings":["box","label","linefill","line"]},
  "abandoned-baby-bearish": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242,54,69,0.1)"]}],"drawings":["label"]},
  "abandoned-baby-bullish": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41,98,255,0.1)"]}],"drawings":["label"]},
  "dark-cloud-cover": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242,54,69,0.1)"]}],"drawings":["label"]},
  "doji": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(120, 123, 134, 0.09999999999999998)"]}],"drawings":["label"]},
  "doji-star-bearish": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242,54,69,0.1)"]}],"drawings":["label"]},
  "doji-star-bullish": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41,98,255,0.1)"]}],"drawings":["label"]},
  "downside-tasuki-gap": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242,54,69,0.1)"]}],"drawings":["label"]},
  "dragonfly-doji": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41, 98, 255, 0.09999999999999998)"]}],"drawings":["label"]},
  "engulfing-bearish": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242, 54, 69, 0.09999999999999998)"]}],"drawings":["label"]},
  "engulfing-bullish": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41, 98, 255, 0.09999999999999998)"]}],"drawings":["label"]},
  "evening-doji-star": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242,54,69,0.1)"]}],"drawings":["label"]},
  "evening-star": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242,54,69,0.1)"]}],"drawings":["label"]},
  "falling-three-methods": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242,54,69,0.1)"]}],"drawings":["label"]},
  "falling-window": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242,54,69,0.1)"]}],"drawings":["label"]},
  "gravestone-doji": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242,54,69,0.1)"]}],"drawings":["label"]},
  "hammer": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41, 98, 255, 0.09999999999999998)"]}],"drawings":["label"]},
  "hanging-man": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242, 54, 69, 0.09999999999999998)"]}],"drawings":["label"]},
  "harami-bearish": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242,54,69,0.1)"]}],"drawings":["label"]},
  "harami-bullish": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41,98,255,0.1)"]}],"drawings":["label"]},
  "harami-cross-bearish": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242,54,69,0.1)"]}],"drawings":["label"]},
  "harami-cross-bullish": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41,98,255,0.1)"]}],"drawings":["label"]},
  "inverted-hammer": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41,98,255,0.1)"]}],"drawings":["label"]},
  "kicking-bearish": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242,54,69,0.1)"]}],"drawings":["label"]},
  "kicking-bullish": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41,98,255,0.1)"]}],"drawings":["label"]},
  "long-lower-shadow": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41, 98, 255, 0.09999999999999998)"]}],"drawings":["label"]},
  "long-upper-shadow": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242, 54, 69, 0.09999999999999998)"]}],"drawings":["label"]},
  "marubozu-black": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242, 54, 69, 0.09999999999999998)"]}],"drawings":["label"]},
  "marubozu-white": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41, 98, 255, 0.09999999999999998)"]}],"drawings":["label"]},
  "morning-doji-star": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41,98,255,0.1)"]}],"drawings":["label"]},
  "morning-star": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41,98,255,0.1)"]}],"drawings":["label"]},
  "on-neck": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242,54,69,0.1)"]}],"drawings":["label"]},
  "piercing": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41,98,255,0.1)"]}],"drawings":["label"]},
  "rising-three-methods": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41,98,255,0.1)"]}],"drawings":["label"]},
  "rising-window": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41,98,255,0.1)"]}],"drawings":["label"]},
  "shooting-star": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242, 54, 69, 0.09999999999999998)"]}],"drawings":["label"]},
  "spinning-top-black": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(120, 123, 134, 0.09999999999999998)"]}],"drawings":["label"]},
  "spinning-top-white": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(120, 123, 134, 0.09999999999999998)"]}],"drawings":["label"]},
  "three-black-crows": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242,54,69,0.1)"]}],"drawings":["label"]},
  "three-white-soldiers": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41,98,255,0.1)"]}],"drawings":["label"]},
  "tri-star-bearish": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242,54,69,0.1)"]}],"drawings":["label"]},
  "tri-star-bullish": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41,98,255,0.1)"]}],"drawings":["label"]},
  "tweezer-bottom": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41, 98, 255, 0.09999999999999998)"]}],"drawings":["label"]},
  "tweezer-top": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(242, 54, 69, 0.09999999999999998)"]}],"drawings":["label"]},
  "upside-tasuki-gap": {"markerDrawing":"label","barColors":[{"id":"bgcolor0","kind":"bgcolor","title":"Background Color","palette":["rgba(41,98,255,0.1)"]}],"drawings":["label"]},
  "all-patterns": {"markerDrawing":"label","drawings":["label"]},
  "aroon-oscillator": {"hiddenPlots":["plot1"],"plotPalettes":{"plot0":["#4CAF50","#FF5252"]},"fills":[{"id":"fill_0","plot1":"plot0","plot2":"plot1","title":"Oscillator fill","palette":["#4CAF501A","#FF52521A"]}]},
  "ulcer-index": {"hiddenPlots":["plot1"],"fills":[{"id":"fill_0","plot1":"plot0","plot2":"plot1","title":"Plots Background","color":"rgba(33,150,243,0.1)"}]},
  "volatility-stop": {"plotPalettes":{"plot0":["#009688","#F44336"]}},
  "vwap": {"hiddenPlots":["plot3","plot4","plot5","plot6"],"fills":[{"id":"fill_0","plot1":"plot1","plot2":"plot2","title":"Bands Fill #1","color":"rgba(76, 175, 80, 0.05)"}]},
  "up-down-volume": {"shapes":[{"id":"delta","kind":"char","title":"Delta","location":"absolute","char":"—","palette":["#4CAF50","#F23645"]}]},
  "auto-key-levels": {"drawings":["label","line"]},
  "auto-trend-detector": {"markerDrawing":"label","drawings":["label","line","table"]},
};

// the community built-ins (style-outputs-community.ts)
for (const [id, decl] of Object.entries(COMMUNITY_STYLE_OUTPUTS)) STYLE_OUTPUTS[id] ??= decl;
