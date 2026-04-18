"use client"

import React, { useState } from "react"
import type { Trade, Rule } from "@/lib/db"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, Trash2, Search, Target, FileSpreadsheet } from "lucide-react"
import { format } from "date-fns"
import { Input } from "@/components/ui/input"
import { deleteTradeAction } from "@/app/actions"
import { toast } from "sonner"

export function TradeTable({ trades, rules }: { trades: Trade[], rules: Rule[] }) {
    const [searchTerm, setSearchTerm] = useState("")

    const filteredTrades = trades.filter(t => 
        t.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.analysis?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleExportCSV = () => {
        if (trades.length === 0) {
            alert("No trades to export.");
            return;
        }

        let csvContent = "Date,MainSymbol,Type,LegNo,LegSymbol,LegType,Entry,Exit,Quantity,Fees,TotalPnL,Analysis\n";
        
        trades.forEach(t => {
            const safeAnalysis = `"${(t.analysis || "").replace(/"/g, '""')}"`;
            if (t.isBasket && t.legs) {
                csvContent += `${t.date},"${t.symbol}",BASKET,-,-,-,-,-,-,${t.fees},${t.pnl},${safeAnalysis}\n`;
                t.legs.forEach((l, i) => {
                    csvContent += `${t.date},"${t.symbol}",BASKET,${i+1},"${l.symbol || '-'}",${l.type.toUpperCase()},${l.entryPrice},${l.exitPrice},${l.quantity},${l.fees},-,-\n`;
                });
            } else {
                csvContent += `${t.date},"${t.symbol}",${t.type.toUpperCase()},-,-,-,${t.entryPrice},${t.exitPrice},${t.quantity},${t.fees},${t.pnl},${safeAnalysis}\n`;
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
        if (trades.length === 0) {
            alert("No trades to export.");
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
            doc.text(`Total Trades: ${trades.length}`, 14, 38);

            // Detailed Trade Log Pages
            let currentY = 50;

            trades.forEach((trade) => {
                if (currentY > 270) {
                    doc.addPage();
                    currentY = 20;
                }

                const isProfit = trade.pnl >= 0;
                
                doc.setFont("helvetica", "bold");
                doc.setTextColor(0);
                doc.setFontSize(10);
                
                doc.text(`${format(new Date(trade.date), "dd MMM yyyy")}  |  ${trade.symbol.toUpperCase()}  |  ${trade.isBasket ? "BASKET" : trade.type.toUpperCase()}`, 14, currentY);
                
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
                
                doc.setDrawColor(230);
                doc.line(14, currentY - 3, 196, currentY - 3);
            });

            doc.save(`trade_journal_detailed_${format(new Date(), "yyyy-MM-dd")}.pdf`);
            toast.success("PDF Exported Successfully!");
        } catch (error) {
            console.error("PDF Generation Error:", error);
            toast.error("Failed to generate PDF");
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-center bg-card p-4 rounded-xl border shadow-sm gap-4">
                <div className="relative w-full sm:max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search symbols or analysis..." 
                        className="pl-8 shadow-sm" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button onClick={handleExportCSV} variant="outline" className="flex-1 sm:flex-none">
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        CSV
                    </Button>
                    <Button onClick={handleExportPDF} className="bg-indigo-600 hover:bg-indigo-700 text-white flex-1 sm:flex-none">
                        <Download className="mr-2 h-4 w-4" />
                        Journal PDF
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTrades.map(trade => (
                    <Card key={trade.id} className="overflow-hidden hover:shadow-lg transition-shadow border-border/50">
                        <CardContent className="p-0">
                            <div className={`h-2 w-full ${trade.pnl > 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            <div className="p-5 flex flex-col h-full min-h-[300px]">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-lg">{trade.symbol}</h3>
                                        <p className="text-xs text-muted-foreground">{format(new Date(trade.date), "PPP")}</p>
                                    </div>
                                    <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${trade.isBasket ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : trade.type === 'buy' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                        {trade.isBasket ? "BASKET" : trade.type.toUpperCase()}
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
                                                    <div className="flex gap-2.5 text-[10px] sm:text-xs">
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
                {filteredTrades.length === 0 && (
                    <div className="col-span-full py-16 px-4 bg-muted/20 border-dashed border-2 rounded-2xl text-center text-muted-foreground flex flex-col items-center">
                        <Target className="h-12 w-12 mb-4 opacity-30 text-indigo-500" />
                        <h3 className="text-lg font-bold text-foreground">No trades found</h3>
                        <p className="mt-1">Add logs and they will appear here!</p>
                    </div>
                )}
            </div>
        </div>
    )
}
