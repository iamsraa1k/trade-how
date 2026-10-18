import { istNow } from "./marketData"

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that env var is set; then nothing else may call the job.
 * Without a secret, the job only runs in its own time window. The runs are idempotent, so an extra call in that
 * window can't do anything the schedule wouldn't.
 */
export function cronAllowed(request: Request, window: { days: number[]; fromMinutesIst: number }): boolean {
    const secret = process.env.CRON_SECRET
    if (secret) return request.headers.get("authorization") === `Bearer ${secret}`
    const ist = istNow()
    return window.days.includes(ist.getUTCDay()) && ist.getUTCHours() * 60 + ist.getUTCMinutes() >= window.fromMinutesIst
}
