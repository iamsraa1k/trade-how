import { sql } from '@vercel/postgres';

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
    emotions: string;
    attachment?: string;
}

// Helper to map DB row to Trade object
function mapRowToTrade(row: any): Trade {
    return {
        id: row.id,
        userId: row.user_id,
        date: row.date,
        time: row.time,
        symbol: row.symbol,
        type: row.type,
        entryPrice: Number(row.entry_price),
        exitPrice: Number(row.exit_price),
        quantity: Number(row.quantity),
        fees: Number(row.fees),
        pnl: Number(row.pnl),
        analysis: row.analysis,
        emotions: row.emotions,
        attachment: row.attachment || undefined,
    };
}

export async function getTrades(userId: string): Promise<Trade[]> {
    try {
        const { rows } = await sql`
            SELECT * FROM trades 
            WHERE user_id = ${userId} 
            ORDER BY created_at DESC;
        `;
        return rows.map(mapRowToTrade);
    } catch (error) {
        console.error('Database Error:', error);
        // Fallback for when table doesn't exist yet
        return [];
    }
}

export async function saveTrade(trade: Omit<Trade, 'id' | 'userId'>, userId: string): Promise<Trade> {
    const { rows } = await sql`
        INSERT INTO trades (
            user_id, date, time, symbol, type, 
            entry_price, exit_price, quantity, fees, pnl, 
            analysis, emotions, attachment
        ) VALUES (
            ${userId}, ${trade.date}, ${trade.time}, ${trade.symbol}, ${trade.type},
            ${trade.entryPrice}, ${trade.exitPrice}, ${trade.quantity}, ${trade.fees}, ${trade.pnl},
            ${trade.analysis}, ${trade.emotions}, ${trade.attachment}
        )
        RETURNING *;
    `;
    return mapRowToTrade(rows[0]);
}

export async function deleteTrade(id: string, userId: string): Promise<void> {
    await sql`
        DELETE FROM trades 
        WHERE id = ${id} AND user_id = ${userId};
    `;
}

export async function updateTrade(id: string, updatedData: Partial<Trade>, userId: string): Promise<Trade | null> {
    // Dynamic query construction is tricky with tagged templates, 
    // so we'll just do a full update for now or specific fields if manageable.
    // Given the structure, a full update is safer given we get most data from form.
    // However, the action passes 'rawTrade' which is almost complete.

    // We can't easily do dynamic SET with sql template tag directly without helpers.
    // Let's assume updatedData has all fields for now as per actions.ts usage, 
    // or fetch existing first.

    // BUT, actions.ts passes a full object (except ID and UserID) in 'rawTrade'. 
    // So we can just update all fields.

    // Correction: updatedData in actions.ts is "rawTrade" which has everything except ID/UserID.
    // So we can update all columns.

    const { rows } = await sql`
        UPDATE trades SET
            date = ${updatedData.date},
            time = ${updatedData.time},
            symbol = ${updatedData.symbol},
            type = ${updatedData.type},
            entry_price = ${updatedData.entryPrice},
            exit_price = ${updatedData.exitPrice},
            quantity = ${updatedData.quantity},
            fees = ${updatedData.fees},
            pnl = ${updatedData.pnl},
            analysis = ${updatedData.analysis},
            emotions = ${updatedData.emotions},
            attachment = ${updatedData.attachment}
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING *;
    `;

    return rows.length > 0 ? mapRowToTrade(rows[0]) : null;
}
