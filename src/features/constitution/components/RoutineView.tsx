"use client"

import * as React from "react"
import Link from "next/link"
import { format, parseISO, startOfWeek, subWeeks, endOfWeek } from "date-fns"
import { AlertTriangle, ArrowRight, Bot, Calculator, FileText, Moon, Pencil, Sparkles } from "lucide-react"

import { Button } from "@/shared/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card"
import { Input } from "@/shared/components/ui/input"
import { Label } from "@/shared/components/ui/label"
import type { Breach, ConstitutionSettings, Trade } from "@/lib/db"
import { analyzeSymbolAction } from "@/app/actions"
import { cn } from "@/lib/utils"
import { MAX_ENTRIES_PER_WEEK, MAX_OPEN_POSITIONS, MAX_PER_SECTOR, ROUTINE_STEPS, WEEKLY_REVIEW_ITEMS } from "../lib/rules"
import {
    addTradingDays, computeSizing, computeStatus, isBreakout, realizedDate, reviewStats, toISO, tradeLevels, tradingDaysBetween, type ConstitutionStatus,
} from "../lib/engine"
import { inr } from "./ConstitutionStatusPanel"

// ---------------------------------------------------------------------------
// Tonight's routine — a per-evening checklist kept in this browser only.
// ---------------------------------------------------------------------------

function readLocal<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
        return fallback
    }
}

function writeLocal(key: string, value: unknown) {
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch {
        // Storage unavailable (private mode); the checklist just won't persist.
    }
}

function TonightCard({ today }: { today: string }) {
    const key = `tradehow-routine-${today}`
    const [state, setState] = React.useState<{ done: string[]; urge: number | null }>({ done: [], urge: null })

    React.useEffect(() => setState(readLocal(key, { done: [], urge: null })), [key])

    const update = (next: typeof state) => {
        setState(next)
        writeLocal(key, next)
    }

    return (
        <Card className="glass-card">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Moon className="h-5 w-5 text-indigo-500" /> Tonight, after 4 pm</CardTitle>
                <CardDescription>30–40 minutes. During market hours Kite stays closed except to answer a fill or stop notification.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="space-y-2">
                    <Label>Urge to trade tonight (1–5)</Label>
                    <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(n => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => update({ ...state, urge: n })}
                                className={cn(
                                    "h-10 w-10 rounded-lg border-2 font-bold transition-all",
                                    state.urge === n ? (n === 5 ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" : "border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300") : "border-border text-muted-foreground hover:border-muted-foreground/40"
                                )}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                    {state.urge === 5 ? (
                        <p className="text-sm font-semibold text-red-600 dark:text-red-400">A 5 means no new GTT buys this evening. Treat the urge as information, not motivation.</p>
                    ) : (
                        <p className="text-xs text-muted-foreground">A 5 (&ldquo;I need a trade&rdquo;) means no new GTT buys tonight.</p>
                    )}
                </div>

                <ol className="space-y-2">
                    {ROUTINE_STEPS.map((step, i) => {
                        const done = state.done.includes(step.id)
                        const blockedByUrge = state.urge === 5 && (step.id === "size" || step.id === "gtt")
                        return (
                            <li key={step.id}>
                                <label className={cn("flex items-start gap-3 rounded-lg border bg-background/70 p-3 cursor-pointer transition-colors hover:border-primary/40", done && "opacity-60", blockedByUrge && "opacity-40")}>
                                    <input
                                        type="checkbox"
                                        checked={done}
                                        disabled={blockedByUrge}
                                        onChange={e => update({ ...state, done: e.target.checked ? [...state.done, step.id] : state.done.filter(d => d !== step.id) })}
                                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                                    />
                                    <span className="text-sm">
                                        <span className={cn("font-semibold", done && "line-through")}>{i + 1}. {step.title}</span>
                                        <span className="block text-muted-foreground text-xs mt-0.5">{step.detail}</span>
                                    </span>
                                </label>
                            </li>
                        )
                    })}
                </ol>
            </CardContent>
        </Card>
    )
}

// ---------------------------------------------------------------------------
// Open positions with their evening levels
// ---------------------------------------------------------------------------

function OpenPositions({ trades, status }: { trades: Trade[]; status: ConstitutionStatus }) {
    const open = trades
        .filter(t => isBreakout(t) && t.status === "open" && t.date >= status.settings.startDate)
        .sort((a, b) => Number(!!a.isPaper) - Number(!!b.isPaper) || a.date.localeCompare(b.date))

    return (
        <Card className="glass-card">
            <CardHeader>
                <CardTitle>Open trades first</CardTitle>
                <CardDescription>Exits matter more than entries. Compare today&apos;s close with each level, then act through orders.</CardDescription>
            </CardHeader>
            <CardContent>
                {open.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No open Momentum Breakout positions.</p>
                ) : (
                    <div className="space-y-3">
                        {open.map(t => {
                            const lv = tradeLevels(t)
                            const pending = !t.entryPrice
                            const gttExpiry = addTradingDays(t.date, 3)
                            const toResults = t.resultsDate ? tradingDaysBetween(status.today, t.resultsDate) : null
                            const daysHeld = tradingDaysBetween(t.date, status.today)
                            const alerts: string[] = []
                            // Auto paper trades are managed by the paper engine, so only your own positions get reminders.
                            if (!t.auto) {
                                if (pending && status.today > gttExpiry) alerts.push(`GTT not triggered within 3 trading days (by ${format(parseISO(gttExpiry), "d MMM")}): delete it.`)
                                if (!pending && !t.stopPrice) alerts.push("No stop recorded. Place the stop GTT now.")
                                if (!pending && toResults !== null && toResults >= 0 && toResults <= 2) alerts.push(`Results in ${toResults} trading day${toResults === 1 ? "" : "s"}: exit at the open of the day before (sell half if up 2R+).`)
                                if (!pending && lv.timeStopDate && status.today >= lv.timeStopDate) alerts.push(`15 trading days passed: sell at the next open unless it has closed above ${inr(lv.plusOneR, 2)}.`)
                            }
                            return (
                                <div key={t.id} className={cn("rounded-xl border bg-background/70 p-4", t.isPaper && "border-dashed border-teal-300 dark:border-teal-800")}>
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div>
                                            <p className="font-bold flex items-center gap-2 flex-wrap">
                                                {t.symbol}
                                                {t.sector && <span className="text-xs font-medium text-muted-foreground">{t.sector}</span>}
                                                {t.isPaper && <span className="text-[10px] font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 px-2 py-0.5 rounded-full flex items-center gap-1"><FileText className="h-3 w-3" />PAPER</span>}
                                                {t.auto && <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 px-2 py-0.5 rounded-full flex items-center gap-1"><Bot className="h-3 w-3" />AUTO</span>}
                                                {pending && <span className="text-[10px] font-semibold bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 px-2 py-0.5 rounded-full">GTT PENDING</span>}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {pending ? `Placed ${format(parseISO(t.date), "d MMM")} · trigger ${inr(t.trigger, 2)} · limit ${inr(t.limitPrice, 2)}` : `Filled ${format(parseISO(t.date), "d MMM")} at ${inr(t.entryPrice, 2)} · ${t.quantity} shares · day ${daysHeld} of 15`}
                                            </p>
                                        </div>
                                        {t.auto ? (
                                            <span className="text-xs text-muted-foreground">Managed nightly by the paper engine</span>
                                        ) : (
                                            <Button asChild size="sm" variant="outline">
                                                <Link href={`/edit/${t.id}`}><Pencil className="h-3.5 w-3.5 mr-1.5" />{pending ? "Record fill" : "Update / close"}</Link>
                                            </Button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 text-sm">
                                        {[
                                            { label: t.currentStop && t.currentStop !== t.stopPrice ? "Stop (moved)" : "Stop", value: inr(t.currentStop || t.stopPrice, 2) },
                                            { label: "Breakeven at (1.5R)", value: inr(lv.breakeven, 2) },
                                            { label: "Trail from (2R)", value: inr(lv.trailStart, 2) },
                                            { label: "Time stop", value: lv.timeStopDate ? format(parseISO(lv.timeStopDate), "d MMM") : "—" },
                                            { label: "Results", value: t.resultsDate ? format(parseISO(t.resultsDate), "d MMM") : "Not set" },
                                        ].map(m => (
                                            <div key={m.label} className="rounded-lg bg-muted/40 px-3 py-2 min-w-0">
                                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{m.label}</p>
                                                <p className="font-mono font-semibold truncate">{m.value}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {alerts.length > 0 && (
                                        <ul className="mt-3 space-y-1">
                                            {alerts.map(a => (
                                                <li key={a} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{a}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

// ---------------------------------------------------------------------------
// Sizing calculator (the sizing sheet, A4)
// ---------------------------------------------------------------------------

const CASES = [
    { name: "A", high: "1240", low: "1180" },
    { name: "B", high: "509.5", low: "505" },
    { name: "C", high: "852", low: "780" },
]

function SizingCalculator({ status }: { status: ConstitutionStatus }) {
    const [symbol, setSymbol] = React.useState("")
    const [sector, setSector] = React.useState("")
    const [high, setHigh] = React.useState("")
    const [low, setLow] = React.useState("")
    const [fetchState, setFetchState] = React.useState<{ loading: boolean; text: string | null; ok: boolean }>({ loading: false, text: null, ok: false })

    const fetchLatest = async () => {
        setFetchState({ loading: true, text: null, ok: false })
        const result = await analyzeSymbolAction(symbol, null)
        if (!result.success || !result.data) {
            setFetchState({ loading: false, text: result.error || "Couldn't fetch market data.", ok: false })
            return
        }
        const d = result.data
        setSymbol(d.symbol)
        setSector(d.sector)
        setHigh(String(d.high))
        setLow(String(d.low))
        setFetchState({
            loading: false,
            ok: d.isBreakout && d.marketLight === "green",
            text: `${d.isBreakout ? `Breakout on ${d.breakoutDate}` : `${d.breakoutDate}: not a breakout`} · light ${d.marketLight} · volume ${d.volumeRatio}× · ${d.baseWeeks}-week base · ${d.resultsDate ? `results ${d.resultsDate}` : "results not announced"}`,
        })
    }

    const result = high && low
        ? computeSizing({ high: parseFloat(high), low: parseFloat(low), equity: status.monthEquity, riskPct: status.riskPct, capPct: status.settings.positionCapPct })
        : null
    const sizing = result && !("error" in result) ? result : null

    const sectorKey = sector.trim().toLowerCase()
    const sameSector = sectorKey ? status.openPositions.filter(t => (t.sector || "").trim().toLowerCase() === sectorKey).length : 0
    const limitWarnings: string[] = []
    if (status.openPositions.length >= MAX_OPEN_POSITIONS) limitWarnings.push(`${status.openPositions.length} positions open — no new GTT buys while full.`)
    if (sameSector >= MAX_PER_SECTOR) limitWarnings.push(`${sameSector} ${sector} positions already open (max ${MAX_PER_SECTOR}).`)
    if (status.weekEntries >= MAX_ENTRIES_PER_WEEK) limitWarnings.push(`${status.weekEntries} entries this week — the signal goes in the impulse log.`)

    const journalHref = (paper: boolean) => {
        if (!sizing) return "/add"
        const params = new URLSearchParams({
            trigger: sizing.trigger.toFixed(1),
            limit: sizing.limit.toFixed(1),
            stop: sizing.stop.toFixed(1),
            qty: String(sizing.shares),
        })
        if (symbol.trim()) params.set("symbol", symbol.trim().toUpperCase())
        if (sector.trim()) params.set("sector", sector.trim())
        if (paper) params.set("paper", "1")
        return `/add?${params.toString()}`
    }

    const rows = sizing ? [
        { label: "Trigger", value: inr(sizing.trigger, 2), hint: "High + 0.1%" },
        { label: "Limit (entry)", value: inr(sizing.limit, 2), hint: "Trigger + 1%" },
        { label: "Stop", value: inr(sizing.stop, 2), hint: sizing.stopLoweredTo3Pct ? "Lowered to 3% below entry" : "Low − 0.5%" },
        { label: "Stop distance", value: `${sizing.stopDistancePct.toFixed(1)}%`, hint: "3–8% allowed", bad: sizing.skip },
        { label: "Shares", value: String(sizing.shares), hint: sizing.skip ? "Skip" : sizing.limitedBy === "cap" ? "Capped by 20% position limit" : "Limited by 1R" },
        { label: "Position value", value: inr(sizing.positionValue), hint: `Cap ${inr(status.positionCap)}` },
        { label: "Rupee risk", value: inr(sizing.rupeeRisk), hint: `1R ${inr(status.oneR)}` },
        { label: "Breakeven level", value: inr(sizing.breakeven, 2), hint: "Entry + 1.5R" },
        { label: "Trail starts", value: inr(sizing.trailStart, 2), hint: "Entry + 2R" },
    ] : []

    return (
        <Card className="glass-card scroll-mt-24" id="sizing">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-indigo-500" /> Sizing calculator</CardTitle>
                <CardDescription>
                    Equity {inr(status.monthEquity)} · risk {status.riskPct}% · cap {status.settings.positionCapPct}%. No GTT buy goes in without this. If it says 0 shares, there is no trade.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="calc-symbol">Stock</Label>
                        <div className="flex gap-1.5">
                            <Input id="calc-symbol" placeholder="e.g. TATAMOTORS" className="font-mono uppercase min-w-0" value={symbol} onChange={e => setSymbol(e.target.value)} />
                            <Button type="button" size="icon" variant="outline" className="shrink-0" onClick={fetchLatest} disabled={!symbol.trim() || fetchState.loading} title="Fetch the latest breakout day from market data" aria-label="Fetch from market data">
                                <Sparkles className={cn("h-4 w-4 text-indigo-500", fetchState.loading && "animate-pulse")} />
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="calc-sector">Sector</Label>
                        <Input id="calc-sector" placeholder="e.g. Capital Goods" value={sector} onChange={e => setSector(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="calc-high">Breakout-day high</Label>
                        <Input id="calc-high" type="number" step="any" className="font-mono" value={high} onChange={e => setHigh(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="calc-low">Breakout-day low</Label>
                        <Input id="calc-low" type="number" step="any" className="font-mono" value={low} onChange={e => setLow(e.target.value)} />
                    </div>
                </div>
                {fetchState.text && (
                    <p className={cn("text-xs", fetchState.ok ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>{fetchState.text}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    Try the plan&apos;s worked examples:
                    {CASES.map(c => (
                        <button key={c.name} type="button" onClick={() => { setHigh(c.high); setLow(c.low) }} className="rounded-full border px-2.5 py-0.5 font-medium hover:bg-muted">Case {c.name}</button>
                    ))}
                    <span>(match the PDF at ₹1,00,000 equity and 1% risk)</span>
                </div>

                {result && "error" in result && <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>}

                {sizing && (
                    <>
                        <div className={cn(
                            "rounded-xl p-4 text-sm font-semibold flex items-center gap-2",
                            sizing.skip ? "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/20 dark:text-red-300 dark:border-red-900/60" : "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900/60"
                        )}>
                            {sizing.skip
                                ? `Skip: the stop is ${sizing.stopDistancePct.toFixed(1)}% below entry, wider than 8%. The stock ran too far in one day.`
                                : `Take: ${sizing.shares} shares, risking ${inr(sizing.rupeeRisk)} on a ${inr(sizing.positionValue)} position.`}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {rows.map(r => (
                                <div key={r.label} className="rounded-lg border bg-background/70 px-3 py-2 min-w-0">
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{r.label}</p>
                                    <p className={cn("font-mono font-bold truncate", r.bad && "text-red-600 dark:text-red-400")}>{r.value}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">{r.hint}</p>
                                </div>
                            ))}
                        </div>
                        {(limitWarnings.length > 0 || status.blockers.length > 0) && !sizing.skip && (
                            <ul className="space-y-1">
                                {[...status.blockers.map(b => b.message), ...limitWarnings].map(w => (
                                    <li key={w} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{w}</li>
                                ))}
                            </ul>
                        )}
                        {!sizing.skip && (
                            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                                <Button asChild variant="outline">
                                    <Link href={journalHref(true)}><FileText className="h-4 w-4 mr-2 text-teal-500" />Journal as paper trade</Link>
                                </Button>
                                <Button asChild className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                    <Link href={journalHref(false)}>Journal this plan <ArrowRight className="h-4 w-4 ml-2" /></Link>
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    )
}

// ---------------------------------------------------------------------------
// Weekly review (Saturday)
// ---------------------------------------------------------------------------

type Period = "this" | "last" | "4w" | "all"

function WeeklyReview({ trades, status }: { trades: Trade[]; status: ConstitutionStatus }) {
    const [period, setPeriod] = React.useState<Period>("this")
    const [mode, setMode] = React.useState<"live" | "paper" | "auto">("live")

    const today = parseISO(status.today)
    const ranges: Record<Period, [string, string]> = {
        this: [toISO(startOfWeek(today, { weekStartsOn: 1 })), toISO(endOfWeek(today, { weekStartsOn: 1 }))],
        last: [toISO(startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })), toISO(endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }))],
        "4w": [toISO(startOfWeek(subWeeks(today, 3), { weekStartsOn: 1 })), toISO(endOfWeek(today, { weekStartsOn: 1 }))],
        all: [status.settings.startDate, "9999-12-31"],
    }
    const [from, to] = ranges[period]
    const scoped = trades.filter(t =>
        isBreakout(t) && t.status !== "open" &&
        (mode === "live" ? !t.isPaper : mode === "paper" ? t.isPaper && !t.auto : !!t.auto) &&
        t.date >= status.settings.startDate && realizedDate(t) >= from && realizedDate(t) <= to
    )
    const s = reviewStats(scoped)
    const bt = status.settings.backtest
    const fmtR = (r: number | null) => (r === null ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`)

    const tiles = [
        { label: "Trades closed", value: String(s.trades) },
        { label: "Win rate", value: s.winRate === null ? "—" : `${s.winRate.toFixed(0)}%` },
        { label: "Expectancy", value: fmtR(s.expectancyR), hint: bt?.expectancy != null ? `Backtest ${fmtR(bt.expectancy)}` : undefined, tone: s.expectancyR === null ? undefined : s.expectancyR >= 0 ? "good" : "bad" },
        { label: "Average win", value: fmtR(s.avgWinR) },
        { label: "Average loss (gap check)", value: fmtR(s.avgLossR), hint: "Should be no worse than −1.25R", tone: s.avgLossR !== null && s.avgLossR < -1.25 ? "bad" : undefined },
        { label: "Rule adherence", value: s.adherencePct === null ? "—" : `${s.adherencePct.toFixed(0)}%`, hint: "Checklist items met", tone: s.adherencePct !== null && s.adherencePct < 95 ? "bad" : undefined },
        { label: "Grade A trades", value: s.gradeAPct === null ? "—" : `${s.gradeAPct.toFixed(0)}%` },
        { label: "Longest losing run", value: String(s.longestLosingStreak), hint: "~7 in a row is normal at 40% wins" },
        { label: "Net P&L", value: `${s.netPnl >= 0 ? "+" : ""}${inr(s.netPnl)}`, tone: s.netPnl >= 0 ? "good" : "bad" },
    ] as { label: string; value: string; hint?: string; tone?: "good" | "bad" }[]

    return (
        <Card className="glass-card">
            <CardHeader className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                    <CardTitle>Weekly review</CardTitle>
                    <CardDescription>Saturday, 30–45 minutes. Results in R, after costs, by exit date.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                    <div className="flex rounded-lg bg-muted/50 p-1 border">
                        {([["this", "This week"], ["last", "Last week"], ["4w", "4 weeks"], ["all", "All"]] as [Period, string][]).map(([p, label]) => (
                            <button key={p} onClick={() => setPeriod(p)} className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", period === p ? "bg-background shadow-sm" : "text-muted-foreground")}>{label}</button>
                        ))}
                    </div>
                    <div className="flex rounded-lg bg-muted/50 p-1 border">
                        {([["live", "Live"], ["paper", "Paper"], ["auto", "Auto"]] as const).map(([m, label]) => (
                            <button key={m} onClick={() => setMode(m)} className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", mode === m ? "bg-background shadow-sm" : "text-muted-foreground")}>{label}</button>
                        ))}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {tiles.map(t => (
                        <div key={t.label} className="rounded-lg border bg-background/70 px-3 py-2.5 min-w-0">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{t.label}</p>
                            <p className={cn("text-lg font-bold font-mono truncate", t.tone === "good" && "text-emerald-600 dark:text-emerald-400", t.tone === "bad" && "text-red-600 dark:text-red-400")}>{t.value}</p>
                            {t.hint && <p className="text-[10px] text-muted-foreground truncate">{t.hint}</p>}
                        </div>
                    ))}
                </div>
                {s.trades > 0 && s.rTrades < s.trades && (
                    <p className="text-xs text-muted-foreground">{s.trades - s.rTrades} trade{s.trades - s.rTrades === 1 ? "" : "s"} without a stop or fill price, so no R result.</p>
                )}
                <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
                    {WEEKLY_REVIEW_ITEMS.map(i => <li key={i}>{i}</li>)}
                </ul>
            </CardContent>
        </Card>
    )
}

export function RoutineView({ constitution, trades, breaches }: { constitution: ConstitutionSettings | null; trades: Trade[]; breaches: Breach[] }) {
    const status = React.useMemo(() => computeStatus(constitution, trades, breaches), [constitution, trades, breaches])

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
            <div className="space-y-6 min-w-0">
                {status.blockers.length > 0 && (
                    <div className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/20 p-4 text-sm text-red-800 dark:text-red-200">
                        <p className="font-semibold">No new live entries tonight.</p>
                        <ul className="list-disc pl-5 mt-1 space-y-0.5">{status.blockers.map(b => <li key={b.message}>{b.message}</li>)}</ul>
                    </div>
                )}
                <OpenPositions trades={trades} status={status} />
                <SizingCalculator status={status} />
                <WeeklyReview trades={trades} status={status} />
            </div>
            <div className="xl:sticky xl:top-20">
                <TonightCard today={status.today} />
            </div>
        </div>
    )
}
