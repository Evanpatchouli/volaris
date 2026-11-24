import { hierarchy, treemap } from "d3-hierarchy";
import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { DirectoryResult } from "../shared/desktop";
import { colorFor, formatSize } from "./presentation";

interface TreemapProps {
  rows: DirectoryResult[];
  selected: string | null;
  onSelect: (path: string) => void;
}

interface Tile {
  row: DirectoryResult;
  index: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const hitCell = 48;
const labelFont = '"Segoe UI", "Microsoft YaHei UI", sans-serif';

function layoutTiles(rows: DirectoryResult[], width: number, height: number) {
  const tiles: Tile[] = [];
  const buckets = new Map<number, Tile[]>();
  const columns = Math.ceil(width / hitCell);
  const indices = rows.flatMap((row, i) => row.size > 0 ? [i] : []);
  if (indices.length && width > 0 && height > 0) {
    // The root is a sentinel. Original row indices also determine the ranking colors.
    const root = hierarchy(-1, i => i === -1 ? indices : null).sum(i => rows[i]?.size ?? 0);
    const blocks = treemap<number>().size([width, height]).round(true)(root).children ?? [];
    for (const { data, x0, y0, x1, y1 } of blocks) {
      if (x0 === x1 || y0 === y1) continue;
      const tile = { row: rows[data], index: data, x0, y0, x1, y1 };
      tiles.push(tile);
      // Pointer movement searches only the visible tiles in this patch of the canvas.
      for (let y = Math.floor(y0 / hitCell); y < Math.ceil(y1 / hitCell); y++) {
        for (let x = Math.floor(x0 / hitCell); x < Math.ceil(x1 / hitCell); x++) {
          const key = y * columns + x;
          const bucket = buckets.get(key);
          if (bucket) bucket.push(tile);
          else buckets.set(key, [tile]);
        }
      }
    }
  }
  return { tiles, buckets, columns };
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(chars.slice(0, mid).join("") + "…").width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return chars.slice(0, low).join("") + "…";
}

function paintTile(ctx: CanvasRenderingContext2D, tile: Tile, selected: boolean) {
  const w = tile.x1 - tile.x0;
  const h = tile.y1 - tile.y0;
  ctx.fillStyle = colorFor(tile.index).fill;
  if (w < 6 || h < 6) {
    ctx.fillRect(tile.x0, tile.y0, w, h);
    return;
  }
  const gap = Math.min(1.5, w / 8, h / 8);
  ctx.beginPath();
  ctx.roundRect(tile.x0 + gap, tile.y0 + gap, w - gap * 2, h - gap * 2, Math.min(5, w / 8, h / 8));
  ctx.fill();
  if (selected) {
    ctx.strokeStyle = "#31558e";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (w < 38 || h < 22) return;

  const roomy = w >= 130 && h >= 75;
  const nameSize = roomy ? Math.max(16, Math.min(24, Math.round(Math.min(w, h) / 11))) : 12;
  const valueSize = roomy ? Math.max(14, nameSize - 3) : 11;
  const inset = roomy ? 13 : 7;
  const availableWidth = w - inset * 2;
  ctx.fillStyle = "#20314e";
  ctx.font = `600 ${nameSize}px ${labelFont}`;
  ctx.fillText(fitText(ctx, tile.row.name, availableWidth), tile.x0 + inset, tile.y0 + inset);
  if (h >= inset * 2 + nameSize + valueSize + 5) {
    ctx.font = `400 ${valueSize}px ${labelFont}`;
    const size = formatSize(tile.row.size);
    if (ctx.measureText(size).width <= availableWidth) {
      ctx.fillStyle = "#42536b";
      ctx.fillText(size, tile.x0 + inset, tile.y0 + inset + nameSize + 5);
    }
  }
}

export function Treemap({ rows, selected, onSelect }: TreemapProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const outlined = useRef<Tile | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0, ratio: 1 });
  const { width, height, ratio } = size;
  const layout = useMemo(() => layoutTiles(rows, width, height), [rows, width, height]);

  useLayoutEffect(() => {
    const element = canvas.current!;
    const update = () => {
      const { width, height } = element.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      setSize(old => old.width === width && old.height === height && old.ratio === ratio
        ? old : { width, height, ratio });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element, { box: "device-pixel-content-box" });
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = canvas.current!;
    const ctx = element.getContext("2d");
    if (!ctx || !width || !height) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.textBaseline = "top";
    for (const tile of layout.tiles) paintTile(ctx, tile, false);
    outlined.current = undefined;
  }, [width, height, ratio, layout]);

  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const previous = outlined.current;
    if (previous) {
      ctx.clearRect(previous.x0, previous.y0, previous.x1 - previous.x0, previous.y1 - previous.y0);
      paintTile(ctx, previous, false);
    }
    const next = selected ? layout.tiles.find(tile => tile.row.path === selected) : undefined;
    if (next) paintTile(ctx, next, true);
    outlined.current = next;
  }, [layout, ratio, selected]);

  function targetAt(event: MouseEvent<HTMLCanvasElement>) {
    const x = event.nativeEvent.offsetX;
    const y = event.nativeEvent.offsetY;
    const key = Math.floor(y / hitCell) * layout.columns + Math.floor(x / hitCell);
    return layout.buckets.get(key)?.find(t => x >= t.x0 && x < t.x1 && y >= t.y0 && y < t.y1);
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg">
      <canvas
        ref={canvas}
        role="img"
        aria-label="目录空间分布图，面积代表目录大小。可在目录排名中选择对应目录。"
        className="block h-full w-full cursor-pointer"
        width={Math.round(width * ratio)}
        height={Math.round(height * ratio)}
        onMouseMove={event => {
          const tile = targetAt(event);
          const title = tile ? `${tile.row.path} · ${formatSize(tile.row.size)}` : "";
          if (event.currentTarget.title !== title) event.currentTarget.title = title;
        }}
        onClick={event => {
          const tile = targetAt(event);
          if (tile) onSelect(tile.row.path);
        }}
      />
      {width > 0 && layout.tiles.length === 0 && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-500">
          暂无可绘制的目录空间
        </p>
      )}
    </div>
  );
}
