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

export async function deleteTrade(id: string, userId: string): Promise<void> {
    await db.collection("trades").doc(id).delete();
}

export async function updateTrade(id: string, updatedData: Partial<Trade>, userId: string): Promise<Trade | null> {
    const tradeRef = db.collection("trades").doc(id);
    await tradeRef.update(updatedData);
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
    await db.collection("rules").doc(id).delete();
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
