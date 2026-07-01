import { cn } from "../../lib/utils";

interface DetailItemProps {
  label: string;
  value: string;
  color?: string;
}

export function DetailItem({ label, value, color = "text-slate-200" }: DetailItemProps) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest">
        {label}
      </div>
      <div className={cn("text-[11px] font-mono break-all", color)}>{value}</div>
    </div>
  );
}
