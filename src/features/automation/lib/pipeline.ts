import { endOfWeek, parseISO, startOfWeek } from "date-fns"
import {
    addTradingDays, computeSizing, computeStatus, isBreakout, realizedDate, reviewStats, toISO, tradingDaysBetween,
    type ConstitutionStatus, type ReviewStats, type SizingResult,
} from "@/features/constitution/lib/engine"
import { CHECKLIST, MAX_ENTRIES_PER_WEEK, MAX_OPEN_POSITIONS, MAX_PER_SECTOR, RESULTS_BUFFER_TRADING_DAYS, SETUP_ID, breachLabel } from "@/features/constitution/lib/rules"
import {
    deleteTrade, getAutomation, getBreaches, getConstitution, getLatestScan, getScan, getTrades, saveAutomation, saveScan, saveTrade, updateTrade,
    type ScanResult, type ScanStock, type Trade,
} from "@/lib/db"
import { constitutionEmails } from "@/lib/access"
import { capitalise, readSetup } from "./analysis"
import { composeDailyDigest, fmtR, inr, shortDate, signedInr, type OpenAutoPosition, type SignalDecision } from "./digest"
import {
    NIFTY50_KEY, fetchDailyCandles, fetchResultsCalendar, instrumentKey, istNow, istToday, loadUniverse, mapLimit,
    type UniverseStock,
} from "./marketData"
import { stepPaper, type PaperExitReason, type PaperState } from "./paperEngine"
import { analyzeStock, emaSeries, marketLight, type Candle, type MarketLight, type StockSnapshot } from "./scanner"
import { escapeHtml, sendMessage } from "./telegram"
import { checkOpenPosition } from "./tracking"

// ---------------------------------------------------------------------------
// Who automation runs for: accounts in CONSTITUTION_EMAILS that have constitution mode switched on.
// ---------------------------------------------------------------------------

export async function activeConstitutionUsers(): Promise<string[]> {
    const emails = constitutionEmails()
    const settings = await Promise.all(emails.map(email => getConstitution(email)))
    return emails.filter((_, i) => settings[i]?.enabled)
}

const appUrl = () => (process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "")
const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// Market data and the scan
// ---------------------------------------------------------------------------

export interface MarketData {
    asOf: string
    light: MarketLight
    candles: Map<string, Candle[]>
    keys: Map<string, string>
    universe: UniverseStock[]
    universeSource: "live" | "bundled"
    results: Map<string, string>
    failures: number
}

function afterClose(now: Date) {
    const ist = istNow(now)
    const day = ist.getUTCDay()
    return day >= 1 && day <= 5 && ist.getUTCHours() * 60 + ist.getUTCMinutes() >= 15 * 60 + 45
}

export async function loadMarketData(extra: { symbol: string; key: string }[] = [], now = new Date()): Promise<MarketData> {
    const [{ stocks, source }, results] = await Promise.all([loadUniverse(), fetchResultsCalendar()])
    const withToday = afterClose(now)
    const nifty = await fetchDailyCandles(NIFTY50_KEY, { withToday, now })
    const light = marketLight(nifty)
    if (!light) throw new Error("Not enough Nifty 50 history from Upstox")

    const keys = new Map<string, string>()
    for (const s of stocks) keys.set(s.symbol, instrumentKey(s.isin))
    for (const e of extra) if (!keys.has(e.symbol)) keys.set(e.symbol, e.key)

    const symbols = [...keys.keys()]
    const fetched = await mapLimit(symbols, 8, symbol => fetchDailyCandles(keys.get(symbol)!, { withToday: withToday && light.date === istToday(now), now }))
    const candles = new Map<string, Candle[]>()
    let failures = 0
    fetched.forEach((r, i) => {
        if (r.ok) candles.set(symbols[i], r.value)
        else failures++
    })
    return { asOf: light.date, light, candles, keys, universe: stocks, universeSource: source, results, failures }
}

// Firestore rejects undefined fields, so optional ones are only added when they exist.
function scanStock(u: UniverseStock, snap: StockSnapshot, md: MarketData): ScanStock {
    const stock: ScanStock = {
        symbol: u.symbol,
        name: u.name,
        sector: u.sector,
        instrumentKey: md.keys.get(u.symbol)!,
        close: snap.close,
        high: snap.high,
        low: snap.low,
        volumeRatio: round2(snap.volumeRatio),
        baseWeeks: snap.baseWeeks,
        baseRangePct: round1(snap.baseRangePct),
        resultsDate: md.results.get(u.symbol) || null,
        changePct: round2(snap.changePct),
        closeInRangePct: Math.round(snap.closeInRangePct),
        baseHigh: round2(snap.baseHigh),
        pctBelow52wHigh: round1((1 - snap.close / snap.high52w) * 100),
    }
    if (!snap.isBreakout) stock.pctToBreakout = round2(((snap.baseHigh - snap.close) / snap.baseHigh) * 100)
    return stock
}

export function buildScan(md: MarketData, now = new Date()): ScanResult {
    const breakouts: ScanStock[] = []
    const bases: ScanStock[] = []
    for (const u of md.universe) {
        const c = md.candles.get(u.symbol)
        if (!c?.length || c[c.length - 1].date !== md.asOf) continue // no session today (suspended or data missing)
        const snap = analyzeStock(c)
        if (!snap) continue
        if (snap.isBreakout) breakouts.push(scanStock(u, snap, md))
        else if (snap.isBase) bases.push(scanStock(u, snap, md))
    }
    breakouts.sort((a, b) => b.volumeRatio - a.volumeRatio)
    // Nearest to breaking out first; ones already above the base top on weak volume go last.
    const toBreakout = (s: ScanStock) => (s.pctToBreakout !== undefined && s.pctToBreakout >= 0 ? s.pctToBreakout : 99)
    bases.sort((a, b) => toBreakout(a) - toBreakout(b))
    return {
        date: md.asOf,
        ranAt: now.toISOString(),
        marketLight: { close: md.light.close, sma200: round2(md.light.sma200), green: md.light.green },
        breakouts,
        bases,
        universeSize: md.universe.length,
        universeSource: md.universeSource,
        failures: md.failures,
        resultsCalendar: md.results.size > 0,
    }
}

// ---------------------------------------------------------------------------
// Signals: what Autopilot does with each breakout, and why
// ---------------------------------------------------------------------------

function weekRange(iso: string) {
    const d = parseISO(iso)
    return [toISO(startOfWeek(d, { weekStartsOn: 1 })), toISO(endOfWeek(d, { weekStartsOn: 1 }))] as const
}

type Decision = SignalDecision & { create: boolean }

export function decideSignals(scan: ScanResult, status: ConstitutionStatus, trades: Trade[], asOf: string): Decision[] {
    const openAuto = trades.filter(t => t.auto && t.status === "open")
    const [weekStart, weekEnd] = weekRange(asOf)
    let weekEntries = trades.filter(t => t.auto && t.date >= weekStart && t.date <= weekEnd).length
    let openCount = openAuto.length
    const sectors = new Map<string, number>()
    for (const t of openAuto) sectors.set((t.sector || "").toLowerCase(), (sectors.get((t.sector || "").toLowerCase()) || 0) + 1)

    return scan.breakouts.map(stock => {
        const z = computeSizing({ high: stock.high, low: stock.low, equity: status.monthEquity, riskPct: status.riskPct, capPct: status.settings.positionCapPct })
        const sizing: SizingResult | null = "error" in z ? null : z
        const decide = (take: boolean, verdict: string, create = false): Decision => ({ stock, sizing, take, verdict, create })
        const waitText = (s: SizingResult) => `buys above ${inr(s.trigger, 1)} until ${shortDate(addTradingDays(asOf, 3))}`

        const existing = trades.find(t => t.auto && t.symbol === stock.symbol && (t.signalDate === asOf || t.status === "open"))
        if (existing && existing.signalDate === asOf && sizing) return decide(true, `Paper buy order placed: ${waitText(sizing)}`)
        if (!scan.marketLight.green) return decide(false, "Skipped: the market light is red, so no new buys")
        if (!sizing) return decide(false, "Skipped: couldn't size this trade")
        if (sizing.skip) return decide(false, `Skipped: the stop would be ${sizing.stopDistancePct.toFixed(1)}% below the buy price (8% max)`)
        if (sizing.shares === 0) return decide(false, "Skipped: no whole share fits your risk")
        const gap = stock.resultsDate ? tradingDaysBetween(asOf, stock.resultsDate) : null
        if (gap !== null && gap >= 0 && gap <= RESULTS_BUFFER_TRADING_DAYS) return decide(false, `Skipped: results on ${shortDate(stock.resultsDate!)}, within 10 trading days`)
        if (existing) return decide(false, existing.entryPrice ? `Already holding it (bought ${shortDate(existing.date)})` : "Already waiting to buy it")
        if (openCount >= MAX_OPEN_POSITIONS) return decide(false, `Skipped: Autopilot already has ${MAX_OPEN_POSITIONS} positions`)
        const sector = stock.sector.toLowerCase()
        if ((sectors.get(sector) || 0) >= MAX_PER_SECTOR) return decide(false, `Skipped: already ${MAX_PER_SECTOR} ${stock.sector} positions`)
        if (weekEntries >= MAX_ENTRIES_PER_WEEK) return decide(false, `Skipped: ${MAX_ENTRIES_PER_WEEK} new entries this week already`)

        openCount++
        weekEntries++
        sectors.set(sector, (sectors.get(sector) || 0) + 1)
        return decide(true, `Paper buy order placed: ${waitText(sizing)}`, true)
    })
}

function entryLog(stock: ScanStock, z: SizingResult, md: MarketData): string {
    const l = md.light
    const gapPct = ((l.close - l.sma200) / l.sma200) * 100
    const read = readSetup(stock, z.stopDistancePct)
    const move = stock.changePct !== undefined ? ` (${stock.changePct >= 0 ? "+" : ""}${stock.changePct.toFixed(1)}% on the day)` : ""
    const lines = [
        `ENTRY · Momentum Breakout signal on ${shortDate(md.asOf)}`,
        `Market light green: Nifty ${l.close.toLocaleString("en-IN")} is ${gapPct.toFixed(1)}% above its 200-day average.`,
        `Broke out of a ${stock.baseWeeks}-week base: closed ${inr(stock.close, 2)}${stock.baseHigh ? `, above the base top ${inr(stock.baseHigh, 2)}` : ""}${move}.`,
    ]
    if (read.strengths.length) lines.push(`Why: ${capitalise(read.strengths.join("; "))}.`)
    if (read.cautions.length) lines.push(`Watch: ${capitalise(read.cautions.join("; "))}.`)
    lines.push(`Plan: buy above ${inr(z.trigger, 1)} (limit ${inr(z.limit, 1)}), stop ${inr(z.stop, 1)} (${z.stopDistancePct.toFixed(1)}% below), ${z.shares} shares, risking ${inr(z.rupeeRisk)} (1R). Breakeven at ${inr(z.breakeven, 1)}, trailing from ${inr(z.trailStart, 1)}.`)
    lines.push(`Results: ${stock.resultsDate ? shortDate(stock.resultsDate) : "not announced yet"}.`)
    return lines.join("\n")
}

const ALL_CHECKLIST = CHECKLIST.map(c => c.id)

function newPaperTrade(d: Decision, md: MarketData): Omit<Trade, "id" | "userId"> {
    const z = d.sizing!
    const s = d.stock
    return {
        date: md.asOf,
        time: "15:30",
        symbol: s.symbol,
        type: "buy",
        entryPrice: 0,
        exitPrice: 0,
        quantity: z.shares,
        fees: 0,
        pnl: 0,
        analysis: entryLog(s, z, md),
        rules: [],
        isPaper: true,
        tradeQuality: null,
        setup: SETUP_ID,
        status: "open",
        sector: s.sector,
        marketLight: "green",
        baseWeeks: s.baseWeeks,
        volumeRatio: s.volumeRatio,
        trigger: z.trigger,
        limitPrice: z.limit,
        stopPrice: z.stop,
        resultsDate: s.resultsDate,
        exitDate: null,
        exitReason: null,
        checklist: ALL_CHECKLIST.filter(id => id !== "exit"),
        processGrade: "A",
        repeatNote: "",
        auto: true,
        instrumentKey: s.instrumentKey,
        currentStop: z.stop,
        gttExpiry: addTradingDays(md.asOf, 3),
        signalDate: md.asOf,
        trailActive: false,
        everAbovePlusOneR: false,
        pendingExit: null,
        sessionsHeld: 0,
        lastProcessedDate: md.asOf,
    }
}

// ---------------------------------------------------------------------------
// Paper engine bridge: advance each automated trade and write down what happened
// ---------------------------------------------------------------------------

const toPaperState = (t: Trade): PaperState => ({
    trigger: t.trigger || 0,
    limit: t.limitPrice || 0,
    stop: t.stopPrice || 0,
    currentStop: t.currentStop ?? t.stopPrice ?? 0,
    quantity: t.quantity,
    signalDate: t.signalDate || t.date,
    gttExpiry: t.gttExpiry || addTradingDays(t.signalDate || t.date, 3),
    fillDate: t.entryPrice ? t.date : null,
    entry: t.entryPrice || null,
    trailActive: !!t.trailActive,
    everAbovePlusOneR: !!t.everAbovePlusOneR,
    pendingExit: t.pendingExit || null,
    sessionsHeld: t.sessionsHeld || 0,
    resultsDate: t.resultsDate || null,
    lastProcessedDate: t.lastProcessedDate || t.signalDate || t.date,
})

function exitPlanText(reason: PaperExitReason, c: Candle, ema20: number | null, s: PaperState): string {
    const r = s.entry! - s.stop
    switch (reason) {
        case "trail": return `closed ${inr(c.close, 2)}, below the 20-day average ${inr(ema20 ?? 0, 2)}; selling at the next open (trailing exit)`
        case "time": return `15 trading days without a close above +1R (${inr(s.entry! + r, 2)}); selling at the next open (time stop)`
        case "results": return `results due ${s.resultsDate ? shortDate(s.resultsDate) : "soon"}; selling at the next open, before the announcement`
        default: return "selling at the next open"
    }
}

function soldReasonText(reason: PaperExitReason, c: Candle, before: PaperState): string {
    const gapped = c.open <= before.currentStop
    switch (reason) {
        case "stop": return gapped ? `opened at ${inr(c.open, 2)}, below the stop ${inr(before.currentStop, 2)} (gap down)` : `price fell to the stop ${inr(before.currentStop, 2)}`
        case "breakeven": return gapped ? `opened below the breakeven stop ${inr(before.currentStop, 2)} (gap down)` : "the breakeven stop at the entry price was hit"
        case "trail": return "trailing exit after closing below the 20-day average"
        case "time": return "time stop, 15 days without reaching +1R"
        case "results": return "sold before the results announcement"
    }
}

async function advancePaperTrade(userId: string, t: Trade, md: MarketData): Promise<string[]> {
    const candles = md.candles.get(t.symbol)
    if (!candles) return []
    const ema20 = emaSeries(candles.map(c => c.close), 20)
    const resultsDate = t.resultsDate || md.results.get(t.symbol) || null
    let state: PaperState = { ...toPaperState(t), resultsDate }
    const log: string[] = []
    const lines: string[] = []
    const sym = `<b>${escapeHtml(t.symbol)}</b>`
    let closed: { date: string; price: number; reason: PaperExitReason; pnl: number; fees: number } | null = null
    let done = false

    for (let i = 0; i < candles.length && !done; i++) {
        const c = candles[i]
        if (c.date <= state.lastProcessedDate || c.date > md.asOf) continue
        const before = state
        const step = stepPaper(state, c, ema20[i], resultsDate ? tradingDaysBetween(c.date, resultsDate) : null)
        state = step.state
        done = step.done
        const r = state.entry !== null ? state.entry - state.stop : 0
        for (const e of step.events) {
            switch (e.type) {
                case "filled": {
                    const how = c.open > before.trigger ? `opened at ${inr(c.open, 2)}, above the trigger` : `rose through the trigger ${inr(before.trigger, 1)}`
                    log.push(`${shortDate(e.date)}: bought at ${inr(e.price, 2)}, price ${how}.`)
                    lines.push(`Bought ${sym} at ${inr(e.price, 2)}: price ${how}`)
                    break
                }
                case "expired":
                    lines.push(`${sym} buy order cancelled: price never reached ${inr(before.trigger, 1)} in 3 trading days`)
                    break
                case "missed":
                    lines.push(`${sym} buy order cancelled: opened at ${inr(e.open, 2)}, above the ${inr(before.limit, 1)} limit`)
                    break
                case "breakeven":
                    log.push(`${shortDate(e.date)}: closed ${inr(c.close, 2)}, above +1.5R (${inr(state.entry! + 1.5 * r, 2)}); stop moved up to the entry price ${inr(e.stop, 2)}.`)
                    lines.push(`${sym} closed above +1.5R: stop moved up to entry ${inr(e.stop, 2)}, so no loss from here`)
                    break
                case "trail-armed":
                    log.push(`${shortDate(e.date)}: closed above +2R (${inr(state.entry! + 2 * r, 2)}); now sells on the first close below the 20-day average.`)
                    lines.push(`${sym} reached +2R: now trailing the 20-day average`)
                    break
                case "exit-tomorrow": {
                    const why = exitPlanText(e.reason, c, ema20[i], state)
                    log.push(`${shortDate(e.date)}: ${why}.`)
                    lines.push(`${sym}: ${why}`)
                    break
                }
                case "closed": {
                    const risk = (state.entry! - state.stop) * state.quantity
                    const result = risk > 0 ? e.pnl / risk : null
                    const why = soldReasonText(e.reason, c, before)
                    log.push(`${shortDate(e.date)}: SOLD at ${inr(e.price, 2)}, ${why}. Result ${fmtR(result)} (${signedInr(e.pnl)} after ${inr(e.fees)} costs).`)
                    lines.push(`Sold ${sym} at ${inr(e.price, 2)}: ${why}, ${fmtR(result)} (${signedInr(e.pnl)})`)
                    closed = e
                    break
                }
            }
        }
    }
    if (lines.length === 0 && log.length === 0 && state.lastProcessedDate === (t.lastProcessedDate || "")) return lines

    const analysis = [t.analysis, ...log].filter(Boolean).join("\n")
    if (closed) {
        await updateTrade(t.id, {
            status: "closed",
            date: state.fillDate || t.date,
            entryPrice: round2(state.entry!),
            exitPrice: round2(closed.price),
            exitDate: closed.date,
            exitReason: closed.reason,
            fees: round2(closed.fees),
            pnl: round2(closed.pnl),
            checklist: ALL_CHECKLIST,
            processGrade: "A",
            currentStop: state.currentStop,
            trailActive: state.trailActive,
            pendingExit: null,
            sessionsHeld: state.sessionsHeld,
            lastProcessedDate: state.lastProcessedDate,
            resultsDate,
            analysis,
        }, userId)
    } else if (done) {
        await deleteTrade(t.id, userId) // the buy order never filled, so no trade happened
    } else {
        await updateTrade(t.id, {
            date: state.fillDate || t.date,
            entryPrice: state.entry ? round2(state.entry) : 0,
            currentStop: state.currentStop,
            trailActive: state.trailActive,
            everAbovePlusOneR: state.everAbovePlusOneR,
            pendingExit: state.pendingExit,
            sessionsHeld: state.sessionsHeld,
            lastProcessedDate: state.lastProcessedDate,
            resultsDate,
            analysis,
        }, userId)
    }
    return lines
}

// ---------------------------------------------------------------------------
// The evening run for one user
// ---------------------------------------------------------------------------

export interface UserRunResult {
    userId: string
    skipped?: boolean
    sent: boolean
    message: string
    error?: string
}

function lastCloseOnOrBefore(candles: Candle[] | undefined, date: string) {
    if (!candles) return null
    for (let i = candles.length - 1; i >= 0; i--) if (candles[i].date <= date) return candles[i].close
    return null
}

export async function runDailyForUser(userId: string, md: MarketData, scan: ScanResult, trades: Trade[], opts: { force?: boolean } = {}): Promise<UserRunResult> {
    const automation = await getAutomation(userId)
    if (!opts.force && automation?.lastRunDate === md.asOf) return { userId, skipped: true, sent: false, message: "" }
    const [constitution, breaches] = await Promise.all([getConstitution(userId), getBreaches(userId)])

    // 1. Move existing automated trades through the new sessions.
    const autopilotLines: string[] = []
    for (const t of trades.filter(t => t.auto && t.status === "open")) {
        autopilotLines.push(...await advancePaperTrade(userId, t, md))
    }
    let fresh = await getTrades(userId)
    const status = computeStatus(constitution, fresh, breaches, md.asOf)

    // 2. Decide on tonight's breakouts; place paper buy orders for the ones that qualify.
    const decisions = decideSignals(scan, status, fresh, md.asOf)
    for (const d of decisions.filter(d => d.create)) {
        await saveTrade(newPaperTrade(d, md), userId)
        autopilotLines.push(`Placed a paper buy order for <b>${escapeHtml(d.stock.symbol)}</b>: buys above ${inr(d.sizing!.trigger, 1)} until ${shortDate(addTradingDays(md.asOf, 3))}`)
    }
    if (decisions.some(d => d.create)) fresh = await getTrades(userId)

    // 3. Where every open position stands.
    const openAuto: OpenAutoPosition[] = fresh
        .filter(t => t.auto && t.status === "open")
        .sort((a, b) => Number(!a.entryPrice) - Number(!b.entryPrice) || a.date.localeCompare(b.date))
        .map(t => {
            const close = lastCloseOnOrBefore(md.candles.get(t.symbol), md.asOf)
            const r = t.entryPrice && t.stopPrice ? t.entryPrice - t.stopPrice : 0
            return {
                symbol: t.symbol,
                pending: !t.entryPrice,
                trigger: t.trigger || 0,
                gttExpiry: t.gttExpiry || md.asOf,
                entry: t.entryPrice,
                stop: t.stopPrice || 0,
                currentStop: t.currentStop ?? t.stopPrice ?? 0,
                close,
                rNow: close !== null && r > 0 ? (close - t.entryPrice) / r : null,
            }
        })
    const manualChecks = fresh
        .filter(t => isBreakout(t) && t.status === "open" && !t.auto && t.date >= status.settings.startDate)
        .map(t => ({ ...checkOpenPosition(t, md.candles.get(t.symbol) || [], md.asOf, t.resultsDate || md.results.get(t.symbol) || null), paper: !!t.isPaper }))

    const message = composeDailyDigest({ asOf: md.asOf, scan, decisions, autopilotLines, openAuto, manualChecks, status, appUrl: appUrl() })

    // 4. Deliver and record.
    let sent = false
    let error: string | undefined
    const tg = automation?.telegram
    if (tg?.botToken && tg.chatId) {
        try {
            await sendMessage(tg.botToken, tg.chatId, message)
            sent = true
        } catch (e) {
            error = e instanceof Error ? e.message : String(e)
        }
    }
    const recent = [{ at: new Date().toISOString(), text: message }, ...(automation?.recentMessages || [])].slice(0, 10)
    await saveAutomation(userId, {
        lastRunDate: md.asOf,
        lastRunAt: new Date().toISOString(),
        lastSummary: `${scan.breakouts.length} breakout(s), light ${scan.marketLight.green ? "green" : "red"}, ${autopilotLines.length} Autopilot action(s)`,
        lastError: error || null,
        lastSignals: decisions.map(d => ({ symbol: d.stock.symbol, take: d.take, verdict: d.verdict })),
        recentMessages: recent,
    })
    return { userId, sent, message, error }
}

/** The evening job: one scan for everyone, then each user's Autopilot, position checks and digest. */
export async function runDaily(userIds: string[], opts: { force?: boolean; now?: Date } = {}) {
    const now = opts.now || new Date()
    const tradesByUser = new Map<string, Trade[]>()
    const extra: { symbol: string; key: string }[] = []
    for (const id of userIds) {
        const trades = await getTrades(id)
        tradesByUser.set(id, trades)
        for (const t of trades) if (t.status === "open" && t.instrumentKey) extra.push({ symbol: t.symbol, key: t.instrumentKey })
    }
    const md = await loadMarketData(extra, now)
    let scan = opts.force ? null : await getScan(md.asOf)
    if (!scan) {
        scan = buildScan(md, now)
        await saveScan(scan)
    }
    const users: UserRunResult[] = []
    for (const id of userIds) {
        try {
            users.push(await runDailyForUser(id, md, scan, tradesByUser.get(id) || [], opts))
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e)
            await saveAutomation(id, { lastError: error, lastRunAt: new Date().toISOString() })
            users.push({ userId: id, sent: false, message: "", error })
        }
    }
    return { asOf: md.asOf, breakouts: scan.breakouts.length, bases: scan.bases.length, light: scan.marketLight.green ? "green" : "red", failures: md.failures, users }
}

// ---------------------------------------------------------------------------
// Saturday review
// ---------------------------------------------------------------------------

const statLine = (label: string, s: ReviewStats) =>
    s.trades === 0
        ? `${label}: no closed trades`
        : `${label}: ${s.trades} closed · win ${s.winRate?.toFixed(0)}% · average ${fmtR(s.expectancyR)} per trade · ${signedInr(s.netPnl)}`

export async function runWeekly(userIds: string[], now = new Date()) {
    const today = istToday(now)
    const [weekStart] = weekRange(today)
    const scan = await getLatestScan()
    const results: UserRunResult[] = []
    for (const userId of userIds) {
        try {
            const [trades, constitution, breaches, automation] = await Promise.all([getTrades(userId), getConstitution(userId), getBreaches(userId), getAutomation(userId)])
            const status = computeStatus(constitution, trades, breaches, today)
            const closedThisWeek = (t: Trade) => isBreakout(t) && t.status !== "open" && realizedDate(t) >= weekStart && realizedDate(t) <= today && t.date >= status.settings.startDate
            const autoWeek = trades.filter(t => closedThisWeek(t) && t.auto)
            const autoAll = reviewStats(trades.filter(t => t.auto && t.status !== "open"))
            const live = reviewStats(trades.filter(t => closedThisWeek(t) && !t.isPaper))
            const bt = status.settings.backtest

            const out = [`<b>Weekly review · week of ${shortDate(weekStart)}</b>`, statLine("Autopilot this week", reviewStats(autoWeek))]
            for (const t of autoWeek) {
                const risk = t.entryPrice && t.stopPrice ? (t.entryPrice - t.stopPrice) * t.quantity : 0
                out.push(`• ${escapeHtml(t.symbol)}: ${fmtR(risk > 0 ? t.pnl / risk : null)} (${signedInr(t.pnl)}), ${escapeHtml(t.exitReason || "")}`)
            }
            if (live.trades) out.push(statLine("Live (real money)", live))
            out.push("", `<b>Forward test so far</b>: ${autoAll.trades} trades · win ${autoAll.winRate?.toFixed(0) ?? "—"}% · average ${fmtR(autoAll.expectancyR)}${bt?.expectancy != null ? ` (backtest ${fmtR(bt.expectancy)})` : ""} · longest losing run ${autoAll.longestLosingStreak}`)
            if (status.consequences.active.length) {
                out.push("", "<b>Active consequences</b>", ...status.consequences.active.map(c => `• Level ${c.level}: ${escapeHtml(breachLabel(c.code))} (${shortDate(c.date)})`))
            }
            const near = (scan?.bases || []).filter(b => b.pctToBreakout !== undefined && b.pctToBreakout >= 0).slice(0, 10)
            if (near.length) {
                out.push("", `<b>👀 Watchlist: closest to breaking out</b>`, ...near.map(b => `• ${escapeHtml(b.symbol)} (${escapeHtml(b.sector)}) ${b.pctToBreakout!.toFixed(1)}% below ${inr(b.baseHigh ?? b.high, 1)} · ${b.baseRangePct}% range · ${b.baseWeeks}w`))
            }
            if (Number(today.slice(8, 10)) <= 7 && status.monthlyCloseDue) {
                out.push("", "📅 First weekend of the month: do the monthly close in Autopilot → Settings.")
            }
            const message = out.join("\n")

            let sent = false
            const tg = automation?.telegram
            if (tg?.botToken && tg.chatId) {
                await sendMessage(tg.botToken, tg.chatId, message)
                sent = true
            }
            await saveAutomation(userId, { recentMessages: [{ at: new Date().toISOString(), text: message }, ...(automation?.recentMessages || [])].slice(0, 10) })
            results.push({ userId, sent, message })
        } catch (e) {
            results.push({ userId, sent: false, message: "", error: e instanceof Error ? e.message : String(e) })
        }
    }
    return { date: today, users: results }
}

