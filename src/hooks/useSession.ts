/**
 * useSession — multi-user session tracking
 *
 * Registers the current user's session with the server on mount,
 * sends heartbeats every 30s to stay "online", and listens for
 * other users joining/leaving via SSE so the UI can show who else
 * is currently viewing the dashboard on the same network.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface ActiveUser {
  userId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  ip?: string;
  subnet?: string;
  lastSeenAt?: number;
}

interface UseSessionOptions {
  userId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export function useSession({ userId, email, name, avatarUrl }: UseSessionOptions) {
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const sessionIdRef = useRef<string | null>(null);

  // ── Register session on mount ─────────────────────────────────────────────
  const register = useCallback(async () => {
    try {
      const res = await fetch("/api/session/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email, name, avatarUrl }),
      });
      const data = await res.json();
      sessionIdRef.current = data.sessionId ?? null;
    } catch { /* server may not be reachable */ }
  }, [userId, email, name, avatarUrl]);

  // ── Fetch current active users ────────────────────────────────────────────
  const fetchActiveUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions/active");
      const data: any[] = await res.json();
      setActiveUsers(
        data
          .filter((s) => s.user_id !== userId) // exclude self
          .map((s) => ({
            userId: s.user_id,
            email: s.email,
            name: s.name ?? undefined,
            avatarUrl: s.avatar_url ?? undefined,
            ip: s.ip_address ?? undefined,
            subnet: s.subnet ?? undefined,
            lastSeenAt: s.last_seen_at ?? undefined,
          }))
      );
    } catch { /* ignore */ }
  }, [userId]);

  useEffect(() => {
    register();
    fetchActiveUsers();

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      if (!sessionIdRef.current) return;
      fetch("/api/session/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      }).catch(() => {});
    }, 30_000);

    // Refresh active users every 30s
    const refresh = setInterval(fetchActiveUsers, 30_000);

    // Listen for real-time session join/leave events via SSE
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/stream");
      es.addEventListener("session", (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "session_join" && payload.userId !== userId) {
            setActiveUsers((prev) => {
              const exists = prev.some((u) => u.userId === payload.userId);
              const updated: ActiveUser = {
                userId: payload.userId,
                email: payload.email,
                name: payload.name,
                ip: payload.ip,
                subnet: payload.subnet,
                lastSeenAt: Date.now(),
              };
              return exists
                ? prev.map((u) => u.userId === payload.userId ? updated : u)
                : [...prev, updated];
            });
          } else if (payload.type === "session_leave") {
            setActiveUsers((prev) => prev.filter((u) => u.userId !== payload.userId));
          }
        } catch { /* malformed */ }
      });
    } catch { /* SSE not available */ }

    // On page unload, mark session as inactive
    const handleUnload = () => {
      if (!sessionIdRef.current) return;
      navigator.sendBeacon(
        "/api/session/leave",
        JSON.stringify({ sessionId: sessionIdRef.current, userId, email })
      );
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(heartbeat);
      clearInterval(refresh);
      es?.close();
      window.removeEventListener("beforeunload", handleUnload);
      // Graceful leave on component unmount
      if (sessionIdRef.current) {
        fetch("/api/session/leave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionIdRef.current, userId, email }),
        }).catch(() => {});
      }
    };
  }, [register, fetchActiveUsers, userId, email]);

  return { activeUsers };
}
