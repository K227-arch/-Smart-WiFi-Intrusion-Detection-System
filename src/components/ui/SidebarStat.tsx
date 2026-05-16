import { motion } from "motion/react";
import { cn } from "../../lib/utils";

interface SidebarStatProps {
  label: string;
  value: string;
  progress: number;
  color?: string;
}

export function SidebarStat({ label, value, progress, color = "bg-sky-500" }: SidebarStatProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">
          {label}
        </span>
        <span className="text-xs font-mono text-white leading-none">{value}</span>
      </div>
      <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(progress, 100)}%` }}
          transition={{ duration: 1 }}
          className={cn("h-full", color)}
        />
      </div>
    </div>
  );
}
