import { cn } from "../../lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  color: string;
  trend: string;
  trendColor: string;
}

export function KpiCard({ label, value, color, trend, trendColor }: KpiCardProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
      <div className="text-slate-500 text-[9px] uppercase font-bold tracking-wider mb-1">
        {label}
      </div>
      <div className={cn("text-xl md:text-2xl font-bold tracking-tight", color)}>
        {value}
      </div>
      <div className={cn("text-[8px] md:text-[9px] mt-2 font-mono uppercase font-bold truncate", trendColor)}>
        {trend}
      </div>
    </div>
  );
}
