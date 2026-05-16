import { motion } from "motion/react";
import { cn } from "../../lib/utils";

interface TrafficStatBoxProps {
  label: string;
  value: string | number;
  color?: string;
}

export function TrafficStatBox({ label, value, color = "text-slate-200" }: TrafficStatBoxProps) {
  return (
    <div className="px-4 py-3 border-r border-slate-800 last:border-r-0 relative group overflow-hidden">
      <div className="text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-0.5">
        {label}
      </div>
      <motion.div
        key={String(value)}
        initial={{ opacity: 0.5, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn("text-sm font-mono font-bold tabular-nums", color)}
      >
        {value}
      </motion.div>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        key={`pulse-${value}`}
        transition={{ duration: 0.3 }}
        className={cn(
          "absolute bottom-0 left-0 right-0 h-[1px] origin-left opacity-20",
          color.replace("text-", "bg-")
        )}
      />
    </div>
  );
}
