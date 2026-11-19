/**
 * Digital-garden report: finds notes that are rotting instead of compounding.
 *
 * Read-only, local, free. Maturity comes from properties.maturity; notes
 * without it are treated as seedlings. Uses the Zettelkasten/gardening rules
 * in api/prompts/notes.md.
 */
import type { Client } from "pg";

export interface GardenNote {
  id: string;
  name: string;
  type: string;
  updated_at: string;
}

export interface GardenData {
  total: number;
  seedling: number;
  budding: number;
  evergreen: number;
  stale: number;
  types: { type: string; count: number }[];
  orphans: GardenNote[];
  staleNotes: GardenNote[];
}

export class GardenService {
  constructor(private readonly client: Client) {}

  async data(): Promise<GardenData> {
    const summary = await this.client.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE COALESCE(properties->>'maturity','seedling') = 'seedling')::int AS seedling,
         COUNT(*) FILTER (WHERE properties->>'maturity' = 'budding')::int AS budding,
         COUNT(*) FILTER (WHERE properties->>'maturity' = 'evergreen')::int AS evergreen,
         COUNT(*) FILTER (WHERE updated_at < CURRENT_TIMESTAMP - INTERVAL '30 days')::int AS stale
       FROM nodes`
    );
    const s = summary.rows[0];
    const orphans = await this.client.query(
      `SELECT n.id, n.name, n.type, n.updated_at
         FROM nodes n
        WHERE NOT EXISTS (SELECT 1 FROM edges e WHERE e.source_id = n.id OR e.target_id = n.id)
        ORDER BY n.updated_at ASC LIMIT 8`
    );
    const staleNotes = await this.client.query(
      `SELECT id, name, type, updated_at FROM nodes
        WHERE updated_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
        ORDER BY updated_at ASC LIMIT 8`
    );
    const types = await this.client.query(
      `SELECT type, COUNT(*)::int AS count FROM nodes GROUP BY type ORDER BY COUNT(*) DESC LIMIT 6`
    );
    return {
      total: Number(s.total),
      seedling: Number(s.seedling),
      budding: Number(s.budding),
      evergreen: Number(s.evergreen),
      stale: Number(s.stale),
      types: types.rows,
      orphans: orphans.rows,
      staleNotes: staleNotes.rows,
    };
  }

  async report(): Promise<string> {
    const d = await this.data();
    const lines: string[] = [];
    lines.push("🌱 RELATÓRIO DO JARDIM (KAREN)");
    lines.push("");
    lines.push(`Total de notas: ${d.total}`);
    lines.push(
      `Maturidade: seedling ${d.seedling} · budding ${d.budding} · evergreen ${d.evergreen}`
    );
    lines.push(`Sem atualização há 30+ dias: ${d.stale}`);
    lines.push("");
    lines.push("Por tipo: " + d.types.map((r) => `${r.type} (${r.count})`).join(", "));

    lines.push("");
    lines.push("🔗 Notas órfãs (sem nenhuma aresta — priorize criar links):");
    if (d.orphans.length === 0) lines.push("  nenhuma 🎉");
    else for (const n of d.orphans) lines.push(`  - [${n.type}] ${n.name}`);

    lines.push("");
    lines.push("🕰️ Notas paradas (30+ dias — revisar ou arquivar):");
    if (d.staleNotes.length === 0) lines.push("  nenhuma 🎉");
    else for (const n of d.staleNotes) lines.push(`  - [${n.type}] ${n.name}`);

    lines.push("");
    lines.push(
      "Sugestão: transforme uma órfã em evergreen — adicione fonte, um link explícito e um exemplo pronto para copiar."
    );
    return lines.join("\n");
  }
}
