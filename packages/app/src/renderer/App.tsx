import { useEffect, useState } from "react";
import { AlertCircle, ChevronDown, Folder, FolderOpen, LoaderCircle, Play, Square } from "lucide-react";
import type { ScanEngine, ScanProgress } from "../shared/desktop";
import drive from "./assets/drive.webp";
import logo from "./assets/volaris.png";
import { engineName, explainError, formatCount } from "./presentation";
import { Metrics, Results } from "./Results";
import { useScan } from "./useScan";

const control = "inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50 motion-reduce:transition-none xl:min-h-12 xl:px-5 xl:text-lg";
const primary = control + " bg-accent text-white hover:bg-indigo-700";
const secondary = control + " border border-slate-300 bg-white hover:bg-slate-50";

function Scanning({ progress }: { progress?: ScanProgress }) {
  const [started] = useState(() => performance.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(performance.now() - started), 250);
    return () => window.clearInterval(timer);
  }, [started]);
  const targets = progress?.totalTargets;
  const measurable = progress !== undefined && targets != null && targets > 0;
  return <>
    <Metrics size={progress?.engine === "workers" ? progress.totalSizeBytes : undefined}
      files={progress?.engine === "workers" ? progress.fileCount : undefined}
      dirs={progress?.engine === "workers" ? progress.dirCount : undefined} duration={elapsed}/>
    <section className="flex min-h-56 grow flex-col items-center justify-center gap-4 rounded-xl border border-edge bg-white p-6 text-center" aria-label="扫描进度">
      <LoaderCircle aria-hidden size={30} className="animate-spin text-accent motion-reduce:animate-none"/>
      <h2 className="text-xl font-semibold">正在扫描目录</h2>
      <p className="text-sm text-muted">{measurable
        ? "已完成 " + formatCount(progress.completedTargets) + " / " + formatCount(targets) + " 个目标目录"
        : progress?.engine === "native" ? "正在读取 NTFS 元数据…" : "正在准备扫描目标…"}</p>
      {measurable && <progress className="h-1.5 w-64 max-w-full accent-accent" value={progress.completedTargets} max={targets} aria-label="已扫描目标目录"/>}
    </section>
  </>;
}

export function App() {
  const { root, engine, setEngine, state, choosing, cancelling, choose, start, cancel } = useScan();
  const running = state.phase === "running";
  const completed = state.phase === "complete";
  const progress = running ? state.progress : undefined;
  const summary = completed ? state.report.summary : undefined;
  const actual = summary?.engine ?? progress?.engine;
  const fallback = summary?.fallbackReason ?? progress?.fallbackReason;
  const error = state.phase === "error" ? explainError(state.message) : null;
  const status = {
    idle: root ? "等待扫描" : "就绪", cancelled: "已取消", running: cancelling ? "正在取消" : "扫描中",
    complete: "扫描完成", error: "扫描失败",
  }[state.phase];
  const dot = running ? "bg-indigo-500" : completed ? "bg-emerald-500" : error ? "bg-rose-500" : "bg-slate-400";

  return <div className="flex min-h-dvh flex-col bg-workspace font-sans text-ink antialiased md:h-dvh md:min-h-[510px]">
    <header className="shrink-0 border-b border-edge bg-white">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-4 px-5 sm:h-16 sm:px-8 xl:h-[70px] xl:gap-5">
        <div className="flex items-center gap-2.5"><img src={logo} alt="" className="size-8"/>
          <span className="text-[25px] leading-none font-bold tracking-[-0.045em] xl:text-[32px]">Volaris</span></div>
        <span aria-hidden className="h-5 w-px bg-slate-300"/>
        <span className="text-[15px] font-medium tracking-wide text-muted xl:text-lg">磁盘空间分析</span>
      </div>
    </header>
    <main className="mx-auto flex w-full max-w-[1600px] grow flex-col gap-5 px-5 pt-6 pb-5 sm:px-8 md:min-h-0 md:overflow-y-auto lg:gap-6 lg:pt-8">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-[1_1_150px]">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:text-[32px] xl:text-[40px]">扫描概览</h1>
          <p className={"mt-1 truncate text-sm text-muted xl:text-lg " + (root ? "font-mono" : "")} title={root}>{root || "尚未选择目录"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {root && <button type="button" className={secondary} disabled={running || choosing} onClick={choose}><Folder size={16}/>选择目录</button>}
          <label className="relative flex">
            <select aria-label="扫描引擎" value={engine} disabled={running || choosing}
              onChange={(event) => setEngine(event.target.value as ScanEngine)}
              className={secondary + " appearance-none pr-9 xl:pr-10"}>
              <option value="auto">自动引擎</option><option value="workers">Worker 引擎</option><option value="native">NTFS 引擎</option>
            </select>
            <ChevronDown aria-hidden size={15} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"/>
          </label>
          {completed && <button type="button" onClick={start} disabled={choosing} className={primary}><Play aria-hidden size={15} fill="currentColor"/>开始扫描</button>}
          {running && <button type="button" onClick={cancel} disabled={cancelling} className={secondary}><Square size={13}/>{cancelling ? "正在取消" : "取消扫描"}</button>}
        </div>
      </div>
      {completed ? <Results report={state.report}/> : running ? <Scanning progress={progress}/> :
        <section className="flex min-h-72 grow flex-col items-center justify-center rounded-xl border border-edge bg-white px-6 py-7 text-center">
          <img src={drive} alt="" draggable={false} className="mb-4 h-[clamp(106px,25vh,248px)] max-w-full object-contain xl:h-[clamp(180px,33vh,340px)]"/>
          <h2 className="text-[clamp(21px,2.1vw,30px)] leading-tight font-semibold tracking-tight xl:text-4xl">
            {error ? "扫描遇到问题" : !root ? "从一个目录开始" : state.phase === "cancelled" ? "扫描已取消" : "准备扫描"}
          </h2>
          <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed break-words text-muted xl:mt-4 xl:text-lg" role={error ? "alert" : undefined} title={state.phase === "error" ? state.message : undefined}>
            {error ?? (!root ? "选择磁盘或文件夹，查看子目录占用的空间。" : "统计所选目录下各个子目录的大小与文件数。")}
            {state.phase === "error" && error !== state.message && engine === "native" && "可切换到自动引擎后重试。"}
          </p>
          <button type="button" disabled={choosing} onClick={root ? start : choose} className={primary + " mt-6 min-h-11 px-5 xl:mt-8 xl:min-h-14 xl:px-7"}>
            {root ? <Play size={16} fill="currentColor"/> : <FolderOpen size={17}/>}
            {choosing ? "正在选择…" : root ? "开始扫描" : "选择扫描目录"}
          </button>
        </section>}
    </main>
    <footer className="shrink-0 border-t border-edge bg-workspace text-xs text-muted">
      <div className="mx-auto flex min-h-10 max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 sm:px-8 xl:min-h-13 xl:text-sm">
        <span role="status" className="flex shrink-0 items-center gap-2 font-medium"><span aria-hidden className={"size-2 rounded-full " + dot}/>{status}</span>
        {actual && <span className="border-l border-slate-300 pl-4">实际引擎 · {engineName(actual)}</span>}
        {fallback && <span className="flex min-w-0 items-center gap-1.5" title={fallback}>
          <AlertCircle size={13} aria-hidden className="shrink-0"/><span className="truncate">已自动回退。{explainError(fallback)}</span>
        </span>}
        {summary && (summary.errorCount > 0 || summary.skippedCount > 0) && <span className="ml-auto">读取错误 {formatCount(summary.errorCount)} · 跳过 {formatCount(summary.skippedCount)}</span>}
      </div>
    </footer>
  </div>;
}
