"use client"

import * as React from "react"
import { Ban, Check, Flag, Skull } from "lucide-react"

import type { Trade } from "@/lib/db"
import { cn } from "@/lib/utils"
import { killCriteria, liveGates, type ConstitutionStatus } from "@/features/constitution/lib/engine"
import {
    ENTRY_RULES, FIVE_CHECKS, LADDER, LOSS_LIMITS, MANAGEMENT_RULES, NEVER, PHASES, PLEDGE, TEN_RULES,
} from "@/features/constitution/lib/rules"
import { inr } from "@/features/constitution/lib/format"
import { LevelBadge } from "@/features/constitution/components/LevelBadge"
import { PassIcon, gateAStatus } from "@/features/constitution/components/ValidationPanel"

/** A schematic Momentum Breakout trade: uptrend, quiet base, breakout, buy, stop and exits. */
function TradeIllustration() {
    const vol = [10, 14, 9, 16, 12, 11, 15, 8, 7, 9, 6, 8, 7, 9, 6, 8, 7, 9, 6, 7, 8, 6, 7]
    return (
        <svg viewBox="0 0 480 270" className="w-full h-auto max-w-2xl" role="img" aria-label="A stock rises, rests in a narrow sideways base, then breaks out on heavy volume. The buy sits just above the breakout day's high and the stop just below its low. The stop moves to entry at +1.5R and the trade trails the 20-day average after +2R.">
            <polyline points="20,200 50,190 70,178 90,166 110,150 125,138 140,120" fill="none" className="stroke-zinc-500" strokeWidth={1.5} strokeLinejoin="round" />
            <polyline points="140,120 155,128 170,115 185,127 200,113 215,129 230,116 245,127 260,115 272,126 279,128" fill="none" className="stroke-zinc-500" strokeWidth={1.5} strokeLinejoin="round" />
            <rect x={138} y={108} width={136} height={28} rx={4} fill="none" className="stroke-zinc-400" strokeWidth={0.75} strokeDasharray="4 3" />
            <line x1={284} y1={101} x2={284} y2={131} className="stroke-emerald-600" strokeWidth={1.5} />
            <rect x={279} y={104} width={10} height={24} rx={2} className="fill-emerald-500/40 stroke-emerald-600" strokeWidth={0.75} />
            <line x1={296} y1={21} x2={444} y2={21} className="stroke-zinc-400" strokeWidth={0.75} strokeDasharray="3 3" />
            <line x1={296} y1={40} x2={444} y2={40} className="stroke-zinc-400" strokeWidth={0.75} strokeDasharray="3 3" />
            <line x1={296} y1={97} x2={444} y2={97} className="stroke-emerald-500" strokeWidth={1.5} strokeDasharray="5 3" />
            <line x1={296} y1={135} x2={444} y2={135} className="stroke-red-500" strokeWidth={1.5} strokeDasharray="5 3" />
            <polyline points="300,112 330,92 360,72 390,52 420,36 448,32" fill="none" className="stroke-amber-500" strokeWidth={1} strokeDasharray="2 3" />
            <polyline points="289,104 300,97 318,86 336,72 354,58 372,44 388,30 400,22 412,18 424,26 436,38" fill="none" className="stroke-foreground" strokeWidth={1.5} strokeLinejoin="round" />
            <circle cx={436} cy={38} r={4} fill="none" className="stroke-amber-500" strokeWidth={1.5} />
            <text x={446} y={60} className="fill-muted-foreground" fontSize={12}>Sell</text>
            <text x={272} y={25} textAnchor="end" className="fill-muted-foreground" fontSize={12}>+2R: start trailing</text>
            <text x={272} y={44} textAnchor="end" className="fill-muted-foreground" fontSize={12}>+1.5R: stop moves to entry</text>
            <text x={272} y={101} textAnchor="end" className="fill-muted-foreground" fontSize={12}>Buy just above the high</text>
            <text x={300} y={152} className="fill-muted-foreground" fontSize={12}>Stop just below the low</text>
            <text x={70} y={218} textAnchor="middle" className="fill-muted-foreground" fontSize={12}>Uptrend</text>
            <text x={206} y={152} textAnchor="middle" className="fill-muted-foreground" fontSize={12}>Quiet base</text>
            <text x={284} y={170} textAnchor="middle" className="fill-muted-foreground" fontSize={12}>Breakout</text>
            {vol.map((h, i) => <rect key={i} x={20 + i * 11} y={260 - h} width={8} height={h} className="fill-zinc-400/70" />)}
            <rect x={280} y={220} width={8} height={40} className="fill-amber-500" />
            <text x={296} y={248} className="fill-muted-foreground" fontSize={12}>Heavy volume</text>
        </svg>
    )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <h3 className="font-semibold">{title}</h3>
            <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
        </div>
    )
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <details className="rounded-2xl border bg-background/60 p-4">
            <summary className="cursor-pointer font-semibold">{title}</summary>
            <div className="mt-4 text-sm">{children}</div>
        </details>
    )
}

const Numbered = ({ items }: { items: string[] }) => (
    <ol className="space-y-2">
        {items.map((item, i) => (
            <li key={i} className="flex gap-3 leading-relaxed">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 text-xs font-bold">{i + 1}</span>
                <span className="pt-0.5">{item}</span>
            </li>
        ))}
    </ol>
)

export function RulesTab({ status, trades }: { status: ConstitutionStatus; trades: Trade[] }) {
    const gates = React.useMemo(() => liveGates(trades, status.settings), [trades, status.settings])
    const gateA = gateAStatus(status.settings, trades)
    const kill = killCriteria(status.settings, gates.count, gates.all.expectancyR, status.consequences.level4Count)
    const gateRows: Record<string, { label: string; pass: boolean | null; detail?: string }[]> = {
        "Gate A": gateA,
        "Gate B": gates.gateB.map(g => ({ ...g, pass: g.pass ? true : null })),
        "Gate C": gates.gateC.map(g => ({ ...g, pass: g.pass ? true : null })),
    }
    const current = PHASES[status.settings.phase]

    return (
        <div className="space-y-8">
            <section className="glass-card p-5 sm:p-6 space-y-6">
                <h2 className="text-lg font-bold">How it works</h2>
                <TradeIllustration />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Block title="The idea">
                        <p>Autopilot buys strong Nifty 200 stocks the day after they break out of a quiet sideways range on heavy volume, then holds them for days to weeks until the trend weakens. Everything is decided after the close, from daily prices.</p>
                    </Block>
                    <Block title="When it buys">
                        <p>Only when all five checks pass: the market light is green (Nifty above its 200-day average), the stock is already strong, it rested in a tight base, today was a real breakout on 1.5× volume or more, and the risk fits. Most days nothing qualifies.</p>
                    </Block>
                    <Block title="How much it buys">
                        <p>R is what one trade can lose: {status.riskPct}% of your money, {inr(status.oneR)} right now. Autopilot sizes every trade so hitting the stop costs about 1R, and no position is bigger than {inr(status.positionCap)}.</p>
                    </Block>
                    <Block title="When it sells">
                        <ul className="list-disc pl-5 space-y-1">
                            <li>The stop is hit: a planned loss of about 1R.</li>
                            <li>Up 1.5R: the stop moves up to the buy price, so the trade can&apos;t lose any more.</li>
                            <li>Up 2R: it sells on the first close below the 20-day average.</li>
                            <li>15 trading days without reaching +1R: it sells.</li>
                            <li>Quarterly results coming: it sells the day before.</li>
                        </ul>
                    </Block>
                    <Block title="Safety limits">
                        <p>At most 4 positions, 2 in one sector, and 3 new buys a week. New buys stop for the month after a 5% loss, risk halves after a 10% fall from the peak, and live trading stops at 15%.</p>
                    </Block>
                    <Block title={`Where you are: Phase ${status.settings.phase}, ${current.name.toLowerCase()}`}>
                        <p>{status.settings.phase === 0
                            ? "Paper money only. Real money waits for Gate A: a passing backtest, 20 paper trades and the re-entry checklist (in Settings)."
                            : current.points.join(". ") + "."}</p>
                    </Block>
                </div>
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-bold">Roadmap</h2>
                <div className="space-y-2">
                    {PHASES.map(p => {
                        const here = p.phase === status.settings.phase
                        const rows = p.gate ? gateRows[p.gate.name] : undefined
                        return (
                            <div key={p.phase}>
                                <div className={cn("rounded-2xl border p-4 grid grid-cols-1 sm:grid-cols-[190px_1fr] gap-2", here ? "border-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/20 dark:border-indigo-700" : "bg-background/60")}>
                                    <div>
                                        <p className="font-bold flex items-center gap-2">Phase {p.phase}{here && <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white px-2 py-0.5 rounded-full">You are here</span>}</p>
                                        <p className="text-sm">{p.name}</p>
                                        <p className="text-xs text-muted-foreground">{p.span}</p>
                                    </div>
                                    <ul className="text-sm text-muted-foreground space-y-0.5">{p.points.map(pt => <li key={pt}>{pt}</li>)}</ul>
                                </div>
                                {p.gate && (
                                    <div className="ml-6 border-l-2 border-dashed border-border pl-4 py-2 space-y-2">
                                        <p className="text-sm"><Flag className="inline h-3.5 w-3.5 mr-1.5 text-indigo-500" /><b>{p.gate.name}</b> <span className="text-muted-foreground">— {p.gate.text}</span></p>
                                        {rows && (here || p.phase === status.settings.phase - 1) && (
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
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-bold">The full rulebook</h2>
                <Fold title="The ten rules"><Numbered items={TEN_RULES} /></Fold>
                <Fold title="The five checks before a buy">
                    <div className="space-y-4">
                        {FIVE_CHECKS.map(c => (
                            <div key={c.title}>
                                <p className="font-semibold">{c.title}</p>
                                <ul className="mt-1 space-y-1">{c.items.map(i => <li key={i} className="flex gap-2 text-muted-foreground"><Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />{i}</li>)}</ul>
                                {c.why && <p className="text-xs text-muted-foreground mt-1">Why: {c.why}</p>}
                            </div>
                        ))}
                    </div>
                </Fold>
                <Fold title="Buying and managing a trade">
                    <div className="space-y-4">
                        <Numbered items={ENTRY_RULES} />
                        <Numbered items={MANAGEMENT_RULES} />
                    </div>
                </Fold>
                <Fold title="Loss limits">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full min-w-[480px]">
                            <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b"><th className="py-2 pr-4">Limit</th><th className="py-2 pr-4">Size</th><th className="py-2">When it&apos;s hit</th></tr></thead>
                            <tbody>
                                {LOSS_LIMITS.map(l => (
                                    <tr key={l.limit + l.size} className="border-b border-border/50 last:border-0"><td className="py-2 pr-4 font-medium whitespace-nowrap">{l.limit}</td><td className="py-2 pr-4 font-mono whitespace-nowrap">{l.size}</td><td className="py-2 text-muted-foreground">{l.consequence}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Fold>
                <Fold title="Consequence ladder (for trades you place yourself)">
                    <div className="space-y-3">
                        {LADDER.map(step => (
                            <div key={step.level} className="rounded-xl border p-3">
                                <div className="flex items-center gap-2"><LevelBadge level={step.level} /><span className="font-semibold">{step.title}</span></div>
                                <p className="mt-1">{step.consequence}</p>
                                <p className="text-xs text-muted-foreground mt-1">{step.breaches.map(b => b.label).join(" · ")}</p>
                            </div>
                        ))}
                    </div>
                </Fold>
                <Fold title="Never">
                    <ul className="space-y-2">{NEVER.map(n => <li key={n} className="flex gap-2"><Ban className="h-4 w-4 mt-0.5 text-red-500 shrink-0" />{n}</li>)}</ul>
                </Fold>
                <Fold title="Kill criteria: when to stop trading for good">
                    <ul className="space-y-2">
                        {kill.map((k, i) => (
                            <li key={i} className={cn("rounded-xl border p-3 flex gap-3", k.state === "triggered" && "border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20")}>
                                {k.state === "triggered" ? <Skull className="h-5 w-5 text-red-600 shrink-0" /> : <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>}
                                <div>
                                    <p className="font-medium">{k.text}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{k.state === "triggered" ? "Triggered — " : ""}{k.detail}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </Fold>
                <p className="text-center italic text-muted-foreground pt-2">&ldquo;{PLEDGE(Math.round(status.oneR).toLocaleString("en-IN"))}&rdquo;</p>
            </section>
        </div>
    )
}
