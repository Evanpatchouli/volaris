import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FolderOpen, LayoutGrid, ListOrdered } from "lucide-react";
import type { DirectoryResult, ScanReport } from "../shared/desktop";
import { colorFor, formatCount, formatDuration, formatSize } from "./presentation";
import { Treemap } from "./Treemap";

export function Metrics({ size, files, dirs, duration }: {
  size?: number; files?: number; dirs?: number; duration?: number;
}) {
  const metrics = [
    ["统计大小", size === undefined ? "—" : formatSize(size), "所选根目录下，各一级子目录的逻辑大小合计。"],
    ["文件数", files === undefined ? "—" : formatCount(files), "已计入统计的文件数量。"],
    ["目录数", dirs === undefined ? "—" : formatCount(dirs), "已读取的子目录及其后代数量。"],
    ["扫描耗时", duration === undefined ? "—" : formatDuration(duration), "本次扫描的总耗时。"],
  ];
  return <dl className="grid shrink-0 grid-cols-2 gap-y-5 rounded-xl border border-edge bg-white px-1 py-5 sm:grid-cols-4 sm:py-6 xl:py-7">
    {metrics.map(([label, value, hint], i) => (
      <div key={label} className={'min-w-0 px-4 sm:px-6 ' + (i ? 'sm:border-l sm:border-edge' : '')} title={hint}>
        <dt className="mb-1.5 text-sm font-medium text-muted xl:text-lg">{label}</dt>
        <dd className="truncate text-2xl leading-tight font-semibold tracking-tight tabular-nums lg:text-3xl xl:text-[40px]">{value}</dd>
      </div>
    ))}
  </dl>;
}

const pageSize = 50;
const pageButton = "grid size-7 place-items-center rounded-md text-muted hover:bg-workspace focus-visible:outline-accent disabled:opacity-25";

function Ranking({ rows, total, index, onSelect, page, onPage }: {
  rows: DirectoryResult[]; total: number; index: number; page: number;
  onSelect: (index: number) => void; onPage: (page: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const start = page * pageSize;
  const pages = Math.ceil(rows.length / pageSize);
  const item = rows[index];

  useEffect(() => {
    const container = list.current;
    const active = container?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!container || !active) return;
    const rect = active.getBoundingClientRect();
    const bounds = container.getBoundingClientRect();
    if (rect.bottom > bounds.bottom) container.scrollTop += rect.bottom - bounds.bottom;
    if (rect.top < bounds.top) container.scrollTop += rect.top - bounds.top;
  }, [index, page]);

  return <section className="flex min-h-80 min-w-0 flex-col overflow-hidden rounded-xl border border-edge bg-white" aria-labelledby="ranking-heading">
    <div className="flex items-center justify-between px-5 pt-5 pb-3">
      <h2 id="ranking-heading" className="flex items-center gap-2.5 text-lg font-semibold xl:text-2xl"><ListOrdered aria-hidden size={20} className="text-muted" />目录排名</h2>
      <span className="text-xs text-muted">{formatCount(rows.length)} 项</span>
    </div>
    {rows.length > 0 ? <>
      <div aria-hidden className="mx-3 grid grid-cols-[2rem_minmax(0,1fr)_5rem_3.6rem] gap-1 border-b border-edge px-2 pt-1 pb-2 text-xs text-muted">
        <span>#</span><span>目录</span><span className="text-right">大小</span><span className="text-right">占比</span>
      </div>
      <div className="mx-3 min-h-0 flex-1 overflow-y-auto overscroll-contain py-1" ref={list} aria-label="按大小排序的目录">
        {rows.slice(start, start + pageSize).map((row, offset) => {
          const rank = start + offset;
          return <button key={row.path} type="button" aria-pressed={rank === index} title={row.path} onClick={() => onSelect(rank)}
            className="grid w-full cursor-pointer grid-cols-[2rem_minmax(0,1fr)_5rem_3.6rem] items-center gap-1 rounded-md border-b border-slate-100 px-2 py-2.5 text-left text-sm hover:bg-workspace focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-pressed:border-transparent aria-pressed:bg-indigo-50 xl:text-base">
            <span className="text-xs text-muted tabular-nums">{rank + 1}</span>
            <span className="flex min-w-0 items-center gap-2 font-medium">
              <span aria-hidden className={"size-3 shrink-0 rounded-[3px] " + colorFor(rank).dot}/><span className="truncate">{row.name}</span>
            </span>
            <span className="text-right text-sm tabular-nums xl:text-base">{formatSize(row.size)}</span>
            <span className="text-right text-xs text-muted tabular-nums xl:text-sm">{total ? (row.size / total * 100).toFixed(1) : "0.0"}%</span>
          </button>;
        })}
      </div>
      {pages > 1 && <div className="flex items-center justify-end gap-2 border-t border-edge px-4 py-1.5 text-xs text-muted">
        <button className={pageButton} type="button" disabled={page === 0} aria-label="上一页" onClick={() => onPage(page - 1)}><ChevronLeft size={16}/></button>
        {page + 1} / {pages}
        <button className={pageButton} type="button" disabled={page + 1 >= pages} aria-label="下一页" onClick={() => onPage(page + 1)}><ChevronRight size={16}/></button>
      </div>}
      {item && <div className="flex items-center gap-2 border-t border-edge px-5 py-3 text-xs text-muted" title={item.path}>
        <FolderOpen size={15} className="shrink-0"/><span className="truncate font-semibold text-ink">{item.name}</span>
        <span className="ml-auto shrink-0">{formatCount(item.fileCount)} 个文件 · {formatCount(item.dirCount)} 个目录</span>
      </div>}
    </> : <p className="m-auto p-6 text-sm text-muted">没有可统计的子目录</p>}
  </section>;
}

export function Results({ report }: { report: ScanReport }) {
  const { results, summary } = report;
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState(0);
  function select(rank: number) {
    if (rank < 0) return;
    setIndex(rank);
    setPage(Math.floor(rank / pageSize));
  }
  return <>
    <Metrics size={summary.totalSizeBytes} files={summary.fileCount} dirs={summary.dirCount} duration={summary.durationMs} />
    <div className="grid min-h-0 grow gap-4 md:grid-cols-[minmax(0,1.48fr)_minmax(315px,1fr)] md:grid-rows-[minmax(325px,1fr)]">
      <section className="flex min-h-80 min-w-0 flex-col rounded-xl border border-edge bg-white" aria-labelledby="map-heading">
        <h2 id="map-heading" className="flex items-center gap-2.5 px-5 pt-5 pb-4 text-lg font-semibold xl:text-2xl">
          <LayoutGrid aria-hidden size={19} className="text-muted"/>空间分布
        </h2>
        <div className="mx-3 mb-3 min-h-60 grow">
          <Treemap rows={results} selected={results[index]?.path ?? null} onSelect={(path) => select(results.findIndex(row => row.path === path))}/>
        </div>
      </section>
      <Ranking rows={results} total={summary.totalSizeBytes} index={index} onSelect={select} page={page} onPage={setPage}/>
    </div>
  </>;
}
