'use server'

import { getTrades, saveTrade, updateTrade, deleteTrade, getRules, addRule, deleteRule, getMonthlyAnalyses, saveMonthlyAnalysis, saveConstitution, addBreaches, deleteBreach, addImpulse, updateImpulse, deleteImpulse } from '@/lib/db';
import type { Trade, ConstitutionSettings } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { z } from "zod";

const optionalNumber = z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number().nullable()
).optional().default(null);

const optionalDate = z.string().optional().transform(v => v || null);

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
    tradeQuality: z.enum(["flawless", "acceptable", "violation"]).optional(),

    // Momentum Breakout journal fields
    setup: z.string().optional().default(""),
    status: z.enum(["open", "closed"]).optional().default("closed"),
    sector: z.string().optional().default(""),
    marketLight: z.enum(["green", "red", ""]).optional().default(""),
    baseWeeks: optionalNumber,
    volumeRatio: optionalNumber,
    trigger: optionalNumber,
    limitPrice: optionalNumber,
    stopPrice: optionalNumber,
    resultsDate: optionalDate,
    exitDate: optionalDate,
    exitReason: z.enum(["stop", "breakeven", "trail", "time", "results", "other", ""]).optional().default(""),
    checklist: z.array(z.string()).optional().default([]),
    processGrade: z.enum(["A", "B", "C", ""]).optional().default(""),
    repeatNote: z.string().optional().default(""),
});

const BreachSchema = z.object({
    date: z.string().min(1),
    level: z.coerce.number().int().min(1).max(4),
    code: z.string().min(1),
    note: z.string().optional().default(""),
    tradeId: z.string().nullable().optional(),
});

const GRADE_TO_QUALITY = { A: "flawless", B: "acceptable", C: "violation" } as const;

// Shared by add and update: turns the submitted form into the stored trade shape.
function parseTradeForm(formData: FormData) {
    const formObject: Record<string, any> = Object.fromEntries(formData.entries());
    formObject.rules = formData.getAll('rules');
    formObject.checklist = formData.getAll('checklist');
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
    const isBreakout = data.setup === "momentum_breakout";
    const isOpen = isBreakout && data.status === "open";
    const grade = isBreakout && data.processGrade ? data.processGrade : null;

    let tradeQuality: Trade["tradeQuality"] = data.isPaper ? null : (data.tradeQuality || null);
    if (!data.isPaper && grade) tradeQuality = GRADE_TO_QUALITY[grade];

    const trade: Omit<Trade, 'id' | 'userId'> = {
        date: data.date,
        time: data.time || "00:00",
        symbol: data.symbol,
        type: (data.type === "sell" ? "sell" : "buy") as "buy" | "sell",
        entryPrice: data.entry,
        exitPrice: isOpen ? 0 : data.exit,
        quantity: data.quantity,
        fees: data.fees,
        pnl: isOpen ? 0 : data.pnl,
        analysis: data.analysis,
        rules: data.rules,
        attachment: (data.attachment as File)?.name || "",
        isBasket: isBreakout ? false : data.isBasket,
        legs: isBreakout ? [] : data.legs,
        isPaper: data.isPaper,
        tradeQuality,
        setup: isBreakout ? "momentum_breakout" : null,
        status: isBreakout ? data.status : null,
    };

    if (isBreakout) {
        Object.assign(trade, {
            sector: data.sector.trim(),
            marketLight: data.marketLight || null,
            baseWeeks: data.baseWeeks,
            volumeRatio: data.volumeRatio,
            trigger: data.trigger,
            limitPrice: data.limitPrice,
            stopPrice: data.stopPrice,
            resultsDate: data.resultsDate,
            exitDate: isOpen ? null : data.exitDate,
            exitReason: isOpen ? null : (data.exitReason || null),
            checklist: data.checklist,
            processGrade: grade,
            repeatNote: data.repeatNote,
        });
    }

    let breaches: z.infer<typeof BreachSchema>[] = [];
    if (formObject.breachesData) {
        const parsedBreaches = z.array(BreachSchema).safeParse(JSON.parse(formObject.breachesData as string));
        if (parsedBreaches.success) breaches = parsedBreaches.data;
    }

    return { trade, breaches } as const;
}

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

        const parsed = parseTradeForm(formData);
        if ('error' in parsed) {
            return { success: false, error: parsed.error };
        }

        const saved = await saveTrade(parsed.trade, userId);
        if (parsed.breaches.length > 0) {
            await addBreaches(userId, parsed.breaches.map(b => ({ ...b, level: b.level as 1 | 2 | 3 | 4, tradeId: saved.id })));
        }
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

        await updateTrade(id, parsed.trade, userId);
        if (parsed.breaches.length > 0) {
            await addBreaches(userId, parsed.breaches.map(b => ({ ...b, level: b.level as 1 | 2 | 3 | 4, tradeId: id })));
        }
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
});

export async function saveConstitutionAction(data: Partial<Omit<ConstitutionSettings, 'userId' | 'updatedAt'>>) {
    try {
        const userId = await getAuthenticatedUser();
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
        const userId = await getAuthenticatedUser();
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
        const userId = await getAuthenticatedUser();
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
        const userId = await getAuthenticatedUser();
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
        const userId = await getAuthenticatedUser();
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
        const userId = await getAuthenticatedUser();
        await deleteImpulse(id, userId);
        revalidatePath('/', 'layout');
        return { success: true };
    } catch (error) {
        console.error("Failed to delete impulse", error);
        return { success: false, error: "Failed to delete impulse" };
    }
}
