"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react"
import type { Trade } from "@/lib/db"

export type TradeMode = "all" | "regular" | "paper"

interface TradeFilterContextType {
    tradeMode: TradeMode
    setTradeMode: (mode: TradeMode) => void
    filterTrades: (trades: Trade[]) => Trade[]
}

const TradeFilterContext = createContext<TradeFilterContextType | undefined>(undefined)

const STORAGE_KEY = "tradehow-trade-mode"

export function TradeFilterProvider({ children }: { children: React.ReactNode }) {
    const [tradeMode, setTradeModeState] = useState<TradeMode>("all")
    const [isHydrated, setIsHydrated] = useState(false)

    // Hydrate from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored === "all" || stored === "regular" || stored === "paper") {
            setTradeModeState(stored)
        }
        setIsHydrated(true)
    }, [])

    const setTradeMode = useCallback((mode: TradeMode) => {
        setTradeModeState(mode)
        localStorage.setItem(STORAGE_KEY, mode)
    }, [])

    const filterTrades = useCallback((trades: Trade[]): Trade[] => {
        if (tradeMode === "all") return trades
        if (tradeMode === "paper") return trades.filter(t => t.isPaper === true)
        // "regular" — trades without isPaper or with isPaper === false
        return trades.filter(t => !t.isPaper)
    }, [tradeMode])

    // Prevent flash of wrong filter state during SSR/hydration
    if (!isHydrated) {
        return <>{children}</>
    }

    return (
        <TradeFilterContext.Provider value={{ tradeMode, setTradeMode, filterTrades }}>
            {children}
        </TradeFilterContext.Provider>
    )
}

export function useTradeFilter() {
    const context = useContext(TradeFilterContext)
    if (!context) {
        // Graceful fallback if used outside provider (e.g., server components)
        return {
            tradeMode: "all" as TradeMode,
            setTradeMode: () => {},
            filterTrades: (trades: Trade[]) => trades,
        }
    }
    return context
}
