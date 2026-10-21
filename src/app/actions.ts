'use server'

import { getTrades, getTradeById, saveTrade, updateTrade, deleteTrade, getRules, addRule, deleteRule, getMonthlyAnalyses, saveMonthlyAnalysis, getConstitution, saveConstitution, addBreaches, deleteBreach, addImpulse, updateImpulse, deleteImpulse } from '@/lib/db';
import { getAutomation, saveAutomation, getLatestScan } from '@/lib/db';
import type { Trade, ConstitutionSettings } from '@/lib/db';
import { istToday } from '@/features/automation/lib/marketData';
import { canUseConstitution } from '@/lib/access';
import { findChatForCode, getBotUsername, sendMessage } from '@/features/automation/lib/telegram';
import { randomUUID } from 'crypto';
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
    legs: z.any().optional(),
    isPaper: z.boolean().optional().default(false),
    tradeQuality: z.enum(["flawless", "acceptable", "violation"]).optional()
});

const BreachSchema = z.object({
    date: z.string().min(1),
    level: z.coerce.number().int().min(1).max(4),
    code: z.string().min(1),
    note: z.string().optional().default(""),
    tradeId: z.string().nullable().optional(),
});

// Shared by add and update: turns the submitted form into the stored trade shape.
function parseTradeForm(formData: FormData) {
    const formObject: Record<string, any> = Object.fromEntries(formData.entries());
    formObject.rules = formData.getAll('rules');
    formObject.isBasket = formObject.isBasket === "true";
    formObject.isPaper = formObject.isPaper === "true";

    let parsedLegs = [];
    if (formObject.isBasket && formObject.legsData) {
        parsedLegs = JSON.parse(formObject.legsData as string);
    }
    formObject.legs = parsedLegs;

    const parsed = TradeSchema.safeParse(formObject);
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message || "Invalid input data" } as const;
    }

    const data = parsed.data;
    const trade: Omit<Trade, 'id' | 'userId'> = {
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
        legs: data.legs,
        isPaper: data.isPaper,
        tradeQuality: data.isPaper ? null : (data.tradeQuality || null),
        status: null, // saving through the form closes any breakout trade logged by hand earlier
    };
    return { trade } as const;
}

// Helper to get authenticated user or throw/redirect
async function getAuthenticatedUser() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
        redirect("/login");
    }
    return session.user.email;
}

// Constitution and automation actions are only for accounts listed in CONSTITUTION_EMAILS.
async function requireConstitutionUser() {
    const userId = await getAuthenticatedUser();
    if (!canUseConstitution(userId)) {
        throw new Error("Constitution mode isn't available for this account");
    }
    return userId;
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

        const parsed = parseTradeForm(formData);
        if ('error' in parsed) {
            return { success: false, error: parsed.error };
        }

        const saved = await saveTrade(parsed.trade, userId);
        revalidatePath('/', 'layout');
        return { success: true, id: saved.id };
    } catch (error: any) {
        console.error("Failed to add trade", error);
        return { success: false, error: "Failed to save trade due to server error" };
    }
}

export async function updateTradeAction(id: string, formData: FormData) {
    try {
        const userId = await getAuthenticatedUser();

        const parsed = parseTradeForm(formData);
        if ('error' in parsed) {
            return { success: false, error: parsed.error };
        }
        // Autopilot trades are kept in step with market data, so they aren't edited by hand.
        const existing = await getTradeById(id, userId);
        if (existing?.auto) {
            return { success: false, error: "Autopilot trades can't be edited" };
        }

        await updateTrade(id, parsed.trade, userId);
        revalidatePath('/', 'layout');
        return { success: true, id };
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

const ConstitutionSchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    phase: z.coerce.number().int().min(0).max(4).optional(),
    baseRiskPct: z.coerce.number().positive().max(5).optional(),
    positionCapPct: z.coerce.number().positive().max(100).optional(),
    equityHistory: z.array(z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/),
        equity: z.coerce.number().positive(),
    })).optional(),
    checks: z.record(z.string(), z.boolean()).optional(),
    backtest: z.object({
        expectancy: z.number().nullable(),
        profitFactor: z.number().nullable(),
        totalTrades: z.number().nullable(),
        heldOutTrades: z.number().nullable(),
        maxDrawdown: z.number().nullable(),
        avgLoserR: z.number().nullable(),
        consistencyPct: z.number().nullable(),
        robustnessPF: z.number().nullable(),
        strict: z.boolean(),
        failedRuns: z.number().int().min(0),
    }).nullable().optional(),
    whyTrading: z.string().max(5000).optional(),
    enabled: z.boolean().optional(),
});

export async function saveConstitutionAction(data: Partial<Omit<ConstitutionSettings, 'userId' | 'updatedAt'>>) {
    try {
        const userId = await requireConstitutionUser();
        const parsed = ConstitutionSchema.safeParse(data);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "Invalid settings" };
        }
        const saved = await saveConstitution(userId, parsed.data as Partial<ConstitutionSettings>);
        revalidatePath('/', 'layout');
        return { success: true, data: saved };
    } catch (error) {
        console.error("Failed to save constitution settings", error);
        return { success: false, error: "Failed to save constitution settings" };
    }
}

export async function logBreachAction(input: { date: string; level: number; code: string; note?: string; tradeId?: string | null }) {
    try {
        const userId = await requireConstitutionUser();
        const parsed = BreachSchema.safeParse(input);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "Invalid breach" };
        }
        const [breach] = await addBreaches(userId, [{ ...parsed.data, level: parsed.data.level as 1 | 2 | 3 | 4 }]);
        revalidatePath('/', 'layout');
        return { success: true, breach };
    } catch (error) {
        console.error("Failed to log breach", error);
        return { success: false, error: "Failed to log breach" };
    }
}

export async function deleteBreachAction(id: string) {
    try {
        const userId = await requireConstitutionUser();
        await deleteBreach(id, userId);
        revalidatePath('/', 'layout');
        return { success: true };
    } catch (error) {
        console.error("Failed to delete breach", error);
        return { success: false, error: "Failed to delete breach" };
    }
}

const ImpulseSchema = z.object({
    date: z.string().min(1, "Date is required"),
    symbol: z.string().trim().min(1, "Stock is required"),
    reason: z.string().trim().min(1, "Write down why"),
    refPrice: z.number().positive().nullable().optional(),
});

export async function addImpulseAction(input: { date: string; symbol: string; reason: string; refPrice?: number | null }) {
    try {
        const userId = await requireConstitutionUser();
        const parsed = ImpulseSchema.safeParse(input);
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "Invalid entry" };
        }
        const impulse = await addImpulse(userId, { ...parsed.data, symbol: parsed.data.symbol.toUpperCase() });
        revalidatePath('/', 'layout');
        return { success: true, impulse };
    } catch (error) {
        console.error("Failed to log impulse", error);
        return { success: false, error: "Failed to log impulse" };
    }
}

export async function updateImpulseAction(id: string, laterPrice: number | null) {
    try {
        const userId = await requireConstitutionUser();
        if (laterPrice !== null && !(laterPrice > 0)) {
            return { success: false, error: "Price must be positive" };
        }
        await updateImpulse(id, userId, { laterPrice });
        revalidatePath('/', 'layout');
        return { success: true };
    } catch (error) {
        console.error("Failed to update impulse", error);
        return { success: false, error: "Failed to update impulse" };
    }
}

export async function deleteImpulseAction(id: string) {
    try {
        const userId = await requireConstitutionUser();
        await deleteImpulse(id, userId);
        revalidatePath('/', 'layout');
        return { success: true };
    } catch (error) {
        console.error("Failed to delete impulse", error);
        return { success: false, error: "Failed to delete impulse" };
    }
}

// ---------------------------------------------------------------------------
// Automation: Telegram alerts, scanner overview, market-data auto-fill
// ---------------------------------------------------------------------------

export async function getAutomationOverviewAction() {
    const userId = await requireConstitutionUser();
    const [automation, latestScan, constitution] = await Promise.all([getAutomation(userId), getLatestScan().catch(() => null), getConstitution(userId)]);
    const tg = automation?.telegram;
    return {
        account: userId,
        enabled: !!constitution?.enabled,
        cronSecretSet: !!process.env.CRON_SECRET,
        telegram: {
            hasToken: !!tg?.botToken,
            botUsername: tg?.botUsername || null,
            linked: !!tg?.chatId,
            startLink: tg?.botUsername && tg?.linkCode ? `https://t.me/${tg.botUsername}?start=${tg.linkCode}` : null,
        },
        lastRunDate: automation?.lastRunDate || null,
        lastRunAt: automation?.lastRunAt || null,
        lastSummary: automation?.lastSummary || null,
        lastError: automation?.lastError || null,
        lastSignals: automation?.lastSignals || [],
        recentMessages: automation?.recentMessages || [],
        latestScan,
    };
}

// Small summary for the dashboard strip (no message history).
export async function getAutopilotStatusAction() {
    const userId = await requireConstitutionUser();
    const [automation, latestScan] = await Promise.all([getAutomation(userId), getLatestScan().catch(() => null)]);
    return {
        scanDate: latestScan?.date || null,
        light: latestScan?.marketLight || null,
        breakouts: latestScan?.breakouts.length ?? 0,
        lastRunAt: automation?.lastRunAt || null,
        lastError: automation?.lastError || null,
        telegramLinked: !!automation?.telegram?.chatId,
    };
}

export async function saveTelegramBotAction(token: string) {
    try {
        const userId = await requireConstitutionUser();
        const clean = token.trim();
        if (!/^\d+:[\w-]{30,}$/.test(clean)) return { success: false, error: "That doesn't look like a bot token from @BotFather." };
        const botUsername = await getBotUsername(clean);
        const linkCode = randomUUID().replace(/-/g, "").slice(0, 10);
        await saveAutomation(userId, { telegram: { botToken: clean, botUsername, chatId: null, linkCode } });
        return { success: true, startLink: `https://t.me/${botUsername}?start=${linkCode}`, botUsername };
    } catch (error) {
        console.error("Failed to save Telegram bot", error);
        return { success: false, error: error instanceof Error ? error.message : "Couldn't reach Telegram with that token" };
    }
}

export async function linkTelegramAction() {
    try {
        const userId = await requireConstitutionUser();
        const tg = (await getAutomation(userId))?.telegram;
        if (!tg?.botToken || !tg.linkCode) return { success: false, error: "Save your bot token first." };
        const chatId = await findChatForCode(tg.botToken, tg.linkCode);
        if (!chatId) return { success: false, error: "No /start message with your code yet. Open the bot link, tap Start, then try again." };
        await saveAutomation(userId, { telegram: { ...tg, chatId } });
        await sendMessage(tg.botToken, chatId, "✅ <b>TradeHow is linked.</b> Evening digests arrive after the close on trading days, and the weekly review on Saturday morning.");
        return { success: true };
    } catch (error) {
        console.error("Failed to link Telegram", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to link Telegram" };
    }
}

export async function sendTelegramTestAction() {
    try {
        const userId = await requireConstitutionUser();
        const tg = (await getAutomation(userId))?.telegram;
        if (!tg?.botToken || !tg.chatId) return { success: false, error: "Link Telegram first." };
        await sendMessage(tg.botToken, tg.chatId, "🔔 Test alert from TradeHow. If you can read this, alerts work.");
        return { success: true };
    } catch (error) {
        console.error("Failed to send Telegram test", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to send test" };
    }
}

export async function disconnectTelegramAction() {
    try {
        const userId = await requireConstitutionUser();
        await saveAutomation(userId, { telegram: null });
        return { success: true };
    } catch (error) {
        console.error("Failed to disconnect Telegram", error);
        return { success: false, error: "Failed to disconnect Telegram" };
    }
}

export async function setConstitutionModeAction(enabled: boolean) {
    try {
        const userId = await requireConstitutionUser();
        const existing = await getConstitution(userId);
        // The start date is fixed the first time the mode is switched on, so older trades never count.
        const data: Partial<ConstitutionSettings> = { enabled };
        if (enabled && !existing?.startDate) {
            data.startDate = istToday();
            data.phase = 0;
        }
        const saved = await saveConstitution(userId, data);
        revalidatePath('/', 'layout');
        return { success: true, data: saved };
    } catch (error) {
        console.error("Failed to switch constitution mode", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to switch constitution mode" };
    }
}
