import { adminDb as db } from './firebase-admin';

export interface Trade {
    id: string;
    userId: string;
    date: string;
    time?: string;
    symbol: string;
    type: "buy" | "sell";
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    fees: number;
    pnl: number;
    analysis: string;
    rules: string[]; 
    attachment?: string;
    isBasket?: boolean;
    legs?: { type: "buy" | "sell", entryPrice: number, exitPrice: number, quantity: number, fees: number, symbol?: string }[];
    isPaper?: boolean;
    tradeQuality?: "flawless" | "acceptable" | "violation" | null;

    // Trading Constitution — Momentum Breakout journal fields (A6)
    setup?: "momentum_breakout" | null;
    status?: "open" | "closed" | null;
    sector?: string;
    marketLight?: "green" | "red" | null;
    baseWeeks?: number | null;
    volumeRatio?: number | null;
    trigger?: number | null;
    limitPrice?: number | null;
    stopPrice?: number | null;
    resultsDate?: string | null;
    exitDate?: string | null;
    exitReason?: "stop" | "breakeven" | "trail" | "time" | "results" | "other" | null;
    checklist?: string[];
    processGrade?: "A" | "B" | "C" | null;
    repeatNote?: string;

    // Automated paper trades (scanner + paper engine)
    auto?: boolean;
    instrumentKey?: string | null;
    currentStop?: number | null;
    gttExpiry?: string | null;
    signalDate?: string | null;
    trailActive?: boolean;
    everAbovePlusOneR?: boolean;
    pendingExit?: "stop" | "breakeven" | "trail" | "time" | "results" | null;
    sessionsHeld?: number;
    lastProcessedDate?: string | null;
}

export interface Rule {
    id: string;
    userId: string;
    text: string;
    createdAt?: string;
}

export async function getTrades(userId: string): Promise<Trade[]> {
    try {
        const snapshot = await db.collection("trades").where("userId", "==", userId).get();
        const trades = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Trade[];
        
        return trades.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (error) {
        console.error('Firestore Error getTrades:', error);
        return [];
    }
}

export async function getTradeById(id: string, userId: string): Promise<Trade | null> {
    try {
        const doc = await db.collection("trades").doc(id).get();
        if (!doc.exists) return null;
        
        const data = doc.data();
        if (data?.userId !== userId) return null;
        
        return { id: doc.id, ...data } as Trade;
    } catch (error) {
        console.error('Firestore Error getTradeById:', error);
        return null;
    }
}

export async function saveTrade(trade: Omit<Trade, 'id' | 'userId'>, userId: string): Promise<Trade> {
    const tradeData = {
        ...trade,
        userId,
        createdAt: new Date().toISOString()
    };
    const docRef = await db.collection("trades").add(tradeData);
    return {
        id: docRef.id,
        ...tradeData
    } as Trade;
}

// Returns the document reference only if it exists and belongs to userId, so one user can't touch another's data by ID.
async function getOwnedDocRef(collection: string, id: string, userId: string) {
    const ref = db.collection(collection).doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.userId !== userId) {
        throw new Error(`${collection}/${id} not found for this user`);
    }
    return ref;
}

export async function deleteTrade(id: string, userId: string): Promise<void> {
    const tradeRef = await getOwnedDocRef("trades", id, userId);
    await tradeRef.delete();
}

export async function updateTrade(id: string, updatedData: Partial<Trade>, userId: string): Promise<Trade | null> {
    const tradeRef = await getOwnedDocRef("trades", id, userId);
    const safeData = { ...updatedData };
    delete safeData.userId;
    await tradeRef.update(safeData);
    return {
        id,
        ...updatedData
    } as unknown as Trade;
}

export async function getRules(userId: string): Promise<Rule[]> {
    try {
        const snapshot = await db.collection("rules").where("userId", "==", userId).get();
        const rules = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Rule[];
        
        return rules.sort((a, b) => {
            if (!a.createdAt || !b.createdAt) return 0;
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
    } catch (error) {
        console.error('Firestore Error getRules:', error);
        return [];
    }
}

export async function addRule(userId: string, text: string): Promise<Rule> {
    const ruleData = { userId, text, createdAt: new Date().toISOString() };
    const docRef = await db.collection("rules").add(ruleData);
    return { id: docRef.id, userId, text } as Rule;
}

export async function deleteRule(id: string, userId: string): Promise<void> {
    const ruleRef = await getOwnedDocRef("rules", id, userId);
    await ruleRef.delete();
}

export interface MonthlyAnalysis {
    id: string;
    userId: string;
    monthYear: string; // Format: "yyyy-MM"
    analysis: string;
    updatedAt: string;
}

export async function getMonthlyAnalyses(userId: string): Promise<MonthlyAnalysis[]> {
    try {
        const snapshot = await db.collection("monthly_analysis").where("userId", "==", userId).get();
        const analyses = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as MonthlyAnalysis[];
        
        return analyses;
    } catch (error) {
        console.error('Firestore Error getMonthlyAnalyses:', error);
        return [];
    }
}

export async function saveMonthlyAnalysis(userId: string, monthYear: string, analysis: string): Promise<MonthlyAnalysis> {
    const data = { userId, monthYear, analysis, updatedAt: new Date().toISOString() };
    
    // Check if exists
    const snapshot = await db.collection("monthly_analysis")
        .where("userId", "==", userId)
        .where("monthYear", "==", monthYear)
        .limit(1)
        .get();
        
    if (!snapshot.empty) {
        const docId = snapshot.docs[0].id;
        await db.collection("monthly_analysis").doc(docId).update(data);
        return { id: docId, ...data } as MonthlyAnalysis;
    } else {
        const docRef = await db.collection("monthly_analysis").add(data);
        return { id: docRef.id, ...data } as MonthlyAnalysis;
    }
}

// ---------------------------------------------------------------------------
// Trading Constitution
// ---------------------------------------------------------------------------

export interface BacktestResult {
    expectancy: number | null;      // R per trade, after costs, held-out period
    profitFactor: number | null;
    totalTrades: number | null;
    heldOutTrades: number | null;
    maxDrawdown: number | null;     // %
    avgLoserR: number | null;
    consistencyPct: number | null;  // % of calendar years profitable
    robustnessPF: number | null;    // profit factor with slippage doubled
    strict: boolean;                // tested on today's Nifty 500 list → stricter pass marks
    failedRuns: number;
}

export interface ConstitutionSettings {
    userId: string;
    startDate: string;              // yyyy-MM-dd; trades from this date count toward the constitution
    phase: 0 | 1 | 2 | 3 | 4;
    baseRiskPct: number;
    positionCapPct: number;
    equityHistory: { month: string; equity: number }[]; // monthly close: account + reserve
    checks: Record<string, boolean>;
    backtest?: BacktestResult | null;
    whyTrading?: string;
    updatedAt?: string;
}

export interface Breach {
    id: string;
    userId: string;
    date: string;
    level: 1 | 2 | 3 | 4;
    code: string;
    note?: string;
    tradeId?: string | null;
    createdAt?: string;
}

export interface Impulse {
    id: string;
    userId: string;
    date: string;
    symbol: string;
    reason: string;
    refPrice?: number | null;
    laterPrice?: number | null;
    createdAt?: string;
}

export async function getConstitution(userId: string): Promise<ConstitutionSettings | null> {
    try {
        const doc = await db.collection("constitution").doc(userId).get();
        if (!doc.exists) return null;
        return doc.data() as ConstitutionSettings;
    } catch (error) {
        console.error('Firestore Error getConstitution:', error);
        return null;
    }
}

export async function saveConstitution(userId: string, data: Partial<Omit<ConstitutionSettings, 'userId'>>): Promise<ConstitutionSettings> {
    const ref = db.collection("constitution").doc(userId);
    await ref.set({ ...data, userId, updatedAt: new Date().toISOString() }, { merge: true });
    const doc = await ref.get();
    return doc.data() as ConstitutionSettings;
}

export async function getBreaches(userId: string): Promise<Breach[]> {
    try {
        const snapshot = await db.collection("breaches").where("userId", "==", userId).get();
        const breaches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Breach[];
        return breaches.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
    } catch (error) {
        console.error('Firestore Error getBreaches:', error);
        return [];
    }
}

// Skips a breach already logged for the same trade and rule, so re-saving a trade doesn't double-count it.
export async function addBreaches(userId: string, items: Omit<Breach, 'id' | 'userId' | 'createdAt'>[]): Promise<Breach[]> {
    const existing = await getBreaches(userId);
    const created: Breach[] = [];
    for (const item of items) {
        if (item.tradeId && existing.some(b => b.tradeId === item.tradeId && b.code === item.code)) continue;
        const data = { ...item, tradeId: item.tradeId || null, note: item.note || "", userId, createdAt: new Date().toISOString() };
        const docRef = await db.collection("breaches").add(data);
        created.push({ id: docRef.id, ...data });
    }
    return created;
}

export async function deleteBreach(id: string, userId: string): Promise<void> {
    const ref = db.collection("breaches").doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.userId !== userId) throw new Error("Not found");
    await ref.delete();
}

export async function getImpulses(userId: string): Promise<Impulse[]> {
    try {
        const snapshot = await db.collection("impulses").where("userId", "==", userId).get();
        const impulses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Impulse[];
        return impulses.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
    } catch (error) {
        console.error('Firestore Error getImpulses:', error);
        return [];
    }
}

export async function addImpulse(userId: string, item: Omit<Impulse, 'id' | 'userId' | 'createdAt'>): Promise<Impulse> {
    const data = { ...item, refPrice: item.refPrice ?? null, laterPrice: item.laterPrice ?? null, userId, createdAt: new Date().toISOString() };
    const docRef = await db.collection("impulses").add(data);
    return { id: docRef.id, ...data };
}

export async function updateImpulse(id: string, userId: string, data: Partial<Pick<Impulse, 'laterPrice' | 'refPrice'>>): Promise<void> {
    const ref = db.collection("impulses").doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.userId !== userId) throw new Error("Not found");
    await ref.update(data);
}

export async function deleteImpulse(id: string, userId: string): Promise<void> {
    const ref = db.collection("impulses").doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.userId !== userId) throw new Error("Not found");
    await ref.delete();
}

// ---------------------------------------------------------------------------
// Automation (scanner, alerts, paper engine)
// ---------------------------------------------------------------------------

export interface ScanStock {
    symbol: string
    name: string
    sector: string
    instrumentKey: string
    close: number
    high: number
    low: number
    volumeRatio: number
    baseWeeks: number
    baseRangePct: number
    resultsDate: string | null
}

export interface ScanResult {
    date: string
    ranAt: string
    marketLight: { close: number; sma200: number; green: boolean }
    breakouts: ScanStock[]
    bases: ScanStock[]
    universeSize: number
    universeSource: "live" | "bundled"
    failures: number
    resultsCalendar: boolean
}

// Server-only: holds the Telegram bot token, so it is never sent to the browser as-is.
export interface AutomationDoc {
    userId: string
    telegram?: { botToken?: string; botUsername?: string; chatId?: number | null; linkCode?: string } | null
    lastRunDate?: string | null
    lastRunAt?: string | null
    lastSummary?: string | null
    lastError?: string | null
    recentMessages?: { at: string; text: string }[]
}

export async function getAutomation(userId: string): Promise<AutomationDoc | null> {
    const doc = await db.collection("automation").doc(userId).get();
    return doc.exists ? (doc.data() as AutomationDoc) : null;
}

export async function saveAutomation(userId: string, data: Partial<Omit<AutomationDoc, 'userId'>>): Promise<void> {
    await db.collection("automation").doc(userId).set({ ...data, userId }, { merge: true });
}

export async function saveScan(scan: ScanResult): Promise<void> {
    await db.collection("scans").doc(scan.date).set(scan);
}

export async function getScan(date: string): Promise<ScanResult | null> {
    const doc = await db.collection("scans").doc(date).get();
    return doc.exists ? (doc.data() as ScanResult) : null;
}

export async function getLatestScan(): Promise<ScanResult | null> {
    const snapshot = await db.collection("scans").orderBy("date", "desc").limit(1).get();
    return snapshot.empty ? null : (snapshot.docs[0].data() as ScanResult);
}
