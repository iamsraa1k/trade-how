"use client"

import * as React from "react"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { ArrowRight, CalendarClock, OctagonX, Settings2, ShieldCheck } from "lucide-react"

import { Button } from "@/shared/components/ui/button"
import { cn } from "@/lib/utils"
import { DRAWDOWN_REDUCE_PCT, DRAWDOWN_STOP_PCT, MAX_ENTRIES_PER_WEEK, MAX_OPEN_POSITIONS, PHASES } from "../lib/rules"
import type { ConstitutionStatus } from "../lib/engine"

export const inr = (n: number | null | undefined, digits = 0) =>
    n === null || n === undefined || !isFinite(n) ? "—" : n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: digits })

function Meter({ value, max, marks = [], tone }: { value: number; max: number; marks?: number[]; tone: "ok" | "warn" | "bad" }) {
    const pct = Math.max(0, Math.min(100, (value / max) * 100))
    return (
        <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden mt-2">
            <div
                className={cn("h-full rounded-full transition-all", tone === "ok" && "bg-emerald-500", tone === "warn" && "bg-amber-500", tone === "bad" && "bg-red-500")}
                style={{ width: `${pct}%` }}
            />
            {marks.map(m => (
                <span key={m} className="absolute top-0 h-full w-px bg-foreground/30" style={{ left: `${(m / max) * 100}%` }} />
            ))}
        </div>
    )
}

function Tile({ label, value, sub, children, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; tone?: "bad" | "warn" | "good" }) {
    return (
        <div className="glass rounded-2xl p-4 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate">{label}</p>
            <p className={cn(
                "text-xl sm:text-2xl font-extrabold tracking-tight mt-1 truncate",
                tone === "bad" && "text-red-600 dark:text-red-400",
                tone === "warn" && "text-amber-600 dark:text-amber-400",
                tone === "good" && "text-emerald-600 dark:text-emerald-400"
            )}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
            {children}
        </div>
    )
}

export function ConstitutionStatusPanel({ status, onOpenSettings, compact = false }: { status: ConstitutionStatus; onOpenSettings?: () => void; compact?: boolean }) {
    const phase = PHASES[status.settings.phase]
    const monthUsed = Math.max(0, -status.monthRealized)
    const openCount = status.openPositions.length

    return (
        <div className="space-y-3">
            {status.monthlyCloseDue && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/20 p-4">
                    <CalendarClock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <p className="text-sm text-amber-900 dark:text-amber-200 flex-1">
                        <span className="font-semibold">Monthly close due for {format(parseISO(`${status.month}-01`), "MMMM")}.</span>{" "}
                        Value equity (account + reserve) to fix this month&apos;s 1R and position cap. Using {inr(status.monthEquity)} until then.
                    </p>
                    {onOpenSettings ? (
                        <Button size="sm" variant="outline" onClick={onOpenSettings} className="shrink-0">Do monthly close</Button>
                    ) : (
                        <Button size="sm" variant="outline" asChild className="shrink-0"><Link href="/constitution">Do monthly close</Link></Button>
                    )}
                </div>
            )}

            {status.blockers.length > 0 ? (
                <div className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/20 p-4">
                    <p className="flex items-center gap-2 text-sm font-bold text-red-700 dark:text-red-300">
                        <OctagonX className="h-4 w-4" /> No new live entries
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-red-900/90 dark:text-red-200/90 list-disc pl-6">
                        {status.blockers.map(b => <li key={b.message}>{b.message}</li>)}
                    </ul>
                    <p className="mt-2 text-xs text-red-800/70 dark:text-red-300/70">Open trades keep their stops and exits. Paper trades are always allowed.</p>
                </div>
            ) : (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/20 p-4 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    <ShieldCheck className="h-4 w-4" /> Clear for live entries — if tonight&apos;s light is green and the scan gives a signal.
                </div>
            )}

            <div className={cn("grid gap-3", compact ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6" : "grid-cols-2 lg:grid-cols-3")}>
                <Tile label={`Phase ${status.settings.phase}`} value={phase.name} sub={phase.span}>
                    {onOpenSettings && !compact && (
                        <button onClick={onOpenSettings} className="mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                            <Settings2 className="h-3 w-3" /> Settings &amp; monthly close
                        </button>
                    )}
                </Tile>
                <Tile
                    label="1R this month"
                    value={inr(status.oneR)}
                    sub={`${status.riskPct}% of ${inr(status.monthEquity)} · cap ${inr(status.positionCap)}`}
                    tone={status.riskPct < status.settings.baseRiskPct ? "warn" : undefined}
                />
                <Tile
                    label="Month realised"
                    value={`${status.monthRealized >= 0 ? "+" : ""}${inr(status.monthRealized)}`}
                    sub={`Limit −${inr(status.monthLossLimit)}`}
                    tone={status.monthLimitHit ? "bad" : status.monthRealized >= 0 ? "good" : undefined}
                >
                    <Meter value={monthUsed} max={status.monthLossLimit} tone={status.monthLimitHit ? "bad" : monthUsed > status.monthLossLimit * 0.6 ? "warn" : "ok"} />
                </Tile>
                <Tile
                    label="From equity peak"
                    value={status.drawdownPct >= 0.05 ? `−${status.drawdownPct.toFixed(1)}%` : "At peak"}
                    sub={`Peak ${inr(status.peakEquity)} · now ${inr(status.currentEquity)}`}
                    tone={status.drawdownPct >= DRAWDOWN_STOP_PCT ? "bad" : status.drawdownPct >= DRAWDOWN_REDUCE_PCT ? "warn" : undefined}
                >
                    <Meter value={status.drawdownPct} max={20} marks={[DRAWDOWN_REDUCE_PCT, DRAWDOWN_STOP_PCT]} tone={status.drawdownPct >= DRAWDOWN_STOP_PCT ? "bad" : status.drawdownPct >= DRAWDOWN_REDUCE_PCT ? "warn" : "ok"} />
                </Tile>
                <Tile
                    label="Open positions"
                    value={`${openCount} / ${MAX_OPEN_POSITIONS}`}
                    sub={Object.entries(status.sectorCounts).map(([s, n]) => `${s} ${n}`).join(" · ") || "None open"}
                    tone={openCount >= MAX_OPEN_POSITIONS ? "warn" : undefined}
                />
                <Tile
                    label="Entries this week"
                    value={`${status.weekEntries} / ${MAX_ENTRIES_PER_WEEK}`}
                    sub={status.weekEntries >= MAX_ENTRIES_PER_WEEK ? "Full: extra signals go in the log" : "Live Momentum Breakout fills"}
                    tone={status.weekEntries >= MAX_ENTRIES_PER_WEEK ? "warn" : undefined}
                />
            </div>

            {status.riskNotes.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 px-1">Risk is {status.riskPct}% because: {status.riskNotes.join("; ")}.</p>
            )}

            {compact && (
                <div className="flex justify-end">
                    <Link href="/constitution" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                        Open the constitution <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>
            )}
        </div>
    )
}
