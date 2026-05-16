import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function NavButton({ active, onClick, children }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-all focus:outline-none",
        active
          ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
          : "text-slate-400 hover:bg-slate-800"
      )}
    >
      {children}
    </button>
  );
}
