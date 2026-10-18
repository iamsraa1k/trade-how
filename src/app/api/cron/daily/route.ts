import { NextResponse } from "next/server";
import { activeConstitutionUsers, runDaily } from "@/features/automation/lib/pipeline";
import { cronAllowed } from "@/features/automation/lib/cronAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Weekday evening job: scan the Nifty 200, advance paper trades, check open positions, send each digest.
export async function GET(request: Request) {
    if (!cronAllowed(request, { days: [1, 2, 3, 4, 5], fromMinutesIst: 18 * 60 })) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const users = await activeConstitutionUsers();
    if (users.length === 0) return NextResponse.json({ skipped: "No account in CONSTITUTION_EMAILS has constitution mode on" });
    try {
        const report = await runDaily(users);
        return NextResponse.json({ ...report, users: report.users.map(u => ({ userId: u.userId, skipped: u.skipped, sent: u.sent, error: u.error })) });
    } catch (error) {
        console.error("Daily automation failed", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Daily run failed" }, { status: 500 });
    }
}
