import { Archive, Database, FileBox, ScanSearch } from "lucide-react";
import { useState } from "react";
import type { CleanupSuggestion } from "../shared/desktop";
import { formatCount, formatSize } from "./presentation";

const kinds = {
  cache: { label: "缓存目录", reason: "名称匹配常见缓存。请先确认所属应用以及缓存能否重新生成。", Icon: Database },
  temporary: { label: "临时目录", reason: "名称匹配临时目录。请确认任务已完成，内容无需保留。", Icon: Archive },
  "large-file": { label: "大文件", reason: "逻辑大小至少 1 GiB。请核对用途，决定保留、归档或迁移。", Icon: FileBox },
};

export function Cleanup({ suggestions }: { suggestions: CleanupSuggestion[] }) {
  const [limit, setLimit] = useState(50);
  return <section aria-labelledby="cleanup-heading" className="flex min-h-64 grow flex-col overflow-hidden rounded-xl border border-edge bg-white">
    <div className="flex items-start justify-between gap-4 border-b border-edge px-5 py-4">
      <div>
        <h2 id="cleanup-heading" className="flex items-center gap-2 text-lg font-semibold"><ScanSearch size={19} className="text-muted"/>清理建议</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">根据目录名称和最大文件榜筛选，供手动核对。大小按逻辑字节计算。</p>
      </div>
      <span className="shrink-0 pt-1 text-xs text-muted">{formatCount(suggestions.length)} 项</span>
    </div>
    {suggestions.length ? <ul className="min-h-0 overflow-auto px-5" aria-label="待核对项目">
      {suggestions.slice(0, limit).map(item => {
        const { label, reason, Icon } = kinds[item.kind];
        return <li key={item.path} className="flex items-start gap-3 border-b border-edge py-3 last:border-0">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-accent"><Icon size={16}/></span>
          <div className="min-w-0 grow">
            <div className="flex items-baseline gap-2"><span className="truncate text-sm font-semibold">{item.name}</span><span className="shrink-0 text-xs text-muted">{label}</span></div>
            <p data-tip={item.path} className="mt-0.5 truncate font-mono text-xs text-muted select-all">{item.path}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{reason}</p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{formatSize(item.size)}</span>
        </li>;
      })}
      {suggestions.length > limit && <li><button className="my-2 cursor-pointer rounded-md px-3 py-2 text-sm text-accent hover:bg-indigo-50" onClick={() => setLimit(limit + 50)}>显示更多建议</button></li>}
    </ul> : <p className="m-auto p-6 text-sm text-muted">本次扫描没有匹配的清理建议</p>}
  </section>;
}
