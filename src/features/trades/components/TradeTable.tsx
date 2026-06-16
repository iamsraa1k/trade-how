"use client"

import React, { useState, useMemo, useEffect, useRef } from "react"
import type { Trade, Rule, MonthlyAnalysis } from "@/lib/db"
import { Card, CardContent } from "@/shared/components/ui/card"
import { Button } from "@/shared/components/ui/button"
import { Download, Trash2, Search, Target, FileSpreadsheet, Calendar as CalendarIcon, ThumbsDown, FileText, Star } from "lucide-react"
import { format, parseISO } from "date-fns"
import { Input } from "@/shared/components/ui/input"
import { Label } from "@/shared/components/ui/label"
import { deleteTradeAction } from "@/app/actions"
import { toast } from "sonner"
import { useTradeFilter } from "@/features/trades/context/TradeFilterContext"

export function TradeTable({ trades, rules, monthlyAnalyses = [] }: { trades: Trade[], rules: Rule[], monthlyAnalyses?: MonthlyAnalysis[] }) {
    const { filterTrades } = useTradeFilter()
    const [searchTerm, setSearchTerm] = useState("")
    const [startDate, setStartDate] = useState<string>("")
    const [endDate, setEndDate] = useState<string>("")

    // Apply global trade filter before local search/date filters
    const globallyFilteredTrades = useMemo(() => filterTrades(trades), [trades, filterTrades])
    
    // Lazy loading state
    const [visibleDays, setVisibleDays] = useState(10)
    const observerTarget = useRef<HTMLDivElement>(null)

    const filteredTrades = useMemo(() => {
        return globallyFilteredTrades.filter(t => {
            const matchesSearch = t.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
                t.analysis?.toLowerCase().includes(searchTerm.toLowerCase());
            
            let matchesDate = true;
            if (startDate) matchesDate = matchesDate && t.date >= startDate;
            if (endDate) matchesDate = matchesDate && t.date <= endDate;

            return matchesSearch && matchesDate;
        });
    }, [globallyFilteredTrades, searchTerm, startDate, endDate]);

    // Group by Date
    const groupedByDate = useMemo(() => {
        const groups: Record<string, Trade[]> = {};
        filteredTrades.forEach(t => {
            if (!groups[t.date]) groups[t.date] = [];
            groups[t.date].push(t);
        });
        
        // Sort dates descending
        return Object.entries(groups).sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
    }, [filteredTrades]);

    const visibleGroups = useMemo(() => {
        return groupedByDate.slice(0, visibleDays);
    }, [groupedByDate, visibleDays]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting) {
                    setVisibleDays(prev => Math.min(prev + 10, groupedByDate.length));
                }
            },
            { threshold: 0.1 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => observer.disconnect();
    }, [groupedByDate.length]);

    const handleExportCSV = () => {
        if (filteredTrades.length === 0) {
            toast.error("No trades to export.");
            return;
        }

        let csvContent = "Date,MainSymbol,Type,LegNo,LegSymbol,LegType,Entry,Exit,Quantity,Fees,TotalPnL,Analysis,MonthlyAnalysis,TradeMode,TradeQuality\n";
        
        // Group filtered trades by month for MonthlyAnalysis column
        filteredTrades.forEach(t => {
            const safeAnalysis = `"${(t.analysis || "").replace(/"/g, '""')}"`;
            const monthYear = format(new Date(t.date), "yyyy-MM");
            const monthlyReview = monthlyAnalyses.find(ma => ma.monthYear === monthYear);
            const safeMonthlyAnalysis = monthlyReview ? `"${monthlyReview.analysis.replace(/"/g, '""')}"` : `""`;
            const tradeMode = t.isPaper ? "Paper" : "Regular";
            const tradeQuality = t.isPaper ? "N/A" : (t.tradeQuality ? t.tradeQuality.charAt(0).toUpperCase() + t.tradeQuality.slice(1) : "Acceptable");

            if (t.isBasket && t.legs) {
                csvContent += `${t.date},"${t.symbol}",BASKET,-,-,-,-,-,-,${t.fees},${t.pnl},${safeAnalysis},${safeMonthlyAnalysis},${tradeMode},${tradeQuality}\n`;
                t.legs.forEach((l, i) => {
                    csvContent += `${t.date},"${t.symbol}",BASKET,${i+1},"${l.symbol || '-'}",${l.type.toUpperCase()},${l.entryPrice},${l.exitPrice},${l.quantity},${l.fees},-,-,,\n`;
                });
            } else {
                csvContent += `${t.date},"${t.symbol}",${t.type.toUpperCase()},-,-,-,${t.entryPrice},${t.exitPrice},${t.quantity},${t.fees},${t.pnl},${safeAnalysis},${safeMonthlyAnalysis},${tradeMode},${tradeQuality}\n`;
            }
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `trade_journal_${format(new Date(), "yyyy-MM-dd")}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("CSV Exported Successfully!");
    }

    const handleExportPDF = async () => {
        if (filteredTrades.length === 0) {
            toast.error("No trades to export.");
            return;
        }
        try {
            const { jsPDF } = await import("jspdf");

            const doc = new jsPDF();
            const primaryColor = [79, 70, 229] as [number, number, number]; // Indigo 600

            // Title
            doc.setFontSize(22);
            doc.setTextColor(...primaryColor);
            doc.text("Complete Trade Journal", 14, 25);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Generated on: ${format(new Date(), "PPpp")}`, 14, 33);
            doc.text(`Total Trades: ${filteredTrades.length}`, 14, 38);

            let currentY = 50;

            // Group by month to append monthly analysis
            const groupedByMonth: Record<string, Trade[]> = {};
            filteredTrades.forEach(t => {
                const monthYear = format(new Date(t.date), "yyyy-MM");
                if (!groupedByMonth[monthYear]) groupedByMonth[monthYear] = [];
                groupedByMonth[monthYear].push(t);
            });

            const sortedMonths = Object.keys(groupedByMonth).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

            for (const month of sortedMonths) {
                // Print month header
                if (currentY > 260) { doc.addPage(); currentY = 20; }
                doc.setFont("helvetica", "bold");
                doc.setFontSize(14);
                doc.setTextColor(50, 50, 50);
                doc.text(`Month: ${format(parseISO(`${month}-01`), "MMMM yyyy")}`, 14, currentY);
                currentY += 10;
                doc.line(14, currentY - 5, 196, currentY - 5);

                const monthTrades = groupedByMonth[month];

                monthTrades.forEach((trade) => {
                    if (currentY > 270) {
                        doc.addPage();
                        currentY = 20;
                    }

                    const isProfit = trade.pnl >= 0;
                    const modeLabel = trade.isPaper ? "[PAPER] " : "";
                    const qualityLabel = trade.isPaper ? "" : (trade.tradeQuality === "flawless" ? " ⭐ FLAWLESS" : trade.tradeQuality === "violation" ? " ⚠ VIOLATION" : "");
                    
                    doc.setFont("helvetica", "bold");
                    doc.setTextColor(0);
                    doc.setFontSize(10);
                    
                    doc.text(`${modeLabel}${format(new Date(trade.date), "dd MMM")}  |  ${trade.symbol.toUpperCase()}  |  ${trade.isBasket ? "BASKET" : trade.type.toUpperCase()}${qualityLabel}`, 14, currentY);
                    
                    doc.setTextColor(isProfit ? 16 : 239, isProfit ? 185 : 68, isProfit ? 129 : 68);
                    doc.text(`PnL: ${trade.pnl > 0 ? "+" : ""}${trade.pnl.toFixed(2)}`, 160, currentY);
                    
                    currentY += 5;
                    
                    doc.setFont("helvetica", "normal");
                    doc.setTextColor(80);
                    doc.setFontSize(9);
                    
                    if (!trade.isBasket) {
                        doc.text(`Qty: ${trade.quantity} | En: ${trade.entryPrice} | Ex: ${trade.exitPrice} | Fee: ${trade.fees}`, 14, currentY);
                        currentY += 5;
                    } else {
                        if (trade.legs) {
                            trade.legs.forEach((leg: any, i: number) => {
                                if (currentY > 280) { doc.addPage(); currentY = 20; }
                                doc.text(`  > Leg ${i+1} [${leg.symbol || 'N/A'}]: ${leg.type.toUpperCase()} | Qty: ${leg.quantity} | En: ${leg.entryPrice} | Ex: ${leg.exitPrice} | Fee: ${leg.fees}`, 14, currentY);
                                currentY += 5;
                            });
                        }
                    }

                    if (trade.analysis) {
                        const lines = doc.splitTextToSize(`Note: ${trade.analysis}`, 180);
                        if (currentY + (lines.length * 4) > 280) { doc.addPage(); currentY = 20; }
                        doc.text(lines, 14, currentY);
                        currentY += (lines.length * 4);
                    }
                    
                    const followed = trade.rules?.join(", ") || "None";
                    const missed = rules.filter(r => !(trade.rules || []).includes(r.text)).map(r => r.text).join(", ") || "None";
                    
                    doc.text(`Rules Followed: ${followed}`, 14, currentY);
                    currentY += 5;
                    doc.text(`Missed: ${missed}`, 14, currentY);
                    currentY += 7; 
                    
                    doc.setDrawColor(240);
                    doc.line(14, currentY - 3, 196, currentY - 3);
                });

                // Append Monthly Analysis if exists
                const monthlyReview = monthlyAnalyses.find(ma => ma.monthYear === month);
                if (monthlyReview) {
                    if (currentY > 250) { doc.addPage(); currentY = 20; }
                    doc.setFont("helvetica", "bold");
                    doc.setTextColor(79, 70, 229);
                    doc.setFontSize(12);
                    doc.text(`${format(parseISO(`${month}-01`), "MMMM")} Analysis Review:`, 14, currentY);
                    currentY += 6;
                    
                    doc.setFont("helvetica", "italic");
                    doc.setTextColor(60);
                    doc.setFontSize(10);
                    
                    const lines = doc.splitTextToSize(monthlyReview.analysis, 180);
                    lines.forEach((line: string) => {
                        if (currentY > 280) { doc.addPage(); currentY = 20; }
                        doc.text(line, 14, currentY);
                        currentY += 5;
                    });
                    currentY += 10;
                } else {
                    currentY += 5;
                }
            }

            doc.save(`trade_journal_detailed_${format(new Date(), "yyyy-MM-dd")}.pdf`);
            toast.success("PDF Exported Successfully!");
        } catch (error) {
            console.error("PDF Generation Error:", error);
            toast.error("Failed to generate PDF");
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 glass p-4 rounded-2xl shadow-sm">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search symbols or analysis..." 
                            className="pl-8 shadow-sm w-full" 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                        <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-md border">
                            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-xs sm:text-sm bg-background border-none w-[120px] sm:w-auto" title="Start Date" />
                            <span className="text-muted-foreground text-xs font-bold px-1">to</span>
                            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-xs sm:text-sm bg-background border-none w-[120px] sm:w-auto" title="End Date" />
                        </div>
                        {(startDate || endDate) && (
                            <Button variant="ghost" size="sm" onClick={() => { setStartDate(""); setEndDate(""); }} className="h-9 text-xs text-muted-foreground hover:text-foreground">
                                Clear
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap gap-2 justify-end pt-2 border-t border-border/50">
                    <Button onClick={handleExportCSV} variant="outline" className="flex-1 sm:flex-none h-9 text-sm">
                        <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
                        CSV Export
                    </Button>
                    <Button onClick={handleExportPDF} className="bg-indigo-600 hover:bg-indigo-700 text-white flex-1 sm:flex-none h-9 text-sm">
                        <Download className="mr-2 h-4 w-4" />
                        Journal PDF
                    </Button>
                </div>
            </div>

            <div className="space-y-10">
                {visibleGroups.map(([date, dayTrades]) => {
                    const dailyPnl = dayTrades.reduce((acc, t) => acc + t.pnl, 0);
                    return (
                        <div key={date} className="space-y-4">
                            <div className="flex items-center justify-between border-b pb-2">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                                    {format(parseISO(date), "EEEE, MMMM d, yyyy")}
                                </h2>
                                <span className={`text-sm sm:text-lg whitespace-nowrap font-bold px-2 sm:px-3 py-1 rounded-full ${dailyPnl >= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                    {dailyPnl >= 0 ? '+' : ''}{dailyPnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {dayTrades.map(trade => (
                                    <Card key={trade.id} className={`glass-card overflow-hidden hover:shadow-xl transition-all duration-300 ${trade.isPaper ? 'border-dashed border-teal-300 dark:border-teal-800' : 'border-border/50'}`}>
                                        <CardContent className="p-0">
                                            <div className={`h-2 w-full ${trade.isPaper ? (trade.pnl > 0 ? 'bg-teal-500' : 'bg-cyan-600') : (trade.pnl > 0 ? 'bg-emerald-500' : 'bg-red-500')}`} />
                                            <div className="p-5 flex flex-col h-full min-h-[300px]">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <h3 className="font-bold text-lg">{trade.symbol}</h3>
                                                        <p className="text-xs text-muted-foreground">{format(new Date(trade.date), "PPP")}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        {trade.isPaper && (
                                                            <div className="px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 flex items-center gap-1">
                                                                <FileText className="h-3 w-3 text-teal-500" />
                                                                PAPER
                                                            </div>
                                                        )}
                                                        {!trade.isPaper && trade.tradeQuality === 'flawless' && (
                                                            <div className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 flex items-center gap-1">
                                                                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                                                ⭐ FLAWLESS
                                                            </div>
                                                        )}
                                                        {!trade.isPaper && trade.tradeQuality === 'violation' && (
                                                            <div className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 flex items-center gap-1">
                                                                <ThumbsDown className="h-3 w-3" />
                                                                VIOLATION
                                                            </div>
                                                        )}
                                                        <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${trade.isBasket ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : trade.type === 'buy' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                                            {trade.isBasket ? "BASKET" : trade.type.toUpperCase()}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex justify-between items-baseline mb-4">
                                                    <div className={`text-2xl font-bold ${trade.pnl > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                                        {trade.pnl > 0 ? '+' : ''}{trade.pnl.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                                    </div>
                                                    {!trade.isBasket && (
                                                        <div className="text-sm text-muted-foreground">
                                                            Qty: {trade.quantity}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-1.5 text-sm mb-4 bg-muted/20 p-2 rounded-md">
                                                    {trade.isBasket ? (
                                                        <div className="flex flex-col gap-1 w-full max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                                                            {trade.legs?.map((leg: any, i: number) => (
                                                                <div key={i} className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs pb-1.5 border-b border-border/50 last:border-0 last:pb-0 mt-1 first:mt-0">
                                                                    <span className="font-semibold text-foreground/80">{leg.symbol || `Leg ${i+1}`} <span className="uppercase text-[9px] text-muted-foreground ml-1">{leg.type}</span></span>
                                                                    <div className="flex gap-2.5 text-[10px] sm:text-xs mt-1 sm:mt-0">
                                                                        <span><span className="text-muted-foreground mr-0.5">En:</span>₹{leg.entryPrice || 0}</span>
                                                                        <span><span className="text-muted-foreground mr-0.5">Ex:</span>₹{leg.exitPrice || 0}</span>
                                                                        <span><span className="text-muted-foreground mr-0.5">Fee:</span>₹{leg.fees || 0}</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="flex justify-between">
                                                                <span className="text-muted-foreground">Entry</span>
                                                                <span className="font-medium">₹{trade.entryPrice}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-muted-foreground">Exit</span>
                                                                <span className="font-medium">₹{trade.exitPrice}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-muted-foreground">Fees</span>
                                                                <span className="font-medium">₹{trade.fees}</span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                {trade.analysis && (
                                                    <div className="text-sm bg-muted/50 p-3 rounded-lg mb-4 max-h-32 overflow-y-auto custom-scrollbar text-muted-foreground text-left">
                                                        {trade.analysis}
                                                    </div>
                                                )}

                                                <div className="flex flex-wrap gap-1 mb-4 mt-auto">
                                                    {trade.rules && trade.rules.map((rule, idx) => (
                                                        <span key={idx} className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                                                            {rule.length > 25 ? rule.substring(0, 25) + '...' : rule}
                                                        </span>
                                                    ))}
                                                </div>

                                                <div className="flex justify-end gap-2 pt-3 border-t">
                                                    <Button variant="ghost" size="sm" className="hover:bg-red-100 hover:text-red-600 transition-colors" onClick={async () => {
                                                        if (confirm("Delete this trade?")) {
                                                            await deleteTradeAction(trade.id);
                                                        }
                                                    }}>
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    );
                })}

                {filteredTrades.length === 0 && (
                    <div className="col-span-full py-16 px-4 bg-muted/20 border-dashed border-2 rounded-2xl text-center text-muted-foreground flex flex-col items-center">
                        <Target className="h-12 w-12 mb-4 opacity-30 text-indigo-500" />
                        <h3 className="text-lg font-bold text-foreground">No trades found</h3>
                        <p className="mt-1">Try adjusting your filters or date range.</p>
                    </div>
                )}
                
                {/* Intersection Observer target for lazy loading */}
                {visibleDays < groupedByDate.length && (
                    <div ref={observerTarget} className="h-10 w-full flex items-center justify-center pt-4">
                        <span className="text-muted-foreground text-sm animate-pulse">Loading older trades...</span>
                    </div>
                )}
            </div>
        </div>
    )
}
