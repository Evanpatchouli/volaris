import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, ListTree } from "lucide-react";
import type { DirectoryNode, DirectoryResult } from "../shared/desktop";
import { formatCount, formatSize } from "./presentation";

const pageSize = 100;

function More({ count, show }: { count: number; show: () => void }) {
  return <button type="button" onClick={show} className="my-1 rounded-md px-3 py-2 text-xs font-medium text-accent hover:bg-indigo-50 focus-visible:outline-accent">
    显示更多（剩余 {formatCount(count)} 项）
  </button>;
}

interface BranchProps {
  nodes: DirectoryNode[];
  children: Map<number, number[]>;
  index: number;
  fullPath: string;
}

function Branch({ nodes, children, index, fullPath }: BranchProps) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(pageSize);
  const node = nodes[index];
  const ids = children.get(index);
  const Icon = open ? FolderOpen : Folder;
  const row = <>
    {ids ? open ? <ChevronDown size={15}/> : <ChevronRight size={15}/> : <span className="w-[15px]"/>}
    <Icon aria-hidden size={16} className="shrink-0 text-indigo-500"/>
    <span className="min-w-0 truncate">{node.name}</span>
    <span className="ml-auto shrink-0 pl-3 text-xs text-muted tabular-nums sm:text-sm">{formatSize(node.size)}</span>
  </>;
  const base = "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm";
  return <li>
    {ids ? <button type="button" aria-label={node.name} aria-expanded={open} data-tip={fullPath} className={base + " cursor-pointer hover:bg-indigo-50 focus-visible:outline-accent"} onClick={() => setOpen(!open)}>{row}</button>
      : <div data-tip={fullPath} className={base}>{row}</div>}
    {open && ids && <ul className="ml-3 border-l border-edge pl-2 sm:ml-4">
      {ids.slice(0, limit).map(i => <Branch key={i} nodes={nodes} children={children} index={i} fullPath={fullPath + "\\" + nodes[i].name}/>)}
      {ids.length > limit && <li><More count={ids.length - limit} show={() => setLimit(limit + pageSize)}/></li>}
    </ul>}
  </li>;
}

function TargetTree({ target }: { target: DirectoryResult }) {
  const nodes = useMemo(() => target.tree ?? [{ parent: -1, name: target.name, size: target.size }], [target]);
  const children = useMemo(() => {
    const groups = new Map<number, number[]>();
    for (let i = 1; i < nodes.length; i++) {
      const parent = nodes[i].parent;
      const ids = groups.get(parent);
      if (ids) ids.push(i);
      else groups.set(parent, [i]);
    }
    for (const ids of groups.values()) ids.sort((a, b) => nodes[b].size - nodes[a].size || nodes[a].name.localeCompare(nodes[b].name));
    return groups;
  }, [nodes]);
  return <Branch index={0} fullPath={target.path} nodes={nodes} children={children}/>;
}

export function DirectoryTree({ rows }: { rows: DirectoryResult[] }) {
  const [limit, setLimit] = useState(pageSize);
  return <section aria-labelledby="tree-heading" className="flex min-h-64 grow flex-col overflow-hidden rounded-xl border border-edge bg-white px-4 py-4 sm:px-5">
    <div className="mb-3 flex items-center justify-between border-b border-edge pb-3">
      <h2 id="tree-heading" className="flex items-center gap-2 text-lg font-semibold"><ListTree size={19} className="text-muted"/>目录树</h2>
      <span className="text-xs text-muted">含子目录的逻辑大小</span>
    </div>
    {rows.length ? <ul aria-label="目录层级" className="min-h-0 overflow-auto">
      {rows.slice(0, limit).map(row => <TargetTree key={row.path} target={row}/>)}
      {rows.length > limit && <li><More count={rows.length - limit} show={() => setLimit(limit + pageSize)}/></li>}
    </ul> : <p className="m-auto text-sm text-muted">没有可显示的子目录</p>}
  </section>;
}
