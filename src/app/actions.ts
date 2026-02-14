'use server'

import { getTrades, saveTrade, updateTrade, deleteTrade } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

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
    const userId = await getAuthenticatedUser();

    const pnl = parseFloat(formData.get("pnl") as string) || 0;
    let analysis = formData.get("analysis") as string;

    const type = formData.get("type") as "buy" | "sell";
    const symbol = formData.get("symbol") as string;

    if (!analysis.trim()) {
        if (pnl > 0) {
            analysis = `Successful ${type} trade on ${symbol}. Target hit.`;
        } else {
            analysis = `Loss on ${type} trade on ${symbol}. Stop loss hit.`;
        }
    }

    const rawTrade = {
        date: formData.get("date") as string,
        time: (formData.get("time") as string) || "00:00", // Default if missing
        symbol: symbol,
        type: type,
        entryPrice: parseFloat(formData.get("entry") as string),
        exitPrice: parseFloat(formData.get("exit") as string),
        quantity: parseFloat(formData.get("quantity") as string),
        fees: parseFloat(formData.get("fees") as string) || 0,
        pnl: pnl,
        analysis: analysis,
        emotions: formData.get("emotions") as string,
        attachment: (formData.get("attachment") as File)?.name || "",
    };

    await saveTrade(rawTrade, userId);
    revalidatePath('/'); // Update dashboard
    revalidatePath('/add');
    return { success: true };
}

export async function updateTradeAction(id: string, formData: FormData) {
    const userId = await getAuthenticatedUser();

    const pnl = parseFloat(formData.get("pnl") as string) || 0;

    const rawTrade = {
        date: formData.get("date") as string,
        time: (formData.get("time") as string) || "00:00",
        symbol: formData.get("symbol") as string,
        type: formData.get("type") as "buy" | "sell",
        entryPrice: parseFloat(formData.get("entry") as string),
        exitPrice: parseFloat(formData.get("exit") as string),
        quantity: parseFloat(formData.get("quantity") as string),
        fees: parseFloat(formData.get("fees") as string) || 0,
        pnl: pnl,
        analysis: formData.get("analysis") as string,
        emotions: formData.get("emotions") as string,
        attachment: (formData.get("attachment") as File)?.name || "",
    };

    await updateTrade(id, rawTrade, userId);
    revalidatePath('/');
    return { success: true };
}

export async function deleteTradeAction(id: string) {
    const userId = await getAuthenticatedUser();
    await deleteTrade(id, userId);
    revalidatePath('/');
    return { success: true };
}
