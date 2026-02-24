'use server'

import { getTrades, saveTrade, updateTrade, deleteTrade } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { z } from "zod";

const TradeSchema = z.object({
    date: z.string().min(1, "Date is required"),
    time: z.string().default("00:00"),
    symbol: z.string().min(1, "Symbol is required"),
    type: z.enum(["buy", "sell"]),
    entry: z.coerce.number().optional().default(0),
    exit: z.coerce.number().optional().default(0),
    quantity: z.coerce.number().optional().default(0),
    fees: z.coerce.number().optional().default(0),
    pnl: z.coerce.number(),
    analysis: z.string().optional().default(""),
    emotions: z.string().optional().default(""),
    attachment: z.any().optional()
});

// Helper to get authenticated user or throw/redirect
async function getAuthenticatedUser() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
        redirect("/login");
    }
    // We use email as the user ID for simplicity in this JSON DB approach
    // In a real DB, you'd use the actual user ID from the provider
    return session.user.email;
}

export async function fetchTrades() {
    const userId = await getAuthenticatedUser();
    return await getTrades(userId);
}

export async function addNewTrade(formData: FormData) {
    try {
        const userId = await getAuthenticatedUser();

        // Convert formData entries to a plain object
        const formObject = Object.fromEntries(formData.entries());

        // Parse and validate using Zod
        const parsed = TradeSchema.safeParse(formObject);

        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "Invalid input data" };
        }

        const data = parsed.data;

        let analysis = data.analysis;
        if (!analysis.trim()) {
            if (data.pnl > 0) {
                analysis = `Successful ${data.type} trade on ${data.symbol}. Target hit.`;
            } else {
                analysis = `Loss on ${data.type} trade on ${data.symbol}. Stop loss hit.`;
            }
        }

        const rawTrade = {
            date: data.date,
            time: data.time || "00:00",
            symbol: data.symbol,
            type: data.type,
            entryPrice: data.entry,
            exitPrice: data.exit,
            quantity: data.quantity,
            fees: data.fees,
            pnl: data.pnl,
            analysis: analysis,
            emotions: data.emotions,
            attachment: (data.attachment as File)?.name || "",
        };

        await saveTrade(rawTrade, userId);
        revalidatePath('/'); // Update dashboard
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

        const formObject = Object.fromEntries(formData.entries());
        const parsed = TradeSchema.safeParse(formObject);

        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "Invalid input data" };
        }

        const data = parsed.data;

        const rawTrade = {
            date: data.date,
            time: data.time || "00:00",
            symbol: data.symbol,
            type: data.type,
            entryPrice: data.entry,
            exitPrice: data.exit,
            quantity: data.quantity,
            fees: data.fees,
            pnl: data.pnl,
            analysis: data.analysis,
            emotions: data.emotions,
            attachment: (data.attachment as File)?.name || "",
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
