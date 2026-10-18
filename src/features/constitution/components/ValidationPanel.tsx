"use client"

import * as React from "react"
import { toast } from "sonner"
import { CheckCircle2, Circle, XCircle } from "lucide-react"

import { Button } from "@/shared/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card"
import { Input } from "@/shared/components/ui/input"
import { Label } from "@/shared/components/ui/label"
import { Switch } from "@/shared/components/ui/switch"
import { Textarea } from "@/shared/components/ui/textarea"
import { saveConstitutionAction } from "@/app/actions"
import type { BacktestResult, Trade } from "@/lib/db"
import { useData } from "@/shared/context/DataContext"
import { cn } from "@/lib/utils"
import { GOALS_90_DAYS, REENTRY_CHECKS } from "../lib/rules"
import { evaluateBacktest, paperStage, type ResolvedSettings } from "../lib/engine"

export function PassIcon({ pass }: { pass: boolean | null }) {
    if (pass === true) return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
    if (pass === false) return <XCircle className="h-4 w-4 text-red-500 shrink-0" />
    return <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
}

const EMPTY_BACKTEST: BacktestResult = {
    expectancy: null, profitFactor: null, totalTrades: null, heldOutTrades: null, maxDrawdown: null,
    avgLoserR: null, consistencyPct: null, robustnessPF: null, strict: false, failedRuns: 0,
}

function useSaveSettings() {
    const { setConstitution } = useData()
    return async (data: Parameters<typeof saveConstitutionAction>[0], successMessage?: string) => {
        const result = await saveConstitutionAction(data)
        if (!result.success || !result.data) {
            toast.error(result.error || "Failed to save")
            return false
        }
        setConstitution(result.data)
        if (successMessage) toast.success(successMessage)
        return true
    }
}

function CheckList({ items, checks, onToggle }: { items: { key: string; label: string }[]; checks: Record<string, boolean>; onToggle: (key: string, value: boolean) => void }) {
    return (
        <ul className="space-y-2">
            {items.map(item => (
                <li key={item.key}>
                    <label className="flex items-start gap-3 rounded-lg border bg-background/70 p-3 text-sm cursor-pointer hover:border-primary/40 transition-colors">
                        <input
                            type="checkbox"
                            checked={!!checks[item.key]}
                            onChange={e => onToggle(item.key, e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                        />
                        <span className={cn(checks[item.key] && "text-muted-foreground line-through decoration-muted-foreground/40")}>{item.label}</span>
                    </label>
                </li>
            ))}
        </ul>
    )
}

export function ValidationPanel({ settings, trades }: { settings: ResolvedSettings; trades: Trade[] }) {
    const save = useSaveSettings()
    const [checks, setChecks] = React.useState(settings.checks)
    const [backtest, setBacktest] = React.useState<BacktestResult>(settings.backtest || EMPTY_BACKTEST)
    const [whyTrading, setWhyTrading] = React.useState(settings.whyTrading)
    const [savingBacktest, setSavingBacktest] = React.useState(false)

    React.useEffect(() => setChecks(settings.checks), [settings.checks])
    React.useEffect(() => setBacktest(settings.backtest || EMPTY_BACKTEST), [settings.backtest])
    React.useEffect(() => setWhyTrading(settings.whyTrading), [settings.whyTrading])

    const toggle = async (key: string, value: boolean) => {
        const next = { ...checks, [key]: value }
        setChecks(next)
        const ok = await save({ checks: next })
        if (!ok) setChecks(checks)
    }

    const backtestEval = evaluateBacktest(backtest)
    const paper = paperStage(trades, { ...settings, checks })
    const reentryDone = REENTRY_CHECKS.every(c => checks[c.key]) && whyTrading.trim().length > 0

    const setMetric = (key: keyof BacktestResult, raw: string) =>
        setBacktest(prev => ({ ...prev, [key]: raw === "" ? null : Number(raw) }))

    const saveBacktest = async () => {
        setSavingBacktest(true)
        await save({ backtest }, "Backtest results saved")
        setSavingBacktest(false)
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                No live rupee goes in until the setup passes a backtest that includes costs and gaps, then 20 paper trades with perfect size-and-stop compliance, then your break&apos;s re-entry conditions — in that order.
            </p>

            <Card className="glass-card">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><PassIcon pass={backtestEval.passed} /> Stage 1 — Backtest</CardTitle>
                    <CardDescription>Enter the held-out results from your Python engine (after costs). Fail twice and the setup is dead.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                        <label className="flex items-center gap-2 text-sm">
                            <Switch checked={backtest.strict} onCheckedChange={(v: boolean) => setBacktest(prev => ({ ...prev, strict: v }))} />
                            Tested on today&apos;s Nifty 500 list (stricter marks)
                        </label>
                        <div className="flex items-center gap-2 text-sm">
                            <Label htmlFor="failedRuns" className="whitespace-nowrap">Failed runs</Label>
                            <Input id="failedRuns" type="number" min="0" max="5" className="w-20 h-9" value={backtest.failedRuns} onChange={e => setBacktest(prev => ({ ...prev, failedRuns: Math.max(0, Number(e.target.value) || 0) }))} />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {backtestEval.rows.map(row => (
                            <div key={row.key} className="flex items-center gap-3 rounded-lg border bg-background/70 p-3">
                                <PassIcon pass={row.pass} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{row.label}</p>
                                    <p className="text-xs text-muted-foreground">Pass: {row.direction === "min" ? "≥" : "≤"} {row.mark}{row.unit}</p>
                                </div>
                                <Input
                                    type="number"
                                    step="any"
                                    aria-label={row.label}
                                    className="w-24 h-9 font-mono text-right"
                                    value={backtest[row.key] ?? ""}
                                    onChange={e => setMetric(row.key, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-xs text-muted-foreground">
                            Tune at most three things: base length (20 or 30 days), volume multiple (1.5× or 2×), and the trail (20-day EMA or 50-day SMA).
                        </p>
                        <Button size="sm" onClick={saveBacktest} disabled={savingBacktest} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            {savingBacktest ? "Saving..." : "Save backtest"}
                        </Button>
                    </div>
                    {backtest.failedRuns === 1 && (
                        <p className="text-sm text-amber-700 dark:text-amber-400">One failure used. One structural change is allowed, then one re-run on the same held-out data.</p>
                    )}
                    {backtest.failedRuns >= 2 && (
                        <p className="text-sm font-semibold text-red-600 dark:text-red-400">Failed twice: the setup is dead. This is Kill criterion 1.</p>
                    )}
                </CardContent>
            </Card>

            <Card className="glass-card">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><PassIcon pass={paper.passed ? true : null} /> Stage 2 — Paper trading</CardTitle>
                    <CardDescription>20 trades and at least 8 weeks, whichever comes later. Profit isn&apos;t required. Log these as paper Momentum Breakout trades.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    {paper.checks.map(c => (
                        <div key={c.label} className="flex items-center gap-3 rounded-lg border bg-background/70 p-3 text-sm">
                            {"manualKey" in c && c.manualKey ? (
                                <input
                                    type="checkbox"
                                    checked={!!checks[c.manualKey]}
                                    onChange={e => toggle(c.manualKey!, e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                                />
                            ) : (
                                <PassIcon pass={c.pass ? true : null} />
                            )}
                            <span className="flex-1">{c.label}</span>
                            <span className="text-xs text-muted-foreground text-right">{c.detail}</span>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Card className="glass-card">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><PassIcon pass={reentryDone ? true : null} /> Stage 3 — Re-entry conditions</CardTitle>
                    <CardDescription>Live trading starts no earlier than month 10 of the break, and only once all of these are true.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <CheckList items={REENTRY_CHECKS} checks={checks} onToggle={toggle} />
                    <div className="space-y-2">
                        <Label htmlFor="whyTrading">Why am I trading? (you should be comfortable reading this on a −10% day)</Label>
                        <Textarea id="whyTrading" className="min-h-[100px] bg-background" value={whyTrading} onChange={e => setWhyTrading(e.target.value)} />
                        <div className="flex justify-end">
                            <Button size="sm" variant="outline" onClick={() => save({ whyTrading }, "Saved")} disabled={whyTrading === settings.whyTrading}>Save answer</Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="glass-card">
                <CardHeader>
                    <CardTitle>Next 90 days (still inside the break)</CardTitle>
                    <CardDescription>{GOALS_90_DAYS.filter(g => checks[g.key]).length} of {GOALS_90_DAYS.length} done</CardDescription>
                </CardHeader>
                <CardContent>
                    <CheckList items={GOALS_90_DAYS} checks={checks} onToggle={toggle} />
                </CardContent>
            </Card>
        </div>
    )
}

export function gateAStatus(settings: ResolvedSettings, trades: Trade[]) {
    const bt = evaluateBacktest(settings.backtest)
    const paper = paperStage(trades, settings)
    const reentry = REENTRY_CHECKS.every(c => settings.checks[c.key]) && settings.whyTrading.trim().length > 0
    return [
        { label: "Backtest passes", pass: bt.passed },
        { label: "Paper stage passes", pass: paper.passed ? true : null },
        { label: "Re-entry conditions met", pass: reentry ? true : null },
    ]
}
