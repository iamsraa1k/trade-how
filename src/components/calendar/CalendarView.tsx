"use client"

import React, { useState } from "react"
import type { Trade, Rule } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Star, Trash2, Edit } from "lucide-react"
import { deleteTradeAction } from "@/app/actions"
import Link from "next/link"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { motion } from "framer-motion"

const formatCompactNumber = (num: number) => {
    if (num === 0) return '0';
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '+';
    if (abs >= 100000) return sign + (abs / 100000).toFixed(1) + 'L';
    if (abs >= 1000) return sign + (abs / 1000).toFixed(1) + 'k';
    return sign + abs.toFixed(0);
}

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

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this trade?")) {
            await deleteTradeAction(id);
            toast.success("Trade deleted successfully");
            // If it was the last trade for the day, close modal
            if (selectedTrades.length <= 1) {
                setIsDayModalOpen(false);
            }
        }
    }

    return (
        <div className="w-full">
            <Card className="border-zinc-200 dark:border-zinc-800 shadow-md flex flex-col">
                <CardHeader className="flex flex-col sm:flex-row items-center justify-between pb-4 pt-5 gap-4 border-b border-zinc-100 dark:border-zinc-800/50">
                    <CardTitle className="text-xl sm:text-2xl font-bold">Month View</CardTitle>
                    <div className="flex items-center gap-2 sm:gap-4 bg-muted/40 p-1.5 rounded-lg border shadow-sm">
                        <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8 hover:bg-background">
                            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                        </Button>
                        <span className="min-w-[100px] sm:min-w-[120px] text-center font-bold text-sm sm:text-lg tracking-tight">
                            {format(currentMonth, 'MMMM yyyy')}
                        </span>
                        <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8 hover:bg-background">
                            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 p-2 sm:p-4 overflow-hidden bg-muted/5">
                    <div className="grid grid-cols-7 gap-1 sm:gap-2 content-start">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                            <div key={d} className="text-center text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{d}</div>
                        ))}

                        {Array.from({ length: startDay }).map((_, i) => (
                            <div key={`empty-${i}`} className="min-h-[60px] sm:min-h-[100px] bg-muted/5 rounded-xl border border-transparent" />
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
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.2, delay: i * 0.01 }}
                                    onClick={() => handleDayClick(day)}
                                    className={`
                                min-h-[60px] sm:min-h-[100px] flex flex-col p-1 sm:p-3 border rounded-xl relative transition-all cursor-pointer group hover:shadow-xl hover:-translate-y-0.5
                                ${pnl !== null 
                                    ? (isPositive 
                                        ? 'bg-gradient-to-br from-emerald-500/10 to-emerald-500/20 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2)] dark:shadow-[inset_0_0_0_1px_rgba(16,185,129,0.1)] border-transparent' 
                                        : 'bg-gradient-to-br from-red-500/10 to-red-500/20 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.2)] dark:shadow-[inset_0_0_0_1px_rgba(239,68,68,0.1)] border-transparent') 
                                    : 'bg-card hover:bg-accent border-border/50 shadow-sm'}
                            `}
                                >
                                    <div className="flex justify-between items-start">
                                        <span className={`text-[10px] sm:text-sm font-bold pl-0.5 ${pnl !== null ? (isPositive ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300') : 'text-muted-foreground group-hover:text-foreground'}`}>
                                            {format(day, 'd')}
                                        </span>
                                        {allFlawless && (
                                            <Star className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-500 fill-yellow-500 drop-shadow-sm" />
                                        )}
                                    </div>
                                    
                                    {pnl !== null && (
                                        <div className="flex flex-col items-center justify-center flex-1 w-full mt-1 sm:mt-2">
                                            {/* Mobile view - Simple pill dot with minimal space to prevent collision */}
                                            <div className="sm:hidden flex flex-col items-center gap-0.5 w-full">
                                                <div className={`w-full max-w-[20px] h-1 rounded-full ${isPositive ? "bg-emerald-500" : "bg-red-500"}`}></div>
                                                <span className={`text-[8px] font-extrabold tracking-tight leading-none w-full text-center ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                                  {formatCompactNumber(pnl)}
                                                </span>
                                            </div>
                                            
                                            {/* Desktop view - Full formatted currency */}
                                            <div className="hidden sm:flex flex-col items-center w-full">
                                                <span className={`text-xs md:text-sm lg:text-base font-extrabold tracking-tight truncate w-full text-center drop-shadow-sm ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                                    {isPositive ? '+' : ''}{pnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                                </span>
                                                <div className="text-[10px] mt-1 font-medium text-muted-foreground opacity-80">{tradesForThatDay.length} Trade{tradesForThatDay.length > 1 ? 's' : ''}</div>
                                            </div>
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

                    {/* Explicit Total PnL for the Day */}
                    <div className="py-4 border-b">
                        <div className="flex justify-between items-center px-4 py-3 bg-muted/30 rounded-lg border shadow-inner">
                            <span className="font-semibold text-lg">Total Daily Returns</span>
                            <span className={`font-bold text-2xl ${selectedDayTotalPnl > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {selectedDayTotalPnl > 0 ? '+' : ''}{selectedDayTotalPnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-4 mt-4">
                        {selectedTrades.map((trade, idx) => (
                            <div key={trade.id} className="group p-4 border rounded-xl bg-card hover:bg-muted/30 hover:border-primary/30 transition-all shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <span className="font-bold text-lg flex items-center gap-2">
                                            {trade.symbol} 
                                            {trade.isBasket && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full dark:bg-purple-900/30 dark:text-purple-400">BASKET</span>}
                                        </span>
                                        <div className="text-xs text-muted-foreground flex gap-3 mt-1">
                                            <span>Type: <span className="uppercase font-semibold text-foreground">{trade.isBasket ? "-" : trade.type}</span></span>
                                            {!trade.isBasket && <span>Qty: <span className="font-semibold text-foreground">{trade.quantity}</span></span>}
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col items-end gap-1.5 h-[50px]">
                                        <span className={`font-bold text-xl tracking-tight drop-shadow-sm ${trade.pnl > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {trade.pnl > 0 ? '+' : ''}{trade.pnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                        </span>
                                        <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Link href={`/edit/${trade.id}`}>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50">
                                                    <Edit className="h-3 w-3" />
                                                </Button>
                                            </Link>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50" onClick={(e) => handleDelete(e, trade.id)}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                {trade.analysis && (
                                     <p className="text-sm mt-3 text-muted-foreground line-clamp-2 bg-muted/20 p-2 rounded-md border-l-2 border-l-primary/50">
                                        &quot;{trade.analysis}&quot;
                                     </p>
                                )}
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
