import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import logo from "./assets/volaris.png";

const captionButton = "grid h-full w-12 cursor-pointer place-items-center text-muted hover:bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

export function AppBar() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let current = true;
    const unsubscribe = window.volaris.onMaximizedChange(value => {
      current = false;
      setMaximized(value);
    });
    void window.volaris.isWindowMaximized().then(value => { if (current) setMaximized(value); });
    return () => { current = false; unsubscribe(); };
  }, []);
  return <header className="flex h-14 shrink-0 select-none items-center border-b border-edge bg-white [-webkit-app-region:drag]">
    <div className="flex min-w-0 items-center gap-4 px-5 sm:px-7">
      <div className="flex items-center gap-2.5"><img src={logo} alt="" draggable={false} className="size-7"/>
        <span className="text-[24px] leading-none font-bold tracking-[-0.045em]">Volaris</span></div>
      <span aria-hidden className="h-5 w-px bg-slate-300"/>
      <span className="truncate text-sm font-medium tracking-wide text-muted">磁盘空间分析</span>
    </div>
    <div className="ml-auto flex h-full shrink-0 [-webkit-app-region:no-drag]">
      <button type="button" aria-label="最小化" data-tip="最小化" className={captionButton} onClick={() => void window.volaris.minimizeWindow()}><Minus size={16}/></button>
      <button type="button" aria-label={maximized ? "还原" : "最大化"} data-tip={maximized ? "还原" : "最大化"} className={captionButton} onClick={() => void window.volaris.toggleMaximize()}>
        {maximized ? <Copy size={14}/> : <Square size={14}/>}
      </button>
      <button type="button" aria-label="关闭到托盘" data-tip="关闭到托盘" className={captionButton + " hover:bg-red-600 hover:text-white"} onClick={() => void window.volaris.hideToTray()}><X size={17}/></button>
    </div>
  </header>;
}
