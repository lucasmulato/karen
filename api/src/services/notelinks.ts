/**
 * Parses the markdown vault into a note-level link graph.
 *
 * Plain files stay the source of truth. We read frontmatter, #tags and
 * [[wikilinks]] on demand — no database copy of note contents.
 */
import type { VaultFsService } from "./vaultfs.js";

export interface NoteNode {
  path: string;
  name: string;
  type: string;
  context: string;
  tags: string[];
  maturity: string;
  graphId: string | null;
  links: string[];
  backlinks: string[];
}

export interface NoteEdge {
  source: string;
  target: string;
}

export interface NoteGraph {
  nodes: NoteNode[];
  edges: NoteEdge[];
  stats: {
    total: number;
    linked: number;
    orphan: number;
    mostLinked: { path: string; name: string; count: number }[];
    types: { type: string; count: number }[];
    contexts: { context: string; count: number }[];
    tags: { tag: string; count: number }[];
  };
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseFrontmatter(text: string): Record<string, string> {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return {};
  const out: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") break;
    const match = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (match) out[match[1].toLowerCase()] = match[2].trim();
  }
  return out;
}

function parseTags(text: string, frontmatter: Record<string, string>): string[] {
  const tags = new Set<string>();
  const fromMeta = frontmatter.tags ?? "";
  const inline = fromMeta.startsWith("[")
    ? fromMeta.slice(1, -1)
    : fromMeta;
  inline
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean)
    .forEach((t) => tags.add(t.toLowerCase()));
  for (const match of text.matchAll(/(?:^|\s)#([a-z0-9_-]+)/gi)) {
    tags.add(match[1].toLowerCase());
  }
  return [...tags];
}

export function parseLinks(text: string): string[] {
  const targets = new Set<string>();
  for (const match of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = match[1].split("|")[0].trim();
    if (target) targets.add(target);
  }
  return [...targets];
}

const DEFAULT_TYPE: Record<string, string> = {
  "00 Inbox": "inbox",
  "10 Projects": "project",
  "20 Areas": "area",
  "30 Resources": "resource",
  "40 Archive": "archive",
};

export class NoteLinksService {
  constructor(private readonly vault: VaultFsService) {}

  async graph(type?: string, tag?: string, context?: string): Promise<NoteGraph> {
    const files = (await this.vault.list()).filter((f) => f.endsWith(".md"));
    const bySlug = new Map<string, string>();
    const parsed: {
      path: string;
      name: string;
      type: string;
      tags: string[];
      maturity: string;
      graphId: string | null;
      context: string;
      links: string[];
      body: string;
    }[] = [];

    for (const path of files) {
      const body = await this.vault.read(path).catch(() => "");
      const meta = parseFrontmatter(body);
      const name =
        meta.title ||
        body.split("\n").find((l) => l.startsWith("# "))?.replace(/^#\s*/, "").trim() ||
        path.split("/").pop()!.replace(/\.md$/i, "");
      const folder = path.includes("/") ? path.split("/")[0] : "";
      const noteType = meta.type || DEFAULT_TYPE[folder] || (path === "MEMORY.md" ? "memory" : "note");
      const entry = {
        path,
        name,
        type: noteType.toLowerCase(),
        tags: parseTags(body, meta),
        maturity: (meta.maturity || "seedling").toLowerCase(),
        graphId: meta.graph_id || null,
        context: (meta.context || "personal").toLowerCase(),
        links: parseLinks(body),
        body,
      };
      parsed.push(entry);
      bySlug.set(slug(name), path);
      bySlug.set(slug(path.replace(/\.md$/i, "")), path);
    }

    const edges: NoteEdge[] = [];
    const backlinks = new Map<string, string[]>();
    for (const note of parsed) {
      for (const target of note.links) {
        const targetPath =
          bySlug.get(slug(target)) ??
          parsed.find((p) => slug(p.name).includes(slug(target)))?.path;
        if (!targetPath || targetPath === note.path) continue;
        edges.push({ source: note.path, target: targetPath });
        if (!backlinks.has(targetPath)) backlinks.set(targetPath, []);
        backlinks.get(targetPath)!.push(note.path);
      }
    }

    let nodes: NoteNode[] = parsed.map((p) => ({
      path: p.path,
      name: p.name,
      type: p.type,
      tags: p.tags,
      maturity: p.maturity,
      graphId: p.graphId,
      context: p.context,
      links: edges.filter((e) => e.source === p.path).map((e) => e.target),
      backlinks: backlinks.get(p.path) ?? [],
    }));

    if (type) nodes = nodes.filter((n) => n.type === type.toLowerCase());
    if (tag) nodes = nodes.filter((n) => n.tags.includes(tag.toLowerCase()));
    if (context) nodes = nodes.filter((n) => n.context === context.toLowerCase());
    const visiblePaths = new Set(nodes.map((n) => n.path));
    const visibleEdges = edges.filter(
      (e) => visiblePaths.has(e.source) && visiblePaths.has(e.target)
    );

    const typeCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();
    const contextCounts = new Map<string, number>();
    for (const n of nodes) {
      typeCounts.set(n.type, (typeCounts.get(n.type) ?? 0) + 1);
      contextCounts.set(n.context, (contextCounts.get(n.context) ?? 0) + 1);
      for (const t of n.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
    const mostLinked = [...nodes]
      .sort((a, b) => b.backlinks.length - a.backlinks.length)
      .slice(0, 5)
      .map((n) => ({ path: n.path, name: n.name, count: n.backlinks.length }));

    return {
      nodes,
      edges: visibleEdges,
      stats: {
        total: nodes.length,
        linked: nodes.filter((n) => n.links.length || n.backlinks.length).length,
        orphan: nodes.filter((n) => !n.links.length && !n.backlinks.length).length,
        mostLinked,
        types: [...typeCounts].map(([t, count]) => ({ type: t, count })).sort((a, b) => b.count - a.count),
        contexts: [...contextCounts]
          .map(([context, count]) => ({ context, count }))
          .sort((a, b) => b.count - a.count),
        tags: [...tagCounts]
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20),
      },
    };
  }

  async backlinks(path: string): Promise<NoteNode[]> {
    const graph = await this.graph();
    return graph.nodes.filter((n) => n.links.includes(path));
  }
}
