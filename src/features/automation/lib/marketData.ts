import { addDays, format, parse } from "date-fns"
import bundledUniverse from "../data/nifty200.json"
import type { Candle } from "./scanner"

// Free sources, no login: Upstox historical candles (daily OHLCV), the Nifty 200 list from niftyindices.com,
// and NSE's corporate event calendar for upcoming results. Each call degrades gracefully if a source is down.

const UPSTOX = "https://api.upstox.com/v3/historical-candle"
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
export const NIFTY50_KEY = "NSE_INDEX|Nifty 50"

export interface UniverseStock {
    symbol: string
    name: string
    sector: string
    isin: string
}

export const instrumentKey = (isin: string) => `NSE_EQ|${isin}`

/** Current time in India as a Date whose UTC fields read as IST. */
export function istNow(now = new Date()) {
    return new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
}

export const istToday = (now = new Date()) => istNow(now).toISOString().slice(0, 10)

async function fetchWithRetry(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" })
        if ((res.status === 429 || res.status >= 500) && attempt < 2) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
            continue
        }
        return res
    }
}

type UpstoxCandle = [string, number, number, number, number, number, number]

const toCandles = (rows: UpstoxCandle[]): Candle[] =>
    rows
        .map(([ts, open, high, low, close, volume]) => ({ date: ts.slice(0, 10), open, high, low, close, volume }))
        .sort((a, b) => a.date.localeCompare(b.date))

/** Daily candles, oldest first. `withToday` also asks for today's session candle (available after the close). */
export async function fetchDailyCandles(key: string, opts: { days?: number; withToday?: boolean; now?: Date } = {}): Promise<Candle[]> {
    const today = istToday(opts.now)
    const from = format(addDays(new Date(`${today}T00:00:00Z`), -(opts.days ?? 420)), "yyyy-MM-dd")
    const encoded = encodeURIComponent(key)
    const res = await fetchWithRetry(`${UPSTOX}/${encoded}/days/1/${today}/${from}`, { headers: { Accept: "application/json" } })
    if (!res.ok) throw new Error(`Upstox ${res.status} for ${key}`)
    const body = await res.json()
    const candles = toCandles(body?.data?.candles || [])

    if (opts.withToday && candles[candles.length - 1]?.date !== today) {
        const intraday = await fetchWithRetry(`${UPSTOX}/intraday/${encoded}/days/1`, { headers: { Accept: "application/json" } })
        if (intraday.ok) {
            const todayCandles = toCandles((await intraday.json())?.data?.candles || []).filter(c => c.date === today)
            if (todayCandles.length) candles.push(todayCandles[todayCandles.length - 1])
        }
    }
    return candles
}

/** Runs `fn` over `items` with at most `limit` in flight; failures are returned, not thrown. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<({ ok: true; value: R } | { ok: false; error: string })[]> {
    const results: ({ ok: true; value: R } | { ok: false; error: string })[] = new Array(items.length)
    let next = 0
    const worker = async () => {
        while (next < items.length) {
            const i = next++
            try {
                results[i] = { ok: true, value: await fn(items[i]) }
            } catch (e) {
                results[i] = { ok: false, error: e instanceof Error ? e.message : String(e) }
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
    return results
}

function parseCsv(text: string): string[][] {
    const rows: string[][] = []
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue
        const cells: string[] = []
        let cur = ""
        let quoted = false
        for (let i = 0; i < line.length; i++) {
            const ch = line[i]
            if (ch === '"') {
                if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
            } else if (ch === "," && !quoted) {
                cells.push(cur)
                cur = ""
            } else cur += ch
        }
        cells.push(cur)
        rows.push(cells.map(c => c.trim()))
    }
    return rows
}

/** Nifty 200 constituents with sector and ISIN. Falls back to the snapshot bundled with the app. */
export async function loadUniverse(): Promise<{ stocks: UniverseStock[]; source: "live" | "bundled" }> {
    try {
        const res = await fetchWithRetry("https://www.niftyindices.com/IndexConstituent/ind_nifty200list.csv", { headers: { "User-Agent": BROWSER_UA } }, 8000)
        if (res.ok) {
            const [header, ...rows] = parseCsv(await res.text())
            const col = (name: string) => header.findIndex(h => h.replace(/^﻿/, "").toLowerCase() === name)
            const [iName, iInd, iSym, iSeries, iIsin] = ["company name", "industry", "symbol", "series", "isin code"].map(col)
            const stocks = rows
                .filter(r => r[iSeries] === "EQ" && r[iIsin])
                .map(r => ({ symbol: r[iSym], name: r[iName], sector: r[iInd], isin: r[iIsin] }))
            if (stocks.length >= 150) return { stocks, source: "live" }
        }
    } catch {
        // fall through to the bundled list
    }
    return { stocks: bundledUniverse.stocks, source: "bundled" }
}

export function findInUniverse(stocks: UniverseStock[], symbol: string) {
    const s = symbol.trim().toUpperCase()
    return stocks.find(x => x.symbol.toUpperCase() === s) || bundledUniverse.stocks.find(x => x.symbol.toUpperCase() === s) || null
}

/** Upcoming results dates by symbol (next ~4 weeks) from NSE's event calendar. Empty map if NSE is unreachable. */
export async function fetchResultsCalendar(): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    try {
        const res = await fetchWithRetry("https://www.nseindia.com/api/event-calendar?index=equities", {
            headers: { "User-Agent": BROWSER_UA, Accept: "application/json", Referer: "https://www.nseindia.com/companies-listing/corporate-filings-event-calendar" },
        }, 8000)
        if (!res.ok) return map
        const events: { symbol: string; purpose: string; date: string }[] = await res.json()
        for (const e of events) {
            if (!/result/i.test(e.purpose || "")) continue
            const date = format(parse(e.date, "dd-MMM-yyyy", new Date()), "yyyy-MM-dd")
            const prev = map.get(e.symbol)
            if (!prev || date < prev) map.set(e.symbol, date)
        }
    } catch {
        // NSE often blocks automated requests; results dates then stay manual.
    }
    return map
}
