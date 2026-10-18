// The Trading Constitution (v2 — ₹1 Lakh Restart Plan) as data the app can enforce.
// Wording follows the printed document so the app and the paper copy never disagree.

export const SETUP_ID = "momentum_breakout" as const
export const SETUP_NAME = "Momentum Breakout"

export const STARTING_EQUITY = 100000
export const BASE_RISK_PCT = 1
export const REDUCED_RISK_PCT = 0.5
export const POSITION_CAP_PCT = 20
export const MAX_OPEN_POSITIONS = 4
export const MAX_PER_SECTOR = 2
export const MAX_ENTRIES_PER_WEEK = 3
export const MONTHLY_LOSS_LIMIT_PCT = 5
export const DRAWDOWN_REDUCE_PCT = 10
export const DRAWDOWN_RECOVER_PCT = 5
export const DRAWDOWN_STOP_PCT = 15
export const MIN_STOP_PCT = 3
export const MAX_STOP_PCT = 8
export const RESULTS_BUFFER_TRADING_DAYS = 10
export const TIME_STOP_TRADING_DAYS = 15
export const MIN_VOLUME_RATIO = 1.5

export const TEN_RULES = [
    "One setup: Momentum Breakout. Nifty 200 stocks, delivery (CNC) only.",
    "New buys only when the market light is green.",
    "Risk 1% of equity per trade; no position above 20%.",
    "At most 4 open trades, 2 per sector, and 3 new entries a week.",
    "Stop = the breakout day's low − 0.5%, 3–8% below entry. Wider = skip.",
    "Buy only through a GTT above the breakout day's high, never on impulse during market hours.",
    "The stop GTT (market order) goes in the day of the fill. Never moved down, never deleted.",
    "Exits come only from the stop, breakeven, the 20-EMA trail, the time stop or the results rule.",
    "No F&O, no MTF, no intraday, and no money added during market hours.",
    "A breach gets its consequence today.",
]

export type ChecklistId = "light" | "strong" | "breakout" | "size" | "limits" | "stopGtt" | "exit" | "journal"

export const CHECKLIST: { id: ChecklistId; label: string; short: string; minor?: boolean; needsExit?: boolean }[] = [
    { id: "light", label: "The market light was green.", short: "Light green" },
    { id: "strong", label: "All four strong-stock conditions were met.", short: "Strong stock" },
    { id: "breakout", label: "The base was quiet and the breakout passed all three tests.", short: "Base & breakout" },
    { id: "size", label: "Stop 3–8% below entry; size from the sheet; risk ≤ 1%, position ≤ 20%.", short: "Stop & size" },
    { id: "limits", label: "No results within 10 trading days; position, sector and weekly limits respected.", short: "Results & limits" },
    { id: "stopGtt", label: "The stop GTT went in the day of the fill, as a market order.", short: "Stop GTT same day" },
    { id: "exit", label: "The exit came only from a written exit rule.", short: "Rule-based exit", minor: true, needsExit: true },
    { id: "journal", label: "Journaled the same evening.", short: "Journaled same evening", minor: true },
]

export const PLEDGE = (amount: string) => `I accept losing ₹${amount} on this trade, and tomorrow I'll trade exactly the same way.`

export const FIVE_CHECKS: { title: string; items: string[]; why?: string }[] = [
    {
        title: "Check 1 — The market light is green",
        items: ["Nifty 50 closed above its 200-day SMA today. If not, place no new buys; open trades keep following their own rules."],
        why: "Most breakouts fail when the whole market is falling.",
    },
    {
        title: "Check 2 — The stock is already strong",
        items: [
            "It's in the Nifty 200 (large and liquid, so orders fill cleanly).",
            "The close is above the 50-day SMA, and the 50-day SMA is above the 200-day SMA.",
            "The 200-day SMA is higher than it was 20 trading days ago.",
            "The close is within 25% of the 52-week high.",
        ],
        why: "You only want stocks that big buyers are already accumulating.",
    },
    {
        title: "Check 3 — It rested in a quiet base",
        items: ["Over the 20 trading days before today, the lowest low is no more than 15% below the highest high — a flat, narrow channel lasting 3–8 weeks, not a V-shape or a spike."],
        why: "A quiet range means sellers have dried up.",
    },
    {
        title: "Check 4 — Today was a real breakout",
        items: [
            "The close is above the highest high of the previous 20 trading days.",
            "Volume is at least 1.5× its 50-day average.",
            "The close is in the upper half of the day's range.",
        ],
    },
    {
        title: "Check 5 — The risk fits",
        items: [
            "Stop = the breakout day's low, minus 0.5%. It must be 3–8% below the GTT limit price (under 3%: lower it to exactly 3%; over 8%: skip).",
            "No quarterly results due in the next 10 trading days.",
            "Fewer than 4 open positions, fewer than 2 in the same sector, and fewer than 3 new entries this week.",
        ],
    },
]

export const ENTRY_RULES = [
    "Trigger = the breakout day's high + 0.1%. Limit = the trigger + 1%. Quantity from the sizing sheet.",
    "If the stock opens more than 1% above the trigger, the order won't fill — that's fine.",
    "If the GTT hasn't triggered within 3 trading days, delete it.",
    "As soon as the fill arrives, and no later than that evening, place a GTT sell at the stop, as a market order, for the full quantity.",
]

export const MANAGEMENT_RULES = [
    "The stop never moves down.",
    "Breakeven: after a daily close at or above entry + 1.5R, move the stop GTT up to your entry price.",
    "Trail: after a daily close at or above entry + 2R, exit on the first daily close below the 20-day EMA (market AMO sell that evening).",
    "Time stop: if 15 trading days pass without a close above entry + 1R, sell at the next open.",
    "Results: exit at the open of the trading day before the results date. If the open profit is 2R or more, sell half and keep the stop at breakeven on the rest.",
    "Market light turns red: no new buys; open trades keep their stops and exits.",
]

export const LOSS_LIMITS: { limit: string; size: string; consequence: string }[] = [
    { limit: "Per trade", size: "1% of equity, planned", consequence: "Stop GTT placed the day of the fill" },
    { limit: "Per position", size: "20% of equity", consequence: "The sizing sheet caps it" },
    { limit: "Open trades", size: "4, at most 2 per sector", consequence: "No new GTT buys while full" },
    { limit: "New entries", size: "3 per week", consequence: "Extra signals go in the log, not the market" },
    { limit: "Per month", size: "−5% realised", consequence: "No new entries until next month; open trades keep their stops" },
    { limit: "From equity peak", size: "−10%", consequence: "Risk per trade drops to 0.5% until the drawdown is back under 5%" },
    { limit: "From equity peak", size: "−15%", consequence: "Live trading stops; paper only; back to Phase 0 and check the Kill criteria" },
]

export const NEVER = [
    "Averaging down, or adding to a losing position.",
    "Moving a stop lower, or deleting it \"because the stock needs room\".",
    "MTF, intraday (MIS), F&O, or any borrowed money.",
    "Buying during market hours on a tip, a headline or a feeling.",
]

export type BreachLevel = 1 | 2 | 3 | 4

export const LADDER: { level: BreachLevel; title: string; consequence: string; breaches: { code: string; label: string }[] }[] = [
    {
        level: 1,
        title: "Process slip",
        consequence: "Logged. Three in a month count as one Level 2.",
        breaches: [
            { code: "journal_late", label: "Journal written late" },
            { code: "routine_skipped", label: "Evening routine skipped" },
            { code: "stop_late", label: "Stop GTT placed later than you could have (before price reached it)" },
        ],
    },
    {
        level: 2,
        title: "A trade outside the setup",
        consequence: "No new entries for 5 trading days, then 5 paper trades with the full routine.",
        breaches: [
            { code: "no_signal", label: "No scan signal" },
            { code: "red_light", label: "Bought on a red market light" },
            { code: "results_window", label: "Results within 10 trading days" },
            { code: "weekly_limit", label: "Weekly entry limit exceeded" },
            { code: "position_limit", label: "Open-position or sector limit exceeded" },
            { code: "stop_too_wide", label: "Stop wider than 8% (should have been skipped)" },
            { code: "market_hours_buy", label: "Buy placed during market hours" },
        ],
    },
    {
        level: 3,
        title: "Size, stop or capital breach",
        consequence: "No new entries for the rest of the month. Return needs 10 compliant paper trades, then 20 live trades at 0.5% risk.",
        breaches: [
            { code: "risk_over", label: "Risk above 1%" },
            { code: "position_over", label: "Position above 20%" },
            { code: "no_stop", label: "No stop GTT by the evening of the fill" },
            { code: "stop_lowered", label: "Lowered or deleted a stop" },
            { code: "averaged_down", label: "Averaged down" },
            { code: "leverage", label: "Used MTF or MIS" },
            { code: "fno_enabled", label: "Re-enabled F&O" },
            { code: "money_added", label: "Added money during market hours" },
        ],
    },
    {
        level: 4,
        title: "Repeat or F&O",
        consequence: "Back to Phase 0 for three months, and a written answer to the Kill criteria.",
        breaches: [
            { code: "fno_trade", label: "Any F&O trade" },
            { code: "two_level3", label: "Two Level 3s within 90 days" },
        ],
    },
]

// Synthetic codes the engine creates when lower-level breaches escalate.
export const ESCALATION_LABELS: Record<string, string> = {
    three_level1: "Three Level 1 slips in one month",
    two_level3: "Two Level 3s within 90 days",
}

export function breachLabel(code: string): string {
    for (const step of LADDER) {
        const match = step.breaches.find(b => b.code === code)
        if (match) return match.label
    }
    return ESCALATION_LABELS[code] || code
}

export const EXIT_REASONS: { value: "stop" | "breakeven" | "trail" | "time" | "results" | "other"; label: string }[] = [
    { value: "stop", label: "Stop hit" },
    { value: "breakeven", label: "Breakeven stop" },
    { value: "trail", label: "20-EMA trail" },
    { value: "time", label: "Time stop (15 days)" },
    { value: "results", label: "Results rule" },
    { value: "other", label: "Other (not a written rule)" },
]

// NSE industry names, as in the Nifty 200 list, so typed and auto-filled sectors match for the 2-per-sector limit.
export const SECTORS = [
    "Automobile and Auto Components",
    "Capital Goods",
    "Chemicals",
    "Construction",
    "Construction Materials",
    "Consumer Durables",
    "Consumer Services",
    "Fast Moving Consumer Goods",
    "Financial Services",
    "Healthcare",
    "Information Technology",
    "Metals & Mining",
    "Oil Gas & Consumable Fuels",
    "Power",
    "Realty",
    "Services",
    "Telecommunication",
    "Textiles",
]

export const PHASES: { phase: 0 | 1 | 2 | 3 | 4; name: string; span: string; points: string[]; gate?: { name: string; text: string } }[] = [
    {
        phase: 0, name: "Build and validate", span: "Now to break month 9",
        points: ["Scan, chart template, sizing sheet, backtest, 20 paper trades", "No live trades; repayments and SIPs on schedule"],
        gate: { name: "Gate A", text: "Backtest passes, paper passes, re-entry conditions met" },
    },
    {
        phase: 1, name: "Prove compliance", span: "Live trades 1 to 50",
        points: ["Trades 1–20 at 0.5% risk, then 1%; at most 4 positions", "Success = zero Level 3 breaches, not profit"],
        gate: { name: "Gate B", text: "50 trades, 95%+ adherence, expectancy at least zero after costs" },
    },
    {
        phase: 2, name: "Prove edge", span: "Live trades 51 to 150",
        points: ["Risk stays 1%; position size grows with equity", "Add surplus income monthly; never to recover a loss"],
        gate: { name: "Gate C", text: "Expectancy at least +0.2R over 100 trades, in line with the backtest" },
    },
    {
        phase: 3, name: "Systematize", span: "Year 2",
        points: ["Automate the scan, sizing and GTTs through Kite Connect", "Research a second strategy: defined-risk options at ₹3 lakh+"],
        gate: { name: "Gate D", text: "Second setup passes its own backtest and 20 paper trades" },
    },
    {
        phase: 4, name: "Scale", span: "Years 3 to 5",
        points: ["Two or three strategies, ₹5–10 lakh, 15–25% a year target", "Drawdown under 15%; full-time only by the two-year test"],
    },
]

export const BACKTEST_CRITERIA: { key: "expectancy" | "profitFactor" | "totalTrades" | "heldOutTrades" | "maxDrawdown" | "avgLoserR" | "consistencyPct" | "robustnessPF"; label: string; unit: string; pass: number; strict: number; direction: "min" | "max" }[] = [
    { key: "expectancy", label: "Expectancy (R per trade)", unit: "R", pass: 0.2, strict: 0.3, direction: "min" },
    { key: "profitFactor", label: "Profit factor", unit: "", pass: 1.4, strict: 1.6, direction: "min" },
    { key: "totalTrades", label: "Total trades", unit: "", pass: 200, strict: 200, direction: "min" },
    { key: "heldOutTrades", label: "Trades in held-out years", unit: "", pass: 60, strict: 60, direction: "min" },
    { key: "maxDrawdown", label: "Max drawdown", unit: "%", pass: 20, strict: 20, direction: "max" },
    { key: "avgLoserR", label: "Average loser (gap check)", unit: "R", pass: 1.25, strict: 1.25, direction: "max" },
    { key: "consistencyPct", label: "Calendar years profitable", unit: "%", pass: 60, strict: 60, direction: "min" },
    { key: "robustnessPF", label: "Profit factor, slippage doubled", unit: "", pass: 1.2, strict: 1.3, direction: "min" },
]

export const PAPER_MANUAL_CHECKS = [
    { key: "paper_signals_taken", label: "At least 90% of valid signals actually taken" },
    { key: "paper_in_range", label: "Results inside the backtest's range" },
]

export const REENTRY_CHECKS = [
    { key: "reentry_backtest", label: "Backtest passed and its report saved" },
    { key: "reentry_paper", label: "Paper stage passed" },
    { key: "reentry_loans", label: "Loan repayments fully on schedule since the break began" },
    { key: "reentry_broker", label: "F&O switched off, DDPI active, Kite notifications tested" },
    { key: "reentry_mechanics", label: "Order mechanics tested once with a single share: GTT buy, GTT stop, AMO exit" },
]

export const GOALS_90_DAYS = [
    { key: "goal_broker", label: "F&O switched off, DDPI submitted, Kite notifications on" },
    { key: "goal_charts", label: "Kite chart template and both Chartink scans built" },
    { key: "goal_sheet", label: "Sizing sheet built and checked against Cases A–C" },
    { key: "goal_backtest", label: "Momentum Breakout backtest run with costs and gaps; pass/fail report written" },
    { key: "goal_tradehow", label: "TradeHow fields, checklist, consequence ladder and impulse log set up" },
    { key: "goal_zero_live", label: "Zero live trades. Repayments and SIPs on schedule" },
]

export const KILL_CRITERIA = [
    "The setup fails its backtest twice (Stage 1).",
    "After 100 live trades, expectancy after costs is zero or negative.",
    "You trigger a Level 4 reset a second time.",
    "Any trading rupee comes from outside surplus income — a loan, the emergency fund, an SIP redemption — even once.",
    "Repayments slip, or trading measurably costs you at work.",
]

export const ROUTINE_STEPS: { id: string; title: string; detail: string }[] = [
    { id: "light", title: "Market light", detail: "Open the Nifty 50 chart. A close above the red 200 SMA means green. Note it." },
    { id: "open", title: "Open trades first", detail: "Compare today's close with each holding's breakeven, trail and time-stop levels below. Act through GTT edits or AMO sells." },
    { id: "orders", title: "Old buy orders", detail: "In Orders → GTT, delete any buy GTT that has gone 3 trading days without triggering." },
    { id: "scan", title: "Run the scan", detail: "Chartink → MB breakout → Run scan. Most evenings it returns zero to five stocks." },
    { id: "check", title: "Check each result", detail: "Flat, narrow base; results more than 10 trading days away; sector and weekly limits not full; light green." },
    { id: "size", title: "Size it", detail: "Type the breakout day's high and low into the sizing calculator. Shares = 0 means skip." },
    { id: "gtt", title: "Place the GTT buy", detail: "Create GTT → Single → Buy → trigger and limit from the sheet → product CNC → quantity from the sheet." },
    { id: "journal", title: "Journal the plan", detail: "Log it as an open trade: trigger, limit, stop, shares, results date." },
]

export const WEEKLY_REVIEW_ITEMS = [
    "Compare each number with the backtest's expected range. Four weeks outside it = investigate before placing new trades.",
    "Run MB bases and refresh the watchlist.",
    "Rule changes only at a phase boundary — never mid-week, never after a loss.",
]
