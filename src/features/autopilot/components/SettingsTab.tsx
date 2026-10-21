"use client"

import * as React from "react"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"
import { Bell, Clock, ExternalLink, Send, ShieldCheck, Unlink, Wallet } from "lucide-react"

import { Button } from "@/shared/components/ui/button"
import { Input } from "@/shared/components/ui/input"
import {
    disconnectTelegramAction, linkTelegramAction, saveTelegramBotAction, sendTelegramTestAction,
} from "@/app/actions"
import type { Trade } from "@/lib/db"
import { PHASES } from "@/features/constitution/lib/rules"
import { inr } from "@/features/constitution/lib/format"
import type { ConstitutionStatus } from "@/features/constitution/lib/engine"
import { ConstitutionSettingsDialog } from "@/features/constitution/components/ConstitutionSettingsDialog"
import { ValidationPanel } from "@/features/constitution/components/ValidationPanel"
import type { Overview } from "./AutopilotView"

function Panel({ icon: Icon, title, description, children }: { icon: React.ElementType; title: string; description?: string; children: React.ReactNode }) {
    return (
        <section className="glass-card p-5 sm:p-6 space-y-4">
            <div>
                <h2 className="text-lg font-bold flex items-center gap-2"><Icon className="h-5 w-5 text-indigo-500" />{title}</h2>
                {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
            </div>
            {children}
        </section>
    )
}

function TelegramPanel({ overview, onChange }: { overview: Overview; onChange: () => void }) {
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
        <Panel icon={Bell} title="Telegram" description="The nightly digest and Saturday review arrive here.">
            {tg.linked ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-emerald-700 dark:text-emerald-300 font-medium">Connected to @{tg.botUsername}.</span>
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("test", sendTelegramTestAction, "Test message sent")}>
                        <Send className="h-3.5 w-3.5 mr-1.5" /> Send test
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("unlink", disconnectTelegramAction, "Telegram disconnected")}>
                        <Unlink className="h-3.5 w-3.5 mr-1.5" /> Disconnect
                    </Button>
                </div>
            ) : tg.startLink ? (
                <div className="space-y-2 text-sm">
                    <p className="text-muted-foreground">Open your bot, tap <b>Start</b>, then come back and confirm.</p>
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" asChild className="bg-sky-500 hover:bg-sky-600 text-white">
                            <a href={tg.startLink} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open @{tg.botUsername}</a>
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("link", linkTelegramAction, "Telegram connected")}>
                            {busy === "link" ? "Checking..." : "I tapped Start"}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-2 text-sm">
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
        </Panel>
    )
}

export function SettingsTab({ overview, status, trades, onChange }: { overview: Overview; status: ConstitutionStatus; trades: Trade[]; onChange: () => void }) {
    const [dialogOpen, setDialogOpen] = React.useState(false)
    const phase = PHASES[status.settings.phase]
    const facts = [
        { label: `Equity, ${format(parseISO(`${status.month}-01`), "MMMM")}`, value: inr(status.monthEquity), note: status.monthlyCloseDue ? "Monthly close due" : undefined },
        { label: "1R (risk per trade)", value: inr(status.oneR), note: `${status.riskPct}% of equity` },
        { label: "Largest position", value: inr(status.positionCap), note: `${status.settings.positionCapPct}% of equity` },
        { label: "Phase", value: `Phase ${status.settings.phase}`, note: phase.name },
        { label: "Counting trades from", value: format(parseISO(status.settings.startDate), "d MMM yyyy") },
    ]

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            <div className="space-y-6">
                <Panel icon={Wallet} title="Money and phase" description="Value your equity (account + reserve) on the first weekend of each month. Autopilot sizes every trade from it.">
                    <div className="grid grid-cols-2 gap-2">
                        {facts.map(f => (
                            <div key={f.label} className="rounded-lg border bg-background/70 px-3 py-2 min-w-0">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{f.label}</p>
                                <p className="font-mono font-semibold truncate">{f.value}</p>
                                {f.note && <p className={f.note === "Monthly close due" ? "text-[11px] text-amber-600 dark:text-amber-400 font-medium" : "text-[11px] text-muted-foreground truncate"}>{f.note}</p>}
                            </div>
                        ))}
                    </div>
                    <Button variant="outline" onClick={() => setDialogOpen(true)}>Monthly close and phase</Button>
                    <ConstitutionSettingsDialog open={dialogOpen} onOpenChange={setDialogOpen} status={status} />
                </Panel>

                <TelegramPanel overview={overview} onChange={onChange} />

                <Panel icon={Clock} title="Schedule">
                    <ul className="text-sm space-y-2 text-muted-foreground">
                        <li><b className="text-foreground">Weekdays, around 6:30–7:30 pm:</b> scan, Autopilot trades, and the digest.</li>
                        <li><b className="text-foreground">Saturday, around 9–10 am:</b> weekly review and watchlist.</li>
                        <li className="flex items-start gap-2">
                            <ShieldCheck className={overview.cronSecretSet ? "h-4 w-4 mt-0.5 text-emerald-500" : "h-4 w-4 mt-0.5 text-amber-500"} />
                            {overview.cronSecretSet
                                ? "Locked: only Vercel's scheduler can start the job (CRON_SECRET is set)."
                                : "Add a CRON_SECRET environment variable in Vercel so only its scheduler can start the job."}
                        </li>
                    </ul>
                </Panel>
            </div>

            <Panel icon={ShieldCheck} title="Before real money: Gate A" description="All three stages must pass before Phase 1. Autopilot's paper trades count toward the paper stage.">
                <ValidationPanel settings={status.settings} trades={trades} />
            </Panel>
        </div>
    )
}
