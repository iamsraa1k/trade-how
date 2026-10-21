"use client"

import * as React from "react"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { AlertTriangle, Bell, CalendarClock, Check, Eye, Radar, Wallet } from "lucide-react"

import { Button } from "@/shared/components/ui/button"
import type { ScanStock, Trade } from "@/lib/db"
import { cn } from "@/lib/utils"
import { computeSizing, isBreakout, tradeLevels, type ConstitutionStatus } from "@/features/constitution/lib/engine"
import { inr } from "@/features/constitution/lib/format"
import { capitalise, readSetup } from "@/features/automation/lib/analysis"
import { TradeLog, day } from "./AutoTrade"
import type { Overview } from "./AutopilotView"

function Section({ icon: Icon, title, description, children }: { icon: React.ElementType; title: string; description?: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <div>
                <h2 className="text-lg font-bold flex items-center gap-2"><Icon className="h-5 w-5 text-indigo-500" />{title}</h2>
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            {children}
        </section>
    )
}

function Notice({ tone, children, action }: { tone: "amber" | "sky" | "red"; children: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div className={cn(
            "flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border p-4 text-sm",
            tone === "amber" && "border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200",
            tone === "sky" && "border-sky-200 bg-sky-50/80 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-200",
            tone === "red" && "border-red-200 bg-red-50/80 text-red-800 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200"
        )}>
            <div className="flex-1">{children}</div>
            {action}
        </div>
    )
}

function BreakoutCard({ stock, status, verdict }: { stock: ScanStock; status: ConstitutionStatus; verdict?: { take: boolean; verdict: string } }) {
    const z = computeSizing({ high: stock.high, low: stock.low, equity: status.monthEquity, riskPct: status.riskPct, capPct: status.settings.positionCapPct })
    const sizing = "error" in z ? null : z
    const read = readSetup(stock, sizing?.stopDistancePct)
    const facts = [
        `Volume ${stock.volumeRatio}×`,
        `${stock.baseWeeks}-week base, ${stock.baseRangePct}% range`,
        stock.pctBelow52wHigh !== undefined ? (stock.pctBelow52wHigh <= 0.5 ? "At 52-week high" : `${stock.pctBelow52wHigh}% below 52-week high`) : null,
        `Results ${stock.resultsDate ? format(parseISO(stock.resultsDate), "d MMM") : "not announced"}`,
    ].filter(Boolean)

    return (
        <div className="rounded-2xl border bg-background/70 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-bold font-mono text-lg">{stock.symbol}</p>
                    <p className="text-xs text-muted-foreground truncate">{stock.name} · {stock.sector}</p>
                </div>
                <div className="text-right shrink-0">
                    <p className="font-mono font-bold">{inr(stock.close, 2)}</p>
                    {stock.changePct !== undefined && (
                        <p className={cn("text-xs font-semibold", stock.changePct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                            {stock.changePct >= 0 ? "+" : ""}{stock.changePct.toFixed(1)}% today
                        </p>
                    )}
                </div>
            </div>
            <p className="text-xs text-muted-foreground">{facts.join(" · ")}</p>
            <ul className="space-y-1 text-sm">
                {read.strengths.map(s => <li key={s} className="flex gap-2"><Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />{capitalise(s)}</li>)}
                {read.cautions.map(s => <li key={s} className="flex gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />{capitalise(s)}</li>)}
            </ul>
            <p className="text-xs rounded-lg bg-muted/40 px-3 py-2">
                {sizing && !sizing.skip
                    ? <>Plan: buy above <b>{inr(sizing.trigger, 1)}</b> (limit {inr(sizing.limit, 1)}) · stop <b>{inr(sizing.stop, 1)}</b> ({sizing.stopDistancePct.toFixed(1)}%) · {sizing.shares} shares · risk {inr(sizing.rupeeRisk)}</>
                    : sizing ? <>The stop would sit {sizing.stopDistancePct.toFixed(1)}% below the buy price, wider than the 8% the rules allow.</> : "Couldn't size this one."}
            </p>
            {verdict && (
                <p className={cn(
                    "text-sm font-semibold rounded-lg px-3 py-2",
                    verdict.take ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300"
                )}>
                    {verdict.verdict}
                </p>
            )}
        </div>
    )
}

function PositionCard({ trade }: { trade: Trade }) {
    const pending = !trade.entryPrice
    const lv = tradeLevels(trade)
    const stop = trade.currentStop ?? trade.stopPrice
    const cells = pending
        ? [
            { label: "Buys above", value: inr(trade.trigger, 1) },
            { label: "Limit", value: inr(trade.limitPrice, 1) },
            { label: "Stop after buying", value: inr(trade.stopPrice, 1) },
            { label: "Order expires", value: day(trade.gttExpiry) },
        ]
        : [
            { label: stop !== trade.stopPrice ? "Stop (moved up)" : "Stop", value: inr(stop, 2) },
            { label: "Breakeven at (+1.5R)", value: inr(lv.breakeven, 2) },
            { label: "Trail from (+2R)", value: inr(lv.trailStart, 2) },
            { label: "Time stop", value: day(lv.timeStopDate) },
        ]
    return (
        <div className="rounded-2xl border bg-background/70 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <p className="font-bold font-mono text-lg flex items-center gap-2">
                        {trade.symbol}
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full font-sans", pending ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300")}>
                            {pending ? "WAITING TO BUY" : "HOLDING"}
                        </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {trade.sector} · {pending ? `signal on ${day(trade.signalDate || trade.date)}` : `bought ${day(trade.date)} at ${inr(trade.entryPrice, 2)}`} · {trade.quantity} shares
                    </p>
                </div>
                <Link href={`/edit/${trade.id}`} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">Full log</Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {cells.map(c => (
                    <div key={c.label} className="rounded-lg bg-muted/40 px-3 py-2 min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{c.label}</p>
                        <p className="font-mono font-semibold text-sm truncate">{c.value}</p>
                    </div>
                ))}
            </div>
            <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">Why Autopilot {pending ? "wants to buy it" : "bought it"}</summary>
                <TradeLog text={trade.analysis} className="mt-2" />
            </details>
        </div>
    )
}

export function TodayTab({ overview, status, trades, onGoToSettings }: { overview: Overview; status: ConstitutionStatus; trades: Trade[]; onGoToSettings: () => void }) {
    const scan = overview.latestScan
    const verdicts = new Map(overview.lastRunDate === scan?.date ? overview.lastSignals.map(v => [v.symbol, v]) : [])
    const near = (scan?.bases || []).filter(b => b.pctToBreakout !== undefined && b.pctToBreakout >= 0).slice(0, 8)
    const openAuto = trades
        .filter(t => t.auto && t.status === "open")
        .sort((a, b) => Number(!a.entryPrice) - Number(!b.entryPrice) || a.date.localeCompare(b.date))
    const manualOpen = trades.filter(t => isBreakout(t) && t.status === "open" && !t.auto)

    return (
        <div className="space-y-8">
            {(status.monthlyCloseDue || !overview.telegram.linked || overview.lastError) && (
                <div className="space-y-3">
                    {status.monthlyCloseDue && (
                        <Notice tone="amber" action={<Button size="sm" variant="outline" onClick={onGoToSettings}>Open settings</Button>}>
                            <CalendarClock className="inline h-4 w-4 mr-1.5 -mt-0.5" />
                            <b>Monthly close due.</b> Enter this month&apos;s equity so 1R and the position cap stay right. Using {inr(status.monthEquity)} until then.
                        </Notice>
                    )}
                    {!overview.telegram.linked && (
                        <Notice tone="sky" action={<Button size="sm" variant="outline" onClick={onGoToSettings}>Connect</Button>}>
                            <Bell className="inline h-4 w-4 mr-1.5 -mt-0.5" />
                            Telegram isn&apos;t connected, so the nightly digest isn&apos;t reaching your phone.
                        </Notice>
                    )}
                    {overview.lastError && <Notice tone="red">Last run had a problem: {overview.lastError}</Notice>}
                </div>
            )}

            <Section
                icon={Radar}
                title={scan ? `Breakouts on ${format(parseISO(scan.date), "EEE d MMM")}` : "Breakouts"}
                description={scan ? `${scan.breakouts.length} of ${scan.universeSize} Nifty 200 stocks passed all 8 scan filters.` : undefined}
            >
                {!scan ? (
                    <p className="text-sm text-muted-foreground">No scan yet. It runs on weekday evenings around 7 pm, or press Run now.</p>
                ) : scan.breakouts.length === 0 ? (
                    <p className="text-sm text-muted-foreground rounded-2xl border border-dashed p-6 text-center">No stock broke out that day. Most days look like this, and that&apos;s the system working.</p>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {scan.breakouts.map(s => <BreakoutCard key={s.symbol} stock={s} status={status} verdict={verdicts.get(s.symbol)} />)}
                    </div>
                )}
            </Section>

            {near.length > 0 && (
                <Section icon={Eye} title="Close to breaking out" description="Strong stocks resting in tight bases, nearest to their breakout level first.">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {near.map(b => (
                            <div key={b.symbol} className="rounded-xl border bg-background/70 px-4 py-3 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-mono font-bold">{b.symbol}</p>
                                    <p className="text-xs text-muted-foreground truncate">{b.sector} · {b.baseWeeks}w base, {b.baseRangePct}% range</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-sm font-semibold">{b.pctToBreakout! < 0.1 ? "At the top" : `${b.pctToBreakout!.toFixed(1)}% to go`}</p>
                                    <p className="text-xs text-muted-foreground">base top {inr(b.baseHigh ?? b.high, 1)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            <Section icon={Wallet} title="Autopilot's positions" description="Paper trades it placed. It manages every stop and exit itself after each close.">
                {openAuto.length === 0 ? (
                    <p className="text-sm text-muted-foreground rounded-2xl border border-dashed p-6 text-center">No open positions. Autopilot buys only when the market light is green and a stock passes every check.</p>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {openAuto.map(t => <PositionCard key={t.id} trade={t} />)}
                    </div>
                )}
            </Section>

            {manualOpen.length > 0 && (
                <Section icon={Wallet} title="Your own open breakout trades" description="Logged by hand before Autopilot. The nightly digest still checks their exits.">
                    <ul className="text-sm space-y-1">
                        {manualOpen.map(t => <li key={t.id}><Link href={`/edit/${t.id}`} className="font-mono font-semibold hover:underline">{t.symbol}</Link> <span className="text-muted-foreground">bought {day(t.date)}</span></li>)}
                    </ul>
                </Section>
            )}
        </div>
    )
}
