import { endOfWeek, format, parseISO, startOfWeek } from "date-fns"
import {
    addTradingDays, computeSizing, computeStatus, isBreakout, realizedDate, reviewStats, toISO, tradingDaysBetween,
    type ConstitutionStatus, type ReviewStats,
} from "@/features/constitution/lib/engine"
import { CHECKLIST, MAX_ENTRIES_PER_WEEK, MAX_OPEN_POSITIONS, MAX_PER_SECTOR, RESULTS_BUFFER_TRADING_DAYS, SETUP_ID, breachLabel } from "@/features/constitution/lib/rules"
import {
    deleteTrade, getAutomation, getBreaches, getConstitution, getLatestScan, getScan, getTrades, saveAutomation, saveScan, saveTrade, updateTrade,
    type ScanResult, type ScanStock, type Trade,
} from "@/lib/db"
import {
    NIFTY50_KEY, fetchDailyCandles, fetchResultsCalendar, findInUniverse, instrumentKey, istNow, istToday, loadUniverse, mapLimit,
    type UniverseStock,
} from "./marketData"
import { stepPaper, type PaperEvent, type PaperState } from "./paperEngine"
import { analyzeStock, emaSeries, indexOnOrBefore, marketLight, type Candle, type MarketLight, type StockSnapshot } from "./scanner"
import { escapeHtml, sendMessage } from "./telegram"
import { checkOpenPosition, type PositionCheck } from "./tracking"

// ---------------------------------------------------------------------------
// Who automation runs for: the Google sign-in emails listed in AUTOMATION_EMAILS (comma-separated).
// ---------------------------------------------------------------------------

export function automationUsers(): string[] {
    return (process.env.AUTOMATION_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
}

export const isAutomationUser = (email: string) => automationUsers().includes(email.trim().toLowerCase())

const appUrl = () => (process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "")

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

function scanStock(u: UniverseStock, snap: StockSnapshot, md: MarketData): ScanStock {
    return {
        symbol: u.symbol,
        name: u.name,
        sector: u.sector,
        instrumentKey: md.keys.get(u.symbol)!,
        close: snap.close,
        high: snap.high,
        low: snap.low,
        volumeRatio: Math.round(snap.volumeRatio * 100) / 100,
        baseWeeks: snap.baseWeeks,
        baseRangePct: Math.round(snap.baseRangePct * 10) / 10,
        resultsDate: md.results.get(u.symbol) || null,
    }
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
    bases.sort((a, b) => a.baseRangePct - b.baseRangePct)
    return {
        date: md.asOf,
        ranAt: now.toISOString(),
        marketLight: { close: md.light.close, sma200: Math.round(md.light.sma200 * 100) / 100, green: md.light.green },
        breakouts,
        bases,
        universeSize: md.universe.length,
        universeSource: md.universeSource,
        failures: md.failures,
        resultsCalendar: md.results.size > 0,
    }
}

// ---------------------------------------------------------------------------
// Paper engine bridge
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

const ALL_CHECKLIST = CHECKLIST.map(c => c.id)
const round2 = (n: number) => Math.round(n * 100) / 100

async function advancePaperTrade(userId: string, t: Trade, md: MarketData): Promise<PaperEvent[]> {
    const candles = md.candles.get(t.symbol)
    if (!candles) return []
    const ema20 = emaSeries(candles.map(c => c.close), 20)
    const resultsDate = t.resultsDate || md.results.get(t.symbol) || null
    let state = { ...toPaperState(t), resultsDate }
    const events: PaperEvent[] = []
    let done = false
    for (let i = 0; i < candles.length && !done; i++) {
        const c = candles[i]
        if (c.date <= state.lastProcessedDate || c.date > md.asOf) continue
        const step = stepPaper(state, c, ema20[i], resultsDate ? tradingDaysBetween(c.date, resultsDate) : null)
        state = step.state
        events.push(...step.events)
        done = step.done
    }
    if (events.length === 0 && state.lastProcessedDate === (t.lastProcessedDate || "")) return events

    const closed = events.find((e): e is Extract<PaperEvent, { type: "closed" }> => e.type === "closed")
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
        }, userId)
    } else if (done) {
        await deleteTrade(t.id, userId) // GTT expired or the open skipped past the limit: no trade happened
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
        }, userId)
    }
    return events
}

// ---------------------------------------------------------------------------
// Daily run for one user
// ---------------------------------------------------------------------------

interface SignalLine { stock: ScanStock; text: string }

const inr = (n: number, digits = 0) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: digits })}`
const day = (iso: string) => format(parseISO(iso), "d MMM")

function weekRange(iso: string) {
    const d = parseISO(iso)
    return [toISO(startOfWeek(d, { weekStartsOn: 1 })), toISO(endOfWeek(d, { weekStartsOn: 1 }))] as const
}

async function openNewPaperTrades(userId: string, trades: Trade[], scan: ScanResult, status: ConstitutionStatus, md: MarketData): Promise<SignalLine[]> {
    const lines: SignalLine[] = []
    const openAuto = trades.filter(t => t.auto && t.status === "open")
    const [weekStart, weekEnd] = weekRange(md.asOf)
    let weekEntries = trades.filter(t => t.auto && t.date >= weekStart && t.date <= weekEnd).length

    for (const stock of scan.breakouts) {
        const sizing = computeSizing({ high: stock.high, low: stock.low, equity: status.monthEquity, riskPct: status.riskPct, capPct: status.settings.positionCapPct })
        if ("error" in sizing) continue
        const plan = `GTT buy ${inr(sizing.trigger, 1)} → limit ${inr(sizing.limit, 1)} · stop ${inr(sizing.stop, 1)} (${sizing.stopDistancePct.toFixed(1)}%) · ${sizing.shares} sh · risk ${inr(sizing.rupeeRisk)}`
        const header = `• <b>${escapeHtml(stock.symbol)}</b> (${escapeHtml(stock.sector)}) close ${inr(stock.close, 2)} · vol ${stock.volumeRatio}× · base ${stock.baseWeeks}w`
        const say = (verdict: string) => lines.push({ stock, text: `${header}\n  ${sizing.skip ? "" : plan + "\n  "}${verdict}` })

        const resultsGap = stock.resultsDate ? tradingDaysBetween(md.asOf, stock.resultsDate) : null
        if (sizing.skip) { say(`Skip: stop ${sizing.stopDistancePct.toFixed(1)}% below entry, wider than 8%.`); continue }
        if (sizing.shares === 0) { say("Skip: 0 shares at this risk."); continue }
        if (resultsGap !== null && resultsGap >= 0 && resultsGap <= RESULTS_BUFFER_TRADING_DAYS) { say(`Skip: results on ${day(stock.resultsDate!)}, within 10 trading days.`); continue }
        const resultsNote = stock.resultsDate ? `Results ${day(stock.resultsDate)}.` : "Results date not announced yet — check before a live buy."

        if (trades.some(t => t.auto && t.symbol === stock.symbol && t.signalDate === md.asOf) || openAuto.some(t => t.symbol === stock.symbol)) {
            say(`Paper: already tracking. ${resultsNote}`)
            continue
        }
        const sectorCount = openAuto.filter(t => (t.sector || "").toLowerCase() === stock.sector.toLowerCase()).length
        if (openAuto.length >= MAX_OPEN_POSITIONS) { say(`Paper: not taken, ${MAX_OPEN_POSITIONS} paper positions open. ${resultsNote}`); continue }
        if (sectorCount >= MAX_PER_SECTOR) { say(`Paper: not taken, ${MAX_PER_SECTOR} ${escapeHtml(stock.sector)} positions open. ${resultsNote}`); continue }
        if (weekEntries >= MAX_ENTRIES_PER_WEEK) { say(`Paper: not taken, ${MAX_ENTRIES_PER_WEEK} entries this week. ${resultsNote}`); continue }

        const trade: Omit<Trade, "id" | "userId"> = {
            date: md.asOf,
            time: "15:30",
            symbol: stock.symbol,
            type: "buy",
            entryPrice: 0,
            exitPrice: 0,
            quantity: sizing.shares,
            fees: 0,
            pnl: 0,
            analysis: `Auto paper trade from the ${md.asOf} scan: close ${inr(stock.close, 2)}, volume ${stock.volumeRatio}×, ${stock.baseWeeks}-week base.`,
            rules: [],
            isPaper: true,
            tradeQuality: null,
            setup: SETUP_ID,
            status: "open",
            sector: stock.sector,
            marketLight: "green",
            baseWeeks: stock.baseWeeks,
            volumeRatio: stock.volumeRatio,
            trigger: sizing.trigger,
            limitPrice: sizing.limit,
            stopPrice: sizing.stop,
            resultsDate: stock.resultsDate,
            exitDate: null,
            exitReason: null,
            checklist: ALL_CHECKLIST.filter(id => id !== "exit"),
            processGrade: "A",
            repeatNote: "",
            auto: true,
            instrumentKey: stock.instrumentKey,
            currentStop: sizing.stop,
            gttExpiry: addTradingDays(md.asOf, 3),
            signalDate: md.asOf,
            trailActive: false,
            everAbovePlusOneR: false,
            pendingExit: null,
            sessionsHeld: 0,
            lastProcessedDate: md.asOf,
        }
        const saved = await saveTrade(trade, userId)
        openAuto.push(saved)
        weekEntries++
        say(`Paper: GTT placed. ${resultsNote}`)
    }
    return lines
}

function describePaperEvent(symbol: string, e: PaperEvent): string {
    const s = `<b>${escapeHtml(symbol)}</b>`
    switch (e.type) {
        case "filled": return `${s} filled at ${inr(e.price, 2)} (${day(e.date)})`
        case "expired": return `${s} buy GTT expired after 3 days`
        case "missed": return `${s} opened at ${inr(e.open, 2)}, above the limit: missed`
        case "breakeven": return `${s} stop moved to breakeven ${inr(e.stop, 2)}`
        case "trail-armed": return `${s} reached +2R: trailing on the 20-EMA`
        case "exit-tomorrow": return `${s} exits at the next open (${e.reason})`
        case "closed": return `${s} closed at ${inr(e.price, 2)} (${e.reason}), ${e.pnl >= 0 ? "+" : "−"}${inr(Math.abs(e.pnl))}`
    }
}

export interface UserRunResult {
    userId: string
    skipped?: boolean
    sent: boolean
    message: string
    error?: string
}

export async function runDailyForUser(userId: string, md: MarketData, scan: ScanResult, trades: Trade[], opts: { force?: boolean } = {}): Promise<UserRunResult> {
    const automation = await getAutomation(userId)
    if (!opts.force && automation?.lastRunDate === md.asOf) return { userId, skipped: true, sent: false, message: "" }
    const [constitution, breaches] = await Promise.all([getConstitution(userId), getBreaches(userId)])

    // 1. Advance automated paper trades through the new sessions.
    const paperLines: string[] = []
    for (const t of trades.filter(t => t.auto && t.status === "open")) {
        const events = await advancePaperTrade(userId, t, md)
        for (const e of events) paperLines.push(describePaperEvent(t.symbol, e))
    }
    const freshTrades = await getTrades(userId)
    const status = computeStatus(constitution, freshTrades, breaches, md.asOf)

    // 2. Tonight's signals; with a green light they also become paper trades.
    const signalLines = scan.marketLight.green ? await openNewPaperTrades(userId, freshTrades, scan, status, md) : []

    // 3. Your own open positions (live, and manual paper trades).
    const checks: (PositionCheck & { paper: boolean })[] = freshTrades
        .filter(t => isBreakout(t) && t.status === "open" && !t.auto && t.date >= status.settings.startDate)
        .map(t => ({ ...checkOpenPosition(t, md.candles.get(t.symbol) || [], md.asOf, t.resultsDate || md.results.get(t.symbol) || null), paper: !!t.isPaper }))

    // 4. Compose the evening digest.
    const out: string[] = [`<b>TradeHow · ${format(parseISO(md.asOf), "EEE d MMM")}</b>`]
    const l = scan.marketLight
    out.push(`Market light: ${l.green ? "🟢 GREEN" : "🔴 RED"} · Nifty ${l.close.toLocaleString("en-IN")} vs 200-SMA ${Math.round(l.sma200).toLocaleString("en-IN")}`)
    if (!l.green) out.push("No new buys tonight. Open trades keep their stops and exits.")
    if (status.blockers.length) out.push(`⛔ Live entries paused: ${escapeHtml(status.blockers.map(b => b.message).join(" "))}`)

    out.push("", `<b>Signals</b> (MB breakout)`)
    if (!l.green) out.push(scan.breakouts.length ? `${scan.breakouts.length} stock(s) broke out, but the light is red.` : "None.")
    else if (signalLines.length === 0) out.push("No breakouts tonight — that's the system working.")
    else out.push(...signalLines.slice(0, 8).map(s => s.text), ...(signalLines.length > 8 ? [`…and ${signalLines.length - 8} more in the app.`] : []))

    if (checks.length) {
        out.push("", "<b>Your open positions</b>")
        for (const c of checks) {
            const r = c.rNow === null ? "" : ` ${c.rNow >= 0 ? "+" : ""}${c.rNow.toFixed(2)}R`
            out.push(`• <b>${escapeHtml(c.symbol)}</b>${c.paper ? " (paper)" : ""}${r}${c.close ? ` · close ${inr(c.close, 2)}` : ""}`)
            for (const a of c.actions) out.push(`  ⚠️ ${escapeHtml(a)}`)
            for (const n of c.notes) out.push(`  ${escapeHtml(n)}`)
        }
    }
    if (paperLines.length) out.push("", "<b>Auto paper</b>", ...paperLines.map(p => `• ${p}`))

    const autoOpen = freshTrades.filter(t => t.auto && t.status === "open").length
    out.push("", `1R ${inr(status.oneR)} (${status.riskPct}%) · live open ${status.openPositions.length}/${MAX_OPEN_POSITIONS} · live entries this week ${status.weekEntries}/${MAX_ENTRIES_PER_WEEK} · paper open ${autoOpen}/${MAX_OPEN_POSITIONS}`)
    out.push(`Month realised ${status.monthRealized >= 0 ? "+" : "−"}${inr(Math.abs(status.monthRealized))} (limit −${inr(status.monthLossLimit)})`)
    if (appUrl()) out.push(`<a href="${appUrl()}/routine">Open the evening routine</a>`)
    const message = out.join("\n")

    // 5. Deliver and record.
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
        lastSummary: `${scan.breakouts.length} breakout(s), light ${l.green ? "green" : "red"}, ${paperLines.length} paper event(s), ${checks.reduce((a, c) => a + c.actions.length, 0)} action(s)`,
        lastError: error || null,
        recentMessages: recent,
    })
    return { userId, sent, message, error }
}

/** The evening job: one scan for everyone, then each user's paper engine, position checks and digest. */
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

const fmtR = (r: number | null) => (r === null ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`)
const statLine = (label: string, s: ReviewStats) =>
    s.trades === 0
        ? `${label}: no closed trades`
        : `${label}: ${s.trades} closed · win ${s.winRate?.toFixed(0)}% · exp ${fmtR(s.expectancyR)} · avg loss ${fmtR(s.avgLossR)} · adherence ${s.adherencePct?.toFixed(0)}% · ${s.netPnl >= 0 ? "+" : "−"}${inr(Math.abs(s.netPnl))}`

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
            const live = reviewStats(trades.filter(t => closedThisWeek(t) && !t.isPaper))
            const manualPaper = reviewStats(trades.filter(t => closedThisWeek(t) && t.isPaper && !t.auto))
            const autoWeek = reviewStats(trades.filter(t => closedThisWeek(t) && t.auto))
            const autoAll = reviewStats(trades.filter(t => t.auto && t.status !== "open"))
            const bt = status.settings.backtest

            const out = [`<b>Weekly review · week of ${day(weekStart)}</b>`, statLine("Live", live), statLine("Paper (yours)", manualPaper), statLine("Auto paper", autoWeek)]
            out.push(`Forward test so far: ${autoAll.trades} trades · exp ${fmtR(autoAll.expectancyR)}${bt?.expectancy != null ? ` vs backtest ${fmtR(bt.expectancy)}` : ""} · longest losing run ${autoAll.longestLosingStreak}`)
            if (status.consequences.active.length) {
                out.push("", "<b>Active consequences</b>", ...status.consequences.active.map(c => `• Level ${c.level}: ${escapeHtml(breachLabel(c.code))} (${day(c.date)})`))
            }
            if (scan?.bases.length) {
                out.push("", `<b>MB bases watchlist</b> (${scan.bases.length}, tightest first)`, ...scan.bases.slice(0, 12).map(b => `• ${escapeHtml(b.symbol)} (${escapeHtml(b.sector)}) range ${b.baseRangePct}% · ${b.baseWeeks}w · base top ${inr(b.high, 2)}`))
            }
            if (Number(today.slice(8, 10)) <= 7 && status.monthlyCloseDue) {
                out.push("", "📅 First weekend of the month: do the monthly close (value equity, reset 1R and the cap).")
            }
            out.push("", "Compare each number with the backtest's range. Rule changes only at a phase boundary — never mid-week, never after a loss.")
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

// ---------------------------------------------------------------------------
// One stock on demand (auto-fill in the trade form and sizing calculator)
// ---------------------------------------------------------------------------

export interface SymbolSetup {
    symbol: string
    name: string
    sector: string
    breakoutDate: string
    isBreakout: boolean
    checks: StockSnapshot["checks"]
    high: number
    low: number
    close: number
    volumeRatio: number
    baseWeeks: number
    marketLight: "green" | "red"
    niftyClose: number
    niftySma200: number
    resultsDate: string | null
}

export async function analyzeSymbol(symbol: string, date: string | null, now = new Date()): Promise<SymbolSetup | { error: string }> {
    let stock = findInUniverse([], symbol)
    if (!stock) stock = findInUniverse((await loadUniverse()).stocks, symbol)
    if (!stock) return { error: `${symbol.toUpperCase()} isn't in the Nifty 200, so it's outside the setup.` }

    const withToday = afterClose(now)
    const [candles, nifty, results] = await Promise.all([
        fetchDailyCandles(instrumentKey(stock.isin), { withToday, now }),
        fetchDailyCandles(NIFTY50_KEY, { withToday, now }),
        fetchResultsCalendar(),
    ])
    const target = indexOnOrBefore(candles, date || candles[candles.length - 1]?.date || "")
    if (target < 0) return { error: "No market data for that date." }

    // A plan is journaled on the breakout evening and filled up to 3 sessions later, so look back for the breakout.
    let index = target
    for (let k = 0; k <= 3; k++) {
        if (analyzeStock(candles, target - k)?.isBreakout) { index = target - k; break }
    }
    const snap = analyzeStock(candles, index)
    if (!snap) return { error: "Not enough history for the 200-day average." }
    const light = marketLight(nifty, indexOnOrBefore(nifty, snap.date))
    if (!light) return { error: "Not enough Nifty 50 history." }

    return {
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        breakoutDate: snap.date,
        isBreakout: snap.isBreakout,
        checks: snap.checks,
        high: snap.high,
        low: snap.low,
        close: snap.close,
        volumeRatio: Math.round(snap.volumeRatio * 100) / 100,
        baseWeeks: snap.baseWeeks,
        marketLight: light.green ? "green" : "red",
        niftyClose: light.close,
        niftySma200: Math.round(light.sma200 * 100) / 100,
        resultsDate: results.get(stock.symbol) || null,
    }
}
