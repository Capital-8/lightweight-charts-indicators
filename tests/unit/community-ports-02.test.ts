/**
 * Community ports, batch 02: the alertconditions of the originals (declarations and per-bar states, checked against
 * the original expressions computed again in the test) and the ids of the Style outputs on the emitted markers /
 * background colours.
 */

import { describe, it, expect } from 'vitest';
import { ta, Series, color, getSourceSeries, type Bar } from 'oakscriptjs';
import type { ChartContext } from '../../src/chart-context';
import * as adx from '../../src/community/adx-extreme-zones-divergences';
import * as aegis from '../../src/community/aegis-prime-flow';
import * as aggressive from '../../src/community/aggressive-pullback-indicator';
import * as aiOsc from '../../src/community/ai-adaptive-oscillator';
import * as aiInf from '../../src/community/ai-infinity';
import * as aiSrc from '../../src/community/ai-source-switching-moving-average';
import * as aiAssist from '../../src/community/ai-trading-assistant-v2';
import * as aiTrend from '../../src/community/ai-trend-navigator';
import * as aiVol from '../../src/community/ai-volume-signals';
import * as alBrooks from '../../src/community/al-brooks-ii-ioi-oo';
import * as candles from '../../src/community/all-candlestick-patterns';
import * as rsiSystem from '../../src/community/all-in-one-rsi-system';
import * as allma from '../../src/community/allma-trend-radar';
import * as almaBands from '../../src/community/alma-bands';
import * as almaSd from '../../src/community/alma-sd-bands-rakoquant';

/** The specs of the originals: alertconditions (id, title, message) and Style outputs (shapes, colours) */
const SPEC_ALERTS: Record<string, { id: string; title: string; message: string }[]> = {
 "adx-extreme-zones-divergences": [
  {
   "id": "alert0",
   "title": "ADX divergence - regular bullish",
   "message": "tZv-ADXex: regular bullish divergence vs price."
  },
  {
   "id": "alert1",
   "title": "ADX divergence - regular bearish",
   "message": "tZv-ADXex: regular bearish divergence vs price."
  },
  {
   "id": "alert2",
   "title": "ADX divergence - hidden bullish",
   "message": "tZv-ADXex: hidden bullish divergence vs price."
  },
  {
   "id": "alert3",
   "title": "ADX divergence - hidden bearish",
   "message": "tZv-ADXex: hidden bearish divergence vs price."
  },
  {
   "id": "alert4",
   "title": "ADX enters extreme zone",
   "message": "tZv-ADXex: ADX crossed into the extreme zone."
  },
  {
   "id": "alert5",
   "title": "ADX exits extreme zone",
   "message": "tZv-ADXex: ADX crossed back below the extreme zone."
  },
  {
   "id": "alert6",
   "title": "DI cross - bullish (+DI over -DI)",
   "message": "tZv-ADXex: +DI crossed above -DI (bullish direction)."
  },
  {
   "id": "alert7",
   "title": "DI cross - bearish (-DI over +DI)",
   "message": "tZv-ADXex: -DI crossed above +DI (bearish direction)."
  }
 ],
 "aegis-prime-flow": [
  {
   "id": "alert0",
   "title": "Bullish Reversal (강력 매수 반전)",
   "message": "[Prime Flow] Bullish Reversal Signal Triggered! Capital Inflow Starting. Price: {{close}}"
  },
  {
   "id": "alert1",
   "title": "Bearish Reversal (강력 매도 반전)",
   "message": "[Prime Flow] Bearish Reversal Signal Triggered! Capital Outflow Starting. Price: {{close}}"
  },
  {
   "id": "alert2",
   "title": "Oversold Entrance (과매도 진입)",
   "message": "[Prime Flow] Market Entered Oversold Zone. Watch for Reversal. Price: {{close}}"
  },
  {
   "id": "alert3",
   "title": "Overbought Entrance (과매수 진입)",
   "message": "[Prime Flow] Market Entered Overbought Zone. Watch for Correction. Price: {{close}}"
  }
 ],
 "aggressive-pullback-indicator": [
  {
   "id": "alert0",
   "title": "API Alert!",
   "message": "Pullback signal for {{ticker}}"
  }
 ],
 "ai-adaptive-oscillator": [
  {
   "id": "alert0",
   "title": "AI Oscillator Zero Line Cross",
   "message": "AI Oscillator crossed the zero line"
  },
  {
   "id": "alert1",
   "title": "AI Oscillator Bullish Signal",
   "message": "AI Oscillator shows potential bullish move"
  },
  {
   "id": "alert2",
   "title": "AI Oscillator Bearish Signal",
   "message": "AI Oscillator shows potential bearish move"
  }
 ],
 "ai-infinity": [
  {
   "id": "alert0",
   "title": "Bullish MACD Cross",
   "message": "MACD line crossed ABOVE the signal line. Possible Bullish momentum."
  },
  {
   "id": "alert1",
   "title": "Bearish MACD Cross",
   "message": "MACD line crossed BELOW the signal line. Possible Bearish momentum."
  },
  {
   "id": "alert2",
   "title": "RSI Cross Above 80",
   "message": "RSI just crossed ABOVE 80. Potentially overbought zone."
  },
  {
   "id": "alert3",
   "title": "RSI Cross Below 20",
   "message": "RSI just crossed BELOW 20. Potentially oversold zone."
  }
 ],
 "ai-source-switching-moving-average": [
  {
   "id": "alert0",
   "title": "AI Trend Flip Up",
   "message": "AI Source Adaptive MA flipped bullish"
  },
  {
   "id": "alert1",
   "title": "AI Trend Flip Down",
   "message": "AI Source Adaptive MA flipped bearish"
  },
  {
   "id": "alert2",
   "title": "AI Source Changed",
   "message": "AI Source Selector switched OHLC source"
  }
 ],
 "ai-trading-assistant-v2": [
  {
   "id": "alert0",
   "title": "Long Signal",
   "message": "Long"
  },
  {
   "id": "alert1",
   "title": "Short Signal",
   "message": "Short"
  },
  {
   "id": "alert2",
   "title": "Trap Long Signal",
   "message": "Trap Long"
  },
  {
   "id": "alert3",
   "title": "Trap Short Signal",
   "message": "Trap Short"
  }
 ],
 "ai-trend-navigator": [
  {
   "id": "alert0",
   "title": "Knn Crossover Average Knn",
   "message": "Knn Crossover Average Knn"
  },
  {
   "id": "alert1",
   "title": "Knn Crossunder Average Knn",
   "message": "Knn Crossunder Average Knn"
  },
  {
   "id": "alert2",
   "title": "Knn Crossover Close",
   "message": "Knn Crossover Close"
  },
  {
   "id": "alert3",
   "title": "Knn Crossunder Close",
   "message": "Knn Crossunder Close"
  },
  {
   "id": "alert4",
   "title": "Knn Switch Up",
   "message": "Knn Switch Up"
  },
  {
   "id": "alert5",
   "title": "Knn Switch Dn",
   "message": "Knn Switch Dn"
  },
  {
   "id": "alert6",
   "title": "Knn is Neutral",
   "message": "Knn is Neutral"
  },
  {
   "id": "alert7",
   "title": "Positive Prediction",
   "message": "Positive Prediction"
  },
  {
   "id": "alert8",
   "title": "Negative Prediction",
   "message": "Negative Prediction"
  }
 ],
 "ai-volume-signals": [
  {
   "id": "alert0",
   "title": "Buy Alert",
   "message": "AI Volume Signal: BUY"
  },
  {
   "id": "alert1",
   "title": "Sell Alert",
   "message": "AI Volume Signal: SELL"
  }
 ],
 "alma-bands": [
  {
   "id": "alert0",
   "title": "Bullish Crossover",
   "message": "BULLISH: ALMA 1 crossed above ALMA 2"
  },
  {
   "id": "alert1",
   "title": "Bearish Crossover",
   "message": "BEARISH: ALMA 1 crossed below ALMA 2"
  }
 ],
 "alma-sd-bands-rakoquant": [
  {
   "id": "alert0",
   "title": "RQ ALMA SD BANDS — BULL",
   "message": "RQ ALMA SD BANDS BULL regime on {{exchange}}:{{ticker}} (close={{close}})"
  },
  {
   "id": "alert1",
   "title": "RQ ALMA SD BANDS — BEAR",
   "message": "RQ ALMA SD BANDS BEAR regime on {{exchange}}:{{ticker}} (close={{close}})"
  }
 ]
};
const SPEC_SHAPES: Record<string, { id: string; title: string; shape?: string; location: string; text?: string; char?: string; color: string }[]> = {
 "adx-extreme-zones-divergences": [
  {
   "id": "shape0",
   "title": "Reg bull label",
   "shape": "shape_label_up",
   "location": "Absolute",
   "text": "Bull",
   "color": "#2962ff"
  },
  {
   "id": "shape1",
   "title": "Hidden bull label",
   "shape": "shape_label_up",
   "location": "Absolute",
   "text": "H Bull",
   "color": "#2962ff"
  },
  {
   "id": "shape2",
   "title": "Reg bear label",
   "shape": "shape_label_down",
   "location": "Absolute",
   "text": "Bear",
   "color": "#2962ff"
  },
  {
   "id": "shape3",
   "title": "Hidden bear label",
   "shape": "shape_label_down",
   "location": "Absolute",
   "text": "H Bear",
   "color": "#2962ff"
  }
 ],
 "ai-adaptive-oscillator": [
  {
   "id": "shape0",
   "title": "Bullish Signal (High Confidence)",
   "shape": "shape_label_up",
   "location": "Absolute",
   "text": "++",
   "color": "#2962ff"
  },
  {
   "id": "shape1",
   "title": "Bullish Signal (Medium Confidence)",
   "shape": "shape_label_up",
   "location": "Absolute",
   "text": "+",
   "color": "#2962ff"
  },
  {
   "id": "shape2",
   "title": "Bullish Signal (Average Confidence)",
   "shape": "shape_label_up",
   "location": "Absolute",
   "text": " ",
   "color": "#2962ff"
  },
  {
   "id": "shape3",
   "title": "Bearish Signal (High Confidence)",
   "shape": "shape_label_down",
   "location": "Absolute",
   "text": "++",
   "color": "#2962ff"
  },
  {
   "id": "shape4",
   "title": "Bearish Signal (Medium Confidence)",
   "shape": "shape_label_down",
   "location": "Absolute",
   "text": "+",
   "color": "#2962ff"
  },
  {
   "id": "shape5",
   "title": "Bearish Signal (Average Confidence)",
   "shape": "shape_label_down",
   "location": "Absolute",
   "text": " ",
   "color": "#2962ff"
  }
 ],
 "ai-source-switching-moving-average": [
  {
   "id": "shape0",
   "title": "Source Open",
   "shape": "shape_label_up",
   "location": "BelowBar",
   "text": "O",
   "color": "#2962ff"
  },
  {
   "id": "shape1",
   "title": "Source High",
   "shape": "shape_label_up",
   "location": "BelowBar",
   "text": "H",
   "color": "#2962ff"
  },
  {
   "id": "shape2",
   "title": "Source Low",
   "shape": "shape_label_down",
   "location": "AboveBar",
   "text": "L",
   "color": "#2962ff"
  },
  {
   "id": "shape3",
   "title": "Source Close",
   "shape": "shape_label_up",
   "location": "BelowBar",
   "text": "C",
   "color": "rgba(255,255,255,1)"
  },
  {
   "id": "shape4",
   "title": "Trend Flip Up",
   "shape": "shape_triangle_up",
   "location": "Absolute",
   "color": "#2962ff"
  },
  {
   "id": "shape5",
   "title": "Trend Flip Down",
   "shape": "shape_triangle_down",
   "location": "Absolute",
   "color": "#2962ff"
  },
  {
   "id": "shape6",
   "title": "Trend Flip Up",
   "shape": "shape_triangle_up",
   "location": "Absolute",
   "color": "#2962ff"
  },
  {
   "id": "shape7",
   "title": "Trend Flip Down",
   "shape": "shape_triangle_down",
   "location": "Absolute",
   "color": "#2962ff"
  }
 ],
 "ai-trading-assistant-v2": [
  {
   "id": "shape0",
   "title": "Liquidity Spike",
   "shape": "shape_circle",
   "location": "BelowBar",
   "color": "#e1b311"
  },
  {
   "id": "shape1",
   "title": "LONG",
   "shape": "shape_label_up",
   "location": "BelowBar",
   "text": "LONG",
   "color": "#089981"
  },
  {
   "id": "shape2",
   "title": "SHORT",
   "shape": "shape_label_down",
   "location": "AboveBar",
   "text": "SHORT",
   "color": "#f23645"
  },
  {
   "id": "shape3",
   "title": "TRAP L",
   "shape": "shape_label_up",
   "location": "BelowBar",
   "text": "TRAP",
   "color": "#5b9cf6"
  },
  {
   "id": "shape4",
   "title": "TRAP S",
   "shape": "shape_label_down",
   "location": "AboveBar",
   "text": "TRAP",
   "color": "#FF9800"
  }
 ],
 "al-brooks-ii-ioi-oo": [
  {
   "id": "char0",
   "title": "ii Pattern",
   "location": "AboveBar",
   "char": "i",
   "color": "#2962ff"
  },
  {
   "id": "char1",
   "title": "OO Pattern",
   "location": "AboveBar",
   "char": "O",
   "color": "#2962ff"
  },
  {
   "id": "char2",
   "title": "ioi Pattern",
   "location": "AboveBar",
   "char": "i",
   "color": "#2962ff"
  },
  {
   "id": "char3",
   "title": "Inside Bar",
   "location": "BelowBar",
   "char": "I",
   "color": "#2962ff"
  },
  {
   "id": "char4",
   "title": "Outside Bar",
   "location": "BelowBar",
   "char": "O",
   "color": "#F23645"
  }
 ],
 "al-po-s-arithmetic-mean": [
  {
   "id": "char0",
   "title": "Bars above the arithmetic mean",
   "location": "Top",
   "char": "",
   "color": "#4CAF50"
  },
  {
   "id": "char1",
   "title": "Bars below the arithmetic mean",
   "location": "Top",
   "char": "",
   "color": "#F23645"
  },
  {
   "id": "char2",
   "title": "Bars above the arithmetic mean",
   "location": "Top",
   "char": "",
   "color": "#4CAF50"
  },
  {
   "id": "char3",
   "title": "Bars below the arithmetic mean",
   "location": "Top",
   "char": "",
   "color": "#F23645"
  }
 ],
 "all-candlestick-patterns": [
  {
   "id": "shape0",
   "title": "Dark Cloud Cover",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "DarkCloudCover",
   "color": "#FF0000"
  },
  {
   "id": "shape1",
   "title": "Doji",
   "shape": "shape_circle",
   "location": "BelowBar",
   "text": "Doji",
   "color": "#FFFFFF"
  },
  {
   "id": "shape2",
   "title": "Doji Star",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "DojiStar",
   "color": "#FF0000"
  },
  {
   "id": "shape3",
   "title": "Dragonfly Doji",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "DragonflyDoji",
   "color": "#008000"
  },
  {
   "id": "shape4",
   "title": "Evening Star",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "EveningStar",
   "color": "#FF0000"
  },
  {
   "id": "shape5",
   "title": "Evening Star Doji",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "EveningStarDoji",
   "color": "#FF0000"
  },
  {
   "id": "shape6",
   "title": "Gravestone Doji",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "GravestoneDoji",
   "color": "#FF0000"
  },
  {
   "id": "shape7",
   "title": "Hanging Man Red",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "HangingMan",
   "color": "#FF0000"
  },
  {
   "id": "shape8",
   "title": "Hanging Man Green",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "HangingMan",
   "color": "#FF0000"
  },
  {
   "id": "shape9",
   "title": "Morning Star",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "MorningStar",
   "color": "#008000"
  },
  {
   "id": "shape10",
   "title": "Morning Star Doji",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "MorningStarDoji",
   "color": "#008000"
  },
  {
   "id": "shape11",
   "title": "Piercieng Pattern",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "PiercingPattern",
   "color": "#008000"
  },
  {
   "id": "shape12",
   "title": "Raindrop",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "Raindrop",
   "color": "#008000"
  },
  {
   "id": "shape13",
   "title": "Raindrop Doji",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "RaindropDoji",
   "color": "#008000"
  },
  {
   "id": "shape14",
   "title": "Inverted Hammer Red",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "InvertedHammer",
   "color": "#008000"
  },
  {
   "id": "shape15",
   "title": "Inverted Hammer Green",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "InvertedHammer",
   "color": "#008000"
  },
  {
   "id": "shape16",
   "title": "Star",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "Star",
   "color": "#FF0000"
  },
  {
   "id": "shape17",
   "title": "Bearish Thrusting",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "BearishThrusting",
   "color": "#FF0000"
  },
  {
   "id": "shape18",
   "title": "Bullish Thrusting Pattern",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "BullishThrusting",
   "color": "#008000"
  },
  {
   "id": "shape19",
   "title": "Tweezers Bottom",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "TweezersBottom",
   "color": "#008000"
  },
  {
   "id": "shape20",
   "title": "Tweezers Top",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "TweezersTop",
   "color": "#FF0000"
  },
  {
   "id": "shape21",
   "title": "Tower Bottom",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "TowerBottom",
   "color": "#008000"
  },
  {
   "id": "shape22",
   "title": "Tower Top",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "TowerTop",
   "color": "#FF0000"
  },
  {
   "id": "shape23",
   "title": "Bullish In Neck",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "BullishInNeck",
   "color": "#008000"
  },
  {
   "id": "shape24",
   "title": "Bearish In Neck",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "BearishInNeck",
   "color": "#FF0000"
  },
  {
   "id": "shape25",
   "title": "Bullish Separating Lines",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "BullishSeparatingLines",
   "color": "#008000"
  },
  {
   "id": "shape26",
   "title": "Bearish Separating Lines",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "BearishSeparatingLines",
   "color": "#FF0000"
  },
  {
   "id": "shape27",
   "title": "Bullish Harami",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "BullishHarami",
   "color": "#008000"
  },
  {
   "id": "shape28",
   "title": "Bearish Harami",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "BearishHarami",
   "color": "#FF0000"
  },
  {
   "id": "shape29",
   "title": "Bullish Engulfing",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "BullishEngulfing",
   "color": "#008000"
  },
  {
   "id": "shape30",
   "title": "Bearish Engulfing",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "BearishEngulfing",
   "color": "#FF0000"
  },
  {
   "id": "shape31",
   "title": "Doji Bullish Engulfing",
   "shape": "shape_arrow_up",
   "location": "BelowBar",
   "text": "DojiBullishEngulfing",
   "color": "#008000"
  },
  {
   "id": "shape32",
   "title": "Doji Bearish Engulfing",
   "shape": "shape_arrow_down",
   "location": "AboveBar",
   "text": "DojiBearishEngulfing",
   "color": "#FF0000"
  }
 ],
 "all-in-one-rsi-system": [
  {
   "id": "shape0",
   "title": "BUY",
   "shape": "shape_label_up",
   "location": "Absolute",
   "text": "BUY",
   "color": "#2962ff"
  },
  {
   "id": "shape1",
   "title": "SELL",
   "shape": "shape_label_down",
   "location": "Absolute",
   "text": "SELL",
   "color": "#2962ff"
  },
  {
   "id": "shape2",
   "title": "Regular Bullish Label",
   "shape": "shape_label_up",
   "location": "Absolute",
   "text": " Bull ",
   "color": "#2962ff"
  },
  {
   "id": "shape3",
   "title": "Hidden Bullish Label",
   "shape": "shape_label_up",
   "location": "Absolute",
   "text": " H Bull ",
   "color": "#2962ff"
  },
  {
   "id": "shape4",
   "title": "Regular Bearish Label",
   "shape": "shape_label_down",
   "location": "Absolute",
   "text": " Bear ",
   "color": "#2962ff"
  },
  {
   "id": "shape5",
   "title": "Hidden Bearish Label",
   "shape": "shape_label_down",
   "location": "Absolute",
   "text": " H Bear ",
   "color": "#2962ff"
  }
 ],
 "allma-trend-radar": [
  {
   "id": "shape0",
   "title": "Buy Signal Greater",
   "shape": "shape_triangle_up",
   "location": "BelowBar",
   "text": "Buy",
   "color": "rgba(76,175,80,1)"
  },
  {
   "id": "shape1",
   "title": "Sell Signal Less",
   "shape": "shape_triangle_down",
   "location": "AboveBar",
   "text": "Sell",
   "color": "rgba(242,54,69,1)"
  },
  {
   "id": "shape2",
   "title": "Buy Signal Up",
   "shape": "shape_triangle_up",
   "location": "BelowBar",
   "text": "Buy",
   "color": "rgba(76,175,80,1)"
  },
  {
   "id": "shape3",
   "title": "Sell Signal Down",
   "shape": "shape_triangle_down",
   "location": "AboveBar",
   "text": "Sell",
   "color": "rgba(242,54,69,1)"
  },
  {
   "id": "shape4",
   "title": "Buy Signal Greater Fast",
   "shape": "shape_triangle_up",
   "location": "BelowBar",
   "text": "Buy",
   "color": "rgba(76,175,80,1)"
  },
  {
   "id": "shape5",
   "title": "Sell Signal Less Fast",
   "shape": "shape_triangle_down",
   "location": "AboveBar",
   "text": "Sell",
   "color": "rgba(242,54,69,1)"
  },
  {
   "id": "shape6",
   "title": "Buy Signal Up Fast",
   "shape": "shape_triangle_up",
   "location": "BelowBar",
   "text": "Buy",
   "color": "rgba(76,175,80,1)"
  },
  {
   "id": "shape7",
   "title": "Sell Signal Down Fast",
   "shape": "shape_triangle_down",
   "location": "AboveBar",
   "text": "Sell",
   "color": "rgba(242,54,69,1)"
  },
  {
   "id": "shape8",
   "title": "Buy Signal Greater Slow",
   "shape": "shape_triangle_up",
   "location": "BelowBar",
   "text": "Buy",
   "color": "rgba(76,175,80,1)"
  },
  {
   "id": "shape9",
   "title": "Sell Signal Less Slow",
   "shape": "shape_triangle_down",
   "location": "AboveBar",
   "text": "Sell",
   "color": "rgba(242,54,69,1)"
  },
  {
   "id": "shape10",
   "title": "Buy Signal Up Slow",
   "shape": "shape_triangle_up",
   "location": "BelowBar",
   "text": "Buy",
   "color": "rgba(76,175,80,1)"
  },
  {
   "id": "shape11",
   "title": "Sell Signal Down Slow",
   "shape": "shape_triangle_down",
   "location": "AboveBar",
   "text": "Sell",
   "color": "rgba(242,54,69,1)"
  }
 ]
};
const SPEC_COLORS: Record<string, string[]> = {"al-brooks-ii-ioi-oo": ["bgcolor0", "bgcolor1", "bgcolor2"]};

const DAY = 86400;
const T0 = 1262304000;
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

/** Seeded random walk of daily bars (times in seconds) */
function walk(count: number, seed = 7, vol = 4): Bar[] {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = Math.max(1, price + (rand() - 0.5) * 0.5);
    const close = Math.max(1, open + Math.sin(i / 60) * 0.6 + (rand() - 0.5) * vol);
    const high = Math.max(open, close) + rand() * 2;
    const low = Math.max(0.5, Math.min(open, close) - rand() * 2);
    const spike = rand() < 0.06 ? 4 : 1;
    bars.push({ time: T0 + i * DAY, open, high, low, close, volume: (1000 + Math.floor(rand() * 1000)) * spike });
    price = close;
  }
  return bars;
}

const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
const timesWhere = (bars: Bar[], f: (i: number) => boolean) => bars.filter((_, i) => f(i)).map((b) => b.time as number);
const vals = (plot: { value: number }[]) => plot.map((p) => p.value);
const crossOver = (a: number[], b: number[] | number) => a.map((v, i) => {
  const w = typeof b === 'number' ? b : b[i];
  const pw = typeof b === 'number' ? b : b[i - 1];
  return i > 0 && v > w && a[i - 1] <= pw;
});
const crossUnder = (a: number[], b: number[] | number) => a.map((v, i) => {
  const w = typeof b === 'number' ? b : b[i];
  const pw = typeof b === 'number' ? b : b[i - 1];
  return i > 0 && v < w && a[i - 1] >= pw;
});
const flagTimes = (bars: Bar[], f: boolean[]) => timesWhere(bars, (i) => f[i]);
const uniq = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
type M = { id?: string; time: number; position: string; shape: string; text?: string; color: string };
const idTimes = (markers: M[], id: string) => uniq(markers.filter((m) => m.id === id).map((m) => m.time));

function expectDecls(id: string, decls: unknown, mod: { alertConditions?: unknown }) {
  expect(decls).toEqual(SPEC_ALERTS[id]);
  if (mod.alertConditions !== undefined) expect(mod.alertConditions).toBe(decls);
}

const SHAPE = {
  shape_label_up: 'labelUp', shape_label_down: 'labelDown', shape_triangle_up: 'triangleUp',
  shape_triangle_down: 'triangleDown', shape_circle: 'circle', shape_arrow_up: 'arrowUp', shape_arrow_down: 'arrowDown',
} as Record<string, string>;
/** Every marker has an id of the spec and the look of that output (shape, location, text / character) */
function expectShapeIds(port: string, markers: M[], opts: { color?: boolean } = {}) {
  const spec = new Map(SPEC_SHAPES[port].map((s) => [s.id, s]));
  expect(markers.length).toBeGreaterThan(0);
  for (const m of markers) {
    expect(m.id, JSON.stringify(m)).toBeDefined();
    const s = spec.get(m.id!);
    expect(s, m.id).toBeDefined();
    if (s!.shape) expect(m.shape).toBe(SHAPE[s!.shape]);
    if (s!.location === 'Absolute') expect(m.position.startsWith('atPrice')).toBe(true);
    else expect(m.position).toBe(s!.location[0].toLowerCase() + s!.location.slice(1));
    if (s!.text !== undefined) expect(m.text).toBe(s!.text);
    if (s!.char !== undefined) expect(m.text).toBe(s!.char);
    if (opts.color) expect(m.color.toUpperCase()).toBe(s!.color.toUpperCase());
  }
}

describe('ADX Extreme Zones + Divergences', () => {
  const bars = walk(1200);
  const res = adx.calculate(bars, { showHiddenBullish: true, showHiddenBearish: true });
  it('declares the alertconditions of the original', () => {
    expectDecls('adx-extreme-zones-divergences', adx.alertConditions, adx.AdxExtremeZonesDivergences);
  });
  it('fires the zone and DI crosses on the plotted ADX / DI', () => {
    const a = vals(res.plots.plot0), p = vals(res.plots.plot2), m = vals(res.plots.plot3);
    const sets = [crossOver(a, 60), crossUnder(a, 60), crossOver(p, m), crossUnder(p, m)];
    sets.forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(res.alerts[4 + k].times).toEqual(flagTimes(bars, f));
    });
  });
  it('fires the divergences on the bar that confirms the labels (pivot bar + 1)', () => {
    const next = (id: string) => idTimes(res.markers as M[], id).map((t) => t + DAY);
    ['shape0', 'shape2', 'shape1', 'shape3'].forEach((id, k) => {
      expect(res.alerts[k].times).toEqual(next(id));
    });
    expect(res.alerts[0].times.length + res.alerts[1].times.length).toBeGreaterThan(0);
    expect(res.alerts[2].times.length + res.alerts[3].times.length).toBeGreaterThan(0);
  });
  it('alerts the divergences whatever the per-kind display toggles, none without the master toggle', () => {
    const off = adx.calculate(bars, { showRegularBullish: false, showRegularBearish: false });
    for (let k = 0; k < 4; k++) expect(off.alerts[k].times).toEqual(res.alerts[k].times);
    const none = adx.calculate(bars, { showDivergences: false });
    for (let k = 0; k < 4; k++) expect(none.alerts[k].times).toEqual([]);
  });
  it('gives the label ids of the original', () => {
    expectShapeIds('adx-extreme-zones-divergences', res.markers as M[]);
    expect(new Set((res.markers as M[]).map((m) => m.id))).toEqual(new Set(['shape0', 'shape1', 'shape2', 'shape3']));
  });
});

describe('Aegis Prime Flow', () => {
  const bars = walk(1200, 3, 6);
  const res = aegis.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expectDecls('aegis-prime-flow', aegis.alertConditions, aegis.AegisPrimeFlow);
  });
  it('fires on the WaveTrend expressions', () => {
    const ap = A(getSourceSeries(bars, 'hlc3'));
    const S = (a: number[]) => Series.fromArray(bars, a);
    const esa = A(ta.ema(S(ap), 14));
    const d = A(ta.ema(S(ap.map((v, i) => Math.abs(v - esa[i]))), 14));
    const tci = A(ta.ema(S(ap.map((v, i) => (v - esa[i]) / (0.015 * d[i]))), 3));
    const wt2 = A(ta.sma(S(tci), 4));
    const up = crossOver(tci, wt2), dn = crossUnder(tci, wt2);
    const buy = tci.map((v, i) => up[i] && lt(v, -50));
    const sell = tci.map((v, i) => dn[i] && gt(v, 50));
    const flags = [buy, sell, crossUnder(tci, -60), crossOver(tci, 60)];
    flags.forEach((f, k) => {
      expect(f.some(Boolean), `alert${k}`).toBe(true);
      expect(res.alerts[k].times).toEqual(flagTimes(bars, f));
    });
  });
});

describe('Aggressive Pullback Indicator', () => {
  const bars = walk(1500, 5, 3);
  const res = aggressive.calculate(bars);
  it('declares the alertcondition of the original', () => {
    expectDecls('aggressive-pullback-indicator', aggressive.alertConditions, aggressive.AggressivePullbackIndicator);
  });
  it('fires on a long or a short signal', () => {
    const ema = A(ta.ema(new Series(bars, (b) => b.close), 50));
    const S = (f: (b: Bar) => number) => new Series(bars, f);
    const hiO = A(ta.highest(S((b) => b.open), 5)), loO = A(ta.lowest(S((b) => b.open), 5));
    const hiH = A(ta.highest(S((b) => b.high), 5)), loL = A(ta.lowest(S((b) => b.low), 5));
    const x = (i: number, k: number, f: 'open' | 'high' | 'low' | 'close') => (i - k >= 0 ? bars[i - k][f] : NaN);
    const fire = bars.map((b, i) => {
      const e = ema[i];
      const long = b.close > e && x(i, 1, 'open') > x(i, 1, 'close') && b.close > b.open && b.close >= x(i, 1, 'open')
        && x(i, 1, 'close') >= b.open && b.close - b.open > x(i, 1, 'open') - x(i, 1, 'close')
        && b.open < x(i, 2, 'open') && (b.close < x(i, 5, 'open') || b.close < hiO[i])
        && hiH[i] > e && (x(i, 1, 'high') > e || x(i, 2, 'high') > e) && (x(i, 1, 'close') > e || x(i, 2, 'close') > e);
      const short = b.close < e && x(i, 1, 'close') > x(i, 1, 'open') && b.open > b.close && b.open >= x(i, 1, 'close')
        && x(i, 1, 'open') >= b.close && b.open - b.close > x(i, 1, 'close') - x(i, 1, 'open')
        && b.open > x(i, 2, 'open') && (b.close > x(i, 5, 'open') || b.close > loO[i])
        && loL[i] < e && (x(i, 1, 'low') < e || x(i, 2, 'low') < e) && (x(i, 1, 'close') < e || x(i, 2, 'close') < e);
      return long || short;
    });
    expect(fire.filter(Boolean).length).toBeGreaterThan(2);
    expect(res.alerts[0].times).toEqual(flagTimes(bars, fire));
    expect(res.alerts[0].times).toEqual(uniq((res.markers as M[]).map((m) => m.time)));
  });
});

describe('AI Adaptive Oscillator', () => {
  const bars = walk(1200, 9, 5);
  const res = aiOsc.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expectDecls('ai-adaptive-oscillator', aiOsc.alertConditions, aiOsc.AiAdaptiveOscillator);
  });
  it('fires on the zero cross of the oscillator and on the signal labels', () => {
    const vf = vals(res.plots.plot3);
    const cross = crossOver(vf, 0).map((u, i) => u || crossUnder(vf, 0)[i]);
    expect(cross.some(Boolean)).toBe(true);
    expect(res.alerts[0].times).toEqual(flagTimes(bars, cross));
    const ms = res.markers as M[];
    expect(res.alerts[1].times).toEqual(uniq(ms.filter((m) => m.shape === 'labelUp').map((m) => m.time)));
    expect(res.alerts[2].times).toEqual(uniq(ms.filter((m) => m.shape === 'labelDown').map((m) => m.time)));
    expect(res.alerts[1].times.length + res.alerts[2].times.length).toBeGreaterThan(0);
  });
  it('gives each label the id of its confidence output', () => {
    expectShapeIds('ai-adaptive-oscillator', res.markers as M[]);
  });
});

describe('AI Infinity', () => {
  const bars = walk(1000);
  const res = aiInf.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expectDecls('ai-infinity', aiInf.alertConditions, aiInf.AiInfinity);
  });
  it('fires on the MACD and RSI crosses', () => {
    const close = new Series(bars, (b) => b.close);
    const [m, s] = ta.macd(close, 12, 26, 9);
    const macd = A(m), sig = A(s);
    const rsi = A(ta.rsi(close, 14));
    const flags = [crossOver(macd, sig), crossUnder(macd, sig), crossOver(rsi, 80), crossUnder(rsi, 20)];
    flags.forEach((f, k) => {
      expect(f.some(Boolean), `alert${k}`).toBe(true);
      expect(res.alerts[k].times).toEqual(flagTimes(bars, f));
    });
  });
});

describe('AI Source Switching Moving Average', () => {
  const bars = walk(700, 13, 5);
  const res = aiSrc.calculate(bars, { showSourceMarks: true });
  it('declares the alertconditions of the original', () => {
    expectDecls('ai-source-switching-moving-average', aiSrc.alertConditions, aiSrc.AISourceSwitchingMovingAverage);
  });
  it('fires on the supertrend flips and on the source switches', () => {
    const up = vals(res.plots.plot1), dn = vals(res.plots.plot2);
    const dir = up.map((v, i) => (!isNaN(v) ? 1 : !isNaN(dn[i]) ? -1 : 1));
    const flipUp = dir.map((d, i) => i > 0 && d === 1 && dir[i - 1] === -1);
    const flipDn = dir.map((d, i) => i > 0 && d === -1 && dir[i - 1] === 1);
    expect(flipUp.some(Boolean) && flipDn.some(Boolean)).toBe(true);
    expect(res.alerts[0].times).toEqual(flagTimes(bars, flipUp));
    expect(res.alerts[1].times).toEqual(flagTimes(bars, flipDn));
    const ms = res.markers as M[];
    const switches = uniq(ms.filter((m) => ['shape0', 'shape1', 'shape2', 'shape3'].includes(m.id!)).map((m) => m.time));
    expect(switches.length).toBeGreaterThan(0);
    expect(res.alerts[2].times).toEqual(switches);
    // the flip triangles: the tiny and the small one of each flip
    expect(idTimes(ms, 'shape4')).toEqual(res.alerts[0].times);
    expect(idTimes(ms, 'shape6')).toEqual(res.alerts[0].times);
    expect(idTimes(ms, 'shape5')).toEqual(res.alerts[1].times);
    expect(idTimes(ms, 'shape7')).toEqual(res.alerts[1].times);
  });
  it('gives the shape ids of the original and the plotcandle output', () => {
    expectShapeIds('ai-source-switching-moving-average', res.markers as M[]);
    expect(res.plotCandles).toEqual({ aiTrendCandles: [] });
    const on = aiSrc.calculate(bars.slice(0, 300), { showCandles: true });
    expect(on.plotCandles.aiTrendCandles.length).toBe(300);
  });
});

describe('AI Trading Assistant v2', () => {
  const bars = walk(1200, 21, 4);
  const res = aiAssist.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expectDecls('ai-trading-assistant-v2', aiAssist.alertConditions, aiAssist.AiTradingAssistantV2);
  });
  it('fires on the four signal expressions (daily bars: VWAP = hlc3)', () => {
    const vol = bars.map((b) => b.volume as number);
    const delta = bars.map((b, i) => (i > 0 && gt(b.close, bars[i - 1].close) ? vol[i] : i > 0 && lt(b.close, bars[i - 1].close) ? -vol[i] : 0));
    const sDelta = A(ta.ema(Series.fromArray(bars, delta), 14));
    const res50 = A(ta.highest(new Series(bars, (b) => b.high), 50));
    const sup50 = A(ta.lowest(new Series(bars, (b) => b.low), 50));
    const r1 = (i: number) => (i > 0 ? res50[i - 1] : NaN);
    const s1 = (i: number) => (i > 0 ? sup50[i - 1] : NaN);
    const vw = bars.map((b) => (b.high + b.low + b.close) / 3);
    const flags = [
      bars.map((b, i) => gt(b.close, r1(i)) && gt(sDelta[i], 0) && gt(b.close, vw[i])),
      bars.map((b, i) => lt(b.close, r1(i)) && lt(b.close, b.open) && lt(sDelta[i], 0) && lt(b.close, vw[i])),
      bars.map((b, i) => lt(b.low, s1(i)) && gt(b.close, s1(i)) && gt(sDelta[i], 0)),
      bars.map((b, i) => gt(b.high, r1(i)) && lt(b.close, r1(i)) && lt(sDelta[i], 0)),
    ];
    flags.forEach((f, k) => {
      expect(f.some(Boolean), `alert${k}`).toBe(true);
      expect(res.alerts[k].times).toEqual(flagTimes(bars, f));
    });
    const ms = res.markers as M[];
    ['shape1', 'shape2', 'shape3', 'shape4'].forEach((id, k) => expect(idTimes(ms, id)).toEqual(res.alerts[k].times));
  });
  it('gives the shape ids of the original', () => {
    expectShapeIds('ai-trading-assistant-v2', res.markers as M[], { color: true });
  });
});

describe('AI Trend Navigator', () => {
  const bars = walk(1000, 17, 4);
  const res = aiTrend.calculate(bars, { showBackground: true });
  it('declares the alertconditions of the original', () => {
    expectDecls('ai-trend-navigator', aiTrend.alertConditions, aiTrend.AiTrendNavigator);
  });
  // The original's series with the default inputs, written again from its code
  const n = bars.length;
  const close = bars.map((b) => b.close);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const valueIn = A(ta.sma(S(bars.map((b) => (b.high + b.low) / 2)), 5));
  const targetIn = A(ta.rma(S(close), 5));
  const knnMA = bars.map((_b, t) => {
    const d = [1e10, 1e10, 1e10];
    const v = [0, 0, 0];
    for (let i = 1; i <= 30; i++) {
      const value = t - i >= 0 ? valueIn[t - i] : NaN;
      const dist = Math.abs(targetIn[t] - value);
      let mi = 0;
      for (let j = 1; j < 3; j++) if (gt(d[j], d[mi])) mi = j;
      if (lt(dist, d[mi])) {
        d[mi] = dist;
        v[mi] = value;
      }
    }
    return (v[0] + v[1] + v[2]) / 3;
  });
  const price = knnMA.map((v, i) => (v + close[i]) / 2);
  const c = A(ta.rma(S(knnMA.map((_v, i) => (i > 0 ? knnMA[i - 1] : NaN))), 50));
  const o = A(ta.rma(S(knnMA), 50));
  const raw = bars.map((_b, t) => {
    let pos = 0, neg = 0, min = 10e10;
    for (let j = 1; j <= 10; j++) {
      const dist = Math.abs((t - j >= 0 ? price[t - j] : NaN) - price[t]);
      if (lt(dist, min)) {
        min = dist;
        if (lt(c[t - j], o[t - j])) pos++;
        if (gt(c[t - j], o[t - j])) neg++;
      }
    }
    return pos > neg ? 1 : -1;
  });
  const pred = A(ta.wma(S(raw), 3));
  const line = A(ta.wma(S(knnMA), 5));
  it('draws the classifier line and its average', () => {
    expect(vals(res.plots.plot0)).toEqual(line);
    expect(vals(res.plots.plot1)).toEqual(o);
  });
  it('fires on the original expressions', () => {
    const at = (i: number) => (i >= 0 ? line[i] : NaN);
    const neutral = line.map((v, i) => !(gt(v, at(i - 1)) || lt(v, at(i - 1))));
    const green = pred.map((v) => lt(v, 0.5));
    const red = pred.map((v) => gt(v, -0.5));
    const flags = [
      crossOver(line, o), crossUnder(line, o), crossOver(line, close), crossUnder(line, close),
      line.map((v, i) => lt(at(i - 1), v) && le(at(i - 1), at(i - 2))),
      line.map((v, i) => gt(at(i - 1), v) && ge(at(i - 1), at(i - 2))),
      neutral.map((x, i) => i > 0 && x && !neutral[i - 1]),
      green.map((g, i) => g && !(i > 0 && green[i - 1])),
      red.map((r, i) => r && !(i > 0 && red[i - 1])),
    ];
    flags.forEach((f, k) => {
      expect(f.some(Boolean), `alert${k}`).toBe(true);
      expect(res.alerts[k].times).toEqual(flagTimes(bars, f));
    });
  });
  it('draws no marker, the background with the bgcolor id', () => {
    expect((res as { markers?: unknown[] }).markers ?? []).toEqual([]);
    expect(res.bgColors.length).toBeGreaterThan(0);
    // the original has one bgcolor() (bgcolor0)
    for (const b of res.bgColors) expect(b.id).toBe('bgcolor0');
    expect(aiTrend.calculate(bars).bgColors).toEqual([]);
    expect(n).toBe(1000);
  });
});

describe('AI Volume Signals', () => {
  const bars = walk(1200, 23, 4);
  const res = aiVol.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expectDecls('ai-volume-signals', aiVol.alertConditions, aiVol.AiVolumeSignals);
  });
  it('fires on the buy / sell expressions', () => {
    const vema = A(ta.ema(new Series(bars, (b) => b.volume as number), 20));
    const ema = A(ta.ema(new Series(bars, (b) => b.close), 50));
    const spike = bars.map((b, i) => gt(b.volume as number, vema[i] * 2));
    const buy = bars.map((b, i) => spike[i] && gt(b.close, ema[i]) && gt(b.close, b.open));
    const sell = bars.map((b, i) => spike[i] && lt(b.close, ema[i]) && lt(b.close, b.open));
    expect(buy.some(Boolean) && sell.some(Boolean)).toBe(true);
    expect(res.alerts[0].times).toEqual(flagTimes(bars, buy));
    expect(res.alerts[1].times).toEqual(flagTimes(bars, sell));
  });
});

describe('Al Brooks ii / OO / ioi: Style ids', () => {
  const bars = walk(1500, 29, 2);
  const res = alBrooks.calculate(bars);
  it('gives every character and background the id of its output', () => {
    expectShapeIds('al-brooks-ii-ioi-oo', res.markers as M[]);
    const ids = new Set((res.markers as M[]).map((m) => m.id));
    for (const id of ['char0', 'char1', 'char2', 'char3', 'char4']) expect(ids.has(id), id).toBe(true);
    expect(idTimes(res.markers as M[], 'char0')).toEqual(res.alerts[0].times);
    expect(idTimes(res.markers as M[], 'char1')).toEqual(res.alerts[1].times);
    expect(idTimes(res.markers as M[], 'char2')).toEqual(res.alerts[2].times);
    for (const b of res.bgColors) expect(SPEC_COLORS['al-brooks-ii-ioi-oo']).toContain(b.id);
    expect(uniq(res.bgColors.filter((b) => b.id === 'bgcolor0').map((b) => b.time))).toEqual(res.alerts[0].times);
    expect(uniq(res.bgColors.filter((b) => b.id === 'bgcolor1').map((b) => b.time))).toEqual(res.alerts[1].times);
    expect(uniq(res.bgColors.filter((b) => b.id === 'bgcolor2').map((b) => b.time))).toEqual(res.alerts[2].times);
  });
});

describe('All Candlestick Patterns: the 33 shapes of the original', () => {
  const bars = walk(1500, 31, 3);
  const n = bars.length;
  // a Doji (equal open / close in the middle of the range) after a bearish bar
  bars[n - 4] = { ...bars[n - 4], open: 102, close: 101, high: 102.5, low: 100.5 };
  bars[n - 3] = { ...bars[n - 3], open: 100, close: 100, high: 110, low: 90 };
  // a small bullish bar, then a strong bearish bar that engulfs its range: Bearish Engulfing (and the Doji Bearish
  // Engulfing output, which plots the same condition)
  bars[n - 2] = { ...bars[n - 2], open: 100, close: 101, high: 104, low: 97 };
  bars[n - 1] = { ...bars[n - 1], open: 105, close: 96, high: 105.5, low: 95.5 };
  const res = candles.calculate(bars);
  const ms = res.markers as M[];
  it('gives every marker the id and the look of its plotshape', () => {
    expectShapeIds('all-candlestick-patterns', ms, { color: true });
    expect(new Set(ms.map((m) => m.id)).size).toBeGreaterThan(15);
  });
  it('detects the crafted patterns', () => {
    const at = (i: number) => ms.filter((m) => m.time === bars[i].time).map((m) => m.id);
    expect(at(n - 3)).toContain('shape1');
    expect(at(n - 1)).toContain('shape30');
    expect(at(n - 1)).toContain('shape32');
    expect(idTimes(ms, 'shape32')).toEqual(idTimes(ms, 'shape30'));
  });
});

describe('All in One RSI System: Style ids', () => {
  const bars = walk(1500, 37, 4);
  const res = rsiSystem.calculate(bars, { plotHiddenBull: true, plotHiddenBear: true });
  it('gives every label the id of its plotshape', () => {
    expectShapeIds('all-in-one-rsi-system', res.markers as M[]);
    const ids = new Set((res.markers as M[]).map((m) => m.id));
    for (const id of ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5']) expect(ids.has(id), id).toBe(true);
  });
});

describe('ALLMA Trend Radar: Style ids', () => {
  const bars = walk(1200, 41, 4);
  const all = {
    showUpDown: true, showGreaterLess: true, showUpDownFast: true, showGreaterLessFast: true, showUpDownSlow: true,
    showGreaterLessSlow: true,
  };
  const res = allma.calculate(bars, all);
  it('gives every triangle the id of its plotshape', () => {
    expectShapeIds('allma-trend-radar', res.markers as M[]);
    const ids = new Set((res.markers as M[]).map((m) => m.id));
    expect(ids.size).toBeGreaterThan(6);
    // one output alone gives only its own pair of ids
    const one = allma.calculate(bars, { ...Object.fromEntries(Object.keys(all).map((k) => [k, false])), showUpDownSlow: true });
    expect(new Set((one.markers as M[]).map((m) => m.id))).toEqual(new Set(['shape10', 'shape11']));
  });
});

describe('ALMA Bands', () => {
  const bars = walk(1000, 43, 4);
  const res = almaBands.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expectDecls('alma-bands', almaBands.alertConditions, almaBands.AlmaBands);
  });
  it('fires on the ALMA 1 / ALMA 2 crosses, whatever the show inputs', () => {
    const close = new Series(bars, (b) => b.close);
    const a1 = A(ta.alma(close, 20, 0.85, 6)), a2 = A(ta.alma(close, 20, 0.77, 6));
    const up = crossOver(a1, a2), dn = crossUnder(a1, a2);
    expect(up.some(Boolean) && dn.some(Boolean)).toBe(true);
    expect(res.alerts[0].times).toEqual(flagTimes(bars, up));
    expect(res.alerts[1].times).toEqual(flagTimes(bars, dn));
    const hidden = almaBands.calculate(bars, { showAlma1: false, showAlma2: false });
    expect(hidden.alerts).toEqual(res.alerts);
  });
});

describe('ALMA SD Bands', () => {
  const bars = walk(1500, 47, 5);
  const res = almaSd.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expectDecls('alma-sd-bands-rakoquant', almaSd.alertConditions, almaSd.AlmaSdBandsRakoquant);
  });
  it('fires when the bull / bear regime starts, on confirmed bars', () => {
    const state = res.plots.plot0.map((p) => (p.color === String(color.new(color.lime, 0)) ? 1 : p.color === String(color.new(color.red, 0)) ? -1 : 0));
    const bull = state.map((s, i) => s === 1 && !(i > 0 && state[i - 1] === 1));
    const bear = state.map((s, i) => s === -1 && !(i > 0 && state[i - 1] === -1));
    expect(bull.some(Boolean) && bear.some(Boolean)).toBe(true);
    expect(res.alerts[0].times).toEqual(flagTimes(bars, bull));
    expect(res.alerts[1].times).toEqual(flagTimes(bars, bear));
    // a flip on the last bar: alerted only when the chart says the bar is closed
    const k = timesWhere(bars, (i) => bull[i] || bear[i]).length;
    let cut = bars.length;
    for (let i = bars.length - 1; i > 0; i--) if (bull[i] || bear[i]) { cut = i + 1; break; }
    const head = bars.slice(0, cut);
    const open = almaSd.calculate(head, {}, { lastBarConfirmed: false } as ChartContext);
    const closed = almaSd.calculate(head, {}, { lastBarConfirmed: true } as ChartContext);
    const last = head[head.length - 1].time as number;
    const all = [...closed.alerts[0].times, ...closed.alerts[1].times];
    expect(all).toContain(last);
    expect([...open.alerts[0].times, ...open.alerts[1].times]).not.toContain(last);
    expect(all.length).toBe(k);
  });
});
