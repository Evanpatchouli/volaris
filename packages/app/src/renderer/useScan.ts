import { useEffect, useRef, useState } from "react";
import type { ScanEngine, ScanEvent, ScanProgress, ScanReport } from "../shared/desktop";

type ScanState =
  | { phase: "idle" | "cancelled" }
  | { phase: "running"; progress?: ScanProgress }
  | { phase: "error"; message: string }
  | { phase: "complete"; report: ScanReport };

export function useScan() {
  const [root, setRoot] = useState("");
  const [engine, setEngine] = useState<ScanEngine>("auto");
  const [state, setState] = useState<ScanState>({ phase: "idle" });
  const [choosing, setChoosing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const locked = useRef(false);

  useEffect(() => window.volaris?.onScanEvent((event: ScanEvent) => {
    if (event.type === "progress") {
      setState({ phase: "running", progress: event });
      return;
    }
    locked.current = false;
    setCancelling(false);
    if (event.type === "complete") setState({ phase: "complete", report: event.report });
    if (event.type === "error") setState({ phase: "error", message: event.message });
    if (event.type === "cancelled") setState({ phase: "cancelled" });
  }), []);

  async function choose() {
    if (locked.current) return;
    locked.current = true;
    setChoosing(true);
    try {
      const folder = await window.volaris.chooseDirectory();
      if (folder && folder !== root) {
        setRoot(folder);
        setState({ phase: "idle" });
      }
    } catch (error) {
      setState({ phase: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      locked.current = false;
      setChoosing(false);
    }
  }

  async function start() {
    if (!root || locked.current) return;
    locked.current = true;
    setState({ phase: "running" });
    try {
      await window.volaris.startScan(root, engine);
    } catch (error) {
      locked.current = false;
      setState({ phase: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function cancel() {
    if (state.phase !== "running" || cancelling) return;
    setCancelling(true);
    try {
      await window.volaris.cancelScan();
    } catch (error) {
      locked.current = false;
      setCancelling(false);
      setState({ phase: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return { root, engine, setEngine, state, choosing, cancelling, choose, start, cancel };
}
