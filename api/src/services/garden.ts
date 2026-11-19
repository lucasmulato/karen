/**
 * Digital-garden report: finds notes that are rotting instead of compounding.
 *
 * Read-only, local, free. Maturity comes from properties.maturity; notes
 * without it are treated as seedlings. Uses the Zettelkasten/gardening rules
 * in api/prompts/notes.md.
 */
import type { Client } from "pg";

interface CountRow {
  total: string;
  seedling: string;
  budding: string;
  evergreen: string;
  stale: string;
}

export class GardenService {
  constructor(private readonly client: Client) {}

  async report(): Promise<string> {
    const summary = await this.client.query<CountRow>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE COALESCE(properties->>'maturity','seedling') = 'seedling')::text AS seedling,
         COUNT(*) FILTER (WHERE properties->>'maturity' = 'budding')::text AS budding,
         COUNT(*) FILTER (WHERE properties->>'maturity' = 'evergreen')::text AS evergreen,
         COUNT(*) FILTER (WHERE updated_at < CURRENT_TIMESTAMP - INTERVAL '30 days')::text AS stale
       FROM nodes`
    );
    const s = summary.rows[0];

    const orphans = await this.client.query<{ name: string; type: string; updated_at: string }>(
      `SELECT n.name, n.type, n.updated_at
         FROM nodes n
        WHERE NOT EXISTS (
          SELECT 1 FROM edges e WHERE e.source_id = n.id OR e.target_id = n.id
        )
        ORDER BY n.updated_at ASC LIMIT 8`
    );
    const stale = await this.client.query<{ name: string; type: string; updated_at: string }>(
      `SELECT name, type, updated_at FROM nodes
        WHERE updated_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
        ORDER BY updated_at ASC LIMIT 8`
    );
    const types = await this.client.query<{ type: string; count: string }>(
      `SELECT type, COUNT(*)::text AS count FROM nodes GROUP BY type ORDER BY COUNT(*) DESC LIMIT 6`
    );

    const lines: string[] = [];
    lines.push("🌱 RELATÓRIO DO JARDIM (KAREN)");
    lines.push("");
    lines.push(`Total de notas: ${s.total}`);
    lines.push(
      `Maturidade: seedling ${s.seedling} · budding ${s.budding} · evergreen ${s.evergreen}`
    );
    lines.push(`Sem atualização há 30+ dias: ${s.stale}`);
    lines.push("");
    lines.push("Por tipo: " + types.rows.map((r) => `${r.type} (${r.count})`).join(", "));

    lines.push("");
    lines.push("🔗 Notas órfãs (sem nenhuma aresta — priorize criar links):");
    if (orphans.rows.length === 0) lines.push("  nenhuma 🎉");
    else
      for (const n of orphans.rows) {
        lines.push(`  - [${n.type}] ${n.name}`);
      }

    lines.push("");
    lines.push("🕰️ Notas paradas (30+ dias — revisar ou arquivar):");
    if (stale.rows.length === 0) lines.push("  nenhuma 🎉");
    else
      for (const n of stale.rows) {
        lines.push(`  - [${n.type}] ${n.name}`);
      }

    lines.push("");
    lines.push(
      "Sugestão: transforme uma órfã em evergreen — adicione fonte, um link explícito e um exemplo pronto para copiar."
    );
    return lines.join("\n");
  }
}
