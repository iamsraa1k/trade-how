"use client"

import React, { useState, useMemo } from "react"
import type { Trade, Rule } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card"
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns"
import { Button } from "@/shared/components/ui/button"
import { ChevronLeft, ChevronRight, Star, Trash2, Edit, ThumbsDown, FileText } from "lucide-react"
import { deleteTradeAction } from "@/app/actions"
import Link from "next/link"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/shared/components/ui/dialog"
import { motion } from "framer-motion"
import { useTradeFilter } from "@/features/trades/context/TradeFilterContext"

const formatCompactNumber = (num: number) => {
    if (num === 0) return '0';
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '+';
    if (abs >= 100000) return sign + (abs / 100000).toFixed(1) + 'L';
    if (abs >= 1000) return sign + (abs / 1000).toFixed(1) + 'k';
    return sign + abs.toFixed(0);
}

export function CalendarView({ trades: rawTrades, rules, currentMonth, onMonthChange }: { trades: Trade[], rules: Rule[], currentMonth: Date, onMonthChange: (date: Date) => void }) {
    const { filterTrades } = useTradeFilter()
    const trades = filterTrades(rawTrades)

    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [isDayModalOpen, setIsDayModalOpen] = useState(false)
    const [mobileActiveTradeId, setMobileActiveTradeId] = useState<string | null>(null)
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

    const nextMonth = () => onMonthChange(addMonths(currentMonth, 1))
    const prevMonth = () => onMonthChange(subMonths(currentMonth, 1))

    const daysInMonth = eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end: endOfMonth(currentMonth),
    })
    const startDay = getDay(startOfMonth(currentMonth))

    const tradesByDate = useMemo(() => {
        const map: Record<string, Trade[]> = {}
        trades.forEach(t => {
            if (!map[t.date]) map[t.date] = []
            map[t.date].push(t)
        })
        return map
    }, [trades])

    const getPnlForDay = (date: Date) => {
        const dateStr = format(date, "yyyy-MM-dd")
        const tradesForDay = tradesByDate[dateStr] || []
        if (tradesForDay.length === 0) return null
        return tradesForDay.reduce((acc, t) => acc + t.pnl, 0)
    }

    const handleDayClick = (date: Date) => {
        const dateStr = format(date, "yyyy-MM-dd")
        const tradesForDay = tradesByDate[dateStr] || []
        if (tradesForDay.length > 0) {
            setSelectedDate(date)
            setMobileActiveTradeId(null)
            setDeleteConfirmId(null)
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

    const handleConfirmDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDeleteConfirmId(null);
        await deleteTradeAction(id);
        toast.success("Trade securely deleted");
        // If it was the last trade for the day, close modal
        if (selectedTrades.length <= 1) {
            setIsDayModalOpen(false);
        }
    }

    return (
        <div className="w-full">
            <Card className="glass-card flex flex-col overflow-hidden">
                <CardHeader className="flex flex-col sm:flex-row items-center justify-between pb-4 pt-5 gap-4 border-b border-white/10 dark:border-white/5 bg-muted/20">
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
                <CardContent className="flex-1 p-2 sm:p-4 overflow-hidden bg-gradient-to-b from-transparent to-muted/10">
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

                            const tradesForThatDay = tradesByDate[format(day, "yyyy-MM-dd")] || []
                            const allFlawless = tradesForThatDay.length > 0 && tradesForThatDay.every(t =>
                                t.tradeQuality === 'flawless' || (rules.length > 0 && rules.every(r => (t.rules || []).includes(r.text)))
                            )
                            const anyViolation = tradesForThatDay.some(t => t.tradeQuality === 'violation')
                            const hasPaperTrades = tradesForThatDay.some(t => t.isPaper === true)
                            const allPaper = tradesForThatDay.length > 0 && tradesForThatDay.every(t => t.isPaper === true)
                            const allRegular = tradesForThatDay.length > 0 && tradesForThatDay.every(t => !t.isPaper)
                            const isMixed = tradesForThatDay.length > 0 && !allPaper && !allRegular

                            const tradeCount = tradesForThatDay.reduce((count, t) => count + (t.isBasket && t.legs ? t.legs.length : 1), 0)

                            // Determine cell background classes
                            let cellBgClass: string
                            if (pnl !== null) {
                                if (allPaper) {
                                    if (isPositive) {
                                        cellBgClass = 'bg-teal-50/70 border-teal-200 dark:bg-teal-950/30 dark:border-teal-900/50 shadow-sm hover:border-teal-300 dark:hover:border-teal-800'
                                    } else {
                                        cellBgClass = 'bg-rose-50/70 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50 shadow-sm hover:border-rose-300 dark:hover:border-rose-800'
                                    }
                                } else if (isPositive) {
                                    cellBgClass = 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50 shadow-sm hover:border-emerald-300 dark:hover:border-emerald-800'
                                } else {
                                    cellBgClass = 'bg-red-50/70 border-red-200 dark:bg-red-950/30 dark:border-red-900/50 shadow-sm hover:border-red-300 dark:hover:border-red-800'
                                }
                            } else {
                                cellBgClass = 'bg-white dark:bg-[#121214] border-zinc-200 dark:border-zinc-800/80 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md'
                            }

                            return (
                                <motion.div
                                    key={day.toString()}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.2, delay: i * 0.01 }}
                                    onClick={() => handleDayClick(day)}
                                    className={`
                                        min-h-[50px] sm:min-h-[100px] flex flex-col p-1 sm:p-2.5 border rounded-lg sm:rounded-xl relative transition-all cursor-pointer group hover:shadow-xl hover:-translate-y-0.5
                                ${cellBgClass}
                            `}
                                >
                                    <div className="flex justify-between items-start w-full">
                                        <span className={`text-[10px] sm:text-sm font-bold pl-0.5 leading-none ${pnl !== null ? (allPaper ? (isPositive ? 'text-teal-700 dark:text-teal-300' : 'text-rose-700 dark:text-rose-300') : isPositive ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300') : 'text-zinc-600 dark:text-zinc-400 group-hover:text-foreground'}`}>
                                            {format(day, 'd')}
                                        </span>
                                        {/* Quality and paper trade icons */}
                                        {tradesForThatDay.length > 0 && (
                                            <div className="flex flex-wrap justify-end items-center gap-0.5 sm:gap-1 max-w-[60%]">
                                                {allFlawless && (
                                                    <Star className="h-[10px] w-[10px] sm:h-4 sm:w-4 text-yellow-500 fill-yellow-500 drop-shadow-sm" />
                                                )}
                                                {anyViolation && (
                                                    <ThumbsDown className="h-[10px] w-[10px] sm:h-4 sm:w-4 text-red-500 drop-shadow-sm" />
                                                )}
                                                {hasPaperTrades && (
                                                    <FileText className="h-[10px] w-[10px] sm:h-4 sm:w-4 text-teal-500 drop-shadow-sm" />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {pnl !== null && (
                                        <div className="flex flex-col items-center justify-center flex-1 w-full mt-1 sm:mt-2">
                                            {/* Mobile view - Simple pill dot with minimal space to prevent collision */}
                                            <div className="sm:hidden flex flex-col items-center gap-0.5 w-full">
                                                <div className={`w-full max-w-[20px] h-1 rounded-full ${allPaper ? (isPositive ? 'bg-teal-500' : 'bg-rose-500') : isPositive ? "bg-emerald-500" : "bg-red-500"}`}></div>
                                                <span className={`text-[8px] font-extrabold tracking-tight leading-none w-full text-center ${allPaper ? (isPositive ? 'text-teal-600 dark:text-teal-400' : 'text-rose-600 dark:text-rose-400') : isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                                  {formatCompactNumber(pnl)}
                                                </span>
                                            </div>
                                            
                                            {/* Desktop view - Full formatted currency */}
                                            <div className="hidden sm:flex flex-col items-center w-full">
                                                <span className={`text-xs md:text-sm lg:text-base font-extrabold tracking-tight truncate w-full text-center drop-shadow-sm ${allPaper ? (isPositive ? 'text-teal-600 dark:text-teal-400' : 'text-rose-600 dark:text-rose-400') : isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                                    {isPositive ? '+' : ''}{pnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                                </span>
                                                <div className="flex items-center gap-1 text-[10px] mt-1 font-medium text-muted-foreground opacity-80">
                                                    {tradeCount} Trade{tradeCount > 1 ? 's' : ''}
                                                    {isMixed && <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500" title="Contains paper trades" />}
                                                </div>
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
                            <span className="font-semibold text-sm sm:text-lg">Total Daily Returns</span>
                            <span className={`font-bold text-lg sm:text-2xl ${selectedDayTotalPnl > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {selectedDayTotalPnl > 0 ? '+' : ''}{selectedDayTotalPnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-1 custom-scrollbar">
                        {selectedTrades.map((trade, idx) => (
                            <div key={trade.id} onClick={(e) => { e.stopPropagation(); setMobileActiveTradeId(mobileActiveTradeId === trade.id ? null : trade.id) }} className={`group p-4 border rounded-xl bg-card hover:bg-muted/30 hover:border-primary/30 transition-all shadow-sm cursor-pointer sm:cursor-default ${trade.isPaper ? 'border-l-4 border-l-teal-400 dark:border-l-teal-600' : ''}`}>
                                <div className="flex justify-between items-start mb-2 pointer-events-none sm:pointer-events-auto">
                                    <div>
                                        <span className="font-bold text-sm sm:text-lg flex items-center gap-2">
                                            {trade.symbol}
                                            {trade.isPaper && <span className="text-[10px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full dark:bg-teal-900/30 dark:text-teal-400 font-semibold">PAPER</span>}
                                            {trade.isBasket && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full dark:bg-purple-900/30 dark:text-purple-400">BASKET ORDER • {trade.legs?.length || 0} LEGS</span>}
                                            {trade.tradeQuality === 'flawless' && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />}
                                            {trade.tradeQuality === 'violation' && <ThumbsDown className="h-3.5 w-3.5 text-red-500" />}
                                        </span>
                                        <div className="text-xs text-muted-foreground flex gap-3 mt-1">
                                            {!trade.isBasket && (
                                                <>
                                                    <span>Type: <span className="uppercase font-semibold text-foreground">{trade.type}</span></span>
                                                    <span>Qty: <span className="font-semibold text-foreground">{trade.quantity}</span></span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col items-end gap-1.5 h-[50px] pointer-events-auto">
                                        <span className={`font-bold text-sm sm:text-xl tracking-tight drop-shadow-sm ${trade.pnl > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {trade.pnl > 0 ? '+' : ''}{trade.pnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                        </span>
                                        {deleteConfirmId === trade.id ? (
                                            <div className="flex gap-1 pointer-events-auto items-center mt-1">
                                                <span className="text-[10px] text-red-500 font-bold mr-1 uppercase">Delete?</span>
                                                <Button variant="destructive" size="sm" className="h-6 text-[10px] px-2 shadow-sm" onClick={(e) => handleConfirmDelete(e, trade.id)}>Yes</Button>
                                                <Button variant="secondary" size="sm" className="h-6 text-[10px] px-2 shadow-sm" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null) }}>No</Button>
                                            </div>
                                        ) : (
                                            <div className={`flex space-x-1 transition-opacity ${mobileActiveTradeId === trade.id ? 'opacity-100' : 'opacity-0 sm:group-hover:opacity-100'}`}>
                                                <Link href={`/edit/${trade.id}`} onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 pointer-events-auto">
                                                        <Edit className="h-3 w-3" />
                                                    </Button>
                                                </Link>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 pointer-events-auto" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(trade.id) }}>
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
