"use client"

import { Suspense } from "react";
import { TradeForm } from "@/features/trades/components/TradeForm";
import { useData } from "@/shared/context/DataContext";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const PREFILL_KEYS = ["symbol", "sector", "trigger", "limit", "stop", "qty", "paper"];

function AddTradeContent() {
    const { status } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { rules } = useData();

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    if (status === "loading") {
        return null;
    }

    // Values handed over from the sizing calculator on the Evening Routine page.
    const prefill: Record<string, string> = {};
    for (const key of PREFILL_KEYS) {
        const value = searchParams.get(key);
        if (value) prefill[key] = value;
    }

    return (
        <div className="page-container max-w-3xl">
            <div className="page-header">
                <h1 className="page-title">Add New Trade</h1>
                <p className="page-description">Record your executions and build your database.</p>
            </div>
            <TradeForm rules={rules} prefill={prefill} />
        </div>
    );
}

export default function AddTradePage() {
    return (
        <Suspense fallback={null}>
            <AddTradeContent />
        </Suspense>
    );
}
