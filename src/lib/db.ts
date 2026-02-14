import fs from 'fs/promises';
import path from 'path';

export interface Trade {
    id: string;
    userId: string; // [NEW] Link trade to user
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
    emotions: string;
    attachment?: string;
}

const DB_PATH = path.join(process.cwd(), 'trades.json');

// Helper to read all trades (internal use)
async function readDb(): Promise<Trade[]> {
    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

// Get trades filtered by User ID
export async function getTrades(userId: string): Promise<Trade[]> {
    const allTrades = await readDb();
    return allTrades.filter(t => t.userId === userId);
}

// Save trade linked to User ID
export async function saveTrade(trade: Omit<Trade, 'id' | 'userId'>, userId: string): Promise<Trade> {
    const trades = await readDb();
    const newTrade: Trade = {
        ...trade,
        id: crypto.randomUUID(),
        userId: userId,
    };

    trades.push(newTrade);
    await fs.writeFile(DB_PATH, JSON.stringify(trades, null, 2));
    return newTrade;
}

export async function deleteTrade(id: string, userId: string): Promise<void> {
    let trades = await readDb();
    // Only delete if it belongs to the user
    trades = trades.filter(t => t.id !== id || t.userId !== userId);
    await fs.writeFile(DB_PATH, JSON.stringify(trades, null, 2));
}

export async function updateTrade(id: string, updatedData: Partial<Trade>, userId: string): Promise<Trade | null> {
    let trades = await readDb();
    const index = trades.findIndex(t => t.id === id && t.userId === userId);

    if (index === -1) return null; // Not found or not owned by user

    trades[index] = { ...trades[index], ...updatedData };
    await fs.writeFile(DB_PATH, JSON.stringify(trades, null, 2));
    return trades[index];
}
