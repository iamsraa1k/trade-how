'use server'

import { getTrades, saveTrade, updateTrade, deleteTrade, getRules, addRule, deleteRule, getMonthlyAnalyses, saveMonthlyAnalysis } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { z } from "zod";

const TradeSchema = z.object({
    date: z.string().min(1, "Date is required"),
    time: z.string().default("00:00"),
    symbol: z.string().min(1, "Symbol is required"),
    type: z.string().optional().default("buy"),
    entry: z.coerce.number().optional().default(0),
    exit: z.coerce.number().optional().default(0),
    quantity: z.coerce.number().optional().default(0),
    fees: z.coerce.number().optional().default(0),
    pnl: z.coerce.number(),
    analysis: z.string().optional().default(""),
    rules: z.array(z.string()).optional().default([]),
    attachment: z.any().optional(),
    isBasket: z.boolean().optional().default(false),
    legs: z.any().optional()
});

// Helper to get authenticated user or throw/redirect
async function getAuthenticatedUser() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
        redirect("/login");
    }
    return session.user.email;
}

export async function fetchTrades() {
    const userId = await getAuthenticatedUser();
    return await getTrades(userId);
}

export async function fetchRules() {
    const userId = await getAuthenticatedUser();
    return await getRules(userId);
}

export async function addRuleAction(text: string) {
    try {
        const userId = await getAuthenticatedUser();
        const rule = await addRule(userId, text);
        revalidatePath('/');
        revalidatePath('/add');
        return { success: true, rule };
    } catch (error: any) {
        console.error("Failed to add rule", error);
        return { success: false, error: "Failed to add rule" };
    }
}

export async function deleteRuleAction(id: string) {
    try {
        const userId = await getAuthenticatedUser();
        await deleteRule(id, userId);
        revalidatePath('/');
        revalidatePath('/add');
        return { success: true };
    } catch (error: any) {
        console.error("Failed to delete rule", error);
        return { success: false, error: "Failed to delete rule" };
    }
}

export async function addNewTrade(formData: FormData) {
    try {
        const userId = await getAuthenticatedUser();

        const formObject: Record<string, any> = Object.fromEntries(formData.entries());
        formObject.rules = formData.getAll('rules');
        formObject.isBasket = formObject.isBasket === "true";

        let parsedLegs = [];
        if (formObject.isBasket && formObject.legsData) {
            parsedLegs = JSON.parse(formObject.legsData as string);
        }
        formObject.legs = parsedLegs;

        const parsed = TradeSchema.safeParse(formObject);

        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "Invalid input data" };
        }

        const data = parsed.data;
        const rawTrade = {
            date: data.date,
            time: data.time || "00:00",
            symbol: data.symbol,
            type: (data.type === "sell" ? "sell" : "buy") as "buy" | "sell",
            entryPrice: data.entry,
            exitPrice: data.exit,
            quantity: data.quantity,
            fees: data.fees,
            pnl: data.pnl,
            analysis: data.analysis,
            rules: data.rules,
            attachment: (data.attachment as File)?.name || "",
            isBasket: data.isBasket,
            legs: data.legs
        };

        await saveTrade(rawTrade, userId);
        revalidatePath('/');
        revalidatePath('/add');
        return { success: true };
    } catch (error: any) {
        console.error("Failed to add trade", error);
        return { success: false, error: "Failed to save trade due to server error" };
    }
}

export async function updateTradeAction(id: string, formData: FormData) {
    try {
        const userId = await getAuthenticatedUser();

        const formObject: Record<string, any> = Object.fromEntries(formData.entries());
        formObject.rules = formData.getAll('rules');
        formObject.isBasket = formObject.isBasket === "true";

        let parsedLegs = [];
        if (formObject.isBasket && formObject.legsData) {
            parsedLegs = JSON.parse(formObject.legsData as string);
        }
        formObject.legs = parsedLegs;

        const parsed = TradeSchema.safeParse(formObject);

        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "Invalid input data" };
        }

        const data = parsed.data;

        const rawTrade = {
            date: data.date,
            time: data.time || "00:00",
            symbol: data.symbol,
            type: (data.type === "sell" ? "sell" : "buy") as "buy" | "sell",
            entryPrice: data.entry,
            exitPrice: data.exit,
            quantity: data.quantity,
            fees: data.fees,
            pnl: data.pnl,
            analysis: data.analysis,
            rules: data.rules,
            attachment: (data.attachment as File)?.name || "",
            isBasket: data.isBasket,
            legs: data.legs
        };

        await updateTrade(id, rawTrade, userId);
        revalidatePath('/');
        return { success: true };
    } catch (error: any) {
        console.error("Failed to update trade", error);
        return { success: false, error: "Failed to update trade due to server error" };
    }
}

export async function deleteTradeAction(id: string) {
    try {
        const userId = await getAuthenticatedUser();
        await deleteTrade(id, userId);
        revalidatePath('/');
        return { success: true };
    } catch (error: any) {
        console.error("Failed to delete trade", error);
        return { success: false, error: "Failed to delete trade due to server error" };
    }
}

export async function fetchMonthlyAnalyses() {
    const userId = await getAuthenticatedUser();
    return await getMonthlyAnalyses(userId);
}

export async function saveMonthlyAnalysisAction(monthYear: string, analysis: string) {
    try {
        const userId = await getAuthenticatedUser();
        const saved = await saveMonthlyAnalysis(userId, monthYear, analysis);
        revalidatePath('/monthly-analysis');
        return { success: true, data: saved };
    } catch (error: any) {
        console.error("Failed to save monthly analysis", error);
        return { success: false, error: "Failed to save monthly analysis" };
    }
}
