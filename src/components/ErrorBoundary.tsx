import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Class component is required for React error boundaries (no hook equivalent exists)
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SALAMANDA ErrorBoundary caught:", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      const { fallbackLabel = "Component Error" } = this.props;
      const message = this.state.error?.message ?? "An unexpected error occurred.";
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <div className="w-12 h-12 bg-rose-500/10 rounded-full flex items-center justify-center ring-1 ring-rose-500/20">
            <AlertTriangle className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              {fallbackLabel}
            </p>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">{message}</p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs font-bold text-slate-300 transition-colors"
          >
            <RefreshCcw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
