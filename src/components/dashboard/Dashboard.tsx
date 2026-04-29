"use client"

import React, { useState, useMemo } from "react"
import type { Trade, Rule } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import { motion } from "framer-motion"
import { startOfMonth, endOfMonth, format } from "date-fns"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { CalendarView } from "@/components/calendar/CalendarView"

export function Dashboard({ trades, rules }: { trades: Trade[], rules: Rule[] }) {
    const currentMonth = new Date()
    const [customStartDate, setCustomStartDate] = useState<string>("")
    const [customEndDate, setCustomEndDate] = useState<string>("")

    const filteredTrades = useMemo(() => {
        const start = startOfMonth(currentMonth)
        const end = endOfMonth(currentMonth)
        return trades.filter(t => {
            const tradeDate = new Date(t.date)
            return tradeDate >= start && tradeDate <= end
        })
    }, [trades, currentMonth])

    const customRangePnl = useMemo(() => {
        if (!customStartDate || !customEndDate) return null;
        if (customStartDate > customEndDate) return null;

        const relevantTrades = trades.filter(t => {
            return t.date >= customStartDate && t.date <= customEndDate;
        });

        return relevantTrades.reduce((acc, t) => acc + t.pnl, 0);
    }, [trades, customStartDate, customEndDate])

    const metrics = useMemo(() => {
        const totalTrades = filteredTrades.length
        const winningTrades = filteredTrades.filter((t) => t.pnl > 0).length
        const losingTrades = filteredTrades.filter((t) => t.pnl <= 0).length
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0

        const rulesMap = new Map<string, { freq: number, pnl: number }>()
        filteredTrades.forEach(t => {
            if (t.rules && Array.isArray(t.rules)) {
                t.rules.forEach(r => {
                    const current = rulesMap.get(r) || { freq: 0, pnl: 0 }
                    rulesMap.set(r, { freq: current.freq + 1, pnl: current.pnl + t.pnl })
                })
            }
        })

        const rulesData = Array.from(rulesMap.entries())
            .map(([name, data], index) => ({
                name: name.length > 15 ? name.substring(0, 15) + '...' : name,
                fullName: name,
                value: data.freq,
                pnl: data.pnl,
                color: [`#10b981`, `#3b82f6`, `#8b5cf6`, `#f59e0b`, `#ec4899`, `#14b8a6`][index % 6]
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10)

        return {
            winningTrades,
            losingTrades,
            winRate,
            rulesData: rulesData.length > 0 ? rulesData : [{ name: "No Data", fullName: "No Data", value: 1, pnl: 0, color: "#e5e7eb" }]
        }
    }, [filteredTrades])

    const winLossData = [
        { name: "Wins", value: metrics.winningTrades, color: "#10b981" },
        { name: "Losses", value: metrics.losingTrades, color: "#ef4444" },
    ]

    const totalMonthlyPnl = useMemo(() => {
        return filteredTrades.reduce((acc, t) => acc + t.pnl, 0);
    }, [filteredTrades]);

    return (
        <div className="space-y-5 flex flex-col pt-2">
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 flex flex-col sm:flex-row justify-between items-center bg-card p-4 sm:p-5 rounded-xl shadow-sm border gap-4">
                    <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 w-full sm:w-auto text-center sm:text-left">
                        <span className="text-sm font-medium text-muted-foreground sm:mr-2">This Month&#39;s Realized P/L:</span>
                        <span className={`text-3xl sm:text-4xl font-bold tracking-tight drop-shadow-sm ${totalMonthlyPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {totalMonthlyPnl >= 0 ? '+' : ''}{totalMonthlyPnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                        </span>
                    </div>
                </div>
            </div>

            <div className="w-full pb-2">
                <CalendarView trades={trades} rules={rules} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {/* Win Rate Chart */}
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                    <Card className="h-full shadow-md border hover:shadow-lg transition-shadow">
                        <CardHeader className="pb-2 pt-5">
                            <CardTitle className="text-lg sm:text-xl text-center sm:text-left">Win Rate ({format(currentMonth, "MMM yyyy")})</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-center p-4">
                            <div className="h-[250px] w-full min-h-[250px] relative flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={winLossData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                                            <Cell key="win" fill="#10b981" />
                                            <Cell key="loss" fill="#ef4444" />
                                        </Pie>
                                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-xl font-bold fill-foreground">
                                            {metrics.winRate.toFixed(1)}%
                                        </text>
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="w-full pt-4 border-t border-zinc-100 dark:border-zinc-800/50 mt-4 flex justify-center gap-6">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm"></div>
                                    <span className="text-sm font-medium">Wins: {metrics.winningTrades}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm"></div>
                                    <span className="text-sm font-medium">Losses: {metrics.losingTrades}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Rules Chart */}
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                    <Card className="h-full shadow-md border hover:shadow-lg transition-shadow">
                        <CardHeader className="pb-2 pt-5">
                            <CardTitle className="text-lg sm:text-xl text-center sm:text-left">Discipline Breakdown</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-center p-4">
                            <div className="h-[250px] w-full min-h-[250px] relative flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={metrics.rulesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                                        <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} angle={-45} textAnchor="end" height={60} />
                                        <YAxis tick={{fontSize: 10}} />
                                        <Tooltip 
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
                                            formatter={(value: any, name: any) => {
                                                if (name === "pnl") return [new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value as number), "PnL"];
                                                return [value, "Frequency"];
                                            }}
                                            labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                                        />
                                        <Bar dataKey="pnl" name="pnl" radius={[4, 4, 0, 0]}>
                                            {metrics.rulesData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="w-full pt-4 border-t border-zinc-100 dark:border-zinc-800/50 mt-4">
                                <div className="flex flex-wrap gap-2 justify-center max-h-[100px] overflow-y-auto custom-scrollbar">
                                    {metrics.rulesData.map((entry, index) => (
                                        <div key={index} className="flex items-center gap-2 bg-muted/50 px-2 py-1 rounded-full border">
                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }}></div>
                                            <span className="text-xs font-medium max-w-[150px] truncate" title={entry.name}>{entry.name}</span>
                                            <span className="text-xs font-bold opacity-75">{entry.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center bg-card p-4 sm:p-5 rounded-xl shadow-sm border mt-2">
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-start">
                        <Label htmlFor="custom-start" className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                        <Input type="date" id="custom-start" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="h-8 text-sm w-[140px]" />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-start">
                        <Label htmlFor="custom-end" className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
                        <Input type="date" id="custom-end" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="h-8 text-sm w-[140px]" />
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-3 w-full sm:w-auto mt-4 sm:mt-0 text-center sm:text-right">
                    <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Custom Range P/L:</span>
                    <span className={`text-2xl font-bold ${customRangePnl === null ? 'text-muted-foreground' : customRangePnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {customRangePnl !== null ? (
                            <>{customRangePnl >= 0 ? '+' : ''}{customRangePnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</>
                        ) : (
                            "---"
                        )}
                    </span>
                </div>
            </div>
        </div>
    )
}
