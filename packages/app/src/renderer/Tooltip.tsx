import { useEffect, useState } from "react";

// One tooltip also serves the dynamically hit-tested regions inside the treemap.
export function Tooltip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; above: boolean } | null>(null);
  useEffect(() => {
    let element: Element | null = null;
    let text = "";
    let timer: number | undefined;
    function hide() {
      window.clearTimeout(timer);
      element = null;
      text = "";
      setTip(null);
    }
    function show(event: MouseEvent | FocusEvent) {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-tip]") : null;
      const label = target?.dataset.tip ?? "";
      if (element === target && text === label) return;
      hide();
      if (!target || !label) return;
      element = target;
      text = label;
      const rect = target.getBoundingClientRect();
      const x = event instanceof MouseEvent ? event.clientX : rect.left;
      const y = event instanceof MouseEvent ? event.clientY : rect.bottom;
      timer = window.setTimeout(() => {
        if (target.isConnected) setTip({ text: label, x: Math.max(8, Math.min(x, innerWidth - 328)), y, above: y > innerHeight / 2 });
      }, 400);
    }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") hide(); }
    document.addEventListener("mousemove", show);
    document.addEventListener("focusin", show);
    document.addEventListener("focusout", hide);
    document.addEventListener("mouseleave", hide);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousemove", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("mouseleave", hide);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("blur", hide);
    };
  }, []);
  return tip && <div role="tooltip" style={{ left: tip.x, top: tip.y }}
    className={"pointer-events-none fixed z-50 max-w-80 rounded-md bg-ink px-2.5 py-1.5 text-xs leading-relaxed break-all text-white shadow-md " +
      (tip.above ? "-translate-y-[calc(100%+8px)]" : "translate-y-4")}>{tip.text}</div>;
}
