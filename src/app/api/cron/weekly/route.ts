import { NextResponse } from "next/server";
import { automationUsers, runWeekly } from "@/features/automation/lib/pipeline";
import { cronAllowed } from "@/features/automation/lib/cronAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Saturday morning: weekly review, MB bases watchlist and the monthly-close reminder.
export async function GET(request: Request) {
    if (!cronAllowed(request, { days: [6], fromMinutesIst: 7 * 60 })) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const users = automationUsers();
    if (users.length === 0) return NextResponse.json({ skipped: "AUTOMATION_EMAILS is not set" });
    const report = await runWeekly(users);
    return NextResponse.json({ date: report.date, users: report.users.map(u => ({ userId: u.userId, sent: u.sent, error: u.error })) });
}
