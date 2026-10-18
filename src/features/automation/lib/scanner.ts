// Momentum Breakout scan on daily candles. Mirrors the constitution's Chartink filters (Part A3) one for one,
// so a stock flagged here is the same stock the "MB breakout" scan would return.

export interface Candle {
    date: string // yyyy-MM-dd
    open: number
    high: number
    low: number
    close: number
    volume: number
}

export interface StockSnapshot {
    date: string
    open: number
    high: number
    low: number
    close: number
    volume: number
    sma50: number
    sma200: number
    sma200Prev20: number
    high52w: number
    ema20: number
    baseHigh: number       // highest high of the 20 sessions before today
    baseLow: number        // lowest low of the 20 sessions before today
    baseRangePct: number
    baseWeeks: number      // how long the quiet range has lasted (0 if the last 20 sessions weren't quiet)
    volumeRatio: number    // today's volume ÷ 50-day average volume
    checks: {
        aboveSma50: boolean        // filter 1
        sma50AboveSma200: boolean  // filter 2
        sma200Rising: boolean      // filter 3
        near52wHigh: boolean       // filter 4
        quietBase: boolean         // filter 5
        closeAboveBase: boolean    // filter 6
        volumeSurge: boolean       // filter 7
        upperHalfClose: boolean    // filter 8
    }
    strong: boolean      // check 2: filters 1–4
    isBase: boolean      // "MB bases" scan: filters 1–5
    isBreakout: boolean  // "MB breakout" scan: filters 1–8
}

export const MIN_HISTORY = 221

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

function smaAt(values: number[], end: number, n: number): number | null {
    if (end - n + 1 < 0) return null
    return mean(values.slice(end - n + 1, end + 1))
}

export function emaSeries(values: number[], n: number): (number | null)[] {
    const out: (number | null)[] = values.map(() => null)
    if (values.length < n) return out
    const k = 2 / (n + 1)
    let ema = mean(values.slice(0, n))
    out[n - 1] = ema
    for (let i = n; i < values.length; i++) {
        ema = values[i] * k + ema * (1 - k)
        out[i] = ema
    }
    return out
}

// Longest stretch (≥ 20 sessions, ending yesterday) whose lowest low stays within 15% of its highest high.
function quietSessions(candles: Candle[], index: number): number {
    let longest = 0
    let hi = -Infinity
    let lo = Infinity
    for (let n = 1; n <= Math.min(index, 250); n++) {
        const c = candles[index - n]
        hi = Math.max(hi, c.high)
        lo = Math.min(lo, c.low)
        if (lo < hi * 0.85) break
        if (n >= 20) longest = n
    }
    return longest
}

/** Analyses the candle at `index` (default: the latest). Returns null when there isn't enough history for the 200-day average. */
export function analyzeStock(candles: Candle[], index = candles.length - 1): StockSnapshot | null {
    if (index < MIN_HISTORY - 1 || index >= candles.length) return null
    const closes = candles.map(c => c.close)
    const volumes = candles.map(c => c.volume)
    const today = candles[index]

    const sma50 = smaAt(closes, index, 50)!
    const sma200 = smaAt(closes, index, 200)!
    const sma200Prev20 = smaAt(closes, index - 20, 200)!
    const high52w = Math.max(...candles.slice(Math.max(0, index - 249), index + 1).map(c => c.high))
    const prior20 = candles.slice(index - 20, index)
    const baseHigh = Math.max(...prior20.map(c => c.high))
    const baseLow = Math.min(...prior20.map(c => c.low))
    const volumeAvg = smaAt(volumes, index, 50)!
    const ema20 = emaSeries(closes.slice(0, index + 1), 20)[index]!
    const sessions = quietSessions(candles, index)

    const checks = {
        aboveSma50: today.close > sma50,
        sma50AboveSma200: sma50 > sma200,
        sma200Rising: sma200 > sma200Prev20,
        near52wHigh: today.close > high52w * 0.75,
        quietBase: baseLow > baseHigh * 0.85,
        closeAboveBase: today.close > baseHigh,
        volumeSurge: today.volume > volumeAvg * 1.5,
        upperHalfClose: today.close * 2 > today.high + today.low,
    }
    const strong = checks.aboveSma50 && checks.sma50AboveSma200 && checks.sma200Rising && checks.near52wHigh
    const isBase = strong && checks.quietBase

    return {
        date: today.date,
        open: today.open,
        high: today.high,
        low: today.low,
        close: today.close,
        volume: today.volume,
        sma50,
        sma200,
        sma200Prev20,
        high52w,
        ema20,
        baseHigh,
        baseLow,
        baseRangePct: (1 - baseLow / baseHigh) * 100,
        baseWeeks: Math.round((sessions / 5) * 10) / 10,
        volumeRatio: volumeAvg > 0 ? today.volume / volumeAvg : 0,
        checks,
        strong,
        isBase,
        isBreakout: isBase && checks.closeAboveBase && checks.volumeSurge && checks.upperHalfClose,
    }
}

export interface MarketLight {
    date: string
    close: number
    sma200: number
    green: boolean
}

/** Check 1: Nifty 50 closed above its 200-day SMA. */
export function marketLight(nifty: Candle[], index = nifty.length - 1): MarketLight | null {
    if (index < 199) return null
    const sma200 = smaAt(nifty.map(c => c.close), index, 200)!
    return { date: nifty[index].date, close: nifty[index].close, sma200, green: nifty[index].close > sma200 }
}

/** Index of the candle on `date`, or of the last candle before it. -1 if none. */
export function indexOnOrBefore(candles: Candle[], date: string): number {
    for (let i = candles.length - 1; i >= 0; i--) {
        if (candles[i].date <= date) return i
    }
    return -1
}
