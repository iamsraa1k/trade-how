"use client"

import * as React from "react"
import { format, parseISO } from "date-fns"
import { History, MessageSquare, Scale } from "lucide-react"

import type { Breach, ConstitutionSettings, Impulse, Trade } from "@/lib/db"
import { cn, pnlDate } from "@/lib/utils"
import { reviewStats, tradeLevels, type ConstitutionStatus } from "@/features/constitution/lib/engine"
import { inr } from "@/features/constitution/lib/format"
import { DisciplineView } from "@/features/constitution/components/DisciplineView"
import { TradeLog, tradeSummary } from "./AutoTrade"
import type { Overview } from "./AutopilotView"

const fmtR = (r: number | null) => (r === null ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`)
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

export function HistoryTab({ overview, status, trades, constitution, breaches, impulses }: {
    overview: Overview
    status: ConstitutionStatus
    trades: Trade[]
    constitution: ConstitutionSettings | null
    breaches: Breach[]
    impulses: Impulse[]
}) {
    const closed = trades.filter(t => t.auto && t.status !== "open").sort((a, b) => pnlDate(b).localeCompare(pnlDate(a)))
    const s = reviewStats(closed)
    const bt = status.settings.backtest
    const tiles = [
        { label: "Trades closed", value: String(s.trades) },
        { label: "Win rate", value: s.winRate === null ? "—" : `${s.winRate.toFixed(0)}%` },
        { label: "Average per trade", value: fmtR(s.expectancyR), hint: bt?.expectancy != null ? `Backtest ${fmtR(bt.expectancy)}` : "Add your backtest in Settings to compare" },
        { label: "Average loss", value: fmtR(s.avgLossR), hint: "Should stay near −1R" },
        { label: "Longest losing run", value: String(s.longestLosingStreak), hint: "About 7 in a row is normal" },
        { label: "Net (paper)", value: `${s.netPnl >= 0 ? "+" : ""}${inr(s.netPnl)}`, tone: s.netPnl >= 0 ? "good" : "bad" },
    ] as { label: string; value: string; hint?: string; tone?: "good" | "bad" }[]

    return (
        <div className="space-y-8">
            <section className="space-y-3">
                <div>
                    <h2 className="text-lg font-bold flex items-center gap-2"><Scale className="h-5 w-5 text-indigo-500" />How Autopilot is doing</h2>
                    <p className="text-sm text-muted-foreground">Every paper trade uses the backtest&apos;s fill rules and costs, so these numbers show whether the strategy works before any real money.</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {tiles.map(t => (
                        <div key={t.label} className="rounded-xl border bg-background/70 px-3 py-2.5 min-w-0">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{t.label}</p>
                            <p className={cn("text-lg font-bold font-mono truncate", t.tone === "good" && "text-emerald-600 dark:text-emerald-400", t.tone === "bad" && "text-red-600 dark:text-red-400")}>{t.value}</p>
                            {t.hint && <p className="text-[10px] text-muted-foreground truncate">{t.hint}</p>}
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-bold flex items-center gap-2"><History className="h-5 w-5 text-indigo-500" />Closed trades</h2>
                {closed.length === 0 ? (
                    <p className="text-sm text-muted-foreground rounded-2xl border border-dashed p-6 text-center">No closed Autopilot trades yet.</p>
                ) : (
                    <div className="space-y-2">
                        {closed.map(t => {
                            const r = tradeLevels(t).resultR
                            return (
                                <details key={t.id} className="rounded-xl border bg-background/70 p-3">
                                    <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
                                        <span className="min-w-0">
                                            <span className="font-mono font-bold">{t.symbol}</span>
                                            <span className="block text-xs text-muted-foreground truncate">{tradeSummary(t)}</span>
                                        </span>
                                        <span className={cn("text-right font-mono font-semibold shrink-0", t.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                                            {fmtR(r)}
                                            <span className="block text-xs">{t.pnl >= 0 ? "+" : ""}{inr(t.pnl)}</span>
                                        </span>
                                    </summary>
                                    <TradeLog text={t.analysis} className="mt-3 border-t pt-3" />
                                </details>
                            )
                        })}
                    </div>
                )}
            </section>

            {overview.recentMessages.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-lg font-bold flex items-center gap-2"><MessageSquare className="h-5 w-5 text-indigo-500" />Telegram messages</h2>
                    <div className="space-y-2">
                        {overview.recentMessages.map((m, i) => (
                            <details key={`${m.at}-${i}`} className="rounded-xl border bg-background/70 p-3">
                                <summary className="cursor-pointer text-sm font-medium">{format(parseISO(m.at), "EEE d MMM, HH:mm")}</summary>
                                <pre className="mt-2 whitespace-pre-wrap text-xs font-sans text-muted-foreground">{stripHtml(m.text)}</pre>
                            </details>
                        ))}
                    </div>
                </section>
            )}

            <details className="rounded-2xl border p-4">
                <summary className="cursor-pointer font-semibold">Discipline log: rule breaches and impulse ideas</summary>
                <p className="text-sm text-muted-foreground mt-2 mb-4">Only needed for trades you place yourself. Autopilot follows every rule by design.</p>
                <DisciplineView constitution={constitution} trades={trades} breaches={breaches} impulses={impulses} />
            </details>
        </div>
    )
}
