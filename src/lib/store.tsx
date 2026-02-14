"use client"

import React, { createContext, useContext, useState, useEffect } from "react"

export type Trade = {
    id: string
    date: string
    time: string
    symbol: string
    type: "buy" | "sell"
    entryPrice: number
    exitPrice: number
    quantity: number
    fees: number
    pnl: number
    analysis: string
    emotions: string
}

type TradeContextType = {
    trades: Trade[]
    addTrade: (trade: Omit<Trade, "id">) => void
    metrics: {
        winRate: number
        totalPnl: number
        totalTrades: number
        winningTrades: number
        losingTrades: number
    }
}

const TradeContext = createContext<TradeContextType | undefined>(undefined)

export function TradeProvider({ children }: { children: React.ReactNode }) {
    const [trades, setTrades] = useState<Trade[]>([
        // Mock initial data
        {
            id: "1",
            date: new Date().toISOString().split("T")[0],
            time: "10:30",
            symbol: "BTC/USD",
            type: "buy",
            entryPrice: 45000,
            exitPrice: 45500,
            quantity: 0.1,
            fees: 5,
            pnl: 45,
            analysis: "Breakout trade",
            emotions: "Calm"
        },
        {
            id: "2",
            date: new Date(Date.now() - 86400000).toISOString().split("T")[0], // Yesterday
            time: "14:15",
            symbol: "ETH/USD",
            type: "sell",
            entryPrice: 3200,
            exitPrice: 3250,
            quantity: 1,
            fees: 10,
            pnl: -60,
            analysis: "Fakeout",
            emotions: "Frustrated"
        }
    ])

    const addTrade = (trade: Omit<Trade, "id">) => {
        const newTrade = { ...trade, id: Math.random().toString(36).substr(2, 9) }
        setTrades((prev) => [newTrade, ...prev])
    }

    const metrics = React.useMemo(() => {
        const totalTrades = trades.length
        const winningTrades = trades.filter((t) => t.pnl > 0).length
        const losingTrades = trades.filter((t) => t.pnl <= 0).length
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0
        const totalPnl = trades.reduce((acc, t) => acc + t.pnl, 0)

        return {
            winRate,
            totalPnl,
            totalTrades,
            winningTrades,
            losingTrades,
        }
    }, [trades])

    return (
        <TradeContext.Provider value={{ trades, addTrade, metrics }}>
            {children}
        </TradeContext.Provider>
    )
}

export function useTrades() {
    const context = useContext(TradeContext)
    if (context === undefined) {
        throw new Error("useTrades must be used within a TradeProvider")
    }
    return context
}
