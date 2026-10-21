import { addBusinessDays, addDays, differenceInBusinessDays, differenceInCalendarDays, parseISO, format, startOfWeek, endOfWeek, endOfMonth, addMonths } from "date-fns"
import type { Trade, ConstitutionSettings, Breach, BacktestResult, Impulse } from "@/lib/db"
import * as R from "./rules"

// ---------------------------------------------------------------------------
// Dates. Trading days skip weekends only; exchange holidays are not modelled.
// ---------------------------------------------------------------------------

export const toISO = (d: Date) => format(d, "yyyy-MM-dd")
export const todayISO = () => toISO(new Date())
export const monthOf = (iso: string) => iso.slice(0, 7)
export const addTradingDays = (iso: string, n: number) => toISO(addBusinessDays(parseISO(iso), n))
// Weekdays after `from` up to and including `to` (correct even when `from` falls on a weekend).
export const tradingDaysBetween = (fromISO: string, toISO_: string) =>
    differenceInBusinessDays(addDays(parseISO(toISO_), 1), addDays(parseISO(fromISO), 1))

// ---------------------------------------------------------------------------
// Sizing sheet (A4). Same formulas as the Google Sheet:
//   Trigger = ROUNDUP(high × 1.001, 1)   Limit = ROUND(trigger × 1.01, 1)
//   Stop = MIN(low × 0.995, limit × 0.97), rounded down to ₹0.10 (as in Cases A–C)
//   Shares = 0 if stop distance > 8%, else MIN(FLOOR(1R ÷ (limit − stop)), FLOOR(cap ÷ limit))
// ---------------------------------------------------------------------------

const roundUp1 = (x: number) => Math.ceil(x * 10 - 1e-7) / 10
const round1 = (x: number) => Math.round(x * 10) / 10
const floor1 = (x: number) => Math.floor(x * 10 + 1e-7) / 10

export interface SizingResult {
    error?: string
    trigger: number
    limit: number
    stop: number
    stopLoweredTo3Pct: boolean
    rPerShare: number
    stopDistancePct: number
    sharesByRisk: number
    sharesByCap: number
    shares: number
    limitedBy: "risk" | "cap"
    positionValue: number
    rupeeRisk: number
    plusOneR: number
    breakeven: number
    trailStart: number
    skip: boolean
}

export function computeSizing(input: { high: number; low: number; equity: number; riskPct: number; capPct: number }): SizingResult | { error: string } {
    const { high, low, equity, riskPct, capPct } = input
    if (!(high > 0) || !(low > 0)) return { error: "Enter the breakout day's high and low." }
    if (low > high) return { error: "The low can't be above the high." }
    if (!(equity > 0)) return { error: "Set this month's equity first." }

    const trigger = roundUp1(high * 1.001)
    const limit = round1(trigger * 1.01)
    const breakoutStop = low * 0.995
    const threePctStop = limit * (1 - R.MIN_STOP_PCT / 100)
    const stop = floor1(Math.min(breakoutStop, threePctStop))
    const rPerShare = limit - stop
    const stopDistancePct = (rPerShare / limit) * 100
    const riskBudget = equity * riskPct / 100
    const capBudget = equity * capPct / 100
    const sharesByRisk = Math.floor(riskBudget / rPerShare + 1e-9)
    const sharesByCap = Math.floor(capBudget / limit + 1e-9)
    const skip = stopDistancePct > R.MAX_STOP_PCT
    const shares = skip ? 0 : Math.max(0, Math.min(sharesByRisk, sharesByCap))

    return {
        trigger,
        limit,
        stop,
        stopLoweredTo3Pct: breakoutStop > threePctStop,
        rPerShare,
        stopDistancePct,
        sharesByRisk,
        sharesByCap,
        shares,
        limitedBy: sharesByCap < sharesByRisk ? "cap" : "risk",
        positionValue: shares * limit,
        rupeeRisk: shares * rPerShare,
        plusOneR: limit + rPerShare,
        breakeven: limit + 1.5 * rPerShare,
        trailStart: limit + 2 * rPerShare,
        skip,
    }
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

export const isBreakout = (t: Pick<Trade, "setup">) => t.setup === R.SETUP_ID
export const isOpenTrade = (t: Pick<Trade, "setup" | "status">) => isBreakout(t) && t.status === "open"
export const realizedDate = (t: Pick<Trade, "date" | "exitDate">) => t.exitDate || t.date

export interface TradeLevels {
    entry: number | null
    rPerShare: number | null
    plannedRisk: number | null
    positionValue: number | null
    stopDistancePct: number | null
    plusOneR: number | null
    breakeven: number | null
    trailStart: number | null
    timeStopDate: string | null
    resultR: number | null
}

// R comes from the actual fill (entry − stop); stop distance uses the GTT limit when known, as the sheet does.
export function tradeLevels(t: Partial<Trade>): TradeLevels {
    const entry = t.entryPrice || t.limitPrice || null
    const stop = t.stopPrice || null
    const qty = t.quantity || 0
    const r = entry && stop && stop < entry ? entry - stop : null
    const plannedRisk = r !== null && qty > 0 ? r * qty : null
    const distanceBase = t.limitPrice || entry
    const open = t.status === "open"
    return {
        entry,
        rPerShare: r,
        plannedRisk,
        positionValue: entry && qty > 0 ? entry * qty : null,
        stopDistancePct: distanceBase && stop && stop < distanceBase ? ((distanceBase - stop) / distanceBase) * 100 : null,
        plusOneR: entry && r ? entry + r : null,
        breakeven: entry && r ? entry + 1.5 * r : null,
        trailStart: entry && r ? entry + 2 * r : null,
        timeStopDate: t.date ? addTradingDays(t.date, R.TIME_STOP_TRADING_DAYS) : null,
        resultR: !open && plannedRisk && typeof t.pnl === "number" ? t.pnl / plannedRisk : null,
    }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface ResolvedSettings {
    startDate: string
    phase: 0 | 1 | 2 | 3 | 4
    baseRiskPct: number
    positionCapPct: number
    equityHistory: { month: string; equity: number }[]
    checks: Record<string, boolean>
    backtest: BacktestResult | null
    whyTrading: string
    isNew: boolean
}

export function resolveSettings(s: ConstitutionSettings | null, today = todayISO()): ResolvedSettings {
    return {
        startDate: s?.startDate || today,
        phase: (s?.phase ?? 0) as ResolvedSettings["phase"],
        baseRiskPct: s?.baseRiskPct || R.BASE_RISK_PCT,
        positionCapPct: s?.positionCapPct || R.POSITION_CAP_PCT,
        equityHistory: [...(s?.equityHistory || [])].sort((a, b) => a.month.localeCompare(b.month)),
        checks: s?.checks || {},
        backtest: s?.backtest || null,
        whyTrading: s?.whyTrading || "",
        isNew: !s?.equityHistory?.length,
    }
}

// ---------------------------------------------------------------------------
// Consequence ladder
// ---------------------------------------------------------------------------

export interface Consequence {
    level: R.BreachLevel
    date: string
    code: string
    label: string
    blocksUntil: string | null       // last day new entries are blocked (inclusive)
    paperNeeded: number
    paperDone: number
    reducedRiskLeft: number          // live trades still to take at 0.5% risk
    blocking: boolean
    active: boolean
}

export function buildConsequences(breaches: Breach[], trades: Trade[], today = todayISO()) {
    const sorted = [...breaches].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || "").localeCompare(b.createdAt || ""))
    const events: { level: R.BreachLevel; date: string; code: string }[] = []

    // Three Level 1 slips in a calendar month count as one Level 2.
    const levelOneByMonth: Record<string, number> = {}
    for (const b of sorted) {
        if (b.level === 1) {
            const m = monthOf(b.date)
            levelOneByMonth[m] = (levelOneByMonth[m] || 0) + 1
            if (levelOneByMonth[m] % 3 === 0) events.push({ level: 2, date: b.date, code: "three_level1" })
        } else {
            events.push({ level: b.level, date: b.date, code: b.code })
        }
    }

    // Two Level 3s within 90 days escalate to Level 4.
    const levelThree = events.filter(e => e.level === 3)
    const paired = new Set<number>()
    for (let i = 0; i < levelThree.length; i++) {
        if (paired.has(i)) continue
        for (let j = 0; j < i; j++) {
            if (paired.has(j)) continue
            if (differenceInCalendarDays(parseISO(levelThree[i].date), parseISO(levelThree[j].date)) <= 90) {
                events.push({ level: 4, date: levelThree[i].date, code: "two_level3" })
                paired.add(i)
                paired.add(j)
                break
            }
        }
    }

    const breakoutTrades = trades.filter(isBreakout)
    const paperAfter = (date: string, compliantOnly: boolean) =>
        breakoutTrades.filter(t => t.isPaper && t.date > date && (!compliantOnly || t.processGrade !== "C")).length
    const liveAfter = (date: string) => breakoutTrades.filter(t => !t.isPaper && t.date > date).length

    const list: Consequence[] = events
        .filter(e => e.level >= 2)
        .map(e => {
            let blocksUntil: string | null = null
            let paperNeeded = 0
            let paperDone = 0
            let reducedRiskLeft = 0
            if (e.level === 2) {
                blocksUntil = addTradingDays(e.date, 5)
                paperNeeded = 5
                paperDone = paperAfter(e.date, false)
            } else if (e.level === 3) {
                blocksUntil = toISO(endOfMonth(parseISO(e.date)))
                paperNeeded = 10
                paperDone = paperAfter(e.date, true)
                reducedRiskLeft = Math.max(0, 20 - liveAfter(blocksUntil))
            } else {
                blocksUntil = toISO(addMonths(parseISO(e.date), 3))
            }
            const blocking = today <= blocksUntil || paperDone < paperNeeded
            return {
                ...e,
                label: R.breachLabel(e.code),
                blocksUntil,
                paperNeeded,
                paperDone: Math.min(paperDone, paperNeeded),
                reducedRiskLeft,
                blocking,
                active: blocking || reducedRiskLeft > 0,
            }
        })
        .sort((a, b) => b.date.localeCompare(a.date))

    return {
        list,
        active: list.filter(c => c.active),
        level4Count: events.filter(e => e.level === 4).length,
        levelOneThisMonth: levelOneByMonth[monthOf(today)] || 0,
    }
}

// ---------------------------------------------------------------------------
// Status: equity, 1R, limits, restrictions
// ---------------------------------------------------------------------------

export interface Blocker { kind: "phase" | "consequence" | "monthly" | "drawdown"; message: string }

export interface ConstitutionStatus {
    settings: ResolvedSettings
    today: string
    month: string
    monthEquity: number
    monthlyCloseDue: boolean
    monthEquities: Record<string, number>
    riskPct: number
    riskNotes: string[]
    oneR: number
    positionCap: number
    monthRealized: number
    monthLossLimit: number
    monthLimitHit: boolean
    currentEquity: number
    peakEquity: number
    drawdownPct: number
    drawdownReduced: boolean
    openPositions: Trade[]
    sectorCounts: Record<string, number>
    weekEntries: number
    liveBreakoutCount: number
    consequences: ReturnType<typeof buildConsequences>
    blockers: Blocker[]
    liveEntriesAllowed: boolean
}

const monthsBetween = (from: string, to: string) => {
    const months: string[] = []
    let d = parseISO(`${from}-01`)
    while (format(d, "yyyy-MM") <= to) {
        months.push(format(d, "yyyy-MM"))
        d = addMonths(d, 1)
    }
    return months
}

export function computeStatus(raw: ConstitutionSettings | null, trades: Trade[], breaches: Breach[], today = todayISO()): ConstitutionStatus {
    const settings = resolveSettings(raw, today)
    const month = monthOf(today)

    // Real money only: closed live trades realised on/after the constitution start date.
    const realized = trades
        .filter(t => !t.isPaper && !isOpenTrade(t) && realizedDate(t) >= settings.startDate)
        .sort((a, b) => realizedDate(a).localeCompare(realizedDate(b)))

    // Equity path: each month opens at its monthly-close value (or carries the last value forward),
    // then moves with realised P&L. Peak and drawdown come from this path.
    const firstMonth = [monthOf(settings.startDate), ...settings.equityHistory.map(h => h.month)].sort()[0]
    const monthEquities: Record<string, number> = {}
    const path: number[] = []
    let value: number | null = null
    for (const m of monthsBetween(firstMonth, month)) {
        const snapshot = settings.equityHistory.find(h => h.month === m)
        if (snapshot) value = snapshot.equity
        else if (value === null) value = R.STARTING_EQUITY
        monthEquities[m] = value
        path.push(value)
        for (const t of realized) {
            if (monthOf(realizedDate(t)) !== m) continue
            value += t.pnl
            path.push(value)
        }
    }

    let peakEquity = 0
    let drawdownReduced = false
    let drawdownPct = 0
    for (const v of path) {
        peakEquity = Math.max(peakEquity, v)
        drawdownPct = peakEquity > 0 ? ((peakEquity - v) / peakEquity) * 100 : 0
        if (drawdownPct >= R.DRAWDOWN_REDUCE_PCT) drawdownReduced = true
        else if (drawdownReduced && drawdownPct < R.DRAWDOWN_RECOVER_PCT) drawdownReduced = false
    }
    const currentEquity = value ?? R.STARTING_EQUITY
    const monthEquity = monthEquities[month] ?? R.STARTING_EQUITY
    const monthRealized = realized.filter(t => monthOf(realizedDate(t)) === month).reduce((acc, t) => acc + t.pnl, 0)
    const monthLossLimit = monthEquity * R.MONTHLY_LOSS_LIMIT_PCT / 100
    const monthLimitHit = monthRealized <= -monthLossLimit

    const breakout = trades.filter(t => isBreakout(t) && t.date >= settings.startDate)
    const liveBreakout = breakout.filter(t => !t.isPaper)
    const openPositions = liveBreakout.filter(t => t.status === "open").sort((a, b) => a.date.localeCompare(b.date))
    const sectorCounts: Record<string, number> = {}
    for (const t of openPositions) {
        const key = (t.sector || "Unknown").trim()
        sectorCounts[key] = (sectorCounts[key] || 0) + 1
    }
    const weekStart = toISO(startOfWeek(parseISO(today), { weekStartsOn: 1 }))
    const weekEnd = toISO(endOfWeek(parseISO(today), { weekStartsOn: 1 }))
    const weekEntries = liveBreakout.filter(t => t.date >= weekStart && t.date <= weekEnd).length

    const consequences = buildConsequences(breaches, trades.filter(t => t.date >= settings.startDate), today)

    // Risk per trade: 1% unless a rule says 0.5%.
    const riskNotes: string[] = []
    if (settings.phase === 1 && liveBreakout.length < 20) riskNotes.push(`Phase 1: live trade ${liveBreakout.length + 1} of the first 20 at 0.5%`)
    if (drawdownReduced) riskNotes.push(`Drawdown passed −${R.DRAWDOWN_REDUCE_PCT}%: 0.5% until back under −${R.DRAWDOWN_RECOVER_PCT}%`)
    const levelThreeReturn = consequences.active.find(c => c.level === 3 && !c.blocking && c.reducedRiskLeft > 0)
    if (levelThreeReturn) riskNotes.push(`Level 3 return: ${levelThreeReturn.reducedRiskLeft} live trades left at 0.5%`)
    const riskPct = riskNotes.length > 0 ? Math.min(settings.baseRiskPct, R.REDUCED_RISK_PCT) : settings.baseRiskPct

    const blockers: Blocker[] = []
    if (settings.phase === 0) blockers.push({ kind: "phase", message: "Phase 0: no live trades until Gate A passes (backtest, paper, re-entry)." })
    if (drawdownPct >= R.DRAWDOWN_STOP_PCT) blockers.push({ kind: "drawdown", message: `Down ${drawdownPct.toFixed(1)}% from peak: live trading stops. Paper only; back to Phase 0 and check the Kill criteria.` })
    if (monthLimitHit) blockers.push({ kind: "monthly", message: `Monthly loss limit hit (−${R.MONTHLY_LOSS_LIMIT_PCT}%): no new entries until next month.` })
    for (const c of consequences.active.filter(c => c.blocking)) {
        const parts: string[] = []
        if (c.blocksUntil && today <= c.blocksUntil) parts.push(`no new entries through ${format(parseISO(c.blocksUntil), "d MMM")}`)
        if (c.paperDone < c.paperNeeded) parts.push(`${c.paperNeeded - c.paperDone} more ${c.level === 3 ? "compliant " : ""}paper trades needed`)
        if (c.level === 4) parts.push("written answer to the Kill criteria")
        blockers.push({ kind: "consequence", message: `Level ${c.level} (${c.label}, ${format(parseISO(c.date), "d MMM")}): ${parts.join("; ")}.` })
    }

    return {
        settings,
        today,
        month,
        monthEquity,
        monthlyCloseDue: !settings.equityHistory.some(h => h.month === month),
        monthEquities,
        riskPct,
        riskNotes,
        oneR: monthEquity * riskPct / 100,
        positionCap: monthEquity * settings.positionCapPct / 100,
        monthRealized,
        monthLossLimit,
        monthLimitHit,
        currentEquity,
        peakEquity,
        drawdownPct,
        drawdownReduced,
        openPositions,
        sectorCounts,
        weekEntries,
        liveBreakoutCount: liveBreakout.length,
        consequences,
        blockers,
        liveEntriesAllowed: blockers.length === 0,
    }
}

// ---------------------------------------------------------------------------
// Review stats (weekly review, gates)
// ---------------------------------------------------------------------------

export interface ReviewStats {
    trades: number
    rTrades: number
    wins: number
    losses: number
    winRate: number | null
    avgWinR: number | null
    avgLossR: number | null
    expectancyR: number | null
    profitFactor: number | null
    adherencePct: number | null
    gradeAPct: number | null
    netPnl: number
    longestLosingStreak: number
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export function reviewStats(trades: Trade[]): ReviewStats {
    const closed = trades.filter(t => isBreakout(t) && t.status !== "open").sort((a, b) => realizedDate(a).localeCompare(realizedDate(b)))
    const rs = closed.map(t => tradeLevels(t).resultR).filter((r): r is number => r !== null)
    const wins = closed.filter(t => t.pnl > 0)
    const losses = closed.filter(t => t.pnl <= 0)
    const grossWin = wins.reduce((a, t) => a + t.pnl, 0)
    const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0))

    let met = 0
    let applicable = 0
    for (const t of closed) {
        for (const item of R.CHECKLIST) {
            applicable++
            if ((t.checklist || []).includes(item.id)) met++
        }
    }

    let streak = 0
    let longest = 0
    for (const t of closed) {
        streak = t.pnl <= 0 ? streak + 1 : 0
        longest = Math.max(longest, streak)
    }

    return {
        trades: closed.length,
        rTrades: rs.length,
        wins: wins.length,
        losses: losses.length,
        winRate: closed.length ? (wins.length / closed.length) * 100 : null,
        avgWinR: mean(rs.filter(r => r > 0)),
        avgLossR: mean(rs.filter(r => r <= 0)),
        expectancyR: mean(rs),
        profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : null),
        adherencePct: applicable ? (met / applicable) * 100 : null,
        gradeAPct: closed.length ? (closed.filter(t => t.processGrade === "A").length / closed.length) * 100 : null,
        netPnl: closed.reduce((a, t) => a + t.pnl, 0),
        longestLosingStreak: longest,
    }
}

// ---------------------------------------------------------------------------
// Validation path and gates
// ---------------------------------------------------------------------------

export function evaluateBacktest(bt: BacktestResult | null) {
    const rows = R.BACKTEST_CRITERIA.map(c => {
        const value = bt ? bt[c.key] : null
        const mark = bt?.strict ? c.strict : c.pass
        const pass = value === null || value === undefined ? null : c.direction === "min" ? value >= mark : value <= mark
        return { ...c, value, mark, pass }
    })
    const passed = rows.every(r => r.pass === true) ? true : rows.some(r => r.pass === false) ? false : null
    return { rows, passed }
}

// With Autopilot placing the trades, its paper trades are the paper stage (yours count too).
export function paperStage(trades: Trade[], settings: ResolvedSettings, today = todayISO()) {
    const paper = trades
        .filter(t => isBreakout(t) && t.isPaper && t.status !== "open" && t.date >= settings.startDate)
        .sort((a, b) => a.date.localeCompare(b.date))
    const stats = reviewStats(paper)
    const first = paper[0]?.date || null
    const weeks = first ? differenceInCalendarDays(parseISO(today), parseISO(first)) / 7 : 0
    const sizeStopFailures = paper.filter(t => !(t.checklist || []).includes("size") || !(t.checklist || []).includes("stopGtt")).length
    const checks = [
        { label: "20 paper trades", detail: `${paper.length} / 20`, pass: paper.length >= 20 },
        { label: "At least 8 weeks", detail: first ? `${Math.floor(weeks)} weeks since ${format(parseISO(first), "d MMM")}` : "Not started", pass: weeks >= 8 },
        { label: "Zero Level 3 breaches (size or stop)", detail: `${sizeStopFailures} trades missed the size or stop item`, pass: paper.length > 0 && sizeStopFailures === 0 },
        { label: "At least 95% of checklist items met", detail: stats.adherencePct === null ? "—" : `${stats.adherencePct.toFixed(1)}%`, pass: stats.adherencePct !== null && stats.adherencePct >= 95 },
        ...R.PAPER_MANUAL_CHECKS.map(m => ({ label: m.label, detail: "Your call", pass: !!settings.checks[m.key], manualKey: m.key })),
    ]
    return { trades: paper, stats, checks, passed: checks.every(c => c.pass) }
}

export function liveGates(trades: Trade[], settings: ResolvedSettings) {
    const live = trades
        .filter(t => isBreakout(t) && !t.isPaper && t.status !== "open" && t.date >= settings.startDate)
        .sort((a, b) => realizedDate(a).localeCompare(realizedDate(b)))
    const all = reviewStats(live)
    const last100 = reviewStats(live.slice(-100))
    return {
        count: live.length,
        all,
        gateB: [
            { label: "50 live trades", detail: `${Math.min(live.length, 50)} / 50`, pass: live.length >= 50 },
            { label: "95%+ adherence", detail: all.adherencePct === null ? "—" : `${all.adherencePct.toFixed(1)}%`, pass: all.adherencePct !== null && all.adherencePct >= 95 },
            { label: "Expectancy ≥ 0 after costs", detail: all.expectancyR === null ? "—" : `${all.expectancyR.toFixed(2)}R`, pass: all.expectancyR !== null && all.expectancyR >= 0 },
        ],
        gateC: [
            { label: "100 trades measured", detail: `${Math.min(live.length, 100)} / 100`, pass: live.length >= 100 },
            { label: "Expectancy ≥ +0.2R over the last 100", detail: last100.expectancyR === null ? "—" : `${last100.expectancyR.toFixed(2)}R`, pass: live.length >= 100 && last100.expectancyR !== null && last100.expectancyR >= 0.2 },
        ],
    }
}

export function killCriteria(settings: ResolvedSettings, liveCount: number, liveExpectancy: number | null, level4Count: number) {
    return R.KILL_CRITERIA.map((text, i) => {
        let state: "triggered" | "clear" | "self-check" = "self-check"
        let detail = "Only you can check this one."
        if (i === 0) {
            const failed = settings.backtest?.failedRuns || 0
            state = failed >= 2 ? "triggered" : "clear"
            detail = `${failed} failed backtest run${failed === 1 ? "" : "s"}`
        } else if (i === 1) {
            state = liveCount >= 100 && liveExpectancy !== null && liveExpectancy <= 0 ? "triggered" : "clear"
            detail = liveCount >= 100 ? `Expectancy ${liveExpectancy?.toFixed(2) ?? "—"}R over ${liveCount} trades` : `${liveCount} / 100 live trades so far`
        } else if (i === 2) {
            state = level4Count >= 2 ? "triggered" : "clear"
            detail = `${level4Count} Level 4 reset${level4Count === 1 ? "" : "s"}`
        }
        return { text, state, detail }
    })
}

// ---------------------------------------------------------------------------
// Impulse lane
// ---------------------------------------------------------------------------

// What the impulse would have done on a full position-cap buy, held from the logged price to the later price.
export function impulseOutcome(i: Pick<Impulse, "refPrice" | "laterPrice">, positionCap: number) {
    if (!i.refPrice || !i.laterPrice) return null
    const pct = (i.laterPrice - i.refPrice) / i.refPrice
    return { pct: pct * 100, rupees: pct * positionCap }
}
