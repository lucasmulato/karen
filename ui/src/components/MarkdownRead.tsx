import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownReadProps {
  content: string;
  files: string[];
  onOpen: (path: string) => void;
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const MarkdownRead: React.FC<MarkdownReadProps> = ({ content, files, onOpen }) => {
  const body = useMemo(() => {
    const withoutMeta = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
    return withoutMeta.replace(/\[\[([^\]]+)\]\]/g, (_match, raw: string) => {
      const [target, alias] = raw.split('|').map((s) => s.trim());
      const wanted = slug(target);
      const resolved =
        files.find((f) => slug(f.replace(/\.md$/i, '')) === wanted) ??
        files.find((f) => slug(f.replace(/\.md$/i, '')).includes(wanted)) ??
        files.find((f) => slug(f).includes(wanted));
      const label = alias || target;
      return resolved
        ? `[${label}](note:${encodeURIComponent(resolved)})`
        : `**${label}** _(sem nota)_`;
    });
  }, [content, files]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="text-sm leading-relaxed text-slate-200 [&_a]:text-hud-cyan [&_a]:underline [&_code]:rounded [&_code]:bg-hud-raised [&_code]:px-1 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-slate-200 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-200 [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-3 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-black/60 [&_pre]:p-3">
        <ReactMarkdown
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith('note:')) {
                return (
                  <button
                    onClick={() => onOpen(decodeURIComponent(href.slice(5)))}
                    className="rounded bg-blue-950/60 px-1 text-hud-cyan underline decoration-blue-700 hover:text-hud-cyan"
                  >
                    {children}
                  </button>
                );
              }
              return (
                <a href={href} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            },
          }}
        >
          {body}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default MarkdownRead;
