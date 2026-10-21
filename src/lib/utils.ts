import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// The day a trade's profit or loss counts: the sell date for swing trades, otherwise the trade date.
export function pnlDate(t: { date: string; exitDate?: string | null }): string {
  return t.exitDate || t.date
}
