import { useEffect, useState } from "react";
import type { MonitorChange } from "../shared/desktop";

interface Session {
  root: string;
  phase: "idle" | "starting" | "active" | "stopping" | "stopped" | "error";
  total: number;
  entries: MonitorChange[];
  error?: string;
}

const empty = (root: string): Session => ({ root, phase: "idle", total: 0, entries: [] });

export function useMonitor(root: string) {
  const [session, setSession] = useState(() => empty(root));
  useEffect(() => {
    setSession(empty(root));
    return window.volaris.onMonitorEvent(event => {
      if (event.root !== root) return;
      setSession(previous => {
        if (previous.root !== root) return previous;
        if (event.type === "changes") {
          if (previous.phase !== "active") return previous;
          return { ...previous, total: previous.total + event.count,
            entries: [...event.entries].sort((a, b) => b.time - a.time).concat(previous.entries).slice(0, 100) };
        }
        if (event.type === "error") return { ...previous, phase: "error", error: event.message };
        return { ...previous, phase: event.type === "ready" ? "active" : "stopped" };
      });
    });
  }, [root]);

  async function toggle() {
    const enabled = session.phase !== "active";
    setSession(previous => enabled ? { ...empty(root), phase: "starting" } : { ...previous, phase: "stopping" });
    try {
      await window.volaris.setMonitoring(root, enabled);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSession(previous => previous.root === root ? { ...previous, phase: "error", error: message } : previous);
    }
  }
  return { session: session.root === root ? session : empty(root), toggle };
}
