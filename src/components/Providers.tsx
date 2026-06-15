"use client";

import { SessionProvider } from "next-auth/react";
import { TradeFilterProvider } from "@/components/TradeFilterContext";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <TradeFilterProvider>
                {children}
            </TradeFilterProvider>
        </SessionProvider>
    );
}
