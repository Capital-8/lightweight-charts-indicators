# Community Indicator Inventory

Community indicators of `lightweight-charts-indicators`: TypeScript ports of community PineScript scripts, built on
[oakscriptjs](https://github.com/deepentropy/oakscriptJS). Each port has the inputs, plots and drawings of its Pine
source. This list is generated from the indicator registry (`indicatorRegistry` in `src/index.ts`).

## Summary

| | Count |
|---|---|
| **Community indicators** | 1537 |
| Drawn on the price pane (overlay) | 1005 |
| Drawn in their own pane | 532 |
| Compared with reference outputs (batches 1-42 and the most liked set) | 1224 |

| Category | Count |
|---|---|
| Trend | 509 |
| Oscillators | 258 |
| Volume | 189 |
| Momentum | 166 |
| Moving Averages | 154 |
| Channels & Bands | 149 |
| Candlestick Patterns | 59 |
| Volatility | 53 |

## Columns

- **Id**: the registry id (`indicatorRegistry.find((e) => e.id === id)`).
- **Pane**: `price` for an overlay indicator, `own` for an indicator in its own pane (some plots, backgrounds or
  candles of an `own` indicator can still be drawn on the price pane, as Pine `force_overlay`).
- **Author**: the author of the Pine source, from the port header (empty when the header does not name one).
- **Check**: the batch in which the port was compared with reference outputs (BITSTAMP:BTCUSD 1D and NASDAQ:AAPL 1D,
  full histories, default inputs and input variants: plots, colours, fills, markers, bar / background colours and
  candles; for the most liked set also lines, boxes, labels and tables, and intraday bars). Empty for the
  earlier ports.

## Indicators

| # | Indicator | Id | Category | Pane | Author | Check |
|---|---|---|---|---|---|---|
| 1 | %R Trend Exhaustion | `r-trend-exhaustion` | Oscillators | own | upslidedown | most liked |
| 2 | + Average Candle Bodies Range | `average-candle-bodies-range` | Volatility | own | ClassicScott | batch 13 |
| 3 | 1-2-3 Pattern (Expo) | `1-2-3-pattern` | Trend | price | Zeiierman | most liked |
| 4 | 10x Bull Vs. Bear VP Intraday Sessions | `10x-bull-vs-bear-vp-intraday-sessions` | Volume | price | KioseffTrading | most liked |
| 5 | 12/26 EMA Inflection Zones by Korax | `12-26-ema-inflection-zones-by-korax` | Moving Averages | price | Korax | batch 16 |
| 6 | 15-Minute Squeeze Scalper (Traffic Light Edition) | `15-minute-squeeze-scalper` | Volatility | own | Universal_Scalper_Pro | batch 36 |
| 7 | 1m Trend Continuation Signals - SSL + BB Filter | `1m-trend-continuation-signals-ssl-bb-filter` | Trend | price | rhariganesh | batch 13 |
| 8 | 2B Reversal Pattern (Expo) | `2b-reversal-pattern` | Trend | price | Zeiierman | most liked |
| 9 | 3 Bar Reversal | `3-bar-reversal` | Candlestick Patterns | price | abbadon9 | batch 40 |
| 10 | 3 Confirmation Bear | `3-confirmation-bear` | Trend | price | AirianM | batch 16 |
| 11 | 3 Confirmation Bull | `3-confirmation-bull` | Trend | price | AirianM | batch 21 |
| 12 | 3 Lines RCI + Psy Signal + RSI Background | `3-lines-rci-psy-signal-rsi-background` | Oscillators | own | masato19810122 | batch 36 |
| 13 | 3-in-1 Custom Moving Average Indicator | `3-in-1-custom-moving-average-indicator` | Moving Averages | price | Mr-Fish | batch 22 |
| 14 | 3rd Wave | `3rd-wave` | Trend | price | LonesomeTheBlue | most liked |
| 15 | 5-Minute Buy/Sell Signal | `5-minute-buy-sell-signal` | Trend | price | Waqas_Khalid | batch 14 |
| 16 | 72s: Adaptive Hull Moving Average+ | `adaptive-hull-ma` | Moving Averages | price | io72signals |  |
| 17 | <50% Body Candle | `50-body-candle` | Candlestick Patterns | price | Dutchinvestor | batch 38 |
| 18 | [RS] Support and Resistance V0 | `rs-support-resistance` | Channels & Bands | price | RicardoSantos (community) |  |
| 19 | _CM_High_Low_Open_Close_Weekly-Intraday | `cm-high-low-open-close-weekly-intraday` | Channels & Bands | price | ChrisMoody | most liked |
| 20 | _CM_Ultimate_MA_MTF_V4 | `cm-ultimate-ma-mtf-v4` | Moving Averages | price | ChrisMoody | most liked |
| 21 | ABC on Recursive Zigzag | `abc-on-recursive-zigzag` | Trend | price | Trendoscope | most liked |
| 22 | Abdullah | `abdullah` | Trend | price | royalsherry888 | batch 35 |
| 23 | Absolute Strength Index | `absolute-strength-index` | Oscillators | own | Zeiierman | batch 3 |
| 24 | Absorption Arrows v2 | `absorption-arrows-v2` | Volume | price | WaveWalker1 | batch 41 |
| 25 | Absorption Bubbles | `absorption-bubbles` | Volume | price | profitprotrading | most liked |
| 26 | Abusuhil Bullish Candles | `abusuhil-bullish-candles` | Candlestick Patterns | price | abusuhil | batch 38 |
| 27 | Acceleration Bands HTF | `acceleration-bands-htf` | Channels & Bands | price | ZoharCho | batch 18 |
| 28 | Accumulation/Distribution Money Flow v1.0 | `ad-money-flow` | Volume | own | kypexin | batch 8 |
| 29 | Accurate Swing Trading | `accurate-swing-trading` | Trend | price |  |  |
| 30 | Actually Engulfing Candlesticks | `actually-engulfing-candlesticks` | Candlestick Patterns | price | llbot | batch 40 |
| 31 | Adaptive ALMA 2.0 | `adaptive-alma-2-0` | Moving Averages | price | Zomzi | batch 9 |
| 32 | Adaptive Average Sentiment Oscilator | `adaptive-average-sentiment-oscilator` | Oscillators | own | Zomzi | batch 32 |
| 33 | Adaptive Convergence Divergence | `adaptive-convergence-divergence` | Momentum | own | singhxgurjit | batch 21 |
| 34 | Adaptive Ehlers Filtered Percentile | `adaptive-ehlers-filtered-percentile` | Channels & Bands | price | SchizoQuant | batch 4 |
| 35 | Adaptive Entropy Trend | `adaptive-entropy-trend` | Trend | price | QuantAlgo | batch 6 |
| 36 | Adaptive Friction Filter (AFF) | `adaptive-friction-filter` | Trend | price | QuantAlgo | batch 10 |
| 37 | Adaptive Gaussian AFR | `adaptive-gaussian-afr` | Trend | price | Mattes00 | batch 6 |
| 38 | Adaptive Heikin Ashi | `adaptive-heikin-ashi` | Trend | price | chervolino | batch 13 |
| 39 | Adaptive Kinetic Ribbon | `adaptive-kinetic-ribbon` | Trend | price | QuantAlgo | batch 9 |
| 40 | Adaptive MACD | `adaptive-macd` | Momentum | own |  |  |
| 41 | Adaptive ML Trailing Stop | `adaptive-ml-trailing-stop` | Trend | price | BOSWaves | batch 5 |
| 42 | Adaptive Nadaraya-Watson (Non Repainting) | `adaptive-nadaraya-watson` | Channels & Bands | price | Metrify | batch 10 |
| 43 | Adaptive Pivot Zones | `adaptive-pivot-zones` | Channels & Bands | price | Uncle_the_shooter | batch 17 |
| 44 | Adaptive Rolling Z-Score Channel | `adaptive-rolling-z-score-channel` | Channels & Bands | price | B3AR_Trades | batch 18 |
| 45 | Adaptive RSI \| Lyro RS | `adaptive-rsi-lyro-rs` | Oscillators | own | LyroRS | batch 13 |
| 46 | Adaptive Trend Channel | `adaptive-trend-channel` | Channels & Bands | price | MarketStructureLab | batch 4 |
| 47 | Adaptive Trend Finder (log) | `adaptive-trend-finder` | Trend | price | Julien_Eche | most liked |
| 48 | Adaptive Trend Flow [QuantAlgo] | `adaptive-trend-flow` | Trend | price | QuantAlgo |  |
| 49 | Adaptive Volatility-Scaled Oscillator | `adaptive-volatility-scaled-oscillator` | Volatility | own | Zeiierman | batch 4 |
| 50 | Adjusted RSI | `adjusted-rsi` | Oscillators | own | JTCapitalNL | batch 11 |
| 51 | ADR Contraction Tightness | `adr-contraction-tightness` | Volatility | own | etfbreakouts | batch 33 |
| 52 | Advanced Dual Hull Cross Suite v6 - Precision Signals | `advanced-dual-hull-cross-suite-v6-precision-signals` | Moving Averages | price | NitMan279 | batch 36 |
| 53 | Advanced MACD Pro - T3 Themed | `advanced-macd-pro-t3-themed` | Momentum | own | WhiteStone_Ibrahim | batch 27 |
| 54 | Advanced Volume-Driven Breakout Signals | `advanced-volume-driven-breakout-signals` | Volume | price | VolumeVigilante | batch 38 |
| 55 | AdvancedLines (FiboBands) - PaSKaL | `advancedlines-paskal` | Channels & Bands | price | uPaSKaL | batch 19 |
| 56 | ADX and DI | `adx-and-di` | Trend | own | BeikabuOyaji | most liked |
| 57 | ADX and RSI Combo | `adx-and-rsi-combo` | Oscillators | own | Tracks | batch 10 |
| 58 | ADX by cobra | `adx-cobra` | Trend | own | cobra (community) |  |
| 59 | ADX Di+ Di- [Gu5] | `adx-di-gu5` | Trend | own | Gu5tavo71 |  |
| 60 | ADX Extreme Zones + Divergences | `adx-extreme-zones-divergences` | Trend | own | TradeVizion | batch 13 |
| 61 | ADX Trend Strength Filter + TRAMA | `adx-trend-strength-filter-trama` | Trend | price | DotGain | batch 18 |
| 62 | ADX Trend Visualizer with Dual Thresholds | `adx-trend-visualizer-with-dual-thresholds` | Trend | own | crankyprofits | batch 32 |
| 63 | ADX with Shaded Zone | `adx-with-shaded-zone` | Trend | own | MathThomas | batch 20 |
| 64 | ADX-vALMA (N) | `adx-valma` | Trend | own | Zomzi | batch 6 |
| 65 | Aegis Prime Flow | `aegis-prime-flow` | Oscillators | own | wjdtks255 | batch 34 |
| 66 | AG FX - Watermark | `ag-fx-watermark` | Trend | price | AGFXTRADING | most liked |
| 67 | Aggregated Scores Oscillator | `aggregated-scores-oscillator` | Oscillators | own | AlphaExtract | batch 8 |
| 68 | Aggressive Pullback Indicator | `aggressive-pullback-indicator` | Trend | price | ZenAndTheArtOfTrading | batch 1 |
| 69 | Aggressive Volume | `aggressive-volume` | Volume | own | oDouglasAlex | batch 26 |
| 70 | AI Adaptive Oscillator | `ai-adaptive-oscillator` | Oscillators | own | PhenLabs | batch 11 |
| 71 | AI Breakout Bands | `ai-breakout-bands` | Channels & Bands | price | Zeiierman | batch 3 |
| 72 | AI Engulfing Candle | `ai-engulfing` | Candlestick Patterns | price |  |  |
| 73 | AI Infinity | `ai-infinity` | Trend | price | jonathanalbrecht_trader | batch 11 |
| 74 | AI Source Switching Moving Average | `ai-source-switching-moving-average` | Moving Averages | price | Zeiierman | batch 1 |
| 75 | AI Trading Assistant v2 | `ai-trading-assistant-v2` | Trend | price | Alchemical_Carpenter | batch 26 |
| 76 | AI Trend Navigator [K-Neighbor] | `ai-trend-navigator` | Trend | price |  |  |
| 77 | AI Volume Signals | `ai-volume-signals` | Volume | price | szymonsobkowiak | batch 9 |
| 78 | AI-Weighted RSI | `ai-weighted-rsi` | Oscillators | own | Zeiierman | batch 3 |
| 79 | AK MACD BB | `macd-bb` | Momentum | own | Algokid |  |
| 80 | AK TREND ID | `ak-trend-id` | Trend | own | Algokid |  |
| 81 | Al Brooks II.IOI.OO | `al-brooks-ii-ioi-oo` | Candlestick Patterns | price |  | batch 42 |
| 82 | Al Po's Arithmetic Mean | `al-po-s-arithmetic-mean` | Moving Averages | price | sequentialvision | batch 21 |
| 83 | All Candlestick Patterns | `all-candlestick-patterns` | Candlestick Patterns | price |  |  |
| 84 | All-In-One MA Stack Scalper | `all-in-one-ma-stack-scalper` | Moving Averages | price | jonesdaniel2112 | batch 33 |
| 85 | ALL-IN-ONE RSI System (Cloud Divergence Stoch RSI CM WVF) | `all-in-one-rsi-system` | Oscillators | own | ethem11 | batch 25 |
| 86 | AllMA Trend Radar | `allma-trend-radar` | Moving Averages | price | trade_lexx | batch 28 |
| 87 | ALMA SD Bands \| RakoQuant | `alma-sd-bands-rakoquant` | Channels & Bands | price | RakoQuant | batch 10 |
| 88 | Almost Zero Lag EMA | `zero-lag-ema` | Moving Averages | price | LazyBear | most liked |
| 89 | Alpha Trading Signal _ Up side Down | `alpha-trading-signal-up-side-down` | Trend | price | giaodichdsmart | batch 19 |
| 90 | Alpha-Sutte Model | `alpha-sutte-model` | Trend | price | SegaRKO | batch 10 |
| 91 | AlphaTrend | `alpha-trend` | Trend | price | KivancOzbilgic |  |
| 92 | AMD Po3 with Live Edge Stats | `amd-po3-with-live-edge-stats` | Trend | price | WillyAlgoTrader | most liked |
| 93 | Anchored Bollinger Band Range | `anchored-bollinger-band-range` | Channels & Bands | price | Steversteves | batch 20 |
| 94 | Anchored VWAP Pro (Final Visibility Enhanced) | `anchored-vwap-pro` | Volume | price | ImmortalEmerson | batch 17 |
| 95 | Anchored VWAP with Buy/Sell Signals | `anchored-vwap-with-buy-sell-signals` | Volume | price | kmootoo89 | batch 29 |
| 96 | ANDROMEDA - TrendSync | `andromeda-trendsync` | Trend | price | Pedro_Canto | batch 9 |
| 97 | Angle Attack Follow Line Indicator | `angle-attack-follow-line-indicator` | Trend | own | Dreadblitz | most liked |
| 98 | Anti-Volume Stop Loss | `anti-volume-stop` | Trend | price |  |  |
| 99 | Apex Volatility Squeeze & Breakout | `apex-volatility-squeeze-breakout` | Volatility | price | Pineify | batch 33 |
| 100 | Arnaud Legoux Gaussian Flow \| AlphaNatt | `arnaud-legoux-gaussian-flow-alphanatt` | Moving Averages | price | AlphaNatt | batch 17 |
| 101 | Aroon with RSI Confirmation (92.86%) | `aroon-with-rsi-confirmation` | Trend | price | jaydipali622018 | batch 7 |
| 102 | ASDQWE123 2.0 | `asdqwe123-2-0` | Trend | price | luvuoov | batch 34 |
| 103 | Asian & London Session High/Low | `asian-london-session-high-low` | Channels & Bands | price | NikolayBorisov | batch 8 |
| 104 | Ask-Weighted Averages | `ask-weighted-averages` | Volume | price | DinoTradez | batch 27 |
| 105 | Asset risk metrics | `asset-risk-metrics` | Momentum | price | Sweettz | batch 21 |
| 106 | Asymmetric Volatility Trend Line | `asymmetric-volatility-trend-line` | Trend | price | QuantAlgo | batch 4 |
| 107 | ATR Bands | `atr-bands` | Channels & Bands | price | TheTrdFloor | most liked |
| 108 | ATR Based Zigzag w EMA | `atr-based-zigzag-w-ema` | Trend | price | HabibiBudo | batch 4 |
| 109 | ATR HEMA | `atr-hema` | Moving Averages | price | SeerQuant | batch 2 |
| 110 | ATR Period | `nrtr` | Trend | price |  |  |
| 111 | ATR Period | `profit-maximizer` | Moving Averages | price |  |  |
| 112 | ATR Period | `supertrend-ladder` | Trend | price |  |  |
| 113 | ATR Rope | `atr-rope` | Trend | price | SamRecio | batch 2 |
| 114 | ATR Stop Loss Finder | `atr-stop-loss-finder` | Volatility | price | veryfid | most liked |
| 115 | ATR Trailing Stop with ATR Targets | `atr-trailing-stop-with-atr-targets` | Trend | price | TRDRZone | batch 33 |
| 116 | ATR Trailing Stops | `atr-trailing-stops` | Trend | price |  |  |
| 117 | ATR Trend Color | `atr-trend-color` | Trend | price | Aleksin_Aleksandar | batch 31 |
| 118 | ATR Volatility and Trend Analysis | `atr-volatility-and-trend-analysis` | Volatility | price | dchunt-stack | batch 10 |
| 119 | ATR ZLEMA | `atr-zlema` | Trend | price | QuantAlgo | batch 3 |
| 120 | ATR+ Stop Loss Indicator | `atr-plus` | Trend | own | ZenAndTheArtOfTrading |  |
| 121 | ATR-Normalized VWMA Deviation | `atr-normalized-vwma-deviation` | Oscillators | own | exploretranspose | batch 10 |
| 122 | ATR-Scaled Deviation Oscillator | `atr-scaled-deviation-oscillator` | Oscillators | own | C_H_I_P_A | batch 23 |
| 123 | ATR20 SMA x3.5 Trailing Line | `atr20-sma-x3-5-trailing-line` | Volatility | price | hibinomasakazu1991 | batch 30 |
| 124 | Aura Sentiment & Risk Flow | `aura-sentiment-risk-flow` | Oscillators | own | Pineify | batch 34 |
| 125 | Aura Trend & Candlestick Matrix | `aura-trend-candlestick-matrix` | Trend | price | Pineify | batch 9 |
| 126 | Aura Vortex Oscillator | `aura-vortex-oscillator` | Oscillators | own | Pineify | batch 32 |
| 127 | Aura: Adaptive Statistical Smoother | `aura-adaptive-statistical-smoother` | Moving Averages | price | Pineify | batch 15 |
| 128 | Auto AVWAP (Anchored-VWAP) with Breakout Screener | `auto-avwap-with-breakout-screener` | Volume | price | manoharvs | batch 28 |
| 129 | Auto Fib | `auto-fib-theyangguizi` | Channels & Bands | price |  | most liked |
| 130 | Auto Fib Channels by DGT | `auto-fib-channels-by-dgt` | Channels & Bands | price | dgtrd | most liked |
| 131 | Auto Fib Retracement Alerts | `auto-fib-retracement-alerts` | Trend | price | DevLucem | most liked |
| 132 | Auto Fib Speed Resistance Fans by DGT | `auto-fib-speed-resistance-fans-by-dgt` | Trend | price | dgtrd | most liked |
| 133 | Auto Fibo on Indicators | `auto-fibo-indicators` | Oscillators | own | KivancOzbilgic |  |
| 134 | Auto Fibonacci | `auto-fib` | Channels & Bands | price |  |  |
| 135 | Auto PitchFan, Fib Extension/Retracement and ZigZag by DGT | `auto-pitchfan-fib-extension-retracement-and` | Trend | price | dgtrd | most liked |
| 136 | Auto Pitchfork, Fib Retracement and Zig Zag by DGT | `auto-pitchfork-fib-retracement-zig-zag` | Trend | price | dgtrd | most liked |
| 137 | Auto Trendline [DojiEmoji] | `auto-trendline` | Trend | price |  |  |
| 138 | Auto TrendLines Support Resistance Signal Alerts | `auto-trendlines-support-resistance-signal` | Trend | price | TradingFinder | most liked |
| 139 | Auto-Support | `auto-support` | Channels & Bands | price |  |  |
| 140 | Automated Z-scoring | `automated-z-scoring` | Oscillators | own | JTCapitalNL | batch 14 |
| 141 | Automatic Support & Resistance | `auto-support-resistance` | Channels & Bands | price |  |  |
| 142 | Average Bullish & Bearish Percentage Change | `average-bullish-bearish-percentage-change` | Momentum | own | fract | batch 23 |
| 143 | Average Sentiment Oscillator | `average-sentiment-oscillator` | Oscillators | own |  |  |
| 144 | Average True Range Trailing Stops Colored | `atr-trailing-colored` | Trend | price |  |  |
| 145 | Awesome Oscillator V2 | `awesome-oscillator-v2` | Oscillators | own |  |  |
| 146 | Awesome_Accelerator_Zone Oscillator | `awesome-accelerator-zone-oscillator` | Oscillators | own | pirooz_trader | batch 18 |
| 147 | B + A + D v0.4 | `b-a-d-v0-4` | Momentum | own | wepritz84 | batch 13 |
| 148 | BACAP PRICE STRUCTURE 21 EMA TREND | `bacap-price-structure-21-ema-trend` | Trend | price | Alex_PrimeTrading | batch 19 |
| 149 | Banker Fund Flow Trend Oscillator | `banker-fund-flow` | Oscillators | own |  |  |
| 150 | Bar Replay Fix | `bar-replay-fix` | Candlestick Patterns | price | ivanrdgc | batch 42 |
| 151 | BB Breakout Oscillator | `bb-breakout-oscillator` | Oscillators | own | LuxAlgo |  |
| 152 | BB Fibonacci Ratios | `bb-fibonacci-ratios` | Channels & Bands | price |  |  |
| 153 | BB Length | `ideal-bb-ma` | Moving Averages | price |  |  |
| 154 | BB Stochastic RSI Extreme Signal | `bb-stoch-rsi` | Oscillators | price |  |  |
| 155 | Beep Boop | `beep-boop` | Momentum | own | OBSIDE | batch 33 |
| 156 | Bernoulli Process - Binary Entropy | `bernoulli-process-entropy` | Oscillators | own | kocurekc | batch 1 |
| 157 | BEST Supertrend CCI | `supertrend-cci` | Trend | price | Daveatt |  |
| 158 | Beta-Weighted Moving Average | `weighted-ma-function` | Moving Averages | price |  |  |
| 159 | Better Volume Indicator | `better-volume` | Volume | own | LazyBear | most liked |
| 160 | Big Snapper Alerts R3.0 | `big-snapper-alerts` | Trend | price |  |  |
| 161 | Big Trades Detector By HF | `big-trades-detector-by-hf` | Volume | price | Nicolas_Favilla | batch 38 |
| 162 | Big Trades Whale Detector By HK | `big-trades-whale-detector-by-hk` | Volume | price | colacorn | batch 38 |
| 163 | Biggest Volume | `biggest-volume` | Volume | own | mikhail_marka | batch 22 |
| 164 | Bilateral Filter For Loop | `bilateral-filter-for-loop` | Trend | own | BackQuant | batch 14 |
| 165 | Binary Option Arrows | `binary-option-arrows` | Trend | price |  |  |
| 166 | Bitcoin 2Y-SMA Bands\| Astral Vision | `bitcoin-2y-sma-bands-astral-vision` | Channels & Bands | own | AstralVision | batch 34 |
| 167 | Bitcoin Bull/Bear Market Support/Resistance Bands | `bitcoin-bull-bear-market-support-resistance-bands` | Moving Averages | price | JoeSTM | batch 30 |
| 168 | Bitcoin Kill Zones v2 | `bitcoin-kill-zones` | Trend | price |  |  |
| 169 | Bitcoin Log Growth Curves | `bitcoin-log-curves` | Trend | price | Quantadelic |  |
| 170 | Bitcoin: Mayer Multiple | `bitcoin-mayer-multiple` | Oscillators | own | sito4713 | batch 25 |
| 171 | Bitcoin: Pi Cycle Top & Bottom Indicator Z Score | `bitcoin-pi-cycle-top-bottom-indicator-z-score` | Oscillators | own | Commandoum | batch 37 |
| 172 | Bjorgum AutoTrail | `bjorgum-autotrail` | Trend | price | Bjorgum (simplified for auto mode) |  |
| 173 | Bjorgum Key Levels | `bjorgum-key-levels` | Trend | price | Bjorgum | most liked |
| 174 | Bjorgum MTF MA | `bjorgum-mtf-ma` | Moving Averages | price | Bjorgum | most liked |
| 175 | Bjorgum SuperScript | `bjorgum-superscript` | Trend | price | Bjorgum | most liked |
| 176 | Bjorgum TSI | `bjorgum-tsi` | Momentum | own |  |  |
| 177 | Blacklab84 Panel | `blacklab84-panel` | Oscillators | own | blacklab84 | batch 21 |
| 178 | BNF 25/50 MA Pullback Screener (Uptrend-Below / Downtrend-Above) | `bnf-25-50-ma-pullback-screener` | Trend | price | jackson_g_sheehan | batch 35 |
| 179 | Bollinger Adaptive Trend Navigator | `bollinger-adaptive-trend-navigator` | Trend | price | QuantAlgo | batch 16 |
| 180 | Bollinger Awesome Alert R1.1 | `bollinger-awesome-alert` | Trend | price |  |  |
| 181 | Bollinger Free Bars | `bollinger-free-bars` | Channels & Bands | price | pkuliyi | batch 36 |
| 182 | Bollinger Heatmap | `bollinger-heatmap` | Channels & Bands | own | Quantitative | batch 25 |
| 183 | Boom Hunter Pro | `boom-hunter-pro` | Momentum | own | veryfid |  |
| 184 | Breakdown or Buyable Dip? Pullback Depth Can Help | `breakdown-or-buyable-dip-pullback-depth-can-help` | Momentum | own | TradeStation | batch 23 |
| 185 | Breaker Blocks + Order Blocks confirm BBOB Alert | `breaker-blocks-order-blocks-confirm-bbob-alert` | Trend | price | TradingFinder | most liked |
| 186 | Breaker Blocks with Signals | `breaker-blocks-with-signals` | Trend | price | LuxAlgo | most liked |
| 187 | Breakout an Reversal Signal Detector with Colored in Bar Trends | `breakout-an-reversal-signal-detector-with-colored-in-bar-trends` | Channels & Bands | price | AmGlad_Trader | batch 25 |
| 188 | Breakout and Retest Signals | `breakout-and-retest-signals` | Trend | price | AlgoAlpha | most liked |
| 189 | Breakout Finder | `breakout-finder` | Trend | price | LonesomeTheBlue | most liked |
| 190 | Breakout Indicator | `breakout-indicator` | Trend | price | ZenAndTheArtOfTrading | batch 1 |
| 191 | Breakout Pattern Setup | `breakout-pattern-setup` | Channels & Bands | price | WillyAlgoTrader | most liked |
| 192 | Breakout Probability (Expo) | `breakout-probability` | Volatility | price | Zeiierman | most liked |
| 193 | Breakout Targets | `breakout-targets` | Channels & Bands | price | AlgoAlpha | most liked |
| 194 | Breakouts with Tests & Retests | `breakouts-with-tests-retests` | Trend | price | LuxAlgo | most liked |
| 195 | BTC Logarithmic Regression Quantile Bands \| Astral Vision | `btc-logarithmic-regression-quantile-bands-astral-vision` | Channels & Bands | price | AstralVision | batch 24 |
| 196 | Bull Bear Power Trend | `bull-bear-power-trend` | Momentum | own |  |  |
| 197 | Bullish Engulfing Finder | `bullish-engulfing-finder` | Candlestick Patterns | price |  |  |
| 198 | Bullish Volume Anomaly | `bullish-volume-anomaly` | Volume | price | UnknownUnicorn13336802 | batch 31 |
| 199 | Bulls or Bears in Control | `bulls-bears-control` | Trend | own |  |  |
| 200 | Bulls v Bears | `bulls-v-bears` | Momentum | own | Mihkel00 | batch 3 |
| 201 | Buy & Sell - Accurate Signals | `buy-sell-accurate-signals` | Trend | price | Cryptokingworld91 (published as "Buy & Sell - Accurate Signals") | batch 7 |
| 202 | Buy & Sell Pressure | `buy-sell-pressure` | Volume | own |  |  |
| 203 | Buy Low Sell High Composite Upgraded V6 | `buy-low-sell-high-composite-upgraded-v6` | Oscillators | own | kristian6ncqq | batch 15 |
| 204 | Buy on Volume | `buy-on-volume` | Moving Averages | price | Mando4_27 | batch 21 |
| 205 | Buy Sell Signal | `buy-sell-signal-kelfry98` | Trend | price | kelfry98 | most liked |
| 206 | Buy the Dip & Sell the Rip | `buy-the-dip-sell-the-rip` | Momentum | price | vvedding | batch 41 |
| 207 | Buy/Sell Hull Crossover Signals (Fast & Slow) | `buy-sell-hull-crossover-signals` | Moving Averages | price | VibeAlgos | batch 11 |
| 208 | Buyers & Sellers / Range | `buyers-sellers-range` | Oscillators | own | fract | batch 11 |
| 209 | Buyers vs Sellers | `buyers-vs-sellers` | Momentum | own | davorloncarpetrovic | batch 19 |
| 210 | Buying & Selling Pressure | `buying-selling-pressure` | Volatility | own | fract | batch 3 |
| 211 | Buying and Selling Volume Pressure S/R | `buying-and-selling-volume-pressure-s-r` | Volume | price | DinoTradez | batch 16 |
| 212 | Buying Selling Volume | `buying-selling-volume` | Volume | own | ceyhun (community) |  |
| 213 | Buying vs Selling Moving Averages (Scalp Meter) | `buying-vs-selling-moving-averages` | Volume | own | codycolton97 | batch 24 |
| 214 | BuySell Volume Bar Chart | `buysell-volume-bar-chart` | Volume | own | roshbiz1408 | batch 21 |
| 215 | BuySell%_ImtiazH_v2 | `buysell-imtiazh-v2` | Volume | own | a272a59956 | batch 22 |
| 216 | Buyside & Sellside Liquidity | `buyside-sellside-liquidity` | Trend | price | LuxAlgo | most liked |
| 217 | Cabal Dev Indicator | `cabal-dev-indicator` | Oscillators | own | SolanaMemeCoins | batch 26 |
| 218 | Candle Breakout Oscillator | `candle-breakout-oscillator` | Oscillators | own | LuxAlgo | batch 2 |
| 219 | Candle BUY SELL + Support Resistance | `candle-buy-sell-support-resistance` | Channels & Bands | price | JohnsonForexTrader | batch 32 |
| 220 | Candle Channel | `candle-channel` | Channels & Bands | price | Uncle_the_shooter | batch 23 |
| 221 | Candle Color Flip | `candle-color-flip` | Candlestick Patterns | price | LorPlant | batch 42 |
| 222 | Candle Count RSI | `candle-count-rsi` | Oscillators | own | Sherlock_MacGyver | batch 35 |
| 223 | Candle Range Theory (CRT) by Lucas | `candle-range-theory-by-lucas` | Trend | price | lucasfff | batch 15 |
| 224 | Candle Range Theory \| Flux Charts | `candle-range-theory-flux-charts` | Trend | price | fluxchart | most liked |
| 225 | Candle Range Trading (CRT) | `candle-range-trading` | Trend | price | marcostan93 | batch 1 |
| 226 | Candle Spread Oscillator (CS0) | `candle-spread-oscillator` | Oscillators | own | RWCS_LTD | batch 36 |
| 227 | Candle State (The Strat) | `candle-state` | Candlestick Patterns | price | Crinklebine | batch 38 |
| 228 | Candlestick Patterns Identified | `candlestick-patterns-identified` | Candlestick Patterns | price | repo32 | batch 38 |
| 229 | Candlestick Reversal | `candlestick-reversal` | Candlestick Patterns | price | LonesomeTheBlue (community) |  |
| 230 | Candlestick Structure | `candlestick-structure` | Candlestick Patterns | price | LuxAlgo | most liked |
| 231 | Candlestick Trend Indicator v0.5 by JustUncleL | `candlestick-trend-indicator` | Trend | price | JustUncleL | most liked |
| 232 | Cardwell RSI by TQ | `cardwell-rsi-by-tq` | Oscillators | own | TradeQUO | batch 24 |
| 233 | Carrier Volatility | `carrier-volatility` | Oscillators | own | et20tradeview | batch 15 |
| 234 | CBC Flip with Volume | `cbc-flip-with-volume` | Trend | price | PtGambler | batch 18 |
| 235 | CCI coded OBV | `cci-obv` | Oscillators | own | LazyBear |  |
| 236 | CCI Pro | `cci-hash-capital` | Oscillators | own | Hash_Capital | batch 24 |
| 237 | CCI Stochastic | `cci-stochastic` | Momentum | own | Daveatt | most liked |
| 238 | CCT Bollinger Band Oscillator | `cct-bbo` | Oscillators | own | LazyBear |  |
| 239 | CD_Average Daily Range Zones- highs and lows of the day | `cd-average-daily-range-zones-highs-and-lows` | Volatility | price | cristian.d | most liked |
| 240 | CDC Action Zone | `cdc-action-zone` | Trend | price |  |  |
| 241 | Center of Gravity Channel | `cog-channel` | Channels & Bands | price |  |  |
| 242 | CHAKRA RISS ENGULFING CANDLESTICK STRATEGY | `chakra-riss-engulfing-candlestick-strategy` | Momentum | price | Tradewith_Riss | batch 18 |
| 243 | Chandelier Exit | `chandelier-exit` | Trend | price |  |  |
| 244 | Chandelier Stop | `chandelier-stop` | Trend | price |  |  |
| 245 | Change in State of Delivery CISD | `change-in-state-of-delivery-cisd` | Trend | price | AlgoAlpha | most liked |
| 246 | Change-Point Detection (CUSUM) | `change-point-detection` | Trend | price | LuxAlgo | batch 6 |
| 247 | Channels With Patterns | `channels-with-patterns` | Channels & Bands | price | ChartPrime | most liked |
| 248 | CHN BUY SELL with EMA 200 | `chn-buy-sell-with-ema-200` | Trend | price | CHNTeam | batch 10 |
| 249 | Clean Buy Sell Pro | `clean-buy-sell-pro` | Trend | price | JohnsonForexTrader | batch 40 |
| 250 | Clean Volume Bars (Green/Red + Above Avg Highlight) | `clean-volume-bars` | Volume | own | melospoker80 | batch 37 |
| 251 | Climax Volume Reversal Radar | `climax-volume-reversal-radar` | Volume | own | Ty_yanse | batch 31 |
| 252 | Clustering Volatility (ATR-ADR-ChaikinVol) | `clustering-volatility` | Volatility | own | SDF-Solutions | batch 24 |
| 253 | Clusters Volume Profile | `clusters-volume-profile` | Volume | price | LuxAlgo | most liked |
| 254 | CM EMA Trend Bars | `cm-ema-trend-bars` | Trend | price | ChrisMoody |  |
| 255 | CM Enhanced Ichimoku Cloud V5 | `cm-enhanced-ichimoku` | Channels & Bands | price | ChrisMoody (community) |  |
| 256 | CM Gann Swing High Low V2 | `cm-gann-swing` | Trend | price | ChrisMoody (community) |  |
| 257 | CM Guppy EMA | `cm-guppy-ema` | Moving Averages | price | ChrisMoody |  |
| 258 | CM Heikin-Ashi | `cm-heikin-ashi` | Candlestick Patterns | price | ChrisMoody |  |
| 259 | CM Laguerre PPO PercentileRank | `cm-laguerre-ppo` | Oscillators | own | ChrisMoody |  |
| 260 | CM MACD Custom Indicator - Multiple Time Frame - V2 | `cm-macd-custom-mtf-v5` | Momentum | own | ChrisMoody | most liked |
| 261 | CM Price Action Bars | `cm-price-action` | Oscillators | price | ChrisMoody |  |
| 262 | CM RSI Plus EMA | `cm-rsi-ema` | Oscillators | own | ChrisMoody |  |
| 263 | CM RSI-2 Strategy Lower | `cm-rsi-2-lower` | Oscillators | own | ChrisMoody |  |
| 264 | CM RSI-2 Strategy Upper | `cm-rsi-2-upper` | Oscillators | price | ChrisMoody |  |
| 265 | CM Sling Shot System | `cm-sling-shot` | Trend | price | ChrisMoody |  |
| 266 | CM Stochastic Highlight Bars | `cm-stoch-highlight` | Oscillators | price | ChrisMoody |  |
| 267 | CM Stochastic Multi-TimeFrame | `cm-stochastic-mtf` | Oscillators | own | ChrisMoody | most liked |
| 268 | CM Stochastic POP Method 1 | `stoch-pop-1` | Oscillators | own | ChrisMoody |  |
| 269 | CM Stochastic POP Method 2 | `stoch-pop-2` | Oscillators | own | ChrisMoody |  |
| 270 | CM Time Based Vertical Lines | `cm-time-lines` | Trend | price | ChrisMoody |  |
| 271 | CM Williams Vix Fix V3 | `cm-vix-fix-v3` | Oscillators | own | ChrisMoody |  |
| 272 | CM_Parabolic SAR | `cm-parabolic-sar` | Trend | price | ChrisMoody | most liked |
| 273 | CM_Pivot Points_M-W-D-4H-1H_Filtered | `cm-pivot-points-filtered` | Trend | price | ChrisMoody | most liked |
| 274 | CM_Ultimate RSI Multi Time Frame | `cm-ultimate-rsi-mtf` | Oscillators | own | ChrisMoody | most liked |
| 275 | CM_Ultimate_MA_MTF_V2 | `cm-ultimate-ma-mtf-v2` | Moving Averages | price | ChrisMoody | most liked |
| 276 | CM_Williams_Vix_Fix_V3_Upper_Text Plots | `cm-vix-fix-v3-upper-text-plots` | Volatility | price | ChrisMoody | most liked |
| 277 | CMO For Loop \| QuantLapse | `cmo-for-loop-quantlapse` | Momentum | own | QuantLapse | batch 19 |
| 278 | Colored Volume Bars | `colored-volume` | Volume | own | LazyBear |  |
| 279 | Combined Up down with volume | `combined-up-down-with-volume` | Volume | price | ChartMantra_ | batch 41 |
| 280 | Combo Oscillator - MACD + Stoch + RSI + EMA | `combo-oscillator-macd-stoch-rsi-ema` | Oscillators | own | Gauder84 | batch 34 |
| 281 | Community MoneyLine | `community-moneyline` | Trend | price | rafstar_kaczmarek | batch 12 |
| 282 | Composite Indicator (CCI + ATR) | `composite-indicator` | Momentum | price | CharLi0t | batch 17 |
| 283 | Comprehensive Trading Toolkit | `comprehensive-trading-toolkit` | Oscillators | own | BigBeluga | most liked |
| 284 | Consecutive Candles DevisSo | `consecutive-candles-devisso` | Trend | price | engineerofmoney | batch 11 |
| 285 | Consecutive Higher/Lower Closings | `consecutive-higher-lower-closings` | Trend | price | rahul_joshi_2 | batch 39 |
| 286 | Consolidation Range with Signals | `consolidation-range-with-signals` | Volatility | price | Zeiierman | most liked |
| 287 | Consolidation Zones - Live | `consolidation-zones` | Channels & Bands | price | LonesomeTheBlue |  |
| 288 | Conversion Periods | `ichimoku-oscillator` | Momentum | own |  |  |
| 289 | Coral Trend | `coral-trend` | Trend | price | LazyBear |  |
| 290 | Corrected Moving Average | `corrected-moving-average` | Moving Averages | price | everget | batch 3 |
| 291 | COV Bands ~ C H I P A | `cov-bands-c-h-i-p-a` | Channels & Bands | own | C_H_I_P_A | batch 28 |
| 292 | Crosby Ratio \| QuantumResearch | `crosby-ratio-quantumresearch` | Momentum | own | QuantumResearch | batch 17 |
| 293 | Crossover EMMM | `crossover-emmm` | Trend | price | NunyadzilaTrading | batch 22 |
| 294 | CRT indicator | `crt-indicator` | Trend | price | INTELA | batch 16 |
| 295 | Cumulative Delta Volume | `cumulative-delta-volume` | Volume | own | LonesomeTheBlue | most liked |
| 296 | Cumulative Volume Delta Divergence Periodic EMA | `cumulative-volume-delta-divergence-periodic` | Volume | own | TradingFinder | most liked |
| 297 | Cumulative Volume Delta Strategy \| Flux Charts | `cumulative-volume-delta-strategy-flux-charts` | Volume | price | fluxchart | most liked |
| 298 | Cup Finder | `cup-finder` | Trend | price | LonesomeTheBlue | most liked |
| 299 | Curved Trend Channels | `curved-trend-channels` | Channels & Bands | price | Zeiierman | batch 7 |
| 300 | Custom Buy and Sell Signal with Body Ratio and RSI | `custom-buy-and-sell-signal-with-body-ratio-and-rsi` | Momentum | price | am-solaris | batch 38 |
| 301 | Custom Donchian Channels | `donchian-custom` | Channels & Bands | price |  |  |
| 302 | Customizable RSI/StochRSI Double Confirmation | `customizable-rsi-stochrsi-double-confirmation` | Momentum | price | smile_bad_day | batch 42 |
| 303 | CVD & Big Trade Detector By HK | `cvd-big-trade-detector-by-hk` | Volume | own | colacorn | batch 39 |
| 304 | CVD (Cumulative Volume Delta) | `cvd-rupward` | Volume | own | RUpward | batch 19 |
| 305 | CVD Divergence Background By HK | `cvd-divergence-background-by-hk` | Volume | price | colacorn | batch 42 |
| 306 | CVD Polarity Indicator (With Rolling Smoothed) | `cvd-polarity-indicator` | Volume | own | Cruiser | batch 35 |
| 307 | CVD Reversal Divergence (Exhaustion) | `cvd-reversal-divergence` | Volume | price | somnacin | batch 39 |
| 308 | Cycle & Flow Indicator - D_Quant | `cycle-flow-indicator-d-quant` | Trend | price | D_QUANT | batch 22 |
| 309 | Cycle Low (RSI + StochRSI) – v5 John.K | `cycle-low-v5-john-k` | Momentum | price | John_Kal | batch 22 |
| 310 | Cycle-Synced Channel Breakout | `cycle-synced-channel-breakout` | Channels & Bands | price | TradeTechanalysis | batch 25 |
| 311 | Daily Weekly Monthly Yearly Opens | `daily-weekly-monthly-yearly-opens` | Trend | price | sbtnc | most liked |
| 312 | Dan's Ironclad OB - Simple | `dan-s-ironclad-ob-simple` | Trend | price | hynaxiii | batch 10 |
| 313 | Darvas Box | `darvas-box` | Candlestick Patterns | price |  |  |
| 314 | Dead Simple Reversal | `dead-simple-reversal` | Candlestick Patterns | price | B3AR_Trades (converted from "p2f - Dead Simple Reversal" by paidtofade; | batch 41 |
| 315 | DECODE Moving Average Toolkit | `decode-moving-average-toolkit` | Moving Averages | price | decodejar | batch 20 |
| 316 | Delta Flow Profile | `delta-flow-profile` | Volume | price | LuxAlgo | most liked |
| 317 | Delta Manipulation Footprint | `delta-manipulation-footprint` | Volume | price | destrobr0685 | batch 39 |
| 318 | Delta Volume RSI | `delta-volume-rsi` | Volume | own | destrobr0685 | batch 24 |
| 319 | Delta Zones Buy/Sell Pressure | `delta-zones-buy-sell-pressure` | Volume | price | NathanTradeus | most liked |
| 320 | Delta-RSI Oscillator | `delta-rsi-oscillator` | Momentum | own | tbiktag (simplified) |  |
| 321 | DeltaFlow Volume Profile | `deltaflow-volume-profile` | Volume | price | BigBeluga | most liked |
| 322 | DEMA Flow | `dema-flow` | Trend | price | AlphaExtract | batch 7 |
| 323 | Demand Index (James Sibbet) | `demand-index` | Volume | own | conair | batch 37 |
| 324 | Deviation Symmetry Breaker ~ C H I P A | `deviation-symmetry-breaker-c-h-i-p-a` | Channels & Bands | own | C_H_I_P_A | batch 18 |
| 325 | Deviation Trend Profile | `deviation-trend-profile` | Trend | price | BigBeluga | most liked |
| 326 | Dip & Rip Patterns - The Quant Science | `dip-rip-patterns-the-quant-science` | Volatility | price | thequantscience | batch 39 |
| 327 | Dip Buy/Sell Signals (Vix Fix + MA Deviation + TRMAD) | `dip-buy-sell-signals` | Volatility | price | DotGain | batch 42 |
| 328 | Directional Indicator Crossovers v1 | `directional-indicator-crossovers-v1` | Trend | own | JopAlgo | batch 7 |
| 329 | Directional Logistic Oscillator | `directional-logistic-oscillator` | Oscillators | own | GainzAlgo | batch 2 |
| 330 | Directional Movement Index + ADX & Key Levels | `dmi-adx-levels` | Trend | own |  |  |
| 331 | Disparity Index | `disparity-index` | Oscillators | own | HPotter | batch 10 |
| 332 | Divergence for many indicator v3 | `divergence-for-many-indicator-v3` | Momentum | price | LonesomeTheBlue | most liked |
| 333 | Divergence for Many Indicators v4 | `divergence-for-many-indicators-v4` | Momentum | price | LonesomeTheBlue | most liked |
| 334 | Divergence Indicator | `divergence-indicator` | Momentum | price |  |  |
| 335 | Divergence Screener | `divergence-screener` | Oscillators | own | Trendoscope | most liked |
| 336 | DMI Delta by 0xjcf | `dmi-delta-by-0xjcf` | Trend | own | J_O_S_E_ | batch 34 |
| 337 | DMI Histogram Indicator | `dmi-histogram-indicator` | Trend | own | Chart0bserver | batch 32 |
| 338 | DN MACD | `dn-macd` | Momentum | own | lihulu123 | batch 32 |
| 339 | Dominance Signal Apex | `dominance-signal-apex` | Trend | price | chervolino | batch 17 |
| 340 | DonAlt - Smart Money Toolkit | `donalt-smart-money-toolkit` | Trend | price | BigBeluga | most liked |
| 341 | Donchian Reversal Signals with Labels | `donchian-reversal-signals-with-labels` | Channels & Bands | price | Trader-Hitesh | batch 40 |
| 342 | Donchian Trend Ribbon | `donchian-trend-ribbon` | Trend | own | LonesomeTheBlue |  |
| 343 | Dope DPO | `dope-dpo` | Oscillators | own | Sherlock_MacGyver | batch 14 |
| 344 | Double Median ATR Bands \| MisinkoMaster | `double-median-atr-bands-misinkomaster` | Channels & Bands | price | MisinkoMaster | batch 28 |
| 345 | Double Median SD Bands \| MisinkoMaster | `double-median-sd-bands-misinkomaster` | Channels & Bands | price | MisinkoMaster | batch 30 |
| 346 | Double RSI | `double-rsi` | Momentum | own | Clokivez | batch 9 |
| 347 | Double Zig Zag with HHLL | `double-zig-zag-with-hhll` | Trend | price | LonesomeTheBlue | most liked |
| 348 | DR/IDR V1 | `dr-idr-v1` | Volatility | price | TheMas7er | most liked |
| 349 | DTFX Algo Zones | `dtfx-algo-zones` | Trend | price | LuxAlgo | most liked |
| 350 | Dual Bayesian For Loop | `dual-bayesian-for-loop` | Momentum | own | QuantAlgo | batch 5 |
| 351 | Dual EMA Trend Ribbon (Multi-Timeframe Trend Confirmation) | `dual-ema-trend-ribbon` | Moving Averages | price | Aleksin_Aleksandar | batch 3 |
| 352 | Dual MA SD Oscillator | `dual-ma-sd-oscillator` | Oscillators | own | SchizoQuant | batch 9 |
| 353 | Dual RSI Smoother | `dual-rsi-smoother` | Oscillators | own | TheUltimator5 | batch 8 |
| 354 | Dynamic Flow Ribbons | `dynamic-flow-ribbons` | Trend | price | BigBeluga | batch 2 |
| 355 | Dynamic Fractal Flow | `dynamic-fractal-flow` | Oscillators | own | AlphaExtract | batch 21 |
| 356 | Dynamic Linear Regression Channels | `dynamic-linear-regression-channels` | Channels & Bands | price | iravan | most liked |
| 357 | Dynamic Liquidity HeatMap Profile | `dynamic-liquidity-heatmap-profile` | Volume | price | BigBeluga | most liked |
| 358 | Dynamic Score PSAR | `dynamic-score-psar` | Trend | own | QuantAlgo | batch 8 |
| 359 | Dynamic Stop Loss & Take Profit | `dynamic-stop-loss-take-profit` | Volatility | price | criptoblast2 | batch 23 |
| 360 | Dynamic Structure Indicator | `dynamic-structure-indicator` | Trend | price |  |  |
| 361 | Dynamic Supply and Demand Zones | `dynamic-supply-and-demand-zones` | Volume | price | AlgoAlpha | most liked |
| 362 | Dynamic Support & Resistance | `dynamic-support-resistance` | Moving Averages | price | ZenAndTheArtOfTrading | batch 1 |
| 363 | Dynamic Swing Anchored VWAP | `dynamic-swing-anchored-vwap` | Volume | price | Zeiierman | most liked |
| 364 | Dynamic Testing | `dynamic-testing` | Oscillators | price | ProfitNomad | batch 9 |
| 365 | Dynamic Trailing | `dynamic-trailing` | Trend | price | Zeiierman | batch 5 |
| 366 | Dynamic Trend Bands | `dynamic-trend-bands` | Channels & Bands | price | ChartPrime | batch 2 |
| 367 | Dynamic Trend Channel (DTC) | `dynamic-trend-channel` | Channels & Bands | price | JohnsonForexTrader | batch 27 |
| 368 | Dynamic Volatility Filter | `dynamic-volatility-filter` | Trend | price | QuantAlgo | batch 4 |
| 369 | Dynamic Volume Clusters with Retest Signals | `dynamic-volume-clusters` | Channels & Bands | price | Zeiierman | batch 2 |
| 370 | Dynamic Volume Profile Oscillator | `dynamic-volume-profile-oscillator` | Volume | own | AlphaNatt | batch 1 |
| 371 | Dynamic VWAP: Fair Value & Divergence Suite | `dynamic-vwap-fair-value-divergence-suite` | Channels & Bands | price | RWCS_LTD | batch 30 |
| 372 | E9 Bollinger Range | `e9-bollinger-range` | Channels & Bands | price | E9XBT | batch 34 |
| 373 | Eagles Compass | `eagles-compass` | Candlestick Patterns | price | zenmarkets | batch 40 |
| 374 | Early MACD Reversal Indicator | `early-macd-reversal-indicator` | Momentum | own | StockSignaler | batch 10 |
| 375 | Early Pivot Alert (price-quantum reversal) • v1a (arrows only) | `early-pivot-alert-v1a` | Trend | price | dirkbiebaut | batch 35 |
| 376 | Easy Entry/Exit Trend Colors | `easy-trend-colors` | Trend | own |  |  |
| 377 | Edward Smart Channel Reversal | `edward-smart-channel-reversal` | Channels & Bands | price | Jos-ProTrader | batch 13 |
| 378 | Effective FVG Indicator - Imran | `effective-fvg-indicator-imran` | Volume | price | imrancrypto | batch 40 |
| 379 | Effective Volume Z-Score | `effective-volume-z-score` | Volume | own | eugencovaci | batch 35 |
| 380 | Efficiency Ratio Trend | `efficiency-ratio-trend` | Trend | price | achirameegasthanne | batch 9 |
| 381 | Ehlers Adaptive RSI | `ehlers-adaptive-rsi` | Oscillators | own | Julien_Exe | batch 14 |
| 382 | Ehlers Adaptive Trend Indicator | `ehlers-adaptive-trend-indicator` | Trend | price | AlphaExtract | batch 18 |
| 383 | Ehlers Instantaneous Trend | `ehlers-instantaneous-trend` | Trend | price |  |  |
| 384 | Ehlers Maclaurin Ultimate Smoother | `ehlers-maclaurin-ultimate-smoother` | Moving Averages | own | Mupsje | batch 33 |
| 385 | Ehlers MESA Adaptive Moving Average | `ehlers-mesa-ma` | Moving Averages | price | Ehlers |  |
| 386 | Ehlers Regime Dynamic Candles | `ehlers-regime-dynamic-candles` | Candlestick Patterns | price | sizzlinsoft | batch 39 |
| 387 | Ehlers Reverse EMA | `ehlers-reverse-ema` | Oscillators | own | AlgoCollective | batch 36 |
| 388 | Ehlers Stochastic CG Oscillator | `ehlers-stochastic-cg` | Oscillators | own |  |  |
| 389 | Elite Oscillator Pro | `elite-oscillator-pro` | Oscillators | own | Alpha_Wizard | batch 34 |
| 390 | Elliott Wave | `elliott-wave` | Trend | price | LuxAlgo | most liked |
| 391 | Elliott Wave Oscillator | `elliott-wave-oscillator` | Oscillators | own | Koryu |  |
| 392 | Elliott Wave Oscillator Signals by DGT | `elliott-wave-oscillator-signals-by-dgt` | Oscillators | price | dgtrd | most liked |
| 393 | Elliptic Curve SAR | `elliptic-curve-sar` | Trend | price | TEDCORP2 | batch 26 |
| 394 | EMA & MA Crossover | `ema-ma-crossover` | Moving Averages | price |  |  |
| 395 | EMA & MACD Strategy with SL/TP | `ema-macd-strategy-with-sl-tp` | Trend | price | mamachi- | batch 28 |
| 396 | EMA + RSI Autotrade Webhook - Varun | `ema-rsi-autotrade-webhook-varun` | Moving Averages | price | varuns_back | batch 17 |
| 397 | EMA + SuperTrend | `ema-supertrend` | Moving Averages | price | All_in_Traders |  |
| 398 | EMA + VWMA + ATR Smoothed BuySell (merged) - TOM ZENG 202509 | `ema-vwma-atr-smoothed-buysell-tom-zeng-202509` | Trend | price | zengtom | batch 18 |
| 399 | EMA 20/50/100/200 | `ema-multi` | Moving Averages | price |  |  |
| 400 | EMA 9 / 26 Cross | `ema-9-26-cross` | Moving Averages | price | h0s1m001 | batch 27 |
| 401 | EMA Cloud Trend | `ema-cloud-trend` | Moving Averages | price | ZkalishTR | batch 9 |
| 402 | EMA Cross Signals | `ema-cross-signals` | Moving Averages | price | Jos-ProTrader | batch 29 |
| 403 | EMA Enveloper | `ema-enveloper` | Moving Averages | price |  |  |
| 404 | EMA Oscillator | `ema-oscillator` | Oscillators | own | AlphaExtract | batch 16 |
| 405 | EMA Ribbon | `ema-ribbon` | Moving Averages | price |  |  |
| 406 | EMA Wave Indicator | `ema-wave` | Moving Averages | own |  |  |
| 407 | EMA/RMA clouds by Alpachino | `ema-rma-clouds-by-alpachino` | Moving Averages | price | Alpachino97 | batch 28 |
| 408 | EMA21 Pullback Buy | `ema21-pullback-buy` | Moving Averages | price | Kennedy08 | batch 23 |
| 409 | Emergent Rays - NovaTheMachine | `emergent-rays-novathemachine` | Moving Averages | price | NovaTheMachine | batch 32 |
| 410 | Engulfing + Sweep (Confirmed Only) v6 - bars only | `engulfing-sweep-v6-bars-only` | Candlestick Patterns | price | fanta-grapefruit | batch 38 |
| 411 | Engulfing Candle Indicator | `engulfing-candle-indicator` | Candlestick Patterns | price | The_Forex_Steward | batch 41 |
| 412 | Engulfing Sweeps - Milana Trades | `engulfing-sweeps-milana-trades` | Candlestick Patterns | price | MilanaArsenovna | batch 38 |
| 413 | Enhanced KLSE Banker Flow Oscillator | `enhanced-klse-banker-flow-oscillator` | Oscillators | own | Dr_Leong_Yee_Rock | batch 15 |
| 414 | Enhanced VFI Buyer/Seller Pressure | `enhanced-vfi-buyer-seller-pressure` | Volume | own | ask2maniish | batch 28 |
| 415 | Enhanced VSA Volume & Candle Colors with MA Selection | `enhanced-vsa-volume-candle-colors-with-ma-selection` | Volume | own | ViZiV | batch 27 |
| 416 | Entropy Bands | `entropy-bands` | Channels & Bands | price | TechnoBlooms | batch 20 |
| 417 | Entry / TP / SL Alert Bands (Simple & Stable) | `entry-tp-sl-alert-bands` | Channels & Bands | price | drlicht1 | batch 34 |
| 418 | Entry Points | `entry-points` | Oscillators | price |  |  |
| 419 | Entry Signals (Long/Short) | `entry-signals-long-short` | Trend | price | tradegear9 | batch 1 |
| 420 | Envelope RSI | `envelope-rsi` | Oscillators | price | Saleh_Toodarvari |  |
| 421 | EQH/EQL Liquidity Zones | `eqh-eql-liquidity-zones` | Volume | price | LuxAlgo | most liked |
| 422 | Equalhigh JAPANESE TRIPLE RCI | `equalhigh-japanese-triple-rci` | Oscillators | own | Stevesyl | batch 22 |
| 423 | ERD: Effort-Result Diagnostic | `erd-effort-result-diagnostic` | Channels & Bands | price | DarwinDarma | batch 32 |
| 424 | EREMA Signals | `erema-signals` | Trend | price | AlgoCollective | batch 39 |
| 425 | Euclidean Range | `euclidean-range` | Volatility | own | InvestorUnknown | batch 21 |
| 426 | EURUSD Swing High/Low Projection | `eurusd-swing-high-low-projection` | Channels & Bands | price | tiprolin | batch 37 |
| 427 | Evil MACD Trading System (Pine Script v6) | `evil-macd-trading-system` | Momentum | price | daves723 | batch 37 |
| 428 | EVWMA Envelope | `evwma-envelope` | Oscillators | price |  |  |
| 429 | Exhaustion Zone | `exhaustion-zone` | Channels & Bands | price | rukich | batch 6 |
| 430 | Fair Value Gap | `fair-value-gap-luxalgo` | Trend | price | LuxAlgo | most liked |
| 431 | Fair Value Gap Absorption Indicator | `fair-value-gap-absorption-indicator` | Trend | price | LuxAlgo | most liked |
| 432 | Fair Value Gaps (Volumetric) \| Flux Charts | `fair-value-gaps-flux-charts` | Trend | price | fluxchart | most liked |
| 433 | Faith Indicator | `faith-indicator` | Trend | own |  |  |
| 434 | False Breakout (Expo) | `false-breakout` | Channels & Bands | price | Zeiierman |  |
| 435 | Faraz Perfect Structure Scalper + Long Short (Indicator Alerts) | `faraz-perfect-structure-scalper-long-short` | Trend | price | fsaleem03 | batch 29 |
| 436 | Fast Length | `bjorgum-triple-ema` | Moving Averages | price |  |  |
| 437 | Fast WMA | `fast-wma` | Moving Averages | own | Clokivez | batch 25 |
| 438 | Fastlane | `fastlane` | Volume | price | HB5 | batch 40 |
| 439 | Fibo Levels with Volume Profile and Targets | `fibo-levels-with-volume-profile-and-targets` | Volume | price | ChartPrime | most liked |
| 440 | Fibonacci Auto Trend Scouter | `fibonacci-auto-trend-scouter` | Trend | price | sirkriz | most liked |
| 441 | Fibonacci Bollinger Bands | `fibonacci-bollinger-bands` | Channels & Bands | price | Rashad |  |
| 442 | Fibonacci Confluence Toolkit | `fibonacci-confluence-toolkit` | Trend | price | LuxAlgo | most liked |
| 443 | Fibonacci Extension / Retracement / Pivot Points by DGT | `fibonacci-extension-retracement-pivot-points` | Trend | price | dgtrd | most liked |
| 444 | Fibonacci HH LL TRAMA Band | `fibonacci-hh-ll-trama-band` | Channels & Bands | price | FibonacciFlux | batch 16 |
| 445 | Fibonacci Levels | `fibonacci-levels` | Channels & Bands | price |  |  |
| 446 | Fibonacci Moving Averages | `fibonacci-moving-averages` | Moving Averages | price | UkutaLabs | batch 28 |
| 447 | Fibonacci Projection with Volume & Delta Profile | `fibonacci-projection-with-volume-delta-profile` | Volume | price | Zeiierman | most liked |
| 448 | Fibonacci Ranges (Real-Time) | `fibonacci-ranges` | Channels & Bands | price | LuxAlgo | most liked |
| 449 | Fibonacci Structure Engine | `fibonacci-structure-engine` | Trend | price | WillyAlgoTrader | most liked |
| 450 | Fibonacci Time-Price Zones | `fibonacci-time-price-zones` | Trend | price | xxattaxx | most liked |
| 451 | Fibonacci Trend | `fibonacci-trend` | Trend | price | ChartPrime | most liked |
| 452 | Fibonacci Weighted Moving Average | `fibonacci-weighted-moving-average` | Moving Averages | price | everget | batch 12 |
| 453 | Fibonacci Zone | `fibonacci-zone` | Channels & Bands | price |  |  |
| 454 | FibSync - DynamicFibSupport | `fibsync-dynamicfibsupport` | Channels & Bands | price | mr_uponly | batch 34 |
| 455 | Filter Ribbon | `filter-ribbon` | Trend | price | c9indicator | batch 4 |
| 456 | Filter Wave | `filter-wave` | Trend | price | c9indicator | batch 15 |
| 457 | Fisher MPz | `fisher-mpz` | Oscillators | own | B3AR_Trades | batch 30 |
| 458 | Fisher Volume Transform \| AlphaNatt | `fisher-volume-transform-alphanatt` | Oscillators | own | AlphaNatt | batch 16 |
| 459 | Fixed-Range Volume-Profile Zones | `fixed-range-volume-profile-zones` | Volume | own | RWCS_LTD | batch 13 |
| 460 | Flow Control Oscillator (FCO) | `flow-control-oscillator` | Volume | own | WalrusQuant | batch 19 |
| 461 | FlowShift Oscillator | `flowshift-oscillator` | Oscillators | own | BOSWaves | batch 24 |
| 462 | FluidTrades - SMC Lite | `fluidtrades-smc-lite` | Trend | price | Pmgjiv | most liked |
| 463 | Follow Line | `follow-line` | Trend | price | Dreadblitz |  |
| 464 | For-Loop Vote Trailing Stop \| MiesOnCharts | `for-loop-vote-trailing-stop-miesoncharts` | Trend | price | MiesOnCharts | batch 31 |
| 465 | Force Pulse | `force-pulse` | Oscillators | own | Uncle_the_shooter | batch 17 |
| 466 | Forecast Oscillator | `forecast-oscillator` | Oscillators | own | KivancOzbilgic |  |
| 467 | Forex Sessions | `forex-sessions` | Oscillators | own |  |  |
| 468 | Fourier series Model Of The Market | `fourier-series-model-of-the-market` | Oscillators | own | e2e4 | batch 12 |
| 469 | Fractal Exhaustion Band | `fractal-exhaustion-band` | Trend | price | QuantAlgo | batch 2 |
| 470 | Fractal Strength Oscillator | `fractal-strength-oscillator` | Oscillators | own | SurgeQuant | batch 20 |
| 471 | Fractals Trend | `fractals-trend` | Trend | price | BigBeluga | batch 2 |
| 472 | Fractals V9 | `fractals-v9` | Trend | price | RicardoSantos | most liked |
| 473 | Fractional EMA Kalman Filter | `fractional-ema-kalman-filter` | Moving Averages | price | et20tradeview | batch 4 |
| 474 | FSVZO | `fsvzo` | Volume | own | AlphaExtract | batch 5 |
| 475 | Full Candle Higher/Lower (No Repeats) | `full-candle-higher-lower` | Candlestick Patterns | price | devtiqo | batch 41 |
| 476 | Function Savitzky Golay Filter with 7 Vectors V0 | `function-savitzky-golay-filter-with-7-vectors-v0` | Moving Averages | price | RicardoSantos | batch 33 |
| 477 | FuTech V-Spike & V-Highlighter | `futech-v-spike-v-highlighter` | Volume | price | Atmiya_aatubhai | batch 39 |
| 478 | Future Trend Channel | `future-trend-channel` | Channels & Bands | price | ChartPrime | most liked |
| 479 | FVG & IFVG ICT Inversion Fair Value Gap Signal | `fvg-ifvg-ict-inversion-fair-value-gap-signal` | Trend | price | TradingFinder | most liked |
| 480 | FVG Breakout/Breakdown | `fvg-breakout-breakdown` | Trend | price | ICT_Concept_Trading | batch 33 |
| 481 | FVG Candle Highlighter | `fvg-candle-highlighter` | Volatility | price | SmellyTaz | batch 40 |
| 482 | FVG Instantaneous Mitigation Signals | `fvg-instantaneous-mitigation-signals` | Trend | price | LuxAlgo | most liked |
| 483 | FVG Order Blocks | `fvg-order-blocks` | Trend | price | BigBeluga | most liked |
| 484 | FVG Positioning Average | `fvg-positioning-average` | Trend | price | LuxAlgo |  |
| 485 | FVG Sessions | `fvg-sessions` | Trend | price | LuxAlgo | most liked |
| 486 | FX Market Sessions | `fx-market-sessions` | Trend | price | boitoki | most liked |
| 487 | FX Sniper T3-CCI | `fx-sniper-t3-cci` | Oscillators | own |  |  |
| 488 | FXN - Asian Session Range | `fxn-asian-session-range` | Volatility | price | RobMinty | most liked |
| 489 | FXN - Week and Day Separator | `fxn-week-and-day-separator` | Trend | price | RobMinty | most liked |
| 490 | FxShare - CC Reversal | `fxshare-cc-reversal` | Trend | price | FxShareRobots | batch 22 |
| 491 | G-Score \| NAL | `g-score-nal` | Oscillators | own | NordicAlphaLab | batch 13 |
| 492 | Gabriel's Andean Oscillator | `gabriel-s-andean-oscillator` | Trend | own | GabrielAmadeusLau | batch 23 |
| 493 | Gamma + Fibonacci EMA Bands | `gamma-fibonacci-ema-bands` | Moving Averages | price | ky_yule1010 | batch 23 |
| 494 | Gamma Hedging Pressure (Normalized -100 to +100) | `gamma-hedging-pressure` | Momentum | own | uzair2join | batch 20 |
| 495 | Gann High Low | `gann-high-low` | Trend | price | KivancOzbilgic |  |
| 496 | GANN Level (Salil Sir) | `gann-level` | Channels & Bands | price | prabhat76 | batch 12 |
| 497 | Gaps + Imbalances + Wicks (MTF) - By Leviathan | `gaps-imbalances-wicks-by-leviathan` | Trend | price | LeviathanCapital | most liked |
| 498 | Gaussian Acceleration Array | `gaussian-acceleration-array` | Momentum | own | NantzOS | batch 36 |
| 499 | Gaussian Filter Trend | `gaussian-filter-trend` | Trend | price | QuantAlgo | batch 2 |
| 500 | Gaussian Ribbon | `gaussian-ribbon` | Moving Averages | price | NantzOS | batch 13 |
| 501 | Gaussian RSI \| NAL | `gaussian-rsi-nal` | Momentum | own | NordicAlphaLab | batch 7 |
| 502 | GBR Micro Kernel Trend | `gbr-micro-kernel-trend` | Moving Averages | price | THEGBR | batch 36 |
| 503 | Gho$t EMA Cloud | `gho-t-ema-cloud` | Moving Averages | price | Ghostmlt | batch 29 |
| 504 | Ghost Tangent Crossings | `ghost-tangent-crossings` | Trend | price | ChartPrime | most liked |
| 505 | Gideons Gold - ADX Watchman | `gideons-gold-adx-watchman` | Trend | own | gideonsgold | batch 34 |
| 506 | GMMA Oscillator | `gmma-oscillator` | Trend | own |  |  |
| 507 | Gold Trend Signal Indicator | `gold-trend-signal-indicator` | Trend | price | CsmillrSirrry | batch 33 |
| 508 | Golden & Death Cross with Re-Activation | `golden-death-cross-with-re-activation` | Moving Averages | price | oberlunar_tr | batch 26 |
| 509 | Golden Ratio Trend Persistence | `golden-ratio-trend-persistence` | Trend | price | YetAnotherTA | batch 9 |
| 510 | Golden/Death Cross Highlighter | `golden-death-cross-highlighter` | Moving Averages | price | dripvesting | batch 36 |
| 511 | Gorgo's Hybrid Oscillator STrategy | `gorgo-s-hybrid-oscillator-strategy` | Oscillators | own | Gorgomannaro | batch 32 |
| 512 | Gradient Trend Filter | `gradient-trend-filter` | Trend | price | ChartPrime | batch 1 |
| 513 | Granville Entry Guide | `granville-entry-guide` | Moving Averages | price | fightpm | batch 17 |
| 514 | Gravity Well Trend \| Lyro RS | `gravity-well-trend-lyro-rs` | Trend | price | LyroRS | batch 10 |
| 515 | Gridbot Ping Pong | `gridbot-ping-pong` | Channels & Bands | price | xxattaxx | batch 18 |
| 516 | Guppy MMA | `guppy-mma` | Moving Averages | own | AlphaExtract | batch 15 |
| 517 | Guppy Multiple Moving Average | `gmma` | Moving Averages | price | Daryl Guppy |  |
| 518 | Guppy Oscillator-REvans993 | `guppy-oscillator-revans993` | Oscillators | own | REvans993 | batch 36 |
| 519 | Guppy Wave | `guppy-wave` | Moving Averages | price | UkutaLabs | batch 25 |
| 520 | GWAP (Gamma Weighted Average Price) | `gwap` | Moving Averages | price | EdgeTools | batch 18 |
| 521 | H-Infinity Volatility Filter | `h-infinity-volatility-filter` | Trend | price | QuantAlgo | batch 7 |
| 522 | HalfTrend | `half-trend` | Trend | price | everget |  |
| 523 | HaP MACD | `hap-macd` | Momentum | own | agahakanaga | batch 1 |
| 524 | Harmonic Pattern Detection | `harmonic-pattern-detection` | Trend | price | LuxAlgo | most liked |
| 525 | Harmonic Pattern Detection, Prediction, and Backtesting Tool | `harmonic-pattern-detection-prediction-and` | Trend | price | reees | most liked |
| 526 | Harmonic Periodicity Matrix | `harmonic-periodicity-matrix` | Oscillators | own | Pineify | batch 29 |
| 527 | Harmonic Sniper Trigger - PyraTime | `harmonic-sniper-trigger-pyratime` | Oscillators | own | PyraTime | batch 27 |
| 528 | HARSI+CBC | `harsi-cbc` | Oscillators | own | mehmetbezgincan | batch 34 |
| 529 | HawkEye Volume | `hawkeye-volume` | Volume | own |  |  |
| 530 | Heatmap Volume | `heatmap-volume` | Volume | own | xdecow |  |
| 531 | Heiken Ashi Ribbon | `heiken-ashi-ribbon` | Trend | price | UkutaLabs | batch 21 |
| 532 | Heikin Ashi Colored Regular OHLC Candles | `heikin-ashi-colored-regular-ohlc-candles` | Candlestick Patterns | price | LuxmiAI | batch 40 |
| 533 | Heikin Ashi Doji with High Volume | `heikin-ashi-doji-with-high-volume` | Candlestick Patterns | price | nwfjf6m8 | batch 42 |
| 534 | Heikin Ashi RSI Oscillator | `heikin-ashi-rsi-oscillator` | Momentum | own | JayRogers |  |
| 535 | Heikin Line - TB365 | `heikin-line-tb365` | Moving Averages | price | tradebot_365 | batch 32 |
| 536 | Heikin-Ashi Reversals with Region & Dots | `heikin-ashi-reversals-with-region-dots` | Candlestick Patterns | price | theRhinoSlayer | batch 42 |
| 537 | HEMA Trend Levels | `hema-trend-levels` | Trend | price | AlgoAlpha |  |
| 538 | Henderson Weighted Moving Average | `henderson-weighted-moving-average` | Moving Averages | price | everget | batch 30 |
| 539 | High For Loop \| MisinkoMaster | `high-for-loop-misinkomaster` | Trend | own | MisinkoMaster | batch 37 |
| 540 | High Volume Arrow Signals (Ajustável) | `high-volume-arrow-signals` | Volume | price | IdeManson | batch 24 |
| 541 | High Volume Buyers/Sellers+ | `high-volume-buyers-sellers` | Volume | price | avitawill | batch 40 |
| 542 | High Volume Points | `high-volume-points` | Volume | price | BigBeluga | most liked |
| 543 | High-Low of X Bar | `high-low-of-x-bar` | Volatility | own | sam-austin | batch 29 |
| 544 | Higher High Lower Low Strategy (With Source Code) | `higher-high-lower-low-strategy` | Trend | price | LonesomeTheBlue | most liked |
| 545 | Higher order Orderblocks + Breakerblocks + Range + Alerts | `higher-order-orderblocks-breakerblocks-range` | Trend | price |  | most liked |
| 546 | Higher Time Frame Support/Resistance | `higher-time-frame-support-resistance` | Channels & Bands | price | BigBeluga | most liked |
| 547 | Hilega-Milega-RSI-EMA-WMA indicator designed by NK | `hilega-milega-rsi-ema-wma-indicator-designed-by-nk` | Oscillators | own | kshirsagar_n | batch 14 |
| 548 | Historical Liquidity Proximity Heatmap | `liquidity-proximity-heatmap` | Volume | price | LuxAlgo | batch 3 |
| 549 | HMA Breakdown | `hma-breakdown` | Moving Averages | price | NonLinearRookie | batch 11 |
| 550 | HOTT LOTT | `hott-lott` | Trend | price | KivancOzbilgic |  |
| 551 | Hourly Trading System | `hourly-trading-system` | Trend | price | Zeiierman | most liked |
| 552 | HPDR Bands Indicator | `hpdr-bands-indicator` | Channels & Bands | price | afonso_77 | batch 23 |
| 553 | HTC peppermint_07 CCI w signal + s&r RSI | `htc-peppermint-07-cci-w-signal-s-r-rsi` | Oscillators | own | peppermint07 | batch 14 |
| 554 | HTF Candles & Mini Charts by DGT | `htf-candles-mini-charts-by-dgt` | Trend | price | dgtrd | most liked |
| 555 | HTF Reversal Divergences | `htf-reversal-divergences` | Oscillators | own | LuxAlgo | most liked |
| 556 | HTH - WD Gann Square Root Levels | `hth-wd-gann-square-root-levels` | Channels & Bands | price | tamillselvan | batch 27 |
| 557 | Hull Butterfly Oscillator | `hull-butterfly-oscillator` | Momentum | own |  |  |
| 558 | Hull Suite | `hull-suite` | Trend | price |  |  |
| 559 | Hunters Reversal v2.3 | `hunters-reversal-v2-3` | Trend | price | d_jaeger | batch 33 |
| 560 | Hurst-Based Trend Persistence w/Poisson Prediction | `hurst-based-trend-persistence-w-poisson-prediction` | Oscillators | own | garysebastianbrowniii | batch 28 |
| 561 | HyperTrend [LuxAlgo] | `hyper-trend` | Trend | price | LuxAlgo |  |
| 562 | Ichimoku | `ichimoku-hpotter` | Trend | price |  | most liked |
| 563 | Ichimoku ACE Club | `ichimoku-ace-club` | Trend | price | binhmyco | batch 26 |
| 564 | Ichimoku EMA Bands | `ichimoku-ema-bands` | Channels & Bands | price |  |  |
| 565 | Ichimoku Kinko Hyo | `ichimoku-kinko-hyo` | Trend | price | insideandup | batch 32 |
| 566 | Ichimoku Kinkō hyō 目均衡表 | `ichimoku-kink-hy` | Trend | price | RickSimpson | most liked |
| 567 | Ichimoku Score Indicator | `ichimoku-score-indicator` | Trend | own | tanayroy | batch 29 |
| 568 | Ichimoku Theories | `ichimoku-theories` | Trend | price | LuxAlgo | most liked |
| 569 | Ichimoku w/Heikin-Ashi | `ichimoku-w-heikin-ashi` | Trend | price | yasujiy | batch 25 |
| 570 | ICT & RTM Price Action Indicator | `ict-rtm-price-action-indicator` | Channels & Bands | price | behradmojtahedi | batch 21 |
| 571 | ICT Algorithmic Macro Tracker° (Open-Source) by toodegrees | `ict-algorithmic-macro-tracker-by-toodegrees` | Trend | price | toodegrees | most liked |
| 572 | ICT Anchored Market Structures with Validation | `ict-anchored-market-structures-with-validation` | Trend | price | LuxAlgo | most liked |
| 573 | ICT Auto-Validated SMC | `ict-auto-validated-smc` | Trend | price | GoodBadBitcoin | most liked |
| 574 | ICT Concept Order Block \| FVG \| Liquidity Sweeps | `ict-concept-order-block-fvg-liquidity-sweeps` | Trend | price | TradingFinder | most liked |
| 575 | ICT Concepts | `ict-concepts` | Trend | price | LuxAlgo | most liked |
| 576 | ICT Everything | `ict-everything` | Trend | price | coldbrewrosh | most liked |
| 577 | ICT FVG Buy/Sell Signals | `ict-fvg-buy-sell-signals` | Trend | price | svmstellarvisionmedia | batch 5 |
| 578 | ICT Immediate Rebalance Toolkit | `ict-immediate-rebalance-toolkit` | Trend | price | LuxAlgo | most liked |
| 579 | ICT Implied Fair Value Gap (IFVG) | `ict-implied-fair-value-gap` | Trend | price | LuxAlgo | most liked |
| 580 | ICT Institutional Order Flow (fadi) | `ict-institutional-order-flow` | Trend | price | fadizeidan | most liked |
| 581 | ICT Killzones | `ict-killzones` | Trend | price | LuxAlgo | most liked |
| 582 | ICT Killzones + Pivots | `ict-killzones-pivots-tfo` | Trend | price | tradeforopp | most liked |
| 583 | ICT Killzones Toolkit | `ict-killzones-toolkit` | Trend | price | LuxAlgo | most liked |
| 584 | ICT Liquidity Sweep/Swing Fail Pattern V.1 | `ict-liquidity-sweep-swing-fail-pattern-v-1` | Trend | price | wut_trader | most liked |
| 585 | ICT Macros | `ict-macros` | Trend | price | LuxAlgo | most liked |
| 586 | ICT Power Of Three \| Flux Charts | `ict-power-of-three-flux-charts` | Trend | price | fluxchart | most liked |
| 587 | ICT Seek & Destroy Profile | `ict-seek-destroy-profile` | Volatility | price | tradeforopp | most liked |
| 588 | ICT Silver Bullet | `ict-silver-bullet` | Trend | price | LuxAlgo | most liked |
| 589 | ICT Turtle Soup \| Flux Charts | `ict-turtle-soup-flux-charts` | Trend | price | fluxchart | most liked |
| 590 | ICT Unicorn Model | `ict-unicorn-model` | Trend | price | LuxAlgo | most liked |
| 591 | Ideal Entry Point | `ideal-entry-point` | Trend | price |  |  |
| 592 | IIR One-Pole Price Filter | `iir-one-pole-price-filter` | Moving Averages | price | BackQuant | batch 9 |
| 593 | Imbalance Detector | `imbalance-detector` | Trend | price | LuxAlgo | most liked |
| 594 | Impulse MACD | `impulse-macd` | Momentum | own | LazyBear |  |
| 595 | Indicador Millo SMA20-SMA200-AO-RSI M1 | `indicador-millo-sma20-sma200-ao-rsi-m1` | Moving Averages | price | hernangarcia_78 | batch 19 |
| 596 | Indicator: Elder Impulse System | `indicator-elder-impulse-system` | Momentum | own | LazyBear | most liked |
| 597 | Indicator: ElliotWave Oscillator | `elliott-wave-oscillator-lazybear` | Oscillators | own | LazyBear | most liked |
| 598 | Indicator: OBV Oscillator | `obv-oscillator-lazybear` | Volume | own | LazyBear | most liked |
| 599 | Indicator: WaveTrend Oscillator | `wavetrend-oscillator-wt` | Oscillators | own | LazyBear | most liked |
| 600 | Indicator: Weis Wave Volume | `weis-wave-volume-lazybear` | Volume | own | LazyBear | most liked |
| 601 | Indicators: Volume-Weighted MACD Histogram & Sentiment Zone Osc | `indicators-volume-weighted-macd-histogram` | Momentum | own | LazyBear | most liked |
| 602 | Infinite EMA with Alpha Control | `infinite-ema-with-alpha-control` | Moving Averages | price | Sesilya | batch 13 |
| 603 | Initial Balance Breakout Signals | `initial-balance-breakout-signals` | Volatility | price | LuxAlgo | most liked |
| 604 | Inside / Outside Bars | `inside-outside-bars` | Candlestick Patterns | price | Iggy- | batch 42 |
| 605 | Inside Bar (Body-based) Ind/Alert | `inside-bar-ind-alert` | Candlestick Patterns | price | s_b_j | batch 40 |
| 606 | Inside Bar Coloring (Real-time + Historical) w/ Alerts | `inside-bar-coloring-w-alerts` | Candlestick Patterns | price | SpinTrades | batch 42 |
| 607 | Inside Bars (Multiple / Consecutive) | `inside-bars` | Channels & Bands | price | nilstrades_ | batch 5 |
| 608 | Instantaneous Trendline with Cloud | `instantaneous-trendline-with-cloud` | Trend | price | Sesilya | batch 22 |
| 609 | Institutional Composite Moving Average (ICMA) | `institutional-composite-moving-average` | Moving Averages | price | VolumeVigilante | batch 6 |
| 610 | Institutional MACD (Z-Score Edition) | `institutional-macd` | Momentum | own | VolumeVigilante | batch 4 |
| 611 | Institutional OrderBlock Pressure | `institutional-orderblock-pressure` | Trend | price | RickSimpson | most liked |
| 612 | Institutional Volume RSI | `institutional-volume-rsi` | Momentum | own | abgthecoder | batch 6 |
| 613 | Interpolated Median Volatility LSMA \| Otto | `interpolated-median-volatility-lsma-otto` | Channels & Bands | price | oquant | batch 12 |
| 614 | Intraday BUY_SELL | `intraday-buy-sell` | Trend | price |  |  |
| 615 | Intraday TS BB | `intraday-ts-bb` | Oscillators | price |  |  |
| 616 | Intraday Volume Swings | `intraday-volume-swings` | Volume | price | rumpypumpydumpy |  |
| 617 | Intraday vs Overnight Change Tracker | `intraday-vs-overnight-change-tracker` | Momentum | own | TheUltimator5 | batch 12 |
| 618 | Intraday vs Overnight OBV | `intraday-vs-overnight-obv` | Volume | own | TheUltimator5 | batch 21 |
| 619 | Inverse Distance Weighted Moving Average | `inverse-distance-weighted-moving-average` | Moving Averages | price | everget | batch 15 |
| 620 | Inverse Fisher Transform COMBO | `ift-stoch-rsi-cci` | Momentum | own | KivancOzbilgic (creator John Ehlers) | most liked |
| 621 | Inversion Fair Value Gaps (IFVG) | `inversion-fair-value-gaps` | Trend | price | LuxAlgo | most liked |
| 622 | IPO Date Screener | `ipo-date-screener` | Oscillators | own | starshiptrade | batch 14 |
| 623 | Is it Time for a Pullback? Check Bars Since MA Test | `is-it-time-for-a-pullback-check-bars-since-ma-test` | Trend | own | TradeStation | batch 25 |
| 624 | Isolated Peak and Bottom | `isolated-peak-bottom` | Oscillators | price |  |  |
| 625 | ITG Scalper | `itg-scalper` | Trend | price | Complector | most liked |
| 626 | IU Mean Reversion System | `iu-mean-reversion-system` | Channels & Bands | price | Shivam_Mandrai | batch 12 |
| 627 | IU Smart Flow System | `iu-smart-flow-system` | Trend | price | Shivam_Mandrai | batch 7 |
| 628 | IV Rank (tasty-style) - VIXFix / HV Proxy | `iv-rank-vixfix-hv-proxy` | Volatility | own | steveoptionstrade2025 | batch 30 |
| 629 | John Wick Doji indicator | `john-wick-doji-indicator` | Candlestick Patterns | price | Nossgrr | batch 42 |
| 630 | JOPA Channel (Dual-Volumed) v1 | `jopa-channel-v1` | Channels & Bands | price | JopAlgo | batch 30 |
| 631 | Jurik Moving Average | `jurik-moving-average` | Moving Averages | price | everget | batch 1 |
| 632 | Kalman Ema Crosses | `kalman-ema-crosses` | Moving Averages | price | JTCapitalNL | batch 16 |
| 633 | Kalman Exponentialy Weighted Moving Average \| MisinkoMaster | `kalman-exponentialy-weighted-moving-average-misinkomaster` | Moving Averages | price | MisinkoMaster | batch 25 |
| 634 | Kalman Filter Trend Breakers | `kalman-filter-trend-breakers` | Trend | price | kypexin | batch 29 |
| 635 | Kalman Flow \| Lyro RS | `kalman-flow-lyro-rs` | Trend | price | LyroRS | batch 5 |
| 636 | Kalman Hull Bands For Loop \| RakoQuant | `kalman-hull-bands-for-loop-rakoquant` | Channels & Bands | price | RakoQuant | batch 17 |
| 637 | Kalman Hull Kijun | `kalman-hull-kijun` | Trend | price | BackQuant | batch 12 |
| 638 | Kalman Trend Levels | `kalman-trend-levels` | Trend | price | BigBeluga | most liked |
| 639 | Kalman VWAP Filter | `kalman-vwap-filter` | Moving Averages | price | BackQuant | batch 4 |
| 640 | Kaufman Adaptive Moving Average | `kaufman-adaptive-ma` | Moving Averages | price | everget |  |
| 641 | Kaufman Trend Strength Signal | `kaufman-trend-strength-signal` | Trend | price | PakunFX | batch 34 |
| 642 | KD-NewAutoTrade for Future Trading - Heikin Ashi candles | `kd-newautotrade-for-future-trading-heikin-ashi-candles` | Trend | price | krish16887 | batch 22 |
| 643 | KDJ | `kdj` | Oscillators | own | KingThies |  |
| 644 | Keltner-Aroon-EFI Flow | `keltner-aroon-efi-flow` | Trend | price | D_QUANT | batch 20 |
| 645 | Kernel Channel | `kernel-channel` | Channels & Bands | price | BackQuant | batch 6 |
| 646 | KERPD Noise Filter - Kaufman Efficiency Ratio and Price Density | `kerpd-noise-filter-kaufman-efficiency-ratio-and-price-density` | Volatility | own | SensitiveSuit | batch 15 |
| 647 | Key Levels SpacemanBTC IDWM | `key-levels-spacemanbtc-idwm` | Trend | price | spacemanbtc | most liked |
| 648 | Key_TDI | `key-tdi` | Oscillators | own | Fibonacci_Code | batch 31 |
| 649 | Keyzone | `keyzone` | Channels & Bands | price | Uttaya | batch 28 |
| 650 | Kijun-Sen with Buy / Sell Labels & Alerts - Ichimoku simplified | `kijun-sen-with-buy-sell-labels-alerts-ichimoku-simplified` | Trend | price | TaureaYinYang | batch 36 |
| 651 | Kinetic Slippage Index (KSI) | `kinetic-slippage-index` | Volume | own | HPotter | batch 7 |
| 652 | Kiss Of Death | `kiss-of-death` | Trend | price | thanos300693 | batch 37 |
| 653 | L1 Moving Average Fingerprint for Long Entry | `l1-moving-average-fingerprint-for-long-entry` | Trend | price | blackcat1402 | batch 40 |
| 654 | L2 Risk Assessment for Trend Strength | `l2-risk-assessment-for-trend-strength` | Trend | own | blackcat1402 | batch 14 |
| 655 | Ladder StDev | `ladder-stdev` | Volatility | own | jason5480 | batch 30 |
| 656 | Laguerre Filter | `laguerre-filter` | Moving Averages | price | BackQuant | batch 5 |
| 657 | Laguerre RSI | `laguerre-rsi` | Momentum | own | TheLark |  |
| 658 | Laguerre Ultimate Explorations Multicator | `laguerre-ultimate-explorations-multicator` | Moving Averages | own | ImmortalFreedom | batch 20 |
| 659 | Laguerre-Kalman Adaptive Filter \| AlphaNatt | `laguerre-kalman-adaptive-filter-alphanatt` | Moving Averages | price | AlphaNatt | batch 11 |
| 660 | Left Bars | `pivot-hh-hl-lh-ll` | Trend | price |  |  |
| 661 | Leledc Levels | `leledc-levels` | Candlestick Patterns | price |  |  |
| 662 | Length | `gaussian-channel` | Channels & Bands | price |  |  |
| 663 | Length | `redk-vader` | Oscillators | own | RedKTrader |  |
| 664 | Length | `zlma-trend-levels` | Moving Averages | price |  |  |
| 665 | Level2 Signalfilter Liquidity Protection | `level2-signalfilter-liquidity-protection` | Trend | own | djmad | batch 16 |
| 666 | Leveraged Liquidation Zones | `leveraged-liquidation-zones` | Channels & Bands | price | Fussion_Trader | batch 35 |
| 667 | LGMM (flat buffers) - multivariate poly + latent states | `lgmm-multivariate-poly-latent-states` | Channels & Bands | price | vsov | batch 28 |
| 668 | Linear Predictive Filters (TASC 2025.01) | `linear-predictive-filters` | Oscillators | own | PineCodersTASC | batch 2 |
| 669 | Linear Regression ++ | `linear-regression` | Channels & Bands | price | DevLucem | most liked |
| 670 | Linear Regression Blend Candles | `linear-regression-blend-candles` | Candlestick Patterns | price | B3AR_Trades | batch 39 |
| 671 | Linear Regression Candles | `linear-regression-candles` | Candlestick Patterns | price |  |  |
| 672 | Linear Regression Channel | `linear-regression-channel` | Channels & Bands | price |  |  |
| 673 | Linear Regression Channel / Curve / Slope by DGT | `linear-regression-channel-curve-slope-by-dgt` | Channels & Bands | price | dgtrd | most liked |
| 674 | Linear Regression Oscillator | `linear-regression-oscillator` | Oscillators | own | ChartPrime | most liked |
| 675 | Linear Regression Volume \| Lyro RS | `linear-regression-volume-lyro-rs` | Channels & Bands | price | LyroRS | batch 10 |
| 676 | Linear Volume MACD \| Lyro RS | `linear-volume-macd-lyro-rs` | Momentum | own | LyroRS | batch 9 |
| 677 | LineReg Candles with Hma filter | `linereg-candles-with-hma-filter` | Trend | price | MaximusGains | batch 14 |
| 678 | Liquidation Reversal Signals | `liquidation-reversal-signals` | Volume | price | AlgoAlpha | most liked |
| 679 | Liquidations Zones | `liquidations-zones` | Volume | price | ChartPrime | most liked |
| 680 | Liquidity Delta Profiler | `liquidity-delta-profiler` | Volume | price | LuxAlgo | most liked |
| 681 | Liquidity Flow Zones (LFZ) | `liquidity-flow-zones` | Trend | price | ReubenMiles | batch 20 |
| 682 | Liquidity Grabs | `liquidity-grabs` | Trend | price | fluxchart |  |
| 683 | Liquidity Heatmap | `liquidity-heatmap` | Volume | price | Nephew_Sam_ | most liked |
| 684 | Liquidity Indicator | `liquidity-indicator` | Channels & Bands | price | The_Forex_Steward | batch 22 |
| 685 | Liquidity Levels [LuxAlgo] | `liquidity-levels` | Trend | price | LuxAlgo |  |
| 686 | Liquidity Levels MTF - Sonarlab | `liquidity-levels-mtf-sonarlab` | Trend | price | vuetratrading | most liked |
| 687 | Liquidity Location Detector | `liquidity-location-detector` | Volume | price | BigBeluga | most liked |
| 688 | Liquidity Pools | `liquidity-pools` | Trend | price | LuxAlgo | most liked |
| 689 | Liquidity Pools Pro | `liquidity-pools-pro` | Trend | price | WillyAlgoTrader | most liked |
| 690 | Liquidity Price Depth Chart | `liquidity-price-depth-chart` | Volume | price | LuxAlgo | most liked |
| 691 | Liquidity Sentiment Profile \| LUPEN | `liquidity-sentiment-profile-lupen` | Volume | own | Horazio | batch 20 |
| 692 | Liquidity Sweep Confirmation | `liquidity-sweep-confirmation` | Trend | price | filipiti | batch 38 |
| 693 | Liquidity Sweep Filter | `liquidity-sweep-filter` | Trend | price | AlgoAlpha | most liked |
| 694 | Liquidity Sweeps [LuxAlgo] | `liquidity-sweeps` | Trend | price |  |  |
| 695 | Liquidity Swings | `liquidity-swings` | Volume | price | LuxAlgo | most liked |
| 696 | Liquidity Thermal Map | `liquidity-thermal-map` | Volume | price | BigBeluga | most liked |
| 697 | Liquidity Trap & Reversal bot | `liquidity-trap-reversal-bot` | Channels & Bands | price | pointalgo | batch 28 |
| 698 | Liquidity Trendline With Signals | `liquidity-trendline-with-signals` | Trend | price | BigBeluga | most liked |
| 699 | Liquidity Voids (FVG) | `liquidity-voids` | Volatility | price | LuxAlgo | most liked |
| 700 | Liquidity Zones | `liquidity-zones` | Volume | price | BigBeluga | most liked |
| 701 | Loacally Weighted MA (LWMA) Direction Histogram | `loacally-weighted-ma-direction-histogram` | Trend | own | LuxmiAI | batch 9 |
| 702 | Logistic RSI, STOCH, ROC, AO, ... by DGT | `logistic-rsi-stoch-roc-ao-by-dgt` | Oscillators | own | dgtrd | most liked |
| 703 | Logit RSI | `logit-rsi` | Oscillators | own | AdaptiveRSI | batch 11 |
| 704 | Long Short dom | `long-short-dom` | Trend | own | Robin-Hood-trading | batch 11 |
| 705 | Lorentzian Length Adaptive Moving Average | `lorentzian-length-adaptive-moving-average` | Moving Averages | price | Starcruiser | batch 21 |
| 706 | LOWESS (Locally Weighted Scatterplot Smoothing) | `lowess` | Moving Averages | price | ChartPrime | most liked |
| 707 | Lumina Trend Channels | `lumina-trend-channels` | Channels & Bands | price | Pineify | batch 10 |
| 708 | Luminous Mean Reversion Channels | `luminous-mean-reversion-channels` | Channels & Bands | price | Pineify | batch 7 |
| 709 | Lunar Phase (LUNAR) | `lunar-phase` | Oscillators | own | mihakralj | batch 23 |
| 710 | Luxy BIG beautiful Dynamic ORB | `luxy-big-beautiful-dynamic-orb` | Channels & Bands | price | orenluxy | most liked |
| 711 | MA Cross with Displacement | `ma-cross-with-displacement` | Moving Averages | price | TehThomas | batch 25 |
| 712 | MA Ribbon 5EMA \| 20EMA \| 50SMA \| 200EMA | `ma-ribbon-5ema-20ema-50sma-200ema` | Moving Averages | price | vamsinelluri7 | batch 29 |
| 713 | MA Sabres | `ma-sabres` | Moving Averages | price | LuxAlgo | most liked |
| 714 | MA Shaded Fill Crossover | `ma-shaded-fill` | Moving Averages | price |  |  |
| 715 | MA Strategy Emperor | `ma-strategy-emperor` | Trend | price | insiliconot |  |
| 716 | MA Type | `madrid-ma-ribbon` | Moving Averages | price |  |  |
| 717 | MA Zones | `ma-zones` | Moving Averages | price | ZenAndTheArtOfTrading | batch 7 |
| 718 | MACD & RSI Overlay (Expo) | `macd-rsi-overlay` | Momentum | price | Zeiierman | most liked |
| 719 | MACD (Buy & Sell signals) | `macd-irtov` | Momentum | own | irtov | batch 24 |
| 720 | Macd + Adx Pro by @Eternyworld | `macd-adx-pro-by-eternyworld` | Momentum | own | ETERNYWORLD | batch 26 |
| 721 | MACD 4C | `macd-4c` | Momentum | own | vkno422 |  |
| 722 | MACD Based Price Forecasting | `macd-based-price-forecasting` | Momentum | price | LuxAlgo | most liked |
| 723 | MACD Crossover | `macd-crossover` | Momentum | own |  |  |
| 724 | MacD Custom Indicator-Multiple Time Frame+All Available Options! | `cm-macd-custom-mtf` | Momentum | own | ChrisMoody | most liked |
| 725 | MACD DEMA | `macd-dema` | Momentum | own |  |  |
| 726 | MACD Divergence | `macd-divergence` | Momentum | own |  |  |
| 727 | MACD Dynamic Squeeze Pro | `macd-dynamic-squeeze-pro` | Momentum | own | ZynAlgo | batch 24 |
| 728 | MACD Leader | `macd-leader` | Momentum | own | LazyBear |  |
| 729 | MACD Liquidity Tracker System | `macd-liquidity-tracker-system` | Momentum | own | PROFABIGHI_CAPITAL | batch 29 |
| 730 | MACD Overlay v1 | `macd-overlay-v1` | Momentum | price | JopAlgo | batch 5 |
| 731 | MACD Pro | `macd-pro` | Momentum | own | VEGAlgo | batch 23 |
| 732 | MACD Pseudo Super Smoother | `macd-pseudo-super-smoother` | Oscillators | own | The_Peaceful_Lizard | batch 37 |
| 733 | MACD ReLoaded | `macd-reloaded` | Momentum | own | KivancOzbilgic |  |
| 734 | MACD Sniper | `macd-sniper` | Momentum | own | trade_lexx | batch 15 |
| 735 | MACD Support and Resistance [ChartPrime] | `macd-support-resistance` | Momentum | own | ChartPrime |  |
| 736 | MACD VXI | `macd-vxi` | Momentum | own |  |  |
| 737 | MACD With Crossings and Above Below Zero | `macd-with-crossings-and-above-below-zero` | Momentum | own | Kgroomes | batch 18 |
| 738 | MACD x BB x STDEV x RVI | `macd-x-bb-x-stdev-x-rvi` | Oscillators | own | Vaquant | batch 20 |
| 739 | MACD XD | `macd-xd` | Momentum | own | Zen_Formless | batch 8 |
| 740 | MACD-V (Volatility Normalized MACD) | `macd-v` | Momentum | own | KivancOzbilgic | batch 2 |
| 741 | MACD-V with Volatility Normalisation | `macd-v-with-volatility-normalisation` | Momentum | own | DutchCryptoDad | batch 25 |
| 742 | MACD1 Fast | `double-macd` | Momentum | own |  |  |
| 743 | MACDAS | `macdas` | Momentum | own |  |  |
| 744 | Machine Learning RSI \| AI Classification & Ranking | `machine-learning-rsi-ai-classification-ranking` | Oscillators | own | Zeiierman | most liked |
| 745 | Machine Learning RSI ║ BullVision | `machine-learning-rsi-bullvision` | Oscillators | own | BullVisionCapital | most liked |
| 746 | Machine Learning: kNN Trend Predictor | `machine-learning-knn-trend-predictor` | Trend | price | tkarolak | batch 11 |
| 747 | Machine Learning: Lorentzian Classification | `lorentzian-classification` | Trend | price | jdehorty | most liked |
| 748 | MAD Trend Detector ~ C H I P A | `mad-trend-detector-c-h-i-p-a` | Trend | own | C_H_I_P_A | batch 36 |
| 749 | Madrid Trend Squeeze | `madrid-trend-squeeze` | Momentum | own |  |  |
| 750 | MADZ - Moving Average Deviation Z-Score | `madz-moving-average-deviation-z-score` | Oscillators | own | MiesOnCharts | batch 32 |
| 751 | Magnet Force + RSI Filter V6 | `magnet-force-rsi-filter-v6` | Channels & Bands | price | mehmetbezgincan | batch 31 |
| 752 | Maket Strat Absorption Bubbles | `maket-strat-absorption-bubbles` | Volume | price | samb817 | batch 41 |
| 753 | MAMA - FAMA (Ehlers) | `mama-fama` | Moving Averages | price | KatherinaNote | batch 31 |
| 754 | Manipulation Candle | `manipulation-candle` | Candlestick Patterns | price | DrauzioFx | batch 39 |
| 755 | Mark Minervini Buy Signal | `mark-minervini-buy-signal` | Trend | price | Dr_Leong_Yee_Rock | batch 18 |
| 756 | Market Cipher A | `market-cipher-a` | Oscillators | price |  |  |
| 757 | Market Cipher A free version 1.1 | `market-cipher-a-free-version-1-1` | Moving Averages | price | falconCoin | most liked |
| 758 | Market Cipher B | `market-cipher-b` | Oscillators | own |  |  |
| 759 | Market Cipher B  Free version with Buy and sell | `market-cipher-b-free-version-with-buy-and-sell` | Oscillators | own | falconCoin | most liked |
| 760 | Market Participation Ratio-MPR | `market-participation-ratio-mpr` | Volume | own | TechnoBlooms | batch 37 |
| 761 | Market Pressure Oscillator | `market-pressure-oscillator` | Oscillators | own | Uncle_the_shooter | batch 8 |
| 762 | Market Profile | `market-profile` | Volume | price | LonesomeTheBlue | most liked |
| 763 | Market Profile with TPO | `market-profile-with-tpo` | Volume | price | drother | most liked |
| 764 | Market Pulse Pro | `market-pulse-pro` | Oscillators | own | Canhoto-Medium | batch 32 |
| 765 | Market Sentiment Technicals | `market-sentiment-technicals` | Oscillators | price | LuxAlgo | most liked |
| 766 | Market Sessions - By Leviathan | `market-sessions-by-leviathan` | Trend | price | LeviathanCapital | most liked |
| 767 | Market sessions and Volume profile - By Leviathan | `market-sessions-volume-profile` | Volume | price | LeviathanCapital | most liked |
| 768 | Market Shift Levels | `market-shift-levels` | Trend | price |  |  |
| 769 | Market Structure - By Leviathan | `market-structure-by-leviathan` | Trend | price | LeviathanCapital | most liked |
| 770 | Market Structure Break & OB Probability Toolkit | `market-structure-break-ob-probability-toolkit` | Trend | price | LuxAlgo | most liked |
| 771 | Market Structure Break & Order Block by EmreKb | `market-structure-break-order-block` | Trend | price | EmreKb | most liked |
| 772 | Market Structure CHoCH/BOS (Fractal) | `market-structure-choch-bos` | Trend | price | LuxAlgo | most liked |
| 773 | Market Structure Dashboard \| Flux Charts | `market-structure-dashboard-flux-charts` | Trend | price | fluxchart | most liked |
| 774 | Market Structure Oscillator | `market-structure-oscillator` | Oscillators | own | LuxAlgo | most liked |
| 775 | Market Structure Trailing Stop | `market-structure-trailing-stop` | Trend | price | LuxAlgo |  |
| 776 | Market Structure Trend | `market-structure-trend` | Trend | price | QuantAlgo | batch 12 |
| 777 | Market Structure with Inducements & Sweeps | `market-structure-with-inducements-sweeps` | Trend | price | LuxAlgo | most liked |
| 778 | Market Structures + ZigZag CHoCH/BOS - MSS/MSB | `market-structures-zigzag-choch-bos-mss-msb` | Trend | price | TradingFinder | most liked |
| 779 | Martell MNQ Quantum Scalper Pro | `martell-mnq-quantum-scalper-pro` | Trend | price | JMartell | batch 31 |
| 780 | Marubozu Detector | `marubozu-detector` | Candlestick Patterns | price | toppermost | batch 38 |
| 781 | Matrix Series | `matrix-series` | Oscillators | own |  |  |
| 782 | MavilimW | `mavilimw` | Trend | price | KivancOzbilgic |  |
| 783 | Mean Angles | `mean-angles` | Momentum | own | bharatTrader | batch 9 |
| 784 | Mean Reversion Channel - (fareid's MRI Variant) | `mean-reversion-channel` | Channels & Bands | price | fareidzulkifli | most liked |
| 785 | Measured Pattern Move (Bulkowski) | `measured-pattern-move` | Trend | price | Steversteves | batch 28 |
| 786 | MechArt Moving Average and % Above V1.1 | `mechart-moving-average-and-above-v1-1` | Moving Averages | price | MechArt_ | batch 29 |
| 787 | Median ATR SD Oscillator | `median-atr-sd-oscillator` | Volatility | own | Unknownhodler | batch 37 |
| 788 | Median Gaussian Trend \| NAL | `median-gaussian-trend-nal` | Trend | price | NordicAlphaLab | batch 15 |
| 789 | Median MACD - Mattes | `median-macd-mattes` | Momentum | own | Mattes00 | batch 8 |
| 790 | Median Volume Weighted Deviation | `median-volume-weighted-deviation` | Volume | price | Burggg | batch 30 |
| 791 | MESA Adaptive Ehlers Flow \| AlphaNatt | `mesa-adaptive-ehlers-flow` | Moving Averages | price | AlphaNatt | batch 8 |
| 792 | MESA Phase-Adaptive Band Trend | `mesa-phase-adaptive-band-trend` | Trend | price | SchizoQuant | batch 22 |
| 793 | MFI | `mfi-seiglerj` | Volume | own | seiglerj | most liked |
| 794 | MFI + RSI + EMA Dynamic Signals | `mfi-rsi-ema-dynamic-signals` | Momentum | price | Raisontgh | batch 37 |
| 795 | MFI Nexus Pro | `mfi-nexus-pro` | Volume | own | trade_lexx | batch 10 |
| 796 | MFI/RSI Bollinger Bands | `mfi-rsi-bb` | Oscillators | own |  |  |
| 797 | Mid-term Ribbon | `mid-term-ribbon` | Moving Averages | price | Gartav388637 | batch 25 |
| 798 | Minervini Trend Template Screener (v5) | `minervini-trend-template-screener` | Trend | price | hibinomasakazu1991 | batch 41 |
| 799 | Minimalist Doji Highlighter | `minimalist-doji-highlighter` | Candlestick Patterns | price | SensitiveSuit | batch 40 |
| 800 | Mirage Liquidity Sweep Pro | `mirage-liquidity-sweep-pro` | Trend | price | WillyAlgoTrader | most liked |
| 801 | Mix1 : Ema Cross + Trend Channel | `mix1-ema-cross-trend-channel` | Moving Averages | price | gu5tavo71 | most liked |
| 802 | ML Adaptive SuperTrend | `ml-adaptive-supertrend` | Trend | price |  |  |
| 803 | ML Deep Regression Pro | `ml-deep-regression-pro` | Trend | price | TechnoBlooms | batch 29 |
| 804 | ML Momentum Index | `ml-momentum-index` | Momentum | own |  |  |
| 805 | ML Moving Average | `ml-moving-average` | Moving Averages | price |  |  |
| 806 | ML RSI | `ml-rsi` | Momentum | own |  |  |
| 807 | ML: kNN Strategy | `ml-knn-strategy` | Momentum | own |  |  |
| 808 | Modified Heikin-Ashi | `modified-heikin-ashi` | Candlestick Patterns | price | ChrisMoody |  |
| 809 | Momentum Shift | `momentum-shift` | Momentum | own | BigBeluga | most liked |
| 810 | Momentum-based ZigZag | `momentum-zigzag` | Trend | price | Peter_O |  |
| 811 | Money Flow Extended | `money-flow-extended` | Volume | own | alexrainman | batch 6 |
| 812 | Money Flow Index + Alerts | `money-flow-index-alerts` | Oscillators | own | DreamsDefined | most liked |
| 813 | Money Flow Profile | `money-flow-profile` | Volume | price | LuxAlgo | most liked |
| 814 | Money Flow Pulse | `money-flow-pulse` | Volume | own | TheLeadingIndicator | batch 35 |
| 815 | Moneyball EMA-MACD indicator | `moneyball-ema-macd-indicator` | Momentum | own | VinnieTheFish | batch 6 |
| 816 | Monotonic Trend Consensus | `monotonic-trend-consensus` | Trend | own | QuantAlgo | batch 16 |
| 817 | Moving Average ADX | `ma-adx` | Moving Averages | price |  |  |
| 818 | Moving Average Candles | `moving-average-candles` | Moving Averages | price | aleskxyz | batch 41 |
| 819 | Moving Average Colored | `ma-colored` | Moving Averages | price |  |  |
| 820 | Moving Average Converging | `ma-converging` | Moving Averages | price | LuxAlgo |  |
| 821 | Moving Average Cross Alert, Multi-Timeframe (MTF) (by ChartArt) | `ma-cross-alert-mtf` | Moving Averages | price | ChartArt | most liked |
| 822 | Moving Average Crossover with Shading Signals | `moving-average-crossover-with-shading-signals` | Moving Averages | price | Decam9 | batch 12 |
| 823 | Moving Average Deviation Rate | `ma-deviation-rate` | Moving Averages | own |  |  |
| 824 | Moving Average Percentage Difference | `moving-average-percentage-difference` | Moving Averages | own | GapLogic | batch 37 |
| 825 | Moving Average Shift | `ma-shift` | Moving Averages | price |  |  |
| 826 | Moving Average Trend Meter | `moving-average-trend-meter` | Trend | own | UkutaLabs | batch 39 |
| 827 | Moving Averages With Continuous Periods | `moving-averages-with-continuous-periods` | Moving Averages | price | The_Peaceful_Lizard | batch 15 |
| 828 | Moving Volume-Weighted Avg Price, % Channel, BBs | `moving-volume-weighted-avg-price-channel-bbs` | Channels & Bands | price | NeanderTraderBC | batch 37 |
| 829 | Moving VWAP-KAMA Cloud | `moving-vwap-kama-cloud` | Moving Averages | price | SovereignCharts | batch 12 |
| 830 | MPO4 Lines – Modal Engine | `mpo4-lines-modal-engine` | Oscillators | own | Uncle_the_shooter | batch 15 |
| 831 | mr.crypto731 | `mr-crypto731` | Momentum | own | Ali_Smith | batch 20 |
| 832 | MSL Squeeze Pulse | `msl-squeeze-pulse` | Volatility | own | MarketStructureLab | batch 16 |
| 833 | MTF Break of Structure(BOS) & Market Structure Shift(MSS) | `mtf-break-of-structure-market-structure-shift` | Trend | price | Lenny_Kiruthu | most liked |
| 834 | MTF Order Block Finder | `mtf-order-block-finder` | Trend | price | DasanC | most liked |
| 835 | Multi Kernel Regression | `multi-kernel-regression` | Trend | price | ChartPrime | most liked |
| 836 | Multi Time Frame Candles with Volume Info / 3D | `multi-time-frame-candles-with-volume-info-3d` | Volume | own | LonesomeTheBlue | most liked |
| 837 | Multi Timeframe Support and Resistance | `multi-timeframe-support-and-resistance` | Channels & Bands | price | abainvest | most liked |
| 838 | Multi-Band Trend Line | `multi-band-trend-line` | Trend | price | Mr_Rakun | batch 4 |
| 839 | Multi-Layer Volume Profile | `multi-layer-volume-profile` | Volume | price | BigBeluga | most liked |
| 840 | Multi-Oscillator Adaptive Kernel \| AlphaAlgos | `multi-oscillator-adaptive-kernel-alphaalgos` | Oscillators | own | AlphaNatt | batch 4 |
| 841 | Multicator Table | `signal-table-autofib-sma-ema-rsi-atr-vol` | Trend | price | only_fibonacci | most liked |
| 842 | Multiple Divergences | `multiple-divergences` | Momentum | price | PeterO |  |
| 843 | Multiple Exponential Fibnonacci Moving Averages | `multiple-exponential-fibnonacci-moving-averages` | Moving Averages | price | LensOfChartist | batch 13 |
| 844 | Multiple Moving Averages | `multiple-ma` | Moving Averages | price |  |  |
| 845 | Multiple RSI | `multiple-rsi` | Oscillators | own | PrasadJoshi12 | batch 19 |
| 846 | Multitimeframe Fair Value Gap – FVG | `multitimeframe-fair-value-gap-fvg` | Trend | price | Zeiierman | most liked |
| 847 | Multpile strategies | `multpile-strategies` | Oscillators | own | Lupown | most liked |
| 848 | MurreysOscillator | `murreys-math-osc` | Oscillators | own |  |  |
| 849 | Muses afl script | `muses-afl-script` | Trend | price | mostafa47ab (indicator title "L1 Filter Sig") | batch 31 |
| 850 | Mushir's Inside Candle Indicator | `mushir-s-inside-candle-indicator` | Candlestick Patterns | price | mushirinamdar | batch 42 |
| 851 | My auto dual avwap with Auto swing low/pivot low finder | `my-auto-dual-avwap-with-auto-swing-low-pivot-low-finder` | Volume | price | doqkhanh | batch 22 |
| 852 | N Bar Reversal Detector | `n-bar-reversal-detector` | Trend | price | LuxAlgo | most liked |
| 853 | N Order EMA | `n-order-ema` | Moving Averages | price | The_Peaceful_Lizard | batch 35 |
| 854 | Nadaraya-Watson Envelope | `nadaraya-watson-envelope` | Channels & Bands | price | LuxAlgo | most liked |
| 855 | Nadaraya-Watson Smoothers | `nadaraya-watson-smoothers` | Trend | price | LuxAlgo | most liked |
| 856 | Nadaraya-Watson Trend | `nadaraya-watson-trend` | Trend | price | QuantAlgo | batch 1 |
| 857 | Navier-Cauchy Market Elasticity | `navier-cauchy-market-elasticity` | Oscillators | own | PhenLabs | batch 30 |
| 858 | Neighboring Price Bands | `neighboring-price-bands` | Channels & Bands | price | LuxAlgo | batch 21 |
| 859 | Nexus Sentiment & Risk Matrix | `nexus-sentiment-risk-matrix` | Oscillators | own | Pineify | batch 37 |
| 860 | NLMS Volatility Trail | `nlms-volatility-trail` | Trend | price | BackQuant | batch 4 |
| 861 | No wick candles | `no-wick-candles` | Candlestick Patterns | price | KORD_ | batch 39 |
| 862 | Normalized Candles RSI | `normalized-candles-rsi` | Oscillators | own | Jamallo22 | batch 32 |
| 863 | Normalized QQE | `normalized-qqe` | Oscillators | own |  |  |
| 864 | Normalized Quantitative Qualitative Estimation nQQE | `normalized-quantitative-qualitative` | Momentum | own | KivancOzbilgic | most liked |
| 865 | Normalized SPMA \| NAL | `normalized-spma-nal` | Oscillators | own | NordicAlphaLab | batch 30 |
| 866 | Normalized Volume & True Range | `normalized-volume-true-range` | Volume | own | The_Peaceful_Lizard | batch 36 |
| 867 | Nova Flow Lite (Free) | `nova-flow-lite` | Trend | price | NovaQuantX | batch 36 |
| 868 | Nova Statistical Filtering Oscillator | `nova-statistical-filtering-oscillator` | Oscillators | own | Pineify | batch 27 |
| 869 | NR4 & NR7 with Breakouts | `nr4-nr7-with-breakouts` | Volatility | price | LuxAlgo | most liked |
| 870 | NY ORB + Fakeout Detector | `ny-orb-fakeout-detector` | Channels & Bands | price | STEFANGAS | batch 27 |
| 871 | OA - SMES | `oa-smes` | Oscillators | own | onurag | batch 4 |
| 872 | OBV & AD Oscillators with Dual Smoothing Options | `obv-ad-oscillators-with-dual-smoothing-options` | Volume | own | hollowwick (indicator title "OBV, AD, VPT & CDV | batch 27 |
| 873 | OBV (Delta or regular) | `obv-gizmo` | Volume | own | GizmoTheInvestor | batch 37 |
| 874 | OBV + Custom MA Strategy | `obv-custom-ma-strategy` | Volume | own | Rafiki-is-Trading | batch 14 |
| 875 | OBV MACD | `obv-macd` | Volume | own |  |  |
| 876 | OBV Oscillator | `obv-oscillator` | Volume | own |  |  |
| 877 | OBVX Conviction Bias | `obvx-conviction-bias` | Volume | own | TheLeadingIndicator | batch 31 |
| 878 | One Shot One Kill ICT Liquidity MMXM + CISD OTE | `one-shot-one-kill-ict-liquidity-mmxm-cisd-ote` | Trend | price | TradingFinder | most liked |
| 879 | Opal | `opal` | Channels & Bands | price | FlyingSeaHorse | batch 36 |
| 880 | Open Close Cross | `open-close-cross` | Momentum | own | JustUncleL |  |
| 881 | Open Close Cross Alerts NoRepaint Version by JustUncleL | `open-close-cross-alerts-norepaint-version-by` | Trend | own | JustUncleL | most liked |
| 882 | Open Liquidity Heatmap | `open-liquidity-heatmap` | Volume | price | BigBeluga | most liked |
| 883 | Opening Range Breakout with 2 Profit Targets. | `opening-range-breakout-with-2-profit-targets` | Trend | price |  | most liked |
| 884 | Opening Range with Breakouts & Targets | `opening-range-breakouts-targets` | Trend | price | LuxAlgo | most liked |
| 885 | Optimized Trend Tracker | `optimized-trend-tracker` | Trend | price | KivancOzbilgic |  |
| 886 | ORB - Opening Range Breakout | `orb-opening-range-breakout` | Trend | price | zzzcrypto123 | most liked |
| 887 | ORB Algo \| Flux Charts | `orb-algo-flux-charts` | Trend | price | fluxchart | most liked |
| 888 | Order Block Detector | `order-block-detector` | Trend | price | LuxAlgo | most liked |
| 889 | Order Block Finder (Experimental) | `order-block-finder` | Trend | price | wugamlo | most liked |
| 890 | Order Block Finder \| Gold \| ProjectSyndicate | `order-block-finder-gold-projectsyndicate` | Trend | price | ProjectSyndicate | most liked |
| 891 | Order Blocks & Breaker Blocks | `order-blocks-breaker-blocks` | Trend | price | LuxAlgo | most liked |
| 892 | Order Blocks Finder Major OB \| Supply and Demand | `order-blocks-finder-major-ob-supply-and-demand` | Channels & Bands | price | TradingFinder | most liked |
| 893 | Order Blocks Volume Delta 3D \| Flux Charts | `order-blocks-volume-delta-3d-flux-charts` | Volume | price | fluxchart | most liked |
| 894 | Order Blocks W/ Realtime Fibs | `order-blocks-w-realtime-fibs` | Trend | price | QuantVue | most liked |
| 895 | Order Blocks with Signals | `order-blocks-signals` | Trend | price | ClayeWeight |  |
| 896 | Order Blocks \| Flux Charts | `order-blocks-flux-charts` | Volume | price | fluxchart | most liked |
| 897 | Order Flow Imbalance Oscillator | `order-flow-imbalance-oscillator` | Volume | own | StrikePriceLabs | batch 33 |
| 898 | Oscillator Matrix | `oscillator-matrix` | Oscillators | own | AlphaExtract | batch 6 |
| 899 | PAFT | `paft` | Momentum | own | TREESinvest | batch 30 |
| 900 | Parabolic Stoch SAR Visualizer | `parabolic-stoch-sar-visualizer` | Oscillators | own | BOSWaves | batch 24 |
| 901 | Parallel Pivot Lines | `parallel-pivot-lines` | Channels & Bands | price | LuxAlgo |  |
| 902 | Pay Attention Candle | `pay-attention-candle` | Candlestick Patterns | price | asenski (inspired by the RexDog Trading System) | batch 41 |
| 903 | PCR Market Regime Indicator | `pcr-market-regime-indicator` | Momentum | own | Aleksin_Aleksandar | batch 31 |
| 904 | Peak Reversal v2 | `peak-reversal-v2` | Channels & Bands | price | Zettt | batch 11 |
| 905 | Peak Reversal v3 | `peak-reversal-v3` | Channels & Bands | price | Zettt | batch 21 |
| 906 | Percent Off All-time High (% Off High) | `percent-off-all-time-high` | Oscillators | own | xHmmmmm | batch 19 |
| 907 | Percentile Rank Oscillator (Price + VWMA) | `percentile-rank-oscillator` | Oscillators | own | exploretranspose | batch 26 |
| 908 | Percentile-Based BB% Trend - Mattes | `percentile-based-bb-trend-mattes` | Oscillators | own | Mattes00 | batch 7 |
| 909 | Perfect Hammer Pattern Indicators and Alerts | `perfect-hammer-pattern-indicators-and-alerts` | Candlestick Patterns | price | girishptryambakee | batch 40 |
| 910 | Perfect RSI | `perfect-rsi` | Oscillators | own | HabibiBudo | batch 26 |
| 911 | Perforance integral | `perforance-integral` | Momentum | own | Majimbi | batch 37 |
| 912 | Periodic Linear Regressions | `periodic-linear-regressions` | Channels & Bands | price | LuxAlgo | most liked |
| 913 | Philakone 55 EMA Swing Trading | `philakone-ema-swing` | Moving Averages | price |  |  |
| 914 | Pipstocrat Market Participant Analysis | `pipstocrat-market-participant-analysis` | Momentum | own | Delast2 | batch 23 |
| 915 | Pivot Based Trailing Maxima & Minima | `pivot-trailing-maxmin` | Channels & Bands | price | LuxAlgo |  |
| 916 | Pivot Breakout High&Low Signals | `pivot-breakout-high-low-signals` | Trend | price | Jos-ProTrader | batch 3 |
| 917 | Pivot Breakout with Trend Zones | `pivot-breakout-with-trend-zones` | Trend | price | dreamaker7 | batch 33 |
| 918 | Pivot Hilo Support n Resistance Levels R3-3 by JustUncleL | `pivot-hilo-support-n-resistance-levels-r3-3` | Trend | price | JustUncleL | most liked |
| 919 | Pivot Market Structure | `pivot-market-structure` | Trend | price | Daniel_Ge | batch 11 |
| 920 | Pivot Oscillator | `pivot-oscillator` | Oscillators | own | Uncle_the_shooter | batch 3 |
| 921 | Pivot Point | `pivot-point-hpotter` | Trend | price | HPotter | most liked |
| 922 | Pivot Point SuperTrend | `pivot-point-supertrend` | Trend | price | LonesomeTheBlue |  |
| 923 | Pivot Points High Low & Missed Reversal Levels | `pivot-points-high-low-missed-reversal` | Trend | price | LuxAlgo | most liked |
| 924 | Pivot Points High Low Multi Time Frame | `pivot-points-high-low-multi-time-frame` | Trend | price | LonesomeTheBlue | most liked |
| 925 | Pivot Trend | `pivot-trend` | Trend | price | ChartPrime | batch 1 |
| 926 | Pivot Trendlines with Breaks | `pivot-trendlines-with-breaks` | Trend | price | HoanGhetti | most liked |
| 927 | PMax on RSI with Tillson T3 | `pmax-on-rsi-with-tillson-t3` | Oscillators | own | KivancOzbilgic | most liked |
| 928 | POC Volume Bar (Highest Volume in Range) | `poc-volume-bar` | Volume | own | greatbrownball | batch 28 |
| 929 | Pocket Pivot Breakout | `pocket-pivot-breakout` | Volume | price | simatricks | batch 38 |
| 930 | PolyFilter | `polyfilter` | Moving Averages | price | BackQuant | batch 8 |
| 931 | Polynomial Regression Moving Average (PRMA) | `polynomial-regression-moving-average` | Moving Averages | price | ZakAlgoTrade | batch 24 |
| 932 | Polynomial Trend Exhaustion & Divergence | `polynomial-trend-exhaustion-divergence` | Trend | price | B3AR_Trades | batch 40 |
| 933 | Polyphase MACD (PMACD) | `polyphase-macd` | Momentum | own | The_Peaceful_Lizard | batch 19 |
| 934 | Power Of 3 ICT 01 AMD ICT & SMC Accumulations | `power-of-3-ict-01-amd-ict-smc-accumulations` | Trend | price | TradingFinder | most liked |
| 935 | PPO Alerts | `ppo-alerts` | Momentum | own |  |  |
| 936 | PPO Divergence | `ppo-divergence` | Momentum | own | Pekipek |  |
| 937 | Precision Sniper | `precision-sniper` | Trend | price | WillyAlgoTrader | most liked |
| 938 | Predictive Channels | `predictive-channels` | Channels & Bands | price | LuxAlgo |  |
| 939 | Predictive Ranges | `predictive-ranges` | Channels & Bands | price | LuxAlgo | most liked |
| 940 | Premier RSI Oscillator | `premier-rsi` | Momentum | own |  |  |
| 941 | Premier Stochastic Oscillator | `premier-stochastic` | Oscillators | own |  |  |
| 942 | Premium & Discount Delta Volume | `premium-discount-delta-volume` | Volume | price | BigBeluga | most liked |
| 943 | PREMIUM TRADE ZONES | `premium-trade-zones` | Oscillators | own | ENTRYLAB | batch 27 |
| 944 | Previous Day High and Low + Separators Daily/Weekly | `previous-day-high-and-low-separators-daily` | Trend | price | Algoryze | most liked |
| 945 | Previous Day Week Highs & Lows | `previous-day-week-highs-lows` | Trend | price | sbtnc | most liked |
| 946 | Price & Volume Profile (Expo) | `price-volume-profile` | Volume | price | Zeiierman (community) |  |
| 947 | Price Acceleration Indicator (PAI) | `price-acceleration-indicator` | Momentum | own | PHICAPITALINVESTMENTS | batch 35 |
| 948 | Price Action Bands \| Trend & Volatility | `price-action-bands-trend-volatility` | Channels & Bands | price | RadixAlgo | batch 15 |
| 949 | Price Action Breakout Trend | `price-action-breakout-trend` | Trend | price | QuantAlgo | batch 5 |
| 950 | Price Action Signals Filtered +EMA | `price-action-signals-filtered-ema` | Trend | price | Aleksin_Aleksandar | batch 11 |
| 951 | Price Action Smart Money Concepts | `price-action-smart-money-concepts` | Trend | price | BigBeluga | most liked |
| 952 | Price Action Trading System | `price-action-system` | Oscillators | price |  |  |
| 953 | Price Action: Engulfing Patterns | `price-action-engulfing-patterns` | Candlestick Patterns | price | Jay9286 | batch 33 |
| 954 | Price Advance & Decline Range Analysis | `price-advance-decline-range-analysis` | Volatility | own | RicardoSantos | batch 16 |
| 955 | Price Change Sentiment Index | `price-change-sentiment-index` | Oscillators | own | TradeVizion | batch 23 |
| 956 | Price Contraction / Expansion | `price-contraction-expansion` | Volatility | price | destrobr0685 | batch 42 |
| 957 | Price Divergence Detector V3.2 revised by JustUncleL | `price-divergence-detector` | Momentum | price | JustUncleL (original author RicardoSantos) | most liked |
| 958 | Price Flow - Buy Sell | `price-flow-buy-sell` | Channels & Bands | price | IVTrader1990 | batch 35 |
| 959 | Price Linear Sequence Counter | `price-linear-sequence-counter` | Momentum | own | RicardoSantos | batch 14 |
| 960 | Price Momentum Oscillator | `price-momentum-oscillator` | Momentum | own |  |  |
| 961 | Price/Volume Value Histogram | `price-volume-value-histogram` | Volume | own | dman103 | batch 2 |
| 962 | Primitive Delta Divergence | `primitive-delta-divergence` | Volume | price | bfoster238 | batch 41 |
| 963 | Pring Special K\|a2m | `pring-special-k-a2m` | Momentum | own | ask2maniish | batch 34 |
| 964 | Prism Moving Average Trend | `prism-moving-average-trend` | Trend | price | MisinkoMaster | batch 19 |
| 965 | Pro Scalper - 2 MinutesTF by Ayoob | `pro-scalper-2-minutestf-by-ayoob` | Trend | price | FGMNDFBF | batch 30 |
| 966 | Probabilities Module - The Quant Science | `probabilities-module-the-quant-science` | Oscillators | own | thequantscience | batch 31 |
| 967 | Projected Crossover Trend | `projected-crossover-trend` | Trend | price | SchizoQuant | batch 4 |
| 968 | Prometheus Topological Persistent Entropy | `prometheus-topological-persistent-entropy` | Volatility | own | ScorsoneEnterprises | batch 23 |
| 969 | Protected Highs & Lows | `protected-highs-lows` | Trend | price | tradeforopp | most liked |
| 970 | Pullback SAR | `pullback-sar` | Trend | price | szymonsobkowiak | batch 32 |
| 971 | Pullback Scalp Trade V2 | `pullback-scalp-trade-v2` | Trend | price | Sinyalbak_App | batch 12 |
| 972 | Pullback Trading Tool ALT R1.0 by JustUncleL | `pullback-trading-tool-alt-r1-0-by-justunclel` | Moving Averages | price | JustUncleL | most liked |
| 973 | Pulse Range | `pulse-range` | Trend | price | MarketStructureLab | batch 13 |
| 974 | Pulse RSI \| Lyro RS | `pulse-rsi-lyro-rs` | Oscillators | own | LyroRS | batch 10 |
| 975 | PulseWave + Divergence | `pulsewave-divergence` | Oscillators | own | Uncle_the_shooter | batch 7 |
| 976 | Pump & Dump Detector (sensitive) | `pump-dump-detector` | Volume | price | btcpayer | batch 39 |
| 977 | Pure Coca | `pure-coca` | Oscillators | own | La_Von | batch 7 |
| 978 | Pure Price Action ICT Tools | `pure-price-action-ict-tools` | Trend | price | LuxAlgo | most liked |
| 979 | Pure Price Action Order & Breaker Blocks | `pure-price-action-order-breaker-blocks` | Trend | price | LuxAlgo | most liked |
| 980 | Pure Price Action Structures | `pure-price-action-structures` | Trend | price | LuxAlgo | most liked |
| 981 | Q Impulse Entry | `q-impulse-entry` | Trend | price | Quantora | batch 17 |
| 982 | Q KAMA Clarity Trend | `q-kama-clarity-trend` | Trend | price | Quantora | batch 7 |
| 983 | Q Wave | `q-wave` | Trend | price | Quantora | batch 36 |
| 984 | QG-Particle Oscillator | `qg-particle-oscillator` | Oscillators | own | QuantG | batch 35 |
| 985 | QQE Cross | `qqe-cross` | Trend | price | JustUncleL |  |
| 986 | QQE MOD | `qqe-mod` | Momentum | own |  |  |
| 987 | QQE Signals | `qqe-signals` | Oscillators | price | colinmck |  |
| 988 | QTechLabs Machine Learning Logistic Regression Indicator | `qtechlabs-machine-learning-logistic-regression-indicator` | Oscillators | price | QTechLabsInfo | batch 33 |
| 989 | Quant VWAP System 3.8 | `quant-vwap-system-3-8` | Oscillators | own | CustomQuantLabs (published as "Quant VWAP System 3.8") | batch 8 |
| 990 | Quantile Regression Bands | `quantile-regression-bands` | Channels & Bands | price | BackQuant | batch 17 |
| 991 | Quantitative Qualitative Estimation | `qqe` | Oscillators | own | Glaz |  |
| 992 | Quantitative Qualitative Estimation QQE | `qqe-kivanc` | Oscillators | own |  | most liked |
| 993 | Quantum Regression Oscillator | `quantum-regression-oscillator` | Oscillators | own | abgthecoder | batch 32 |
| 994 | Quantum Trend Signal | `quantum-trend-signal` | Trend | price | ReubenMiles | batch 9 |
| 995 | QuantumTrend SwiftEdge | `quantumtrend-swiftedge` | Trend | price | SwiftEdge | batch 5 |
| 996 | Quartile For Loop | `quartile-for-loop` | Trend | own | SeerQuant | batch 6 |
| 997 | Quasimodo Pattern | `quasimodo-pattern` | Candlestick Patterns | price | anodrr2 | batch 41 |
| 998 | Radiant Mean Reversion Channels | `radiant-mean-reversion-channels` | Oscillators | own | Pineify | batch 34 |
| 999 | Radius Trend [ChartPrime] | `radius-trend` | Trend | price | ChartPrime |  |
| 1000 | Rally Base Drop Signals | `rally-base-drop-signals` | Trend | price | LuxAlgo | batch 38 |
| 1001 | Range Average Retest Model | `range-average-retest-model` | Trend | price | LuxAlgo | most liked |
| 1002 | Range Breakout | `range-breakout` | Channels & Bands | price | BigBeluga | most liked |
| 1003 | Range Channel by Atilla Yurtseven | `range-channel-by-atilla-yurtseven` | Channels & Bands | own | AtillaYurtseven | batch 17 |
| 1004 | Range Detector | `range-detector` | Trend | price | LuxAlgo |  |
| 1005 | Range Filter Buy and Sell 5min - guikroth version | `range-filter-buy-sell-5min` | Trend | price | PHVNTOM_TRADER (original script by DonovanWall, adapted by | most liked |
| 1006 | Range Identifier | `range-identifier` | Channels & Bands | price |  |  |
| 1007 | Range Oscillator | `range-oscillator` | Oscillators | own | Zeiierman | batch 1 |
| 1008 | Range Tightening Indicator (RTI) | `range-tightening-indicator` | Volatility | own | Ollie_AllCaps | batch 2 |
| 1009 | Ranges With Targets | `ranges-with-targets` | Trend | price | ChartPrime | most liked |
| 1010 | Rapid Exponential Moving Average | `rapid-exponential-moving-average` | Moving Averages | price | ImmortalFreedom | batch 28 |
| 1011 | RBT strategy | `rbt-strategy` | Momentum | price | luckykoshti | batch 38 |
| 1012 | RCI 3 Lines | `rci-3lines` | Oscillators | own |  |  |
| 1013 | RCYC Bullish Bearish Indicator | `rcyc-bullish-bearish-indicator` | Momentum | price | bizarro29 | batch 38 |
| 1014 | ReadyFor401ks Just Tell Me When! | `readyfor401ks-just-tell-me-when` | Trend | price | ReadyFor401k | batch 20 |
| 1015 | Real-Time Big Trades Bubbles & Absorbtions & Deep Pressure | `big-trades-bubbles` | Volume | price | samet_lezki | batch 5 |
| 1016 | Realtime Volume Bars | `realtime-volume-bars` | Volume | own | the_MarketWhisperer |  |
| 1017 | RedK EVEREX | `redk-everex` | Momentum | own | RedKTrader |  |
| 1018 | RedK Magic Ribbon | `redk-magic-ribbon` | Moving Averages | price | RedKTrader | batch 2 |
| 1019 | RedK Momentum Bars | `redk-momentum-bars` | Momentum | own | RedKTrader |  |
| 1020 | RedK RSS_WMA | `redk-rss-wma` | Moving Averages | price | RedKTrader |  |
| 1021 | RedK Trader Pressure Index | `redk-tpx` | Momentum | own | RedKTrader |  |
| 1022 | RedK Vol_Weighted RSI: Extending the power of the classic RSI | `redk-vol-weighted-rsi` | Momentum | own | RedKTrader | batch 5 |
| 1023 | Reflex & Trendflex | `reflex-trendflex` | Oscillators | own | e2e4 | batch 6 |
| 1024 | Regression Channel Oscillator | `regression-channel-oscillator` | Oscillators | own | Uncle_the_shooter | batch 27 |
| 1025 | Relative ATR Volatility Indicator | `relative-atr-volatility-indicator` | Volatility | own | ZenAndTheArtOfTrading | batch 20 |
| 1026 | Relative Strength Heatmap | `relative-strength-heatmap` | Momentum | own | BackQuant | batch 22 |
| 1027 | Relative Strength Index - Divergences - Libertus | `relative-strength-index-divergences-libertus` | Momentum | own | Libertus | most liked |
| 1028 | Relative Valuation Oscillator | `relative-valuation-oscillator` | Oscillators | own | QuantAlgo | batch 14 |
| 1029 | Relative Volume Indicator (RVOL) | `relative-volume-indicator` | Volume | own | AlgoCollective | batch 13 |
| 1030 | Renko Boxes | `renko-boxes` | Trend | price | LuxAlgo | batch 4 |
| 1031 | Renko Candles Overlay | `renko-candles-overlay` | Trend | price | LonesomeTheBlue | most liked |
| 1032 | Renko Chart | `renko-chart` | Trend | price | LonesomeTheBlue |  |
| 1033 | Renko Compression Index (RCI) | `renko-compression-index` | Oscillators | own | nasu_is_gaji | batch 34 |
| 1034 | Renko Flip Alert (Traditional Only) | `renko-flip-alert` | Candlestick Patterns | price | deephrenology | batch 41 |
| 1035 | Renko Mod | `renko-mod` | Trend | price | RicardoSantos | batch 13 |
| 1036 | Renko Sniper PRO (Liquidity Sweep + EMA + ST + RSI) | `renko-sniper-pro` | Trend | price | zachsprad | batch 24 |
| 1037 | Renko+Moving Average+RMI Alert R3 by JustUncleL | `renko-moving-average-rmi-alert-r3-by` | Trend | price | JustUncleL | most liked |
| 1038 | Res/Sup With Concavity & Increasing / Decreasing Trend Analysis | `res-sup-with-concavity-increasing-decreasing-trend-analysis` | Trend | price | Celar (published as "Res/Sup With Concavity & Increasing / Decreasing Trend Analysis") | batch 28 |
| 1039 | Retail vs Banker Net Positions – Symmetry Break | `retail-vs-banker-net-positions-symmetry-break` | Volume | own | JasonHyde | batch 17 |
| 1040 | Retest Support Resistance Signals | `retest-support-resistance-signals` | Trend | price | ChartPrime | most liked |
| 1041 | Reversal Candle Setup | `reversal-candle-setup` | Candlestick Patterns | price |  |  |
| 1042 | Reversal Candlestick Structure | `reversal-candlestick-structure` | Candlestick Patterns | price | LuxAlgo | most liked |
| 1043 | Reversal Correlation Pressure | `reversal-correlation-pressure` | Oscillators | own | OmegaTools | batch 27 |
| 1044 | Reversal Probability Zone & Levels | `reversal-probability-zone-levels` | Trend | price | LuxAlgo | most liked |
| 1045 | Reversal Scalper 2.0- Adib Noorani | `reversal-scalper-2-0-adib-noorani` | Oscillators | own | AdibNoorani | batch 28 |
| 1046 | Reversal Signals | `reversal-signals` | Momentum | price | LuxAlgo | most liked |
| 1047 | Reversal Trap Probability Bands | `reversal-trap-probability-bands` | Channels & Bands | price | BigBeluga | most liked |
| 1048 | Rhokeo-VW-RSI Histogram for Cumulative Delta by Zeiirman | `rhokeo-vw-rsi-histogram-for-cumulative-delta-by-zeiirman` | Oscillators | own | nabil007 | batch 24 |
| 1049 | Ripster EMA Clouds | `ripster-ema-clouds` | Trend | price | ripster47 |  |
| 1050 | RMA ATR Bands | `rma-atr-bands` | Channels & Bands | price | SchizoQuant | batch 3 |
| 1051 | RMI Length | `rmi-trend-sniper` | Momentum | price | TZack88 |  |
| 1052 | Robby DSS Bressert Colored Dots | `robby-dss-bressert-colored-dots` | Oscillators | own | huatzhi | batch 21 |
| 1053 | ROC-Weighted MA Oscillator | `roc-weighted-ma-oscillator` | Oscillators | own | SeerQuant | batch 2 |
| 1054 | Rolling Liquidity Clusters Channel | `rolling-liquidity-clusters-channel` | Channels & Bands | price | LuxAlgo | batch 12 |
| 1055 | Rolling Sharpe Ratio Oscillator \| Astral Vision | `rolling-sharpe-ratio-oscillator-astral-vision` | Oscillators | own | AstralVision | batch 13 |
| 1056 | Rolling Trendline | `rolling-trendline` | Trend | price | LuxAlgo | batch 5 |
| 1057 | Ross Cameron-Inspired Day Trading Strategy | `ross-cameron-inspired-day-trading-strategy` | Momentum | price | manaziir | batch 25 |
| 1058 | RRR EMA Ignition BUY & SELL (Sideways-Proof) | `rrr-ema-ignition-buy-sell` | Trend | price | RAGSTER123 | batch 21 |
| 1059 | RS Rating (1-99) | `rs-rating` | Momentum | own | kulturdesken | batch 16 |
| 1060 | rs_MACD | `rs-macd` | Momentum | price | RicardoSantos | batch 17 |
| 1061 | RSI | `rsi-hash-capital` | Oscillators | own | Hash_Capital | batch 31 |
| 1062 | RSI & BB Oversold Scalper with MACD Confirmation | `rsi-bb-oversold-scalper-with-macd-confirmation` | Momentum | price | DotGain | batch 40 |
| 1063 | RSI & MACD Suite | `rsi-macd-suite` | Oscillators | own | aaboomar | batch 34 |
| 1064 | RSI (14) with Auto Zone Colors - Overbought/Oversold Highlighter | `rsi-with-auto-zone-colors-overbought-oversold-highlighter` | Oscillators | own | tarangbharti18 | batch 29 |
| 1065 | RSI (Kernel Optimized) \| Flux Charts | `rsi-flux-charts` | Momentum | price | fluxchart | most liked |
| 1066 | RSI + ADX + ATR 18-01-25 | `rsi-adx-atr-18-01-25` | Oscillators | own | dipak11298 | batch 37 |
| 1067 | RSI + ADX + ATR Combo | `rsi-adx-atr-combo` | Oscillators | own | shawasutosh | batch 26 |
| 1068 | RSI + BB + Dispersion | `rsi-bb-dispersion` | Oscillators | own |  |  |
| 1069 | RSI + Fibonacci HH LL Support Resistance | `rsi-fibonacci-hh-ll-support-resistance` | Channels & Bands | price | FibonacciFlux | batch 12 |
| 1070 | RSI + MACD (RSI Divergence) V3.2 | `rsi-macd-v3-2` | Oscillators | own | MKhoa | batch 24 |
| 1071 | RSI + STOCH RSI - Marx_Capital | `rsi-stoch-rsi-marx-capital` | Oscillators | own | Marx_Capital | batch 12 |
| 1072 | RSI - 5UP | `rsi-5up` | Oscillators | own | Marrulk | batch 29 |
| 1073 | RSI Bands | `rsi-bands` | Channels & Bands | price |  |  |
| 1074 | RSI Bars - OnlyFlow | `rsi-bars-onlyflow` | Momentum | price | ofderk | batch 10 |
| 1075 | RSI BB StdDev Signal | `rsi-bb-stddev-signal` | Oscillators | own | trade_lexx (Pine title "RSI Signal [trade_lexx]") | batch 8 |
| 1076 | RSI Candle Color | `rsi-candle-color` | Momentum | price | The_Peaceful_Lizard | batch 39 |
| 1077 | RSI Candles | `rsi-candles` | Momentum | own | Glaz |  |
| 1078 | RSI Confirm Trend with Williams (W%R) | `rsi-confirm-trend-with-williams` | Momentum | own | javageek | batch 11 |
| 1079 | RSI cyclic smoothed v2 | `rsi-cyclic-smoothed-v2` | Oscillators | own | StockMarketCycles | most liked |
| 1080 | RSI Divergence | `rsi-divergence` | Oscillators | own |  |  |
| 1081 | RSI Entry Engine | `rsi-entry-engine` | Oscillators | own | tradewsamet | most liked |
| 1082 | RSI Games 1.2 | `rsi-games-1-2` | Oscillators | own | petejfjohnson | batch 22 |
| 1083 | RSI HistoAlert | `rsi-histoalert` | Oscillators | own |  |  |
| 1084 | RSI Length | `most-rsi` | Momentum | own |  |  |
| 1085 | RSI Length | `parabolic-rsi` | Momentum | own |  |  |
| 1086 | RSI Length | `pmax-rsi-t3` | Momentum | own |  |  |
| 1087 | RSI Length | `rsi-cyclic-smoothed` | Momentum | own |  |  |
| 1088 | RSI MA Cross + Divergence Signal (V2) | `rsi-ma-cross-divergence-signal` | Momentum | price | noxum | batch 39 |
| 1089 | RSI Modified | `rsi-modified` | Oscillators | own | Santos_Trader_PT | batch 5 |
| 1090 | RSI Momentum Divergence | `rsi-momentum-divergence` | Oscillators | own | ChartPrime |  |
| 1091 | RSI Multi Length | `rsi-multi-length` | Oscillators | own | LuxAlgo | most liked |
| 1092 | RSI Multi Levels kiawosch 7-14-42 Consolidation | `rsi-multi-levels` | Oscillators | own | TFlab | batch 5 |
| 1093 | RSI Multicolor editable | `rsi-multicolor-editable` | Oscillators | own | Guillaume46 | batch 8 |
| 1094 | RSI PERFECT Flip Dots | `rsi-perfect-flip-dots` | Momentum | price | debanshuchanda6 | batch 42 |
| 1095 | RSI Potential | `rsi-potential` | Momentum | own | nasu_is_gaji | batch 35 |
| 1096 | RSI Snabbel | `rsi-snabbel` | Oscillators | own |  |  |
| 1097 | RSI Strategy | `rsi-strategy` | Momentum | price | HPotter | most liked |
| 1098 | RSI Supply/Demand | `rsi-supply-demand` | Trend | price | shtcoinr / Lij_MC |  |
| 1099 | RSI Support & Resistance by DGT | `rsi-support-resistance-by-dgt` | Momentum | price | dgtrd | most liked |
| 1100 | RSI Swing Indicator v2 | `rsi-swing-indicator-v2` | Momentum | price | MrDinasty (BalintDavid) | most liked |
| 1101 | RSI Swing Signal | `rsi-swing-signal` | Oscillators | own |  |  |
| 1102 | RSI Tops and Bottoms | `rsi-tops-bottoms` | Momentum | own | LonesomeTheBlue |  |
| 1103 | RSI Trend Bias | `rsi-trend-bias` | Oscillators | own | Botnet101 | batch 24 |
| 1104 | RSI Trend Navigator | `rsi-trend-navigator` | Trend | price | QuantAlgo | batch 10 |
| 1105 | RSI Zone Step Lines | `rsi-zone-step-lines` | Channels & Bands | price | Devjames | batch 11 |
| 1106 | RSI+EMA+MZONES with Divergences | `rsi-ema-mzones-with-divergences` | Oscillators | own | lordoflolz | batch 22 |
| 1107 | RSI+Stoch Band Oscillator | `rsi-stoch-band-oscillator` | Oscillators | own | nasu_is_gaji | batch 26 |
| 1108 | RSI-50 Step Line | `rsi-50-step-line` | Trend | price | Devjames | batch 5 |
| 1109 | RSI-Colored Price Candles with Background | `rsi-colored-price-candles-with-background` | Momentum | price | Midgar- | batch 39 |
| 1110 | RSI-EMA-Crossing with Donchian-Stop-Loss | `rsi-ema-crossing-with-donchian-stop-loss` | Channels & Bands | price | Kahael | batch 28 |
| 1111 | RSI: alternative derivation | `rsi-alternative-derivation` | Oscillators | own | AdaptiveRSI | batch 25 |
| 1112 | RVOL Effort Matrix | `rvol-effort-matrix` | Volume | own | TheLeadingIndicator | batch 36 |
| 1113 | S&R Breakout ATR Confirmation | `s-r-breakout-atr-confirmation` | Trend | price | Jos-ProTrader | batch 33 |
| 1114 | SAR + EMA + MACD Signals | `sar-ema-macd` | Oscillators | price |  |  |
| 1115 | Saty ATR Levels | `saty-atr-levels` | Volatility | price | satymahajan | most liked |
| 1116 | Savitzky Flow Bands | `savitzky-flow-bands` | Channels & Bands | price | ChartPrime | batch 2 |
| 1117 | Savitzky-Golay Hampel Filter \| AlphaNatt | `savitzky-golay-hampel-filter-alphanatt` | Moving Averages | price | AlphaNatt | batch 15 |
| 1118 | Scalp Pro | `scalp-pro` | Momentum | own | ovelix | most liked |
| 1119 | Scalping Line | `scalping-line` | Oscillators | own | KivancOzbilgic |  |
| 1120 | Scalping PullBack Tool R1 by JustUncleL | `scalping-pullback-tool` | Trend | price | JustUncleL | most liked |
| 1121 | Scalping Swing Trading Tool R1-4 by JustUncleL | `scalping-swing-trading-tool-r1-4-by-justunclel` | Moving Averages | price | JustUncleL | most liked |
| 1122 | Scalping Tool with Dynamic Take Profit & Stop Loss | `scalping-tool-dynamic-tp-sl` | Trend | price | TruFREND | batch 3 |
| 1123 | ScalpMap - EMA Pivot Targets | `scalpmap-ema-pivot-targets` | Trend | price | blockybears | batch 12 |
| 1124 | SCE GANN Predictions | `sce-gann-predictions` | Trend | price | ScorsoneEnterprises | batch 22 |
| 1125 | Schaff Trend Cycle | `schaff-trend-cycle` | Oscillators | own | LazyBear |  |
| 1126 | SCOTTGO Advanced MACD | `scottgo-advanced-macd` | Momentum | own | SCOTTGO (indicator title "MACD: Clean Visuals (Fixed Arrows)") | batch 27 |
| 1127 | Self-Aware Trend System | `self-aware-trend-system` | Trend | price | WillyAlgoTrader | most liked |
| 1128 | Sell & Buy Rates | `sell-buy-rates` | Volume | own | LonesomeTheBlue |  |
| 1129 | Sequential Pattern Strength | `sequential-pattern-strength` | Momentum | own | QuantAlgo | batch 9 |
| 1130 | Session Streaks | `session-streaks` | Trend | price | LuxAlgo | most liked |
| 1131 | Session Sweeps | `session-sweeps` | Volatility | price | LuxAlgo | most liked |
| 1132 | Sessions | `sessions-luxalgo` | Trend | price | LuxAlgo | most liked |
| 1133 | Sessions on Chart | `sessions-on-chart` | Trend | price | Aurocks_AIF | most liked |
| 1134 | Setup 9.1 (Larry Williams) + EMA 50 | `setup-9-1-ema-50` | Moving Averages | price | oDouglasAlex | batch 7 |
| 1135 | SExI - Super Exhaustion Indicator | `sexi-super-exhaustion-indicator` | Oscillators | own | Da_Prof | batch 14 |
| 1136 | Sharp Modified Moving Average | `sharp-modified-moving-average` | Moving Averages | price | everget | batch 18 |
| 1137 | Sharpe Ratio Indicator (180) | `sharpe-ratio-indicator` | Volatility | own | tim_amblard | batch 3 |
| 1138 | Sharpe Ratio v4 | `sharpe-ratio-v4` | Oscillators | own | Zettt | batch 32 |
| 1139 | Sharpshooter 30 – EMA Distance | `sharpshooter-30-ema-distance` | Moving Averages | price | hrak22 | batch 33 |
| 1140 | Shock Percentile Moving Average \| NAL | `shock-percentile-moving-average-nal` | Moving Averages | price | NordicAlphaLab | batch 22 |
| 1141 | Sigmoid RSI \| NAL | `sigmoid-rsi-nal` | Oscillators | own | NordicAlphaLab | batch 11 |
| 1142 | Signal Forge | `signal-forge` | Trend | price | LuxAlgo | most liked |
| 1143 | Signal Moving Average | `signal-ma` | Moving Averages | price | LuxAlgo |  |
| 1144 | Simple Moving Averages | `simple-moving-averages` | Moving Averages | price |  |  |
| 1145 | Simplified Percentile Clustering | `simplified-percentile-clustering` | Oscillators | own | InvestorUnknown | batch 4 |
| 1146 | Sine Weighted Moving Average | `sine-weighted-moving-average` | Moving Averages | price | everget | batch 13 |
| 1147 | SL - 4 EMAs, 2 SMAs & Crossover Signals | `sl-4-emas-2-smas-crossover-signals` | Moving Averages | price | MVP202020205 | batch 27 |
| 1148 | Slow Heiken Ashi | `slow-heiken-ashi` | Candlestick Patterns | price |  |  |
| 1149 | Slow Stochastic | `slow-stochastic` | Oscillators | own | Oshri17 | most liked |
| 1150 | SMA Angle Alerts | `sma-angle-alerts` | Moving Averages | price | readysetfire | batch 21 |
| 1151 | SMA DMA Crossing Signal | `sma-dma-crossing-signal` | Moving Averages | price | tradingqueen18 | batch 31 |
| 1152 | SMA Squeeze Oscillator | `sma-squeeze-oscillator` | Momentum | own | Uncle_the_shooter | batch 23 |
| 1153 | SMA+ADX Filter | `sma-adx-filter` | Trend | price | iping99 | batch 31 |
| 1154 | Smart Breakout Targets | `smart-breakout-targets` | Volatility | price | WillyAlgoTrader | most liked |
| 1155 | Smart MCDX FINAL PRO | `smart-mcdx-final-pro` | Volume | own | Sachse-1980 | batch 30 |
| 1156 | Smart Money Breakout Channels | `smart-money-breakout-channels` | Channels & Bands | price | AlgoAlpha | most liked |
| 1157 | Smart Money Breakout Signals | `smart-money-breakout-signals` | Trend | price | AlgoAlpha | most liked |
| 1158 | Smart Money Breakouts | `smart-money-breakouts` | Trend | price | ChartPrime | most liked |
| 1159 | Smart Money Concepts (SMC) | `smart-money-concepts-luxalgo` | Trend | price | LuxAlgo | most liked |
| 1160 | Smart Money Concepts Probability (Expo) | `smart-money-concepts-probability` | Trend | price | Zeiierman | most liked |
| 1161 | Smart Money Flow Signals | `smart-money-flow-signals` | Volume | own | QuantAlgo | batch 2 |
| 1162 | Smart Money Range | `smart-money-range` | Volume | price | ChartPrime | most liked |
| 1163 | Smart Money Volume Index | `smart-money-volume-index` | Volume | own | AlgoAlpha | most liked |
| 1164 | Smart Trend | `smart-trend` | Trend | price | Zofesu | batch 21 |
| 1165 | Smarter SNR (Support and Ressistance, Trendline, MTF OSC) | `smarter-snr` | Trend | price | hanabil | most liked |
| 1166 | SMC Indicator With Webhook | `smc-indicator-with-webhook` | Trend | price | sunwoo101 | most liked |
| 1167 | SMC Statistical Liquidity Walls | `smc-statistical-liquidity-walls` | Channels & Bands | price | PhenLabs | batch 25 |
| 1168 | SMC Structures and FVG | `smc-structures-and-fvg` | Trend | price | LudoGH68 | most liked |
| 1169 | SMIIOL | `smiiol` | Momentum | own | iilter | batch 25 |
| 1170 | Smooth RSI | `smooth-rsi` | Momentum | own | MarktQuant | batch 8 |
| 1171 | Smoothed Heiken Ashi | `smoothed-heiken-ashi` | Trend | price | jackvmk |  |
| 1172 | Smoothed Low-Pass Butterworth Filtered Median | `butterworth-filtered-median` | Moving Averages | price | AlphaNatt | batch 8 |
| 1173 | Smoothed Source Weighted EMA | `smoothed-source-weighted-ema` | Moving Averages | price | Clokivez | batch 13 |
| 1174 | Source | `ott-bands` | Channels & Bands | price | KivancOzbilgic |  |
| 1175 | Source | `otto` | Oscillators | own | KivancOzbilgic |  |
| 1176 | Source | `range-filter-dw` | Trend | price |  |  |
| 1177 | Source-Aligned Oscillators (for Divergences) | `source-aligned-oscillators` | Oscillators | own | QuantNomad | batch 18 |
| 1178 | SP - MACD with Divergence | `sp-macd-with-divergence` | Momentum | own | ca_sidnayak | batch 24 |
| 1179 | Spira Alligator | `spira-alligator` | Trend | price | Markedsignaler | batch 26 |
| 1180 | SPX500 Quick Drop & Rise Alerts | `spx500-quick-drop-rise-alerts` | Momentum | price | PaperChains | batch 41 |
| 1181 | Squeeze Channel | `squeeze-channel` | Channels & Bands | price | B3AR_Trades | batch 16 |
| 1182 | Squeeze Momentum | `squeeze-momentum` | Momentum | own | LazyBear |  |
| 1183 | Squeeze Momentum Indicator Version2 by KıvanÇ fr3762 | `squeeze-momentum-indicator-version2-by-k-van` | Momentum | own | KivancOzbilgic | most liked |
| 1184 | Squeeze Momentum V2 | `squeeze-momentum-v2` | Oscillators | own |  |  |
| 1185 | SSL Channel | `ssl-channel` | Trend | price |  |  |
| 1186 | SSL Hybrid | `ssl-hybrid` | Trend | price | Mihkel00 | most liked |
| 1187 | SSL HYBRID Advanced | `ssl-hybrid-advanced` | Trend | price | traderharikrishna (after "SSL Hybrid" by Mihkel00) | most liked |
| 1188 | SSL Hybrid Scalper | `ssl-hybrid-scalper` | Moving Averages | price | nabeel8369 | batch 11 |
| 1189 | ST0P | `st0p` | Oscillators | price |  |  |
| 1190 | Standardized MACD HA | `standardized-macd-ha` | Momentum | own | EliCobra |  |
| 1191 | Start | `lucid-sar` | Trend | price |  |  |
| 1192 | Statistical Price Deviation Index (MAD/VWMA) | `statistical-price-deviation-index` | Oscillators | own | exploretranspose | batch 16 |
| 1193 | STC Indicator - A Better MACD | `stc-indicator-a-better-macd` | Oscillators | own | shayankm | most liked |
| 1194 | STD-Filtered, N-Pole Gaussian Filter | `std-filtered-n-pole-gaussian-filter` | Moving Averages | price | loxx | most liked |
| 1195 | STH Unrealized Profit/Loss Ratio (STH-NUPL) | `sth-unrealized-profit-loss-ratio` | Oscillators | own | DeVrizii | batch 15 |
| 1196 | Stoch VX3 | `stoch-vx3` | Oscillators | own |  |  |
| 1197 | Stochastic Heat Map | `stochastic-heat-map` | Momentum | own | Violent |  |
| 1198 | Stochastic Momentum Index | `stochastic-momentum-index` | Oscillators | own |  |  |
| 1199 | Stochastic Momentum Index UCS | `smi-ucs` | Oscillators | own |  |  |
| 1200 | Stochastic OTT | `stochastic-ott` | Oscillators | own | KivancOzbilgic |  |
| 1201 | Stockbee ComboBull | `stockbee-combobull` | Momentum | own | traderabhi81 | batch 29 |
| 1202 | Stockbee Reversal Bullish v2 | `stockbee-reversal-bullish-v2` | Momentum | own | traderabhi81 | batch 29 |
| 1203 | Stop/Take Bounds | `stop-take-bounds` | Volatility | price | Y_Goldman | batch 27 |
| 1204 | Strong Burst Fader \| ProjectSyndicate | `strong-burst-fader-projectsyndicate` | Volatility | price | ProjectSyndicate | batch 38 |
| 1205 | Strong Demands & Supplies + Liquidity \| Zonas de Compra e Venda | `strong-demands-supplies-liquidity-zonas-de` | Trend | price | Luis_TudoSobreTrading | most liked |
| 1206 | Strong Engulfing Candlestick (With Alerts) | `strong-engulfing-candlestick` | Candlestick Patterns | price | kyjefive | batch 39 |
| 1207 | Super Guppy | `super-guppy` | Trend | price | JustUncleL |  |
| 1208 | Super OrderBlock / FVG / BoS Tools by makuchaku & eFe | `super-orderblock-fvg-bos` | Trend | price | makuchaku | most liked |
| 1209 | Super SMA 5 8 13 + EMA 20/200 Regime Filter (ALIZET) | `super-sma-5-8-13-ema-20-200-regime-filter` | Moving Averages | price | afdzjr69 | batch 19 |
| 1210 | Super Smoothed MACD | `super-smoothed-macd` | Momentum | own |  |  |
| 1211 | Super SuperTrend | `super-supertrend` | Trend | price |  |  |
| 1212 | SuperBands | `superbands` | Trend | price | The_Peaceful_Lizard | batch 7 |
| 1213 | SuperBollingerTrend (Expo) | `superbollingertrend` | Trend | price | Zeiierman | most liked |
| 1214 | SuperSmoother MA Oscillator | `supersmoother-ma-oscillator` | Oscillators | own | BOSWaves | batch 1 |
| 1215 | SuperTrend + Relative Volume (Kernel Optimized) | `supertrend-relative-volume-kernel` | Trend | price | fluxchart | most liked |
| 1216 | SuperTrend AI Clustering | `supertrend-ai-clustering` | Trend | price |  |  |
| 1217 | SuperTrend Channels | `supertrend-channels` | Channels & Bands | price |  |  |
| 1218 | Supertrend MTF Heikin Ashi | `supertrend-mtf-heikin-ashi` | Trend | price | LonesomeTheBlue | most liked |
| 1219 | SuperTrend Oscillator | `supertrend-oscillator` | Oscillators | own | LuxAlgo | most liked |
| 1220 | Supply & Demand (MTF) \| Flux Charts | `supply-demand-flux-charts` | Trend | price | fluxchart | most liked |
| 1221 | Supply and Demand Anchored | `supply-and-demand-anchored` | Volume | price | LuxAlgo | most liked |
| 1222 | Supply and Demand Daily | `supply-and-demand-daily` | Volume | price | LuxAlgo | most liked |
| 1223 | Supply and Demand Visible Range | `supply-and-demand-visible-range` | Volume | price | LuxAlgo | most liked |
| 1224 | Supply and Demand Zones | `supply-and-demand-zones` | Volume | price | BigBeluga | most liked |
| 1225 | Supply Demand Profiles | `supply-demand-profiles` | Volume | price | LuxAlgo | most liked |
| 1226 | Support & Resistance Pro Toolkit | `support-resistance-pro-toolkit` | Trend | price | LuxAlgo | most liked |
| 1227 | Support and Resistance (High Volume Boxes) | `support-resistance-high-volume-boxes` | Volume | price | ChartPrime | most liked |
| 1228 | Support and Resistance (MTF) \| Flux Charts | `support-and-resistance-flux-charts` | Trend | price | fluxchart | most liked |
| 1229 | Support and Resistance Levels with Breaks | `sr-levels-breaks` | Channels & Bands | price |  |  |
| 1230 | Support and Resistance Logistic Regression \| Flux Charts | `support-and-resistance-logistic-regression` | Trend | price | fluxchart | most liked |
| 1231 | Support and Resistance Power Channel | `support-resistance-power-channel` | Trend | price | ChartPrime | most liked |
| 1232 | Support and Resistance Signals MTF | `support-resistance-signals-mtf` | Trend | price | LuxAlgo | most liked |
| 1233 | Support Resistance - Dynamic | `support-resistance-dynamic` | Trend | price | LonesomeTheBlue | most liked |
| 1234 | Support Resistance - Dynamic v2 | `support-resistance-dynamic-v2` | Trend | price | LonesomeTheBlue | most liked |
| 1235 | Support Resistance Channels | `support-resistance-channels` | Trend | price | LonesomeTheBlue |  |
| 1236 | Support Resistance Channels/Zones Multi Time Frame | `support-resistance-channels-mtf` | Trend | price | LonesomeTheBlue | most liked |
| 1237 | Support Resistance Classification (VR) | `support-resistance-classification` | Channels & Bands | price | LuxAlgo | most liked |
| 1238 | Support Resistance Interactive | `support-resistance-interactive` | Trend | price | LonesomeTheBlue | most liked |
| 1239 | Support Resistance MTF | `support-resistance-mtf` | Trend | price | LonesomeTheBlue | most liked |
| 1240 | Support Resistance with Breaks and Retests | `support-resistance-with-breaks-and-retests` | Trend | price | HoanGhetti | most liked |
| 1241 | Support/Resistance Channel Breakout | `support-resistance-channel-breakout` | Channels & Bands | price | SuprAlgo | batch 31 |
| 1242 | Support/Resistance V2 Indicator | `support-resistance-v2-indicator` | Trend | price | BarsStallone | most liked |
| 1243 | Suppot and resistance & BUY SELL SIGNALS | `suppot-and-resistance-buy-sell-signals` | Channels & Bands | price | doganayy2 | batch 20 |
| 1244 | Sweep Candle | `sweep-candle` | Candlestick Patterns | price | odnac | batch 41 |
| 1245 | Sweep Engulf 2 Candle | `sweep-engulf-2-candle` | Candlestick Patterns | price | gastrophollic | batch 41 |
| 1246 | Sweep Engulf CHoCH | `sweep-engulf-choch` | Candlestick Patterns | price | gastrophollic | batch 38 |
| 1247 | Sweep2Trade Pro | `sweep2trade-pro` | Trend | price | chervolino | batch 8 |
| 1248 | Swing Breakout Sequence | `swing-breakout-sequence` | Trend | price | LuxAlgo | most liked |
| 1249 | Swing Failure Pattern (SFP) | `swing-failure-pattern` | Trend | price | LuxAlgo | most liked |
| 1250 | Swing Failure Signals | `swing-failure-signals` | Trend | price | AlgoAlpha | most liked |
| 1251 | Swing Highs/Lows & Candle Patterns | `swing-highs-lows-patterns` | Candlestick Patterns | price | LuxAlgo (Pine v5) |  |
| 1252 | Swing Levels and Liquidity - By Leviathan | `swing-levels-and-liquidity-by-leviathan` | Trend | price | LeviathanCapital | most liked |
| 1253 | Swing Points | `swing-points` | Trend | price | CrossTradeTeam | batch 14 |
| 1254 | Swing Profile | `swing-profile` | Volume | price | BigBeluga | most liked |
| 1255 | Swing Support and Resistance | `swing-support-and-resistance` | Trend | price | VSB-2024 | batch 25 |
| 1256 | Swing Trade Signals | `swing-trade-signals` | Oscillators | price | nicks1008 |  |
| 1257 | Swing Volume Profiles | `swing-volume-profiles` | Volume | price | LuxAlgo | most liked |
| 1258 | SwingArm ATR Trend Indicator | `swingarm-atr-trend-indicator` | Trend | price | vsnfnd (script title "Blackflag FTS") | most liked |
| 1259 | T1 Wyckoff Aggressive A/D Setup | `t1-wyckoff-aggressive-a-d-setup` | Volume | price | Teyo69 | batch 38 |
| 1260 | T3 Length | `t3-psar` | Moving Averages | price |  |  |
| 1261 | TA (Miles) Adaptive Trend | `ta-adaptive-trend` | Trend | price | TradingApologist | batch 27 |
| 1262 | Target Trend | `target-trend` | Trend | price | BigBeluga | most liked |
| 1263 | Targets For Many Indicators | `targets-for-many-indicators` | Trend | price | LuxAlgo | most liked |
| 1264 | Targets For Overlay Indicators | `targets-for-overlay-indicators` | Trend | price | LuxAlgo | most liked |
| 1265 | TASC 2025.02 Autocorrelation Indicator | `tasc-2025-02-autocorrelation` | Oscillators | own | PineCodersTASC | batch 6 |
| 1266 | TASC 2025.06 Cybernetic Oscillator | `tasc-2025-06-cybernetic-oscillator` | Oscillators | own | PineCodersTASC | batch 5 |
| 1267 | TASC 2025.09 The Continuation Index | `tasc-2025-09-the-continuation-index` | Trend | own | PineCodersTASC | batch 14 |
| 1268 | TASC 2026.01 The Reversion Index | `tasc-2026-01-the-reversion-index` | Oscillators | own | PineCodersTASC | batch 26 |
| 1269 | TASC 2026.04 A Synthetic Oscillator | `tasc-2026-04-a-synthetic-oscillator` | Oscillators | own | PineCodersTASC | batch 7 |
| 1270 | TASC 2026.05 The AutoTune Filter | `tasc-2026-05-the-autotune-filter` | Oscillators | own | PineCodersTASC | batch 8 |
| 1271 | TASC 2026.09 Adaptive SuperSmoother | `tasc-2026-09-adaptive-supersmoother` | Moving Averages | own | PineCodersTASC | batch 15 |
| 1272 | TDI - Traders Dynamic Index | `tdi-rsi` | Momentum | own |  |  |
| 1273 | Technical Ratings | `technical-ratings` | Oscillators | own |  | most liked |
| 1274 | Tenkan Cloud Signals | `tenkan-cloud-signals` | Trend | price | CodaPro | batch 11 |
| 1275 | Terminal Velocity Stop \| Lyro RS | `terminal-velocity-stop-lyro-rs` | Trend | price | LyroRS | batch 13 |
| 1276 | TFO + ADX with Histogram & Signal | `tfo-adx-with-histogram-signal` | Oscillators | own | WalrusQuant | batch 26 |
| 1277 | The Echo Forecast | `the-echo-forecast` | Trend | price | LuxAlgo | most liked |
| 1278 | The Jewel | `the-jewel` | Oscillators | own | afonso_77 | batch 37 |
| 1279 | The Mean Goose v1 | `the-mean-goose-v1` | Channels & Bands | price | FattyGuinness | batch 15 |
| 1280 | The Next Pivot | `the-next-pivot` | Trend | price | KioseffTrading | most liked |
| 1281 | The Strat | `the-strat` | Candlestick Patterns | price | shayy110 | batch 42 |
| 1282 | Theil-Sen Line Filter | `theil-sen-line-filter` | Moving Averages | price | BackQuant | batch 18 |
| 1283 | Three Bar Reversal Pattern | `three-bar-reversal-pattern` | Trend | price | LuxAlgo | most liked |
| 1284 | Three Moving Averages | `three-moving-averages` | Moving Averages | price |  |  |
| 1285 | Three-Bar Reversal/Continuation | `three-bar-reversal-continuation` | Candlestick Patterns | price | abuzka | batch 42 |
| 1286 | Tight Range Display with Background | `tight-range-display-with-background` | Volatility | price | rakeshhelva | batch 42 |
| 1287 | Tillson T3 | `tillson-t3` | Trend | price | KivancOzbilgic (fr3762) |  |
| 1288 | Time-based Alerts for Trading Windows | `time-based-alerts-for-trading-windows` | Trend | price | xhmxdir | batch 41 |
| 1289 | TMA Overlay | `tma-overlay` | Moving Averages | price | ArtyFXC | most liked |
| 1290 | TMO (True Momentum Oscillator) | `tmo` | Momentum | own | Coulisnosaj | batch 15 |
| 1291 | Tom DeMark MACD | `td-macd` | Momentum | own |  |  |
| 1292 | TonyUX EMA Scalper | `tonyux-ema-scalper` | Oscillators | price |  |  |
| 1293 | Top & Bottom Candle | `top-bottom-candle` | Candlestick Patterns | own |  |  |
| 1294 | Tops/Bottoms | `tops-bottoms` | Oscillators | price |  |  |
| 1295 | TR High/Low meter | `tr-high-low-meter` | Momentum | own | dman103 | batch 10 |
| 1296 | Trade Price - Spread Compensator Overlay | `trade-price-spread-compensator-overlay` | Channels & Bands | price | The_Forex_Steward | batch 40 |
| 1297 | Trade Prime - Fluid Trend Indicator | `trade-prime-fluid-trend-indicator` | Trend | price | tradeprime01 | batch 31 |
| 1298 | Trader XO Macro Trend Scanner | `trader-xo` | Oscillators | price |  |  |
| 1299 | Traders Dynamic Index | `tdi-hlc-trix` | Oscillators | own |  |  |
| 1300 | Traders Reality Main | `traders-reality-main` | Trend | price | TradersReality | most liked |
| 1301 | Trading ABC | `trading-abc` | Trend | price | LonesomeTheBlue | most liked |
| 1302 | Trading Activity Index | `trading-activity-index` | Volume | own | Zeiierman | batch 2 |
| 1303 | Trading Gaul | `trading-gaul` | Trend | price | investment20223 | batch 26 |
| 1304 | TradingMoja / SQZMOM ADX | `tradingmoja-sqzmom-adx` | Momentum | own | Trading_Moja | batch 32 |
| 1305 | Trailing Stop Loss Indicator by KıvanÇ fr3762 | `trailing-stop-loss-indicator-by-k-van-fr3762` | Trend | price | KivancOzbilgic | most liked |
| 1306 | Transient Zones v1.1 | `transient-zones` | Channels & Bands | price | Jurij (community) |  |
| 1307 | Tremor Tracker | `tremor-tracker` | Volatility | own | TheUltimator5 | batch 19 |
| 1308 | Trend Channels With Liquidity Breaks | `trend-channels-with-liquidity-breaks` | Channels & Bands | price | ChartPrime | most liked |
| 1309 | Trend Direction Helper (ZigZag and S/R and HH/LL labels) | `trend-direction-helper` | Trend | price | Daveatt (zig zag by Ricardo Santos, pivot levels from Backtest Rookies) | most liked |
| 1310 | Trend Direction Zone | `trend-direction-zone` | Trend | price | MarketStructureLab | batch 16 |
| 1311 | Trend Double Pullbackv1.0 | `trend-double-pullback-v1-0` | Trend | price | puduxbt | batch 26 |
| 1312 | Trend Duration Forecast | `trend-duration-forecast` | Trend | price | ChartPrime | most liked |
| 1313 | Trend Filter (2-pole) | `trend-filter` | Trend | price | BigBeluga | batch 1 |
| 1314 | Trend Flow Oscillator (CMF + MFI) + ADX | `trend-flow-oscillator-adx` | Oscillators | own | WalrusQuant | batch 19 |
| 1315 | Trend Following Moving Averages | `trend-following-ma` | Moving Averages | price | LonesomeTheBlue |  |
| 1316 | Trend Heatmap | `trend-heatmap` | Trend | own | autocrp | batch 30 |
| 1317 | Trend Impulse Channels | `trend-impulse-channels` | Trend | price | Zeiierman |  |
| 1318 | Trend Indicator A-V2 (Smoothed Heikin Ashi Cloud) | `trend-indicator-a-v2` | Trend | price | DZIV | most liked |
| 1319 | Trend Levels | `trend-levels` | Trend | price | ChartPrime | most liked |
| 1320 | Trend Line Auto | `trend-line-auto` | Trend | price | HarryBot |  |
| 1321 | Trend Lines | `trend-lines` | Trend | price | LonesomeTheBlue | most liked |
| 1322 | Trend Lines for RSI, CCI, Momentum, OBV | `trend-lines-for-rsi-cci-momentum-obv` | Oscillators | own | LonesomeTheBlue | most liked |
| 1323 | Trend Lines v2 | `trend-lines-v2` | Trend | price | LonesomeTheBlue (Pine v4) |  |
| 1324 | Trend Magic | `trend-magic` | Trend | price |  |  |
| 1325 | Trend Meter | `trend-meter` | Trend | own | Lij_MC | most liked |
| 1326 | Trend Predictor Ribbon Clone - Fixed roj karo moj karo | `trend-predictor-ribbon` | Trend | price | ronitjain18 | batch 6 |
| 1327 | Trend Pulse Oscillator | `trend-pulse-oscillator` | Oscillators | own | ChaosTrader63 | batch 35 |
| 1328 | Trend Range Detector | `trend-range-detector` | Channels & Bands | price | Zeiierman | most liked |
| 1329 | Trend Regularity Adaptive MA | `trama` | Moving Averages | price | LuxAlgo |  |
| 1330 | Trend Scalper | `trend-scalper` | Moving Averages | price | abedmahmood | batch 35 |
| 1331 | Trend State Signals | `trend-state-signals` | Trend | price | MarketStructureLab | batch 4 |
| 1332 | Trend Strength/Direction | `trend-strength-direction` | Trend | own | ddcakez | batch 32 |
| 1333 | Trend Targets | `trend-targets` | Trend | price | AlgoAlpha | most liked |
| 1334 | Trend Trader Strategy | `trend-trader` | Trend | price |  |  |
| 1335 | Trend Trigger Factor | `trend-trigger-factor` | Oscillators | own |  |  |
| 1336 | Trend Type Indicator by BobRivera990 | `trend-type-indicator-by-bobrivera990` | Trend | own | BobRivera990 | most liked |
| 1337 | Trend Volatility Index (TVI) | `trend-volatility-index` | Volatility | own | chikaharu | batch 3 |
| 1338 | Trend with ADX/EMA - Buy & Sell Signals | `trend-with-adx-ema-buy-sell-signals` | Trend | price | RMPM | batch 28 |
| 1339 | Trend-Pro | `trend-pro` | Trend | price | andrwxwy | batch 38 |
| 1340 | TrendCylinder (Expo) | `trendcylinder` | Trend | price | Zeiierman | batch 4 |
| 1341 | Trending Market Toolkit | `trending-market-toolkit` | Trend | price | LuxAlgo | most liked |
| 1342 | Trendline Breakout Navigator | `trendline-breakout-navigator` | Trend | price | LuxAlgo | most liked |
| 1343 | Trendline Breakouts With Targets | `trendline-breakouts-with-targets` | Trend | price | ChartPrime | most liked |
| 1344 | Trendlines - JD | `trendlines-jd` | Trend | price | Duyck | most liked |
| 1345 | Trendlines with Breaks [LuxAlgo] | `trendlines-with-breaks` | Trend | price | LuxAlgo |  |
| 1346 | TrendMasterPro_Fekonomi | `trendmasterpro-fekonomi` | Trend | price | fekonomi | batch 20 |
| 1347 | Trendshift | `trendshift` | Trend | price | chervolino | batch 39 |
| 1348 | TrendShift Detector | `trendshift-detector` | Candlestick Patterns | price | GIANESELLI | batch 40 |
| 1349 | TRENDSYNC BUY/SELL BY SIMPLY_DANTE-FX | `trendsync-buy-sell-by-simply-dante-fx` | Trend | price | Simply_Dante-fx | batch 36 |
| 1350 | TrendWave Bands | `trendwave-bands` | Channels & Bands | price | BigBeluga | batch 1 |
| 1351 | Triangular MA Bands | `tma-bands` | Channels & Bands | price |  |  |
| 1352 | Triangular Momentum Oscillator | `triangular-momentum-osc` | Oscillators | own |  |  |
| 1353 | Trimmed Mean ATR Bands | `trimmed-mean-atr-bands` | Channels & Bands | price | CryptoNejc | batch 17 |
| 1354 | Triple Doji Sequence | `triple-doji-sequence` | Candlestick Patterns | price | Marc_Thiart | batch 39 |
| 1355 | Triple Gaussian Smoothed Ribbon | `triple-gaussian-smoothed-ribbon` | Trend | price | BOSWaves | batch 16 |
| 1356 | Triple MA For Loop | `triple-ma-for-loop` | Trend | own | SeerQuant | batch 7 |
| 1357 | Triple MA Forecast | `triple-ma-forecast` | Moving Averages | price | yatrader2 (community) |  |
| 1358 | Triple RSI \| MisinkoMaster | `triple-rsi-misinkomaster` | Momentum | own | MisinkoMaster | batch 19 |
| 1359 | True Breakout Pattern Breakout Signal Indicator | `true-breakout-pattern-breakout-signal` | Trend | price | TradingFinder | most liked |
| 1360 | True High/Low RSI for Divergence | `true-high-low-rsi-for-divergence` | Oscillators | own | Lakt_ | batch 29 |
| 1361 | True Range eXpansion | `true-range-expansion` | Volatility | price | Sherlock_MacGyver | batch 22 |
| 1362 | TTM Squeeze | `ttm-squeeze-greeny` | Momentum | own | Greeny | most liked |
| 1363 | TTM Squeeze Pro | `ttm-squeeze-pro` | Oscillators | own | John Carter |  |
| 1364 | TTrades Daily Bias | `ttrades-daily-bias` | Trend | price | tradeforopp | most liked |
| 1365 | Turtle Soup ICT Strategy FVG + CHoCH/CSD | `turtle-soup-ict-strategy-fvg-choch-csd` | Trend | price | TradingFinder | most liked |
| 1366 | Turtle Trade Channels | `turtle-trade-channels` | Channels & Bands | price | Richard Dennis / William Eckhardt |  |
| 1367 | Tweezers & Kangaroo Tail | `tweezers-kangaroo-tail` | Candlestick Patterns | price | LonesomeTheBlue |  |
| 1368 | Twin Range Filter | `twin-range-filter` | Trend | price | colinmck |  |
| 1369 | Twin Range Filter Visualized | `twin-range-filter-visualized` | Trend | price | KivancOzbilgic | most liked |
| 1370 | Ultimate Buy & Sell | `ultimate-buy-sell` | Trend | price |  |  |
| 1371 | Ultimate Moving Average-Multi-TimeFrame-7 MA Types | `ultimate-moving-average-mtf` | Moving Averages | price | ChrisMoody | most liked |
| 1372 | Ultimate Opening Range Breakout | `ultimate-opening-range-breakout` | Volatility | price | LuxAlgo | most liked |
| 1373 | Ultimate RSI [LuxAlgo] | `ultimate-rsi` | Momentum | own | LuxAlgo |  |
| 1374 | Ultra Clean Support / Resistance Levels | `ultra-clean-support-resistance-levels` | Trend | price | Stocktitian | batch 30 |
| 1375 | Ultra Smart Trail | `ultra-smart-trail` | Trend | price | Rathack | batch 18 |
| 1376 | UM EMA SMA WMA HMA with Directional Color Change | `um-ema-sma-wma-hma-with-directional-color-change` | Moving Averages | price | UnderwearMillionaire | batch 30 |
| 1377 | Unicorn Setup Detector (aziz abid) | `unicorn-setup-detector` | Trend | price | mohammedazizabid | batch 40 |
| 1378 | Universal Large Orders Proxy fabio valentini Chat gpt Recreation | `universal-large-orders-proxy-fabio-valentini-chat-gpt-recreation` | Volume | price | boss11233 | batch 18 |
| 1379 | Universal Signal Backtester | `universal-signal-backtester` | Trend | price | LuxAlgo | most liked |
| 1380 | Uptrick: Dynamic Z-Score Deviation | `uptrick-dynamic-z-score-deviation` | Trend | price | Uptrick | batch 6 |
| 1381 | Uptrick: Liquid Reversal Bands | `liquid-reversal-bands` | Channels & Bands | price | Uptrick | batch 3 |
| 1382 | Uptrick: MultiMA_Volume | `uptrick-multima-volume` | Moving Averages | price | Uptrick | batch 16 |
| 1383 | Uptrick: RSI MA Buying/Selling signals | `uptrick-rsi-ma-buying-selling-signals` | Momentum | own | Uptrick | batch 12 |
| 1384 | Uptrick: Trend Analysis | `uptrick-trend-analysis` | Momentum | own | Uptrick | batch 14 |
| 1385 | Uptrick: Volatility Reversion Bands | `uptrick-volatility-reversion-bands` | Channels & Bands | price | Uptrick | batch 4 |
| 1386 | Uptrick: Zero Lag HMA Trend Suite | `zero-lag-hma-trend-suite` | Moving Averages | price | Uptrick | batch 3 |
| 1387 | User Defined Range Selector and Color Changing EMA Line | `user-defined-range-selector-and-color-changing-ema-line` | Moving Averages | price | Crypto_Moses | batch 23 |
| 1388 | UT Bot | `ut-bot` | Trend | price |  |  |
| 1389 | Ut bot - Trend+volume | `ut-bot-trend-volume` | Trend | price | BhargavMeghnathi | batch 40 |
| 1390 | Vacuum Candles | `vacuum-candles` | Volume | price | XrayAlgo | batch 41 |
| 1391 | Variable Moving Average | `variable-ma` | Moving Averages | price | LazyBear |  |
| 1392 | VARIS Zones | `varis-zones` | Channels & Bands | price | IAmTheLiquidity2 | batch 17 |
| 1393 | VCO Fusion | `vco-fusion` | Oscillators | own | Uncle_the_shooter | batch 20 |
| 1394 | Vdub FX Sniper | `vdub-sniper` | Oscillators | price | Vdubus |  |
| 1395 | VDUB_BINARY_PRO_3_V2  FINAL + Strategy | `vdub-binary-pro-3-v2` | Channels & Bands | price | vdubus | most liked |
| 1396 | vdub_Trend_Master_v  /  v1 / v2 / v3 | `vdub-trend-master-v-v1-v2-v3` | Trend | price | vdubus | most liked |
| 1397 | vdubus BinaryPro | `vdubus-binarypro` | Oscillators | price |  |  |
| 1398 | Vdubus Divergence Wave Pattern Generator V1 | `vdubus-divergence-wave-pattern-generator-v1` | Trend | price | vdubus | most liked |
| 1399 | VEGA (Velocity of Efficient Gain Adaptation) | `vega` | Momentum | own | B3AR_Trades | batch 20 |
| 1400 | Vervoort HA LT Candlestick Oscillator | `vervoort-ha-oscillator` | Oscillators | own |  |  |
| 1401 | VIM (Volume in Money) | `vim` | Volume | own | tbtb1111 | batch 29 |
| 1402 | Visualisation tendances | `visualisation-tendances` | Trend | price | Benjamin69 | batch 17 |
| 1403 | Volatility & Big Market Moves | `volatility-big-market-moves` | Volatility | own | nilstrades_ | batch 24 |
| 1404 | Volatility Adaptive Filtered Trend | `volatility-adaptive-filtered-trend` | Trend | price | SchizoQuant | batch 6 |
| 1405 | Volatility Band Cloud with Overextension Signals | `volatility-band-cloud-with-overextension-signals` | Channels & Bands | price | Retire_by_50 | batch 35 |
| 1406 | Volatility Bands | `volatility-bands` | Channels & Bands | price | pmk07 | batch 23 |
| 1407 | Volatility Breakout Pulse (VBP FIX) | `volatility-breakout-pulse` | Channels & Bands | price | JohnsonForexTrader | batch 36 |
| 1408 | Volatility Channel Oscillator | `volatility-channel-oscillator` | Oscillators | own | Uncle_the_shooter | batch 3 |
| 1409 | Volatility Halo \| NAL | `volatility-halo-nal` | Volatility | price | NordicAlphaLab | batch 6 |
| 1410 | Volatility Quality | `volatility-quality` | Volatility | own | AlphaExtract | batch 18 |
| 1411 | Volatility-Driven VWAP Structure | `volatility-driven-vwap-structure` | Channels & Bands | price | Zeiierman | batch 3 |
| 1412 | Volatility-Gated Trend Oscillator | `volatility-gated-trend-oscillator` | Oscillators | own | QuantAlgo | batch 9 |
| 1413 | VOLD Ratio Histogram | `vold-ratio-histogram` | Volume | own | Th16rry | batch 23 |
| 1414 | Volumatic Fair Value Gaps | `volumatic-fair-value-gaps` | Volume | price | BigBeluga | most liked |
| 1415 | Volumatic S/R Levels | `volumatic-sr-levels` | Trend | price | BigBeluga |  |
| 1416 | Volumatic Variable Index Dynamic Average | `volumatic-variable-index-dynamic-average` | Trend | price | BigBeluga | most liked |
| 1417 | Volume + RSI & MA Differential | `volume-rsi-ma-differential` | Volume | own | ozzy_livin | batch 7 |
| 1418 | Volume Accumulation Percentage | `volume-accumulation-pct` | Volume | own |  |  |
| 1419 | Volume Alert | `volume-alert` | Volume | price | oDouglasAlex | batch 42 |
| 1420 | Volume and Volatility Ratio Indicator-WODI | `volume-and-volatility-ratio-indicator-wodi` | Volume | own | W0DI | batch 16 |
| 1421 | Volume Bands | `volume-bands` | Channels & Bands | price | MisinkoMaster | batch 6 |
| 1422 | Volume Bar Breakout | `volume-bar-breakout` | Volume | price | tradeswithashish |  |
| 1423 | Volume bar range | `volume-bar-range` | Volume | price | pandorid | batch 25 |
| 1424 | Volume Bars Color | `volume-bars-color` | Volume | own | Evgenyc111 | batch 20 |
| 1425 | Volume Buy/Sell Split | `volume-buy-sell-split` | Volume | own | LHAMA-Trading | batch 26 |
| 1426 | Volume Candle Coloring v5 (BARCOLOR STABLE) | `volume-candle-coloring-v5` | Volume | price | sugogou | batch 37 |
| 1427 | Volume Candle Highlighter | `volume-candle-highlighter` | Volume | price | Dougie_dee | batch 5 |
| 1428 | Volume Candles | `volume-candles` | Volume | price | alexrainman | batch 39 |
| 1429 | Volume Colored Bars | `volume-colored-bars` | Volume | own |  |  |
| 1430 | Volume Comparison with Buyer/Seller Pressure | `volume-comparison-with-buyer-seller-pressure` | Volume | own | ask2maniish | batch 26 |
| 1431 | Volume Divergence | `volume-divergence` | Volume | own | baymucuk |  |
| 1432 | Volume Flow Indicator | `volume-flow-indicator` | Volume | own |  |  |
| 1433 | Volume Flow v3 | `volume-flow-v3` | Volume | own | DepthHouse / oh92 (community) |  |
| 1434 | Volume Footprint | `volume-footprint` | Volume | price | LuxAlgo |  |
| 1435 | Volume Gaps & Imbalances | `volume-gaps-imbalances` | Volume | price | Zeiierman | most liked |
| 1436 | Volume LinReg Trend | `volume-linreg-trend` | Volume | own | LonesomeTheBlue |  |
| 1437 | Volume Order Blocks | `volume-order-blocks` | Volume | price | BigBeluga | most liked |
| 1438 | Volume Orderbook (Expo) | `volume-orderbook` | Volume | price | Zeiierman | most liked |
| 1439 | Volume Positive Negative (VPN) | `volume-positive-negative` | Volume | own | LevelUpTools | batch 2 |
| 1440 | Volume Price Confirmation Indicator | `vpci` | Volume | own |  |  |
| 1441 | Volume Profile | `volume-profile` | Volume | price | LuxAlgo | most liked |
| 1442 | Volume Profile (kv4coins) | `volume-profile-kv4coins` | Volume | price | kv4coins | most liked |
| 1443 | Volume Profile + Pivot Levels | `volume-profile-pivot-levels` | Volume | price | ChartPrime | most liked |
| 1444 | Volume Profile / Fixed Range | `volume-profile-fixed-range` | Volume | price | LonesomeTheBlue | most liked |
| 1445 | Volume Profile Free Pro (25 Levels Value Area VWAP) by RRB | `volume-profile-free-pro-by-rrb` | Volume | price | RagingRocketBull | most liked |
| 1446 | Volume Profile Free Ultra SLI (100 Levels Value Area VWAP) - RRB | `volume-profile-free-ultra-sli` | Volume | price | RagingRocketBull | most liked |
| 1447 | Volume Profile Heatmap | `volume-profile-heatmap` | Volume | price | KeyAlgos | batch 13 |
| 1448 | Volume Profile per day with support/resistance lines | `volume-profile-per-day-with-support` | Volume | price | juliangonzaconde | most liked |
| 1449 | Volume Profile, Pivot Anchored by DGT | `volume-profile-pivot-anchored` | Volume | price | dgtrd | most liked |
| 1450 | Volume Sentiment Breakout Channels | `volume-sentiment-breakout-channels` | Channels & Bands | price | AlgoAlpha | most liked |
| 1451 | Volume Spike and Contraction Indicator | `volume-spike-and-contraction-indicator` | Volume | price | epicurusMcPot | batch 41 |
| 1452 | Volume Spike Indicator | `volume-spike-indicator` | Volume | price | rikyu04 | batch 42 |
| 1453 | Volume Suite - By Leviathan (CVD, Volume Delta, Relative Volume) | `volume-suite-by-leviathan` | Volume | own | LeviathanCapital | most liked |
| 1454 | Volume SuperTrend AI | `volume-supertrend-ai` | Trend | price |  |  |
| 1455 | Volume Surge Detector | `volume-surge-detector` | Volume | own | SpeculationLab | batch 19 |
| 1456 | Volume Variation Index Indicator | `volume-variation-index-indicator` | Volume | own | thequantscience | batch 35 |
| 1457 | Volume Weighted MACD V2 | `vw-macd-v2` | Momentum | own |  |  |
| 1458 | Volume Weighted Median Price (VWMP) | `volume-weighted-median-price` | Moving Averages | price | vsov | batch 14 |
| 1459 | Volume Weighted RSI (VW RSI) | `volume-weighted-rsi` | Momentum | own | CsokosGeza | batch 34 |
| 1460 | Volume Weighted Trend | `volume-weighted-trend` | Trend | price | QuantAlgo | batch 1 |
| 1461 | Volume with Alert | `volume-with-alert` | Volume | own | BullBearSR | batch 30 |
| 1462 | Volume with EMA and Coloring Rules | `volume-with-ema-and-coloring-rules` | Volume | own | itisfilipe | batch 37 |
| 1463 | Volume-Based Moving Average | `volume-based-moving-average` | Moving Averages | price | The_Forex_Steward | batch 36 |
| 1464 | Volume-Based RSI Color Indicator with MAs | `volume-based-rsi-color-indicator-with-mas` | Oscillators | own | Riccardo02 | batch 32 |
| 1465 | Volume-based Support & Resistance Zones | `volume-based-support-resistance-zones` | Volume | price | tommyf1001 | most liked |
| 1466 | Volume-Gated Trend Ribbon | `volume-gated-trend-ribbon` | Trend | price | QuantAlgo | batch 3 |
| 1467 | Volume-Trend Order Block Engine | `volume-trend-order-block-engine` | Trend | price | BigBeluga | most liked |
| 1468 | Volume-Weighted MA Crossover | `volume-weighted-ma-crossover` | Moving Averages | price | AlphaNatt | batch 9 |
| 1469 | Volume-Weighted Money Flow | `volume-weighted-money-flow` | Volume | own | sgbpulse | batch 33 |
| 1470 | Volume-Weighted Pivot Bands | `volume-weighted-pivot-bands` | Channels & Bands | price | LeafAlgo | batch 33 |
| 1471 | Volume-Weighted Price Z-Score | `volume-weighted-price-z-score` | Oscillators | own | QuantAlgo | batch 6 |
| 1472 | Volumetric Compressed MA | `volumetric-compressed-ma` | Moving Averages | price | serkany88 | batch 14 |
| 1473 | Volumetric Entropy Index | `volumetric-entropy-index` | Volume | own | Sherlock_MacGyver | batch 27 |
| 1474 | Volumetric Tensegrity | `volumetric-tensegrity` | Volume | own | TheLeadingIndicator | batch 30 |
| 1475 | VolVol | `volvol` | Volume | price | kunalgolani | batch 26 |
| 1476 | Vortex Pro with Moving average | `vortex-pro-with-moving-average` | Oscillators | own | pointalgo | batch 25 |
| 1477 | Voss Predictive Filter | `voss-predictive-filter` | Oscillators | own | e2e4 | batch 8 |
| 1478 | VPSA-VTD | `vpsa-vtd` | Volume | own | CatTheTrader | batch 11 |
| 1479 | Vulkan Profit | `vulkan-profit` | Trend | price | AlgoCollective | batch 33 |
| 1480 | VuManChu Swing Free | `vumanchu-swing` | Trend | price |  |  |
| 1481 | VWAP & Dual MA Ribbon Tracker Pro | `vwap-dual-ma-ribbon-tracker-pro` | Trend | own | Simon20cent | batch 19 |
| 1482 | VWAP Deviation Oscillator | `vwap-deviation-oscillator` | Oscillators | own | BackQuant | batch 9 |
| 1483 | VWAP Periodic Close | `vwap-periodic-close` | Volume | price | LuxAlgo | most liked |
| 1484 | VWAP Predictive Breakout + RSI + OB + Trend/Chop | `vwap-predictive-breakout-rsi-ob-trend-chop` | Volume | price | Viggy02 | batch 31 |
| 1485 | VWAP Stdev Bands v2 Mod | `vwap-stdev-bands-v2-mod` | Channels & Bands | price | TheYangGuizi | most liked |
| 1486 | VWAP Volume Profile | `vwap-volume-profile` | Volume | price | BigBeluga | most liked |
| 1487 | VWAP/MVWAP/EMA Crossover | `vwap-mvwap-ema-crossover` | Trend | price | DerrickLaFlame |  |
| 1488 | VWMA/SMA Delta Volatility (Statistical Anomaly Detector) | `vwma-sma-delta-volatility` | Volatility | own | tkarolak | batch 14 |
| 1489 | VWMACD & SZO | `vwmacd-szo` | Momentum | own |  |  |
| 1490 | VWMACD-MFI-OBV Composite | `vwmacd-mfi-obv-composite` | Volume | own | munair | batch 27 |
| 1491 | VWRSI Crossovers & Extremes | `vwrsi-crossovers-extremes` | Momentum | own | TheAITradingDesk | batch 35 |
| 1492 | Waddah Attar Explosion | `waddah-attar-explosion` | Momentum | own | LazyBear/ShayanKM |  |
| 1493 | WAE Sniper Scalp XAUUSD M1 Tuned | `wae-sniper-scalp-xauusd-m1-tuned` | Momentum | own | khonthailoei19071983 | batch 19 |
| 1494 | Wave N + KDJ + Volumi + SMC + Ichimoku | `wave-n-kdj-volumi-smc-ichimoku` | Trend | price | Nikus63 | batch 31 |
| 1495 | WaveFunction MACD | `wavefunction-macd` | Momentum | own | TechnoBlooms | batch 27 |
| 1496 | Wavelet Filter with Adaptive Upsampling | `wavelet-filter-with-adaptive-upsampling` | Oscillators | own | BackQuant | batch 29 |
| 1497 | Wavelet Transform Trend | `wavelet-transform-trend` | Trend | price | QuantAlgo | batch 12 |
| 1498 | Wavelet-Trend ML Integration | `wavelet-trend-ml-integration` | Oscillators | own | AlphaExtract | batch 1 |
| 1499 | WaveTrend | `wavetrend` | Oscillators | own | LazyBear |  |
| 1500 | WaveTrend Oscillator | `wavetrend-oscillator` | Momentum | own | LazyBear |  |
| 1501 | WaveTrend Oscillator + Divergence  + Direction Detection +Alerts | `wavetrend-oscillator-divergence-direction` | Oscillators | own |  | most liked |
| 1502 | Wedge and Flag Finder (Multi - zigzag) | `wedge-and-flag-finder` | Trend | price | Trendoscope | most liked |
| 1503 | Weierstrass Function (Fractal Cycles) | `weierstrass-function` | Oscillators | own | fract | batch 17 |
| 1504 | Weighted percentile nearest rank | `weighted-percentile-nearest-rank` | Moving Averages | price | gorx1 | batch 10 |
| 1505 | Weighted Regression Bands | `weighted-regression-bands` | Channels & Bands | price | Zeiierman | batch 5 |
| 1506 | Weis Wave Candle | `weis-wave-candle` | Trend | own | Uncle_the_shooter | batch 34 |
| 1507 | Weis Wave Volume | `weis-wave-volume` | Volume | own |  |  |
| 1508 | Whale Activity Impact Oscillator | `whale-activity-impact-oscillator` | Volume | own | mdeacey | batch 18 |
| 1509 | Whale Volume Absorption & Aggression @MaxMaserati 3.0 | `whale-volume-absorption-aggression-maxmaserati-3-0` | Volume | own | MaxMaserati | batch 22 |
| 1510 | Wick Volume Alert | `wick-volume-alert` | Candlestick Patterns | price | Shazam77 | batch 41 |
| 1511 | WICK.ED Fractals | `wicked-fractals` | Oscillators | price | Mit Nayi (community) |  |
| 1512 | Williams Alligator + Fractals | `williams-combo` | Trend | price | vlkvr (Pine v3) |  |
| 1513 | Williams BBDiv Signal | `williams-bbdiv-signal` | Oscillators | own | trade_lexx | batch 20 |
| 1514 | Williams Percent Range with Threshold | `williams-percent-range-with-threshold` | Oscillators | own | xdextra | batch 29 |
| 1515 | Williams Vix Fix | `williams-vix-fix` | Volatility | own | ChrisMoody |  |
| 1516 | WLSMA: fast approximation | `wlsma-fast-approximation` | Moving Averages | price | gorx1 | batch 33 |
| 1517 | Wyckoff Effort vs. Result | `wyckoff-effort-vs-result` | Volume | price | TradeTechanalysis | batch 34 |
| 1518 | x5-smooth-ema | `x5-smooth-ema` | Moving Averages | price | traderninezero | batch 19 |
| 1519 | XAUUSD Buy/Sell Alerts with SL & TP | `xauusd-buy-sell-alerts-with-sl-tp` | Moving Averages | price | alexandrossolomou1 | batch 8 |
| 1520 | XAUUSD Family Scalping (5min) | `xauusd-family-scalping` | Oscillators | price | cupra_inc | batch 8 |
| 1521 | Z-Score | `z-score` | Oscillators | own | joecalledher | batch 21 |
| 1522 | Z-Score Oscillator | `z-score-oscillator` | Oscillators | own | B3AR_Trades | batch 12 |
| 1523 | Z-Score STDEMA Bands | `z-score-stdema-bands` | Oscillators | own | TiagoTF | batch 24 |
| 1524 | Z-Score Trend Monitor | `z-score-trend-monitor` | Oscillators | own | EdgeTerminal | batch 31 |
| 1525 | Zero Lag LSMA (ZLSMA) | `zlsma` | Moving Averages | price | veryfid |  |
| 1526 | Zero Lag MACD | `zero-lag-macd` | Momentum | own | AC (based on Glaz) |  |
| 1527 | Zero Lag Signals For Loop | `zero-lag-signals-for-loop` | Trend | price | QuantAlgo | batch 1 |
| 1528 | Zero Lag Trend Signals (MTF) | `zero-lag-trend-signals` | Trend | price | AlgoAlpha | most liked |
| 1529 | Zero-Lag GARCH Bands \| NAL | `zero-lag-garch-bands-nal` | Volatility | price | NordicAlphaLab | batch 12 |
| 1530 | Zig Zag Channels | `zig-zag-channels` | Channels & Bands | price | LuxAlgo | most liked |
| 1531 | ZigZag Multi Time Frame with Fibonacci Retracement | `zigzag-multi-time-frame-with-fibonacci` | Trend | price | LonesomeTheBlue | most liked |
| 1532 | ZigZag Multiple Methods - Forecast - patterns - labels | `zigzag-multiple-methods-forecast-patterns` | Trend | price | RicardoSantos | most liked |
| 1533 | ZigZag Percent Reversal - Forecast - patterns - labels | `zigzag-percent-reversal-forecast-patterns` | Trend | price | RicardoSantos | most liked |
| 1534 | Zigzag Trend/Divergence Detector | `zigzag-trend-divergence-detector` | Trend | price | Trendoscope | most liked |
| 1535 | ZigZag with Fibonacci Levels | `zigzag-fibonacci` | Trend | price | LonesomeTheBlue |  |
| 1536 | ZVOL - Z-Score Volume Heatmap | `zvol-z-score-volume-heatmap` | Volume | own | TheLeadingIndicator | batch 28 |
| 1537 | 🌊 ALMA Bands | `alma-bands` | Moving Averages | price | B3AR_Trades | batch 26 |
