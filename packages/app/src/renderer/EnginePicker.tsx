import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { ScanEngine } from "../shared/desktop";

const engines = [
  { value: "auto", label: "自动引擎" },
  { value: "workers", label: "Worker 引擎" },
  { value: "native", label: "NTFS 引擎" },
] as const;

interface Props {
  value: ScanEngine;
  disabled: boolean;
  onChange: (value: ScanEngine) => void;
  className: string;
}

export function EnginePicker({ value, disabled, onChange, className }: Props) {
  const listId = useId();
  const container = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const selected = engines.findIndex((item) => item.value === value);
  const open = active !== null && !disabled;

  useEffect(() => {
    if (!open) return;
    const close = () => setActive(null);
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", outside);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("blur", close);
    };
  }, [open]);

  function choose(index: number) {
    onChange(engines[index].value);
    setActive(null);
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive(active === null ? selected : Math.max(0, Math.min(engines.length - 1, active + step)));
        break;
      }
      case "Home": setActive(0); break;
      case "End": setActive(engines.length - 1); break;
      case "Enter":
      case " ":
        if (active === null) setActive(selected);
        else choose(active);
        break;
      case "Escape":
        if (!open) return;
        setActive(null);
        event.stopPropagation();
        break;
      case "Tab":
        if (active !== null) choose(active);
        return;
      default:
        return;
    }
    event.preventDefault();
  }

  return <div className="relative" ref={container}>
    <button type="button" role="combobox" aria-label="扫描引擎" aria-expanded={open}
      aria-haspopup="listbox" aria-controls={open ? listId : undefined}
      aria-activedescendant={open ? listId + "-" + active : undefined}
      disabled={disabled} className={className + " min-w-32 justify-between"}
      onClick={() => setActive(open ? null : selected)} onBlur={() => setActive(null)} onKeyDown={navigate}>
      {engines[selected].label}
      <ChevronDown aria-hidden size={15} className={"shrink-0 text-muted transition-transform motion-reduce:transition-none " + (open ? "rotate-180" : "")}/>
    </button>
    {open && <ul id={listId} role="listbox" aria-label="扫描引擎"
      className="absolute top-full right-0 z-30 mt-1.5 w-44 rounded-xl border border-edge bg-white p-1.5 shadow-lg shadow-slate-900/10">
      {engines.map((item, index) => <li key={item.value} id={listId + "-" + index} role="option"
        aria-selected={index === selected}
        className={"flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 text-sm " +
          (index === active ? "bg-indigo-50 " : "") + (index === selected ? "font-semibold text-accent" : "text-ink")}
        onPointerMove={() => setActive(index)} onPointerDown={(event) => event.preventDefault()}
        onClick={() => choose(index)}>
        {item.label}{index === selected && <Check size={16} strokeWidth={2.5} aria-hidden/>}
      </li>)}
    </ul>}
  </div>;
}
