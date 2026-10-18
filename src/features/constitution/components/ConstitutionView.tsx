"use client"

import * as React from "react"
import { Ban, Check, Flag, Skull } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs"
import type { Breach, ConstitutionSettings, Trade } from "@/lib/db"
import { cn } from "@/lib/utils"
import {
    CHECKLIST, ENTRY_RULES, FIVE_CHECKS, LADDER, LOSS_LIMITS, MANAGEMENT_RULES, NEVER, PHASES, PLEDGE, TEN_RULES,
} from "../lib/rules"
import { computeStatus, killCriteria, liveGates } from "../lib/engine"
import { ConstitutionStatusPanel, inr } from "./ConstitutionStatusPanel"
import { ConstitutionSettingsDialog } from "./ConstitutionSettingsDialog"
import { LevelBadge } from "./BreakoutFields"
import { PassIcon, ValidationPanel, gateAStatus } from "./ValidationPanel"

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <Card className="glass-card">
            <CardHeader>
                <CardTitle className="text-lg">{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    )
}

function NumberedList({ items }: { items: string[] }) {
    return (
        <ol className="space-y-2.5">
            {items.map((item, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 text-xs font-bold">{i + 1}</span>
                    <span className="pt-0.5">{item}</span>
                </li>
            ))}
        </ol>
    )
}

export function ConstitutionView({ constitution, trades, breaches }: { constitution: ConstitutionSettings | null; trades: Trade[]; breaches: Breach[] }) {
    const [settingsOpen, setSettingsOpen] = React.useState(false)
    const status = React.useMemo(() => computeStatus(constitution, trades, breaches), [constitution, trades, breaches])
    const gates = React.useMemo(() => liveGates(trades, status.settings), [trades, status.settings])
    const gateA = gateAStatus(status.settings, trades)
    const kill = killCriteria(status.settings, gates.count, gates.all.expectancyR, status.consequences.level4Count)

    const gateRows: Record<string, { label: string; pass: boolean | null; detail?: string }[]> = {
        "Gate A": gateA,
        "Gate B": gates.gateB.map(g => ({ ...g, pass: g.pass ? true : null })),
        "Gate C": gates.gateC.map(g => ({ ...g, pass: g.pass ? true : null })),
    }

    return (
        <div className="space-y-8">
            {status.settings.isNew && (
                <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/80 dark:bg-indigo-950/20 p-4 text-sm text-indigo-900 dark:text-indigo-200">
                    <p className="font-semibold">Set up your constitution</p>
                    <p className="mt-1">You&apos;re starting at Phase 0 with ₹1,00,000 equity (1R = ₹1,000, cap = ₹20,000). Open <button className="underline font-medium" onClick={() => setSettingsOpen(true)}>settings</button> to confirm the start date and this month&apos;s equity. Trades before the start date don&apos;t count.</p>
                </div>
            )}

            <ConstitutionStatusPanel status={status} onOpenSettings={() => setSettingsOpen(true)} />
            <ConstitutionSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} status={status} />

            <Tabs defaultValue="card" className="w-full">
                <div className="overflow-x-auto custom-scrollbar -mx-1 px-1 pb-1">
                    <TabsList className="h-auto">
                        <TabsTrigger value="card">Rule card</TabsTrigger>
                        <TabsTrigger value="setup">The setup</TabsTrigger>
                        <TabsTrigger value="limits">Limits &amp; ladder</TabsTrigger>
                        <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
                        <TabsTrigger value="validation">Validation</TabsTrigger>
                        <TabsTrigger value="kill">Kill criteria</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="card" className="space-y-6 pt-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Section title="The ten rules" description="Read before you place any order.">
                            <NumberedList items={TEN_RULES} />
                        </Section>
                        <div className="space-y-6">
                            <Section title="The eight-item journal checklist" description="Answered yes/no on every Momentum Breakout trade.">
                                <NumberedList items={CHECKLIST.map(c => c.label)} />
                            </Section>
                            <Section title="Never">
                                <ul className="space-y-2">
                                    {NEVER.map(n => (
                                        <li key={n} className="flex gap-2 text-sm"><Ban className="h-4 w-4 mt-0.5 text-red-500 shrink-0" />{n}</li>
                                    ))}
                                </ul>
                            </Section>
                        </div>
                    </div>
                    <blockquote className="glass rounded-2xl p-5 text-center text-base sm:text-lg italic font-medium">
                        &ldquo;{PLEDGE(Math.round(status.oneR).toLocaleString("en-IN"))}&rdquo;
                    </blockquote>
                </TabsContent>

                <TabsContent value="setup" className="space-y-6 pt-4">
                    <p className="text-sm text-muted-foreground max-w-3xl">
                        Buy a strong stock the day after it breaks out of a quiet sideways range on heavy volume. Protect it with a stop below the breakout day, and hold it until the trend bends. A stock becomes an order only when all five checks pass — most evenings the answer is &ldquo;no trade&rdquo;, and that is the system working.
                    </p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {FIVE_CHECKS.map(check => (
                            <Section key={check.title} title={check.title} description={check.why}>
                                <ul className="space-y-2">
                                    {check.items.map(item => (
                                        <li key={item} className="flex gap-2 text-sm"><Check className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />{item}</li>
                                    ))}
                                </ul>
                            </Section>
                        ))}
                        <Section title="Entry: a GTT buy that needs follow-through">
                            <NumberedList items={ENTRY_RULES} />
                        </Section>
                    </div>
                    <Section title="Managing the trade" description="Checked each evening and acted on through orders, never by watching the screen.">
                        <NumberedList items={MANAGEMENT_RULES} />
                    </Section>
                </TabsContent>

                <TabsContent value="limits" className="space-y-6 pt-4">
                    <Section title="Loss limits" description={`On a normal day the most you can lose is about 4% (four positions at 1R = ${inr(status.oneR)} each).`}>
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-sm min-w-[520px]">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                                        <th className="py-2 pr-4 font-semibold">Limit</th>
                                        <th className="py-2 pr-4 font-semibold">Size</th>
                                        <th className="py-2 font-semibold">What happens when it&apos;s hit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {LOSS_LIMITS.map(l => (
                                        <tr key={l.limit + l.size} className="border-b border-border/50 last:border-0">
                                            <td className="py-2.5 pr-4 font-medium whitespace-nowrap">{l.limit}</td>
                                            <td className="py-2.5 pr-4 font-mono whitespace-nowrap">{l.size}</td>
                                            <td className="py-2.5 text-muted-foreground">{l.consequence}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Section>
                    <Section title="The consequence ladder" description="Applied the same day, to yourself. During any pause, open trades keep their stops and exits running.">
                        <div className="space-y-4">
                            {LADDER.map(step => (
                                <div key={step.level} className="rounded-xl border bg-background/60 p-4">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <LevelBadge level={step.level} />
                                        <span className="font-semibold">{step.title}</span>
                                    </div>
                                    <p className="text-sm mt-2">{step.consequence}</p>
                                    <p className="text-xs text-muted-foreground mt-2">{step.breaches.map(b => b.label).join(" · ")}</p>
                                </div>
                            ))}
                        </div>
                    </Section>
                </TabsContent>

                <TabsContent value="roadmap" className="space-y-4 pt-4">
                    <p className="text-sm text-muted-foreground">Each phase is earned by a gate, not a good week. Phases are counted in trades, not months.</p>
                    <div className="space-y-3">
                        {PHASES.map(p => {
                            const current = p.phase === status.settings.phase
                            const rows = p.gate ? gateRows[p.gate.name] : undefined
                            return (
                                <div key={p.phase}>
                                    <div className={cn(
                                        "glass rounded-2xl p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3",
                                        current && "ring-2 ring-indigo-500/60 bg-indigo-50/60 dark:bg-indigo-950/20"
                                    )}>
                                        <div>
                                            <p className="font-bold flex items-center gap-2">
                                                Phase {p.phase}
                                                {current && <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white px-2 py-0.5 rounded-full">You are here</span>}
                                            </p>
                                            <p className="text-sm font-medium">{p.name}</p>
                                            <p className="text-xs text-muted-foreground">{p.span}</p>
                                        </div>
                                        <ul className="text-sm space-y-1">
                                            {p.points.map(pt => <li key={pt}>{pt}</li>)}
                                        </ul>
                                    </div>
                                    {p.gate && (
                                        <div className="ml-6 border-l-2 border-dashed border-border pl-5 py-3 space-y-2">
                                            <p className="text-sm"><Flag className="inline h-3.5 w-3.5 mr-1.5 text-indigo-500" /><span className="font-semibold">{p.gate.name}</span> <span className="text-muted-foreground">— {p.gate.text}</span></p>
                                            {rows && (p.phase === status.settings.phase || p.phase === status.settings.phase - 1) && (
                                                <div className="flex flex-wrap gap-2">
                                                    {rows.map(r => (
                                                        <span key={r.label} className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-1 text-xs">
                                                            <PassIcon pass={r.pass} /> {r.label}{r.detail ? `: ${r.detail}` : ""}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </TabsContent>

                <TabsContent value="validation" className="pt-4">
                    <ValidationPanel settings={status.settings} trades={trades} />
                </TabsContent>

                <TabsContent value="kill" className="space-y-6 pt-4">
                    <Section title="Kill criteria" description="You stop active trading, and move the trading capital into your SIPs, the moment any trigger below becomes true — decided now, while you're calm.">
                        <ul className="space-y-3">
                            {kill.map((k, i) => (
                                <li key={i} className={cn("rounded-xl border p-4 flex gap-3", k.state === "triggered" ? "border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20" : "bg-background/60")}>
                                    {k.state === "triggered" ? <Skull className="h-5 w-5 text-red-600 shrink-0" /> : <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>}
                                    <div>
                                        <p className="text-sm font-medium">{k.text}</p>
                                        <p className={cn("text-xs mt-1", k.state === "triggered" ? "text-red-700 dark:text-red-300 font-semibold" : "text-muted-foreground")}>
                                            {k.state === "triggered" ? "Triggered — " : ""}{k.detail}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </Section>
                    <Section title="What stopping means">
                        <p className="text-sm leading-relaxed">
                            Let open positions close at their stops or exits, move the trading capital to your SIP funds, and keep markets as research — backtests and paper only. Stopping on these terms is the plan working, not failing.
                        </p>
                    </Section>
                </TabsContent>
            </Tabs>
        </div>
    )
}
