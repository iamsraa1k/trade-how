// Minimal Telegram Bot API client. The bot token stays on the server; the browser only ever sees whether it's linked.

async function call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
    })
    const data = await res.json().catch(() => null)
    if (!data?.ok) throw new Error(data?.description || `Telegram ${method} failed (${res.status})`)
    return data.result as T
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export async function getBotUsername(token: string): Promise<string> {
    const me = await call<{ username: string }>(token, "getMe")
    return me.username
}

/** Finds the chat that sent "/start <code>" to the bot. */
export async function findChatForCode(token: string, code: string): Promise<number | null> {
    const updates = await call<{ update_id: number; message?: { chat: { id: number }; text?: string } }[]>(token, "getUpdates", { allowed_updates: ["message"] })
    const match = [...updates].reverse().find(u => u.message?.text?.trim() === `/start ${code}`)
    return match?.message?.chat.id ?? null
}

/** Sends HTML text, split into Telegram-sized chunks on line boundaries. */
export async function sendMessage(token: string, chatId: number, html: string): Promise<void> {
    const chunks: string[] = []
    let current = ""
    for (const line of html.split("\n")) {
        if ((current + "\n" + line).length > 3900) {
            chunks.push(current)
            current = line
        } else {
            current = current ? `${current}\n${line}` : line
        }
    }
    if (current) chunks.push(current)
    for (const chunk of chunks) {
        await call(token, "sendMessage", { chat_id: chatId, text: chunk, parse_mode: "HTML", disable_web_page_preview: true })
    }
}
