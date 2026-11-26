import React, { useRef } from 'react';
import type { ReactNode } from 'react';

interface Props {
  first: ReactNode;
  second: ReactNode;
  orientation: 'horizontal' | 'vertical';
  ratio: number;
  onRatioChange: (ratio: number) => void;
}

const SplitPane: React.FC<Props> = ({ first, second, orientation, ratio, onRatioChange }) => {
  const container = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const vertical = orientation === 'vertical';

  const move = (clientX: number, clientY: number) => {
    if (!dragging.current || !container.current) return;
    const rect = container.current.getBoundingClientRect();
    const percent = vertical
      ? ((clientY - rect.top) / rect.height) * 100
      : ((clientX - rect.left) / rect.width) * 100;
    onRatioChange(Math.min(75, Math.max(25, Math.round(percent))));
  };

  return (
    <div
      ref={container}
      className={`workspace-split flex h-full w-full min-h-0 min-w-0 ${vertical ? 'flex-col' : 'flex-row'}`}
    >
      <div className="min-h-0 min-w-0 overflow-hidden" style={{ flexBasis: `${ratio}%` }}>
        {first}
      </div>
      <div
        role="separator"
        aria-orientation={vertical ? 'horizontal' : 'vertical'}
        aria-label="Redimensionar divisão"
        aria-valuemin={25}
        aria-valuemax={75}
        aria-valuenow={ratio}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => move(event.clientX, event.clientY)}
        onPointerUp={(event) => {
          dragging.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onKeyDown={(event) => {
          const key = vertical ? event.key === 'ArrowUp' || event.key === 'ArrowDown' : event.key === 'ArrowLeft' || event.key === 'ArrowRight';
          if (!key) return;
          event.preventDefault();
          const delta = (vertical ? event.key === 'ArrowUp' : event.key === 'ArrowLeft') ? 2 : -2;
          onRatioChange(Math.min(75, Math.max(25, ratio + delta)));
        }}
        className={`shrink-0 bg-hud-border transition-colors hover:bg-hud-cyan/40 focus:bg-hud-cyan/40 focus:outline-none ${
          vertical ? 'h-1.5 w-full cursor-row-resize' : 'h-full w-1.5 cursor-col-resize'
        }`}
      />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{second}</div>
    </div>
  );
};

export default SplitPane;
