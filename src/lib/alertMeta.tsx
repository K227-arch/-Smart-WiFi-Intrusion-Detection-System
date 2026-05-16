import { AlertTriangle, Fingerprint, Radio, Zap } from "lucide-react";
import type { Alert, AlertTypeMeta } from "../types";

export const ALERT_TYPE_META: Record<Alert["type"], AlertTypeMeta> = {
  ROGUE_AP: {
    label: "Rogue Access Point",
    icon: <Radio className="w-3.5 h-3.5" />,
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
  },
  DEAUTH_ATTACK: {
    label: "Deauth Flood Attack",
    icon: <Zap className="w-3.5 h-3.5" />,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
  },
  MAC_SPOOFING: {
    label: "MAC Spoofing",
    icon: <Fingerprint className="w-3.5 h-3.5" />,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
  },
  UNAUTHORIZED_DEVICE: {
    label: "Unauthorized Device",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
};
