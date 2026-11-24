import { Activity, CircleStop, Radio } from "lucide-react";
import type { useMonitor } from "./useMonitor";
import { formatCount } from "./presentation";

const clock = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export function Monitor({ session, toggle }: ReturnType<typeof useMonitor>) {
  const active = session.phase === "active";
  const changing = session.phase === "starting" || session.phase === "stopping";
  const pending = session.phase === "starting" ? "正在启动" : "正在停止";
  return <section aria-labelledby="monitor-heading" className="flex min-h-64 grow flex-col overflow-hidden rounded-xl border border-edge bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4">
      <div>
        <h2 id="monitor-heading" className="flex items-center gap-2 text-lg font-semibold"><Activity size={19} className={active ? "text-emerald-600" : "text-muted"}/>实时监控</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">监听所选目录及其子目录。系统可能合并通知，点击「刷新分析」可更新大小和排名。</p>
      </div>
      <button type="button" onClick={toggle} disabled={changing}
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-accent hover:bg-indigo-100 focus-visible:outline-accent disabled:opacity-50">
        {active ? <CircleStop size={16}/> : <Radio size={16}/>}{changing ? pending : active ? "停止监控" : "开始监控"}
      </button>
    </div>
    <div className="flex shrink-0 justify-between gap-3 bg-workspace px-5 py-2 text-xs text-muted">
      <span>{active ? "监听中" : changing ? pending : session.phase === "error" ? "监控失败" : session.phase === "stopped" ? "已停止" : "尚未开启"} · {formatCount(session.total)} 条通知</span>
      <span>最近 100 条变化</span>
    </div>
    {session.error && <p role="alert" className="bg-amber-50 px-5 py-2 text-sm text-amber-950">{session.error}</p>}
    {session.entries.length ? <ol className="min-h-0 overflow-auto px-5" aria-label="文件系统变化">
      {session.entries.map((entry, index) => <li key={entry.time + ":" + index} className="flex items-baseline gap-4 border-b border-edge py-2.5 text-sm last:border-0">
        <time className="shrink-0 font-mono text-xs text-muted">{clock.format(entry.time)}</time>
        <span className="shrink-0 text-xs font-medium text-accent">{entry.kind === "rename" ? "名称变化" : "内容变化"}</span>
        <span data-tip={entry.path} className="truncate font-mono text-xs select-all">{entry.path}</span>
      </li>)}
    </ol> : <p className="m-auto p-8 text-sm text-muted">{active ? "正在等待文件系统变化…" : "开启后可在这里查看变更路径和时间。"}</p>}
  </section>;
}
