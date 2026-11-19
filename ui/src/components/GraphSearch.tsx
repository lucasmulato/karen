import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';

interface Result {
  id: string;
  name: string;
  type: string;
  description: string | null;
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const GraphSearch: React.FC<{
  onSelect: (row: Result) => void;
  onClose: () => void;
}> = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}&limit=8`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="pointer-events-auto relative">
      <div className="flex items-center gap-2 rounded-full border border-zinc-700 bg-black/80 px-3 py-1.5 backdrop-blur-md">
        <Search size={14} className="text-zinc-500" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && results[0]) onSelect(results[0]);
          }}
          placeholder="Buscar nós do grafo..."
          className="w-48 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
        />
        <button onClick={onClose} className="text-[11px] text-zinc-500 hover:text-zinc-200">ESC</button>
      </div>
      {(results.length > 0 || loading) && (
        <div className="absolute left-0 right-0 top-full mt-1 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl">
          {loading && <p className="px-3 py-2 text-[12px] text-zinc-500">Buscando...</p>}
          {!loading && results.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelect(r)}
              className="flex w-full flex-col items-start gap-0.5 border-b border-zinc-900 px-3 py-2 text-left last:border-0 hover:bg-zinc-900"
            >
              <span className="truncate text-xs text-zinc-200">{r.name}</span>
              <span className="text-[11px] text-zinc-500">[{r.type}]</span>
            </button>
          ))}
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-zinc-500">Nenhum nó encontrado.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default GraphSearch;
