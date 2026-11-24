import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';

interface CanvasNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text: string;
}
interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  label?: string;
}
interface Canvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

const COLORS: Record<string, string> = {
  '1': '#ef4444', '2': '#f97316', '3': '#eab308',
  '4': '#22c55e', '5': '#06b6d4', '6': '#a855f7',
};

function titleOf(text: string): string {
  return text.split('\n').find((l) => l.startsWith('# '))?.replace(/^#\s*/, '').trim() || 'Sem título';
}

const CanvasView: React.FC<{ canvas: Canvas }> = ({ canvas }) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const nodes = useMemo(() => canvas.nodes ?? [], [canvas]);
  const edges = useMemo(() => canvas.edges ?? [], [canvas]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const size = useMemo(() => {
    if (!nodes.length) return { w: 800, h: 600, maxX: 800, maxY: 600 };
    const maxX = Math.max(...nodes.map((n) => n.x + n.width)) + 120;
    const maxY = Math.max(...nodes.map((n) => n.y + n.height)) + 120;
    return { w: maxX, h: maxY, maxX, maxY };
  }, [nodes]);

  function fit() {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const s = Math.max(0.2, Math.min(rect.width / size.w, rect.height / size.h, 1.5));
    setZoom(s);
    setPan({
      x: (rect.width - size.w * s) / 2,
      y: (rect.height - size.h * s) / 2,
    });
  }

  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, size.w, size.h]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    drag.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setPan({
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y),
    });
  }
  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-grab overflow-hidden bg-hud-panel active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={(e) => {
        e.preventDefault();
        setZoom((z) => Math.min(2.5, Math.max(0.2, z - Math.sign(e.deltaY) * 0.1)));
      }}
    >
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          position: 'absolute',
          width: size.w,
          height: size.h,
        }}
      >
        <svg className="absolute inset-0" width={size.w} height={size.h}>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill="#71717a" />
            </marker>
          </defs>
          {edges.map((e) => {
            const a = byId.get(e.fromNode);
            const b = byId.get(e.toNode);
            if (!a || !b) return null;
            const x1 = a.x + a.width;
            const y1 = a.y + a.height / 2;
            const x2 = b.x;
            const y2 = b.y + b.height / 2;
            return (
              <g key={e.id}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#52525b" strokeWidth={1.5} markerEnd="url(#arrow)" />
                {e.label && (
                  <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} fill="#a1a1aa" fontSize={10} textAnchor="middle">
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {nodes.map((n) => (
          <div
            key={n.id}
            className="absolute overflow-hidden rounded-lg border border-hud-line bg-hud-raised p-2 shadow-xl"
            style={{
              left: n.x,
              top: n.y,
              width: n.width,
              height: n.height,
              borderTop: `3px solid ${COLORS[n.color ?? '6'] ?? '#a855f7'}`,
            }}
          >
            <p className="truncate text-[12px] font-semibold text-slate-200">{titleOf(n.text)}</p>
            <p className="mt-1 line-clamp-3 text-[11px] text-hud-muted">
              {n.text.split('\n').filter((l) => l && !l.startsWith('#') && !/^\[[a-z_]+\]$/.test(l)).join(' ').slice(0, 180)}
            </p>
          </div>
        ))}
      </div>
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-hud-line bg-black/80 p-1">
        <button onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))} className="p-1 text-hud-muted hover:text-white" title="Diminuir">
          <Minus size={13} />
        </button>
        <span className="w-10 text-center text-[11px] text-hud-muted">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))} className="p-1 text-hud-muted hover:text-white" title="Aumentar">
          <Plus size={13} />
        </button>
        <button
          onClick={fit}
          className="p-1 text-hud-muted hover:text-white"
          title="Ajustar à tela"
        >
          <RotateCcw size={13} />
        </button>
      </div>
    </div>
  );
};

export default CanvasView;
