"use client"

import * as React from "react"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"
import { Bot, CheckCircle2, Circle, Clock, ExternalLink, Play, Radar, Send, Unlink } from "lucide-react"

import { Button } from "@/shared/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card"
import { Input } from "@/shared/components/ui/input"
import { Label } from "@/shared/components/ui/label"
import {
    disconnectTelegramAction, getAutomationOverviewAction, linkTelegramAction, saveTelegramBotAction, sendTelegramTestAction,
} from "@/app/actions"
import type { Breach, ConstitutionSettings, ScanStock, Trade } from "@/lib/db"
import { cn } from "@/lib/utils"
import { computeSizing, computeStatus, reviewStats, tradingDaysBetween } from "@/features/constitution/lib/engine"
import { inr } from "@/features/constitution/components/ConstitutionStatusPanel"

export type Overview = Awaited<ReturnType<typeof getAutomationOverviewAction>>

const Step = ({ done, children }: { done: boolean; children: React.ReactNode }) => (
    <li className="flex items-start gap-3 text-sm">
        {done ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" /> : <Circle className="h-5 w-5 text-muted-foreground/50 shrink-0" />}
        <div className="min-w-0">{children}</div>
    </li>
)

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

function SetupCard({ overview, onChange }: { overview: Overview; onChange: () => void }) {
    const [token, setToken] = React.useState("")
    const [busy, setBusy] = React.useState<string | null>(null)
    const tg = overview.telegram

    const run = async (key: string, fn: () => Promise<{ success: boolean; error?: string }>, ok: string) => {
        setBusy(key)
        const result = await fn()
        setBusy(null)
        if (!result.success) {
            toast.error(result.error || "Something went wrong")
            return
        }
        toast.success(ok)
        onChange()
    }

    return (
        <Card className="glass-card">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-indigo-500" /> Set up</CardTitle>
                <CardDescription>Two one-time steps. After that, everything runs on its own after the close.</CardDescription>
            </CardHeader>
            <CardContent>
                <ol className="space-y-5">
                    <Step done={tg.linked}>
                        <p className="font-semibold">Connect Telegram</p>
                        {tg.linked ? (
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="text-muted-foreground">Linked to @{tg.botUsername}.</span>
                                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("test", sendTelegramTestAction, "Test message sent")}>
                                    <Send className="h-3.5 w-3.5 mr-1.5" /> Send test
                                </Button>
                                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("unlink", disconnectTelegramAction, "Telegram disconnected")}>
                                    <Unlink className="h-3.5 w-3.5 mr-1.5" /> Disconnect
                                </Button>
                            </div>
                        ) : tg.startLink ? (
                            <div className="space-y-2 mt-1">
                                <p className="text-muted-foreground">Open your bot, tap <b>Start</b>, then come back and check.</p>
                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" asChild className="bg-sky-500 hover:bg-sky-600 text-white">
                                        <a href={tg.startLink} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open @{tg.botUsername}</a>
                                    </Button>
                                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("link", linkTelegramAction, "Telegram linked")}>
                                        {busy === "link" ? "Checking..." : "I tapped Start"}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2 mt-1">
                                <p className="text-muted-foreground">
                                    In Telegram, message <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="underline">@BotFather</a>, send <span className="font-mono">/newbot</span>, pick a name, and paste the token it gives you here. It stays on the server.
                                </p>
                                <div className="flex gap-2">
                                    <Input type="password" autoComplete="off" placeholder="123456789:AA..." value={token} onChange={e => setToken(e.target.value)} className="font-mono" />
                                    <Button disabled={!token.trim() || busy !== null} onClick={() => run("save", () => saveTelegramBotAction(token), "Bot saved")}>
                                        {busy === "save" ? "Saving..." : "Save"}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Step>

                    <Step done={overview.cronSecretSet}>
                        <p className="font-semibold">Lock the scheduled job (recommended)</p>
                        <p className="text-muted-foreground mt-1">
                            {overview.cronSecretSet
                                ? "CRON_SECRET is set, so only Vercel's scheduler can trigger the job."
                                : "Add a CRON_SECRET environment variable in Vercel (any long random string). Until then the job still works, but only runs in its own evening window."}
                        </p>
                    </Step>
                </ol>
                <p className="text-xs text-muted-foreground mt-6 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Runs Mon–Fri around 18:30–19:30 IST, and Saturday around 09:00–10:00 IST for the weekly review.
                </p>
            </CardContent>
        </Card>
    )
}

function ScanCard({ overview, status }: { overview: Overview; status: ReturnType<typeof computeStatus> }) {
    const scan = overview.latestScan
    if (!scan) {
        return (
            <Card className="glass-card">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Radar className="h-5 w-5 text-indigo-500" /> Latest scan</CardTitle>
                    <CardDescription>No scan yet. The first one runs tonight after the close, or press Run now.</CardDescription>
                </CardHeader>
            </Card>
        )
    }
    const planHref = (s: ScanStock) => {
        const z = computeSizing({ high: s.high, low: s.low, equity: status.monthEquity, riskPct: status.riskPct, capPct: status.settings.positionCapPct })
        if ("error" in z) return "/add"
        return `/add?${new URLSearchParams({ symbol: s.symbol, sector: s.sector, trigger: z.trigger.toFixed(1), limit: z.limit.toFixed(1), stop: z.stop.toFixed(1), qty: String(z.shares) })}`
    }

    return (
        <Card className="glass-card">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Radar className="h-5 w-5 text-indigo-500" /> Scan for {format(parseISO(scan.date), "EEE d MMM")}</CardTitle>
                <CardDescription>
                    Nifty 200 ({scan.universeSize} stocks{scan.universeSource === "bundled" ? ", bundled list" : ""}) · filters 1–8 from your Chartink scan{scan.failures ? ` · ${scan.failures} stocks had no data` : ""}{scan.resultsCalendar ? "" : " · NSE results calendar unavailable"}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className={cn("rounded-xl p-4 text-sm font-semibold border", scan.marketLight.green ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900/60" : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-300 dark:border-red-900/60")}>
                    Market light {scan.marketLight.green ? "GREEN" : "RED"}: Nifty {scan.marketLight.close.toLocaleString("en-IN")} vs 200-day SMA {Math.round(scan.marketLight.sma200).toLocaleString("en-IN")}.
                    {!scan.marketLight.green && " No new buys."}
                </div>

                <div>
                    <p className="text-sm font-semibold mb-2">Breakouts ({scan.breakouts.length})</p>
                    {scan.breakouts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">None — most evenings the answer is &ldquo;no trade&rdquo;.</p>
                    ) : (
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-sm min-w-[620px]">
                                <thead>
                                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b">
                                        <th className="py-2 pr-3">Stock</th><th className="py-2 pr-3">Close</th><th className="py-2 pr-3">Volume</th><th className="py-2 pr-3">Base</th><th className="py-2 pr-3">Results</th><th className="py-2 pr-3">Sizing</th><th className="py-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {scan.breakouts.map(s => {
                                        const z = computeSizing({ high: s.high, low: s.low, equity: status.monthEquity, riskPct: status.riskPct, capPct: status.settings.positionCapPct })
                                        const resultsGap = s.resultsDate ? tradingDaysBetween(scan.date, s.resultsDate) : null
                                        const resultsBlock = resultsGap !== null && resultsGap >= 0 && resultsGap <= 10
                                        return (
                                            <tr key={s.symbol} className="border-b border-border/50 last:border-0">
                                                <td className="py-2.5 pr-3"><span className="font-bold font-mono">{s.symbol}</span><span className="block text-xs text-muted-foreground">{s.sector}</span></td>
                                                <td className="py-2.5 pr-3 font-mono">{inr(s.close, 2)}</td>
                                                <td className="py-2.5 pr-3 font-mono">{s.volumeRatio}×</td>
                                                <td className="py-2.5 pr-3 font-mono">{s.baseWeeks}w · {s.baseRangePct}%</td>
                                                <td className={cn("py-2.5 pr-3 text-xs", resultsBlock && "text-red-600 dark:text-red-400 font-semibold")}>{s.resultsDate ? format(parseISO(s.resultsDate), "d MMM") : "Not announced"}</td>
                                                <td className="py-2.5 pr-3 text-xs">
                                                    {"error" in z ? "—" : z.skip ? <span className="text-red-600 dark:text-red-400">Skip: stop {z.stopDistancePct.toFixed(1)}%</span> : <>{z.shares} sh · risk {inr(z.rupeeRisk)}<span className="block text-muted-foreground">GTT {inr(z.trigger, 1)} → {inr(z.limit, 1)} · stop {inr(z.stop, 1)}</span></>}
                                                </td>
                                                <td className="py-2.5 text-right">
                                                    {!("error" in z) && !z.skip && !resultsBlock && (
                                                        <Button size="sm" variant="outline" asChild><Link href={planHref(s)}>Journal plan</Link></Button>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {scan.bases.length > 0 && (
                    <div>
                        <p className="text-sm font-semibold mb-2">MB bases watchlist ({scan.bases.length}, tightest first)</p>
                        <div className="flex flex-wrap gap-2">
                            {scan.bases.slice(0, 24).map(b => (
                                <span key={b.symbol} className="rounded-full border bg-background/70 px-2.5 py-1 text-xs" title={`${b.name} · ${b.sector}`}>
                                    <span className="font-mono font-semibold">{b.symbol}</span> <span className="text-muted-foreground">{b.baseRangePct}% · {b.baseWeeks}w</span>
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function ForwardTestCard({ trades, backtestExpectancy }: { trades: Trade[]; backtestExpectancy: number | null | undefined }) {
    const auto = trades.filter(t => t.auto)
    const closed = auto.filter(t => t.status !== "open")
    const open = auto.filter(t => t.status === "open")
    const s = reviewStats(closed)
    const fmtR = (r: number | null) => (r === null ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`)
    const tiles = [
        { label: "Closed", value: String(s.trades) },
        { label: "Open / pending", value: `${open.filter(t => t.entryPrice).length} / ${open.filter(t => !t.entryPrice).length}` },
        { label: "Win rate", value: s.winRate === null ? "—" : `${s.winRate.toFixed(0)}%` },
        { label: "Expectancy", value: fmtR(s.expectancyR), hint: backtestExpectancy != null ? `Backtest ${fmtR(backtestExpectancy)}` : "Enter your backtest to compare" },
        { label: "Average loss", value: fmtR(s.avgLossR), hint: "Gap check: ≥ −1.25R" },
        { label: "Net P&L", value: `${s.netPnl >= 0 ? "+" : ""}${inr(s.netPnl)}` },
    ]
    return (
        <Card className="glass-card">
            <CardHeader>
                <CardTitle>Forward test (auto paper)</CardTitle>
                <CardDescription>
                    Every green-light signal is traded on paper with the backtest&apos;s fill rules and costs, within your limits. This tests the setup; it doesn&apos;t count toward the 20 paper trades in Stage 2, which test your own routine.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {tiles.map(t => (
                        <div key={t.label} className="rounded-lg border bg-background/70 px-3 py-2.5 min-w-0">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{t.label}</p>
                            <p className="text-lg font-bold font-mono truncate">{t.value}</p>
                            {t.hint && <p className="text-[10px] text-muted-foreground truncate">{t.hint}</p>}
                        </div>
                    ))}
                </div>
                {open.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-3">Open auto positions are on the <Link href="/routine" className="underline">Evening Routine</Link>; closed ones are in the Trade Log under Paper.</p>
                )}
            </CardContent>
        </Card>
    )
}

export function AutomationView({ constitution, trades, breaches }: { constitution: ConstitutionSettings | null; trades: Trade[]; breaches: Breach[] }) {
    const [overview, setOverview] = React.useState<Overview | null>(null)
    const [running, setRunning] = React.useState(false)

    const load = React.useCallback(async () => {
        try {
            setOverview(await getAutomationOverviewAction())
        } catch {
            toast.error("Couldn't load automation status")
        }
    }, [])

    React.useEffect(() => { load() }, [load])

    const runNow = async () => {
        setRunning(true)
        try {
            const res = await fetch("/api/automation/run", { method: "POST" })
            const body = await res.json()
            if (!res.ok) throw new Error(body.error || "Run failed")
            toast.success(`Scanned ${format(parseISO(body.asOf), "d MMM")}: light ${body.light}, ${body.breakouts} breakout(s)${body.sent ? ", digest sent to Telegram" : ""}`)
            if (body.error) toast.error(`Telegram: ${body.error}`)
            await load()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Run failed")
        } finally {
            setRunning(false)
        }
    }

    if (!overview) return <p className="text-sm text-muted-foreground">Loading…</p>
    return <AutomationPanels overview={overview} constitution={constitution} trades={trades} breaches={breaches} running={running} onRunNow={runNow} onChange={load} />
}

export function AutomationPanels({ overview, constitution, trades, breaches, running, onRunNow, onChange }: {
    overview: Overview
    constitution: ConstitutionSettings | null
    trades: Trade[]
    breaches: Breach[]
    running: boolean
    onRunNow: () => void
    onChange: () => void
}) {
    const status = React.useMemo(() => computeStatus(constitution, trades, breaches), [constitution, trades, breaches])

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 glass rounded-2xl p-4">
                <div className="text-sm">
                    <p className="font-semibold">
                        {overview.lastRunAt ? `Last run ${format(parseISO(overview.lastRunAt), "d MMM, HH:mm")} for ${overview.lastRunDate ? format(parseISO(overview.lastRunDate), "d MMM") : "—"}` : "Not run yet"}
                    </p>
                    {overview.lastSummary && <p className="text-muted-foreground">{overview.lastSummary}</p>}
                    {overview.lastError && <p className="text-red-600 dark:text-red-400">Last error: {overview.lastError}</p>}
                </div>
                <Button onClick={onRunNow} disabled={!overview.enabled || running} className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">
                    <Play className="h-4 w-4 mr-2" /> {running ? "Running… (up to a minute)" : "Run now"}
                </Button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
                <div className="space-y-6 min-w-0">
                    <ScanCard overview={overview} status={status} />
                    <ForwardTestCard trades={trades} backtestExpectancy={status.settings.backtest?.expectancy} />
                    {overview.recentMessages.length > 0 && (
                        <Card className="glass-card">
                            <CardHeader>
                                <CardTitle>Recent alerts</CardTitle>
                                <CardDescription>{overview.recentMessages.length === 1 ? "The last digest" : `The last ${overview.recentMessages.length} digests`}, as sent to Telegram.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {overview.recentMessages.map(m => (
                                    <details key={m.at} className="rounded-lg border bg-background/70 p-3">
                                        <summary className="cursor-pointer text-sm font-medium">{format(parseISO(m.at), "EEE d MMM, HH:mm")}</summary>
                                        <pre className="mt-2 whitespace-pre-wrap text-xs font-sans text-muted-foreground">{stripHtml(m.text)}</pre>
                                    </details>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </div>
                <div className="space-y-6">
                    <SetupCard overview={overview} onChange={onChange} />
                    <Card className="glass-card">
                        <CardHeader>
                            <CardTitle>What runs automatically</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="text-sm space-y-2 list-disc pl-5 text-muted-foreground">
                                <li><b className="text-foreground">Market light</b> from Nifty 50 vs its 200-day SMA.</li>
                                <li><b className="text-foreground">The MB breakout scan</b> on the Nifty 200, with sizing at your current 1R and cap, and NSE results dates.</li>
                                <li><b className="text-foreground">Paper trading</b> of every signal: GTT fill, stop, breakeven, trail, time stop and results exits.</li>
                                <li><b className="text-foreground">Your open positions</b>: breakeven, trail, time-stop, stop and results actions each evening.</li>
                                <li><b className="text-foreground">Saturday review</b> and the MB bases watchlist.</li>
                            </ul>
                            <Label className="block mt-4 text-xs text-muted-foreground font-normal">
                                Live orders stay manual until Phase 3, as your constitution says. Data: Upstox daily candles (free, after the close).
                            </Label>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
