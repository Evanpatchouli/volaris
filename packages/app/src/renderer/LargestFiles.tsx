import { Files } from "lucide-react";
import type { ScanReport } from "../shared/desktop";
import { formatCount, formatSize } from "./presentation";

export function LargestFiles({ report }: { report: ScanReport }) {
  const files = report.largestFiles ?? [];
  const errors = report.largestFileReadErrors ?? 0;
  return <section className="flex min-h-64 grow flex-col overflow-hidden rounded-xl border border-edge bg-white" aria-labelledby="files-heading">
    <div className="flex items-start justify-between gap-4 border-b border-edge px-5 py-4">
      <div>
        <h2 id="files-heading" className="flex items-center gap-2 text-lg font-semibold"><Files size={19} className="text-muted"/>最大文件</h2>
        <p className="mt-1 text-xs text-muted">包含根目录直属文件，按逻辑大小显示前 100 项。</p>
      </div>
      <span className="pt-1 text-xs text-muted">{files.length} 项</span>
    </div>
    {errors > 0 && <p className="bg-amber-50 px-5 py-2 text-xs text-amber-900">部分路径读取失败（{formatCount(errors)} 处），排名可能不完整。</p>}
    {files.length ? <div className="min-h-0 overflow-auto px-3">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-white text-xs text-muted"><tr>
          <th scope="col" className="w-12 px-2 py-2 font-medium">排名</th>
          <th scope="col" className="px-2 py-2 font-medium">文件</th>
          <th scope="col" className="w-28 px-2 py-2 text-right font-medium">大小</th>
        </tr></thead>
        <tbody>{files.map((file, i) => <tr key={file.path} className="border-t border-edge hover:bg-workspace">
          <td className="px-2 py-2 text-muted tabular-nums">{i + 1}</td>
          <td className="px-2 py-2"><span className="block truncate font-medium">{file.name}</span><span data-tip={file.path} className="mt-0.5 block truncate font-mono text-xs text-muted select-all">{file.path}</span></td>
          <td className="px-2 py-2 text-right font-medium tabular-nums">{formatSize(file.size)}</td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="m-auto py-10 text-sm text-muted">没有可列出的文件</p>}
  </section>;
}
