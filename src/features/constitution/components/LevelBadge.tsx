import { cn } from "@/lib/utils"

const levelStyles: Record<number, string> = {
    1: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    2: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    3: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    4: "bg-red-600 text-white",
}

export function LevelBadge({ level }: { level: number }) {
    return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", levelStyles[level])}>Level {level}</span>
}
