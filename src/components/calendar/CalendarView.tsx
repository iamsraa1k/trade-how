"use client"

import React, { useState } from "react"
import type { Trade, Rule } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Star } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { motion } from "framer-motion"

export function CalendarView({ trades, rules }: { trades: Trade[], rules: Rule[] }) {
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [isDayModalOpen, setIsDayModalOpen] = useState(false)

    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))

    const daysInMonth = eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end: endOfMonth(currentMonth),
    })
    const startDay = getDay(startOfMonth(currentMonth))

    const getPnlForDay = (date: Date) => {
        const dateStr = format(date, "yyyy-MM-dd")
        const tradesForDay = trades.filter(t => t.date === dateStr)
        if (tradesForDay.length === 0) return null
        return tradesForDay.reduce((acc, t) => acc + t.pnl, 0)
    }

    const handleDayClick = (date: Date) => {
        const dateStr = format(date, "yyyy-MM-dd")
        const hasTrades = trades.some(t => t.date === dateStr)
        if (hasTrades) {
            setSelectedDate(date)
            setIsDayModalOpen(true)
        }
    }

    // Modal data
    let selectedTrades: Trade[] = [];
    let selectedDayTotalPnl = 0;
    if (selectedDate) {
        selectedTrades = trades.filter(t => t.date === format(selectedDate, "yyyy-MM-dd"));
        selectedDayTotalPnl = selectedTrades.reduce((acc, t) => acc + t.pnl, 0);
    }

    return (
        <div className="space-y-6">
            <Card className="h-full border-zinc-200 dark:border-zinc-800 shadow-lg flex flex-col">
                <CardHeader className="flex flex-col sm:flex-row items-center justify-between pb-6 gap-4 border-b border-zinc-100 dark:border-zinc-800/50">
                    <CardTitle className="text-xl sm:text-2xl font-bold">Month View</CardTitle>
                    <div className="flex items-center gap-2 sm:gap-4 bg-muted/30 p-1 rounded-lg">
                        <Button variant="ghost" size="icon" onClick={prevMonth}>
                            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                        </Button>
                        <span className="min-w-[100px] sm:min-w-[120px] text-center font-semibold text-sm sm:text-lg">
                            {format(currentMonth, 'MMMM yyyy')}
                        </span>
                        <Button variant="ghost" size="icon" onClick={nextMonth}>
                            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 p-2 sm:p-6 overflow-hidden">
                    <div className="grid grid-cols-7 gap-1 h-full content-start min-h-[500px]">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                            <div key={d} className="text-center text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{d}</div>
                        ))}

                        {Array.from({ length: startDay }).map((_, i) => (
                            <div key={`empty-${i}`} className="min-h-[80px]" />
                        ))}

                        {daysInMonth.map((day, i) => {
                            const pnl = getPnlForDay(day)
                            const isPositive = pnl !== null && pnl > 0

                            const tradesForThatDay = trades.filter(t => t.date === format(day, "yyyy-MM-dd"))
                            const allFlawless = tradesForThatDay.length > 0 && rules.length > 0 && tradesForThatDay.every(t =>
                                rules.every(r => (t.rules || []).includes(r.text))
                            )

                            return (
                                <motion.div
                                    key={day.toString()}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.2 }}
                                    onClick={() => handleDayClick(day)}
                                    className={`
                                aspect-square sm:aspect-auto sm:min-h-[80px] flex flex-col p-0.5 sm:p-1.5 border rounded-md sm:rounded-lg relative transition-all cursor-pointer group hover:shadow-md
                                ${pnl !== null ? (isPositive ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30') : 'hover:bg-accent border-muted'}
                            `}
                                >
                                    <div className="flex justify-between items-start">
                                        <span className="text-[10px] sm:text-xs font-medium text-muted-foreground group-hover:text-foreground pl-1">{format(day, 'd')}</span>
                                        {allFlawless && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                                    </div>
                                    {pnl !== null && (
                                        <div className="flex flex-col items-center justify-center flex-1 w-full overflow-hidden mt-1">
                                            <span className={`hidden sm:block text-xs md:text-sm font-bold tracking-tight truncate w-full text-center ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                                {isPositive ? '+' : ''}{pnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                            </span>
                                            <div className="text-[9px] text-muted-foreground hidden sm:block">{tradesForThatDay.length} trade(s)</div>
                                            <div className={`sm:hidden w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isPositive ? "bg-emerald-500" : "bg-red-500"}`}></div>
                                        </div>
                                    )}
                                </motion.div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isDayModalOpen} onOpenChange={setIsDayModalOpen}>
                <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Trades on {selectedDate && format(selectedDate, "MMMM d, yyyy")}</DialogTitle>
                        <DialogDescription>Review individual trades taken on this day.</DialogDescription>
                    </DialogHeader>

                    {/* NEW: Explicit Total PnL for the Day */}
                    <div className="py-4 border-b">
                        <div className="flex justify-between items-center px-4 py-3 bg-muted/30 rounded-lg border">
                            <span className="font-semibold text-lg">Total Daily Returns</span>
                            <span className={`font-bold text-2xl ${selectedDayTotalPnl > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {selectedDayTotalPnl > 0 ? '+' : ''}{selectedDayTotalPnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-4 mt-2">
                        {selectedTrades.map((trade, idx) => (
                            <div key={trade.id} className="p-3 border rounded-lg bg-card">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold">{trade.symbol}</span>
                                    <span className={`font-medium ${trade.pnl > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {trade.pnl > 0 ? '+' : ''}{trade.pnl}
                                    </span>
                                </div>
                                <div className="text-xs text-muted-foreground flex gap-3">
                                    <span>Type: <span className="uppercase font-semibold">{trade.type}</span></span>
                                    <span>Qty: {trade.quantity}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
