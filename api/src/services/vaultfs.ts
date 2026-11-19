/**
 * KAREN's markdown memory layer.
 *
 * Plain files, strict path allowlist, no traversal. The Postgres graph remains
 * the structured index; this directory is the human-readable memory/notes side
 * that can be opened in Obsidian. Default location is outside the git repo so
 * private notes and operator details are never committed.
 */
import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";

const DEFAULT_ROOT = "/home/admin/models/karen-vault";
const ALLOWED_DIRS = new Set([
  "00 Inbox",
  "10 Projects",
  "20 Areas",
  "30 Resources",
  "40 Archive",
  "decisions",
  "people",
  "projects",
]);
const MAX_FILE_BYTES = 60_000;

const MEMORY_SEED = `# MEMORY.md — memória persistente da KAREN

Atualize este arquivo quando aprender algo durável sobre o operador, decisões
ou projetos. Mantenha curto e factual.

## Operador
- Nome: (preencher)
- Preferências: (preencher)

## Decisões
- (nenhuma registrada)

## Projetos ativos
- KAREN: assistente local (SynapseVault + leads via OSM)

## Notas de longo prazo
- Use notas atômicas, links explícitos e maturidade seedling → budding → evergreen.
`;

export class VaultFsService {
  readonly root: string;

  constructor(root = process.env.KAREN_VAULT_DIR ?? DEFAULT_ROOT) {
    this.root = resolve(root);
  }

  private safe(relative: string): string {
    if (!relative || relative.includes("\0")) throw new Error("Caminho inválido.");
    const clean = relative.replace(/\\/g, "/").replace(/^\/+/, "");
    if (clean.split("/").some((part) => part === ".." || part === ".")) {
      throw new Error("Traversal de diretório não permitido.");
    }
    if (extname(clean) && extname(clean) !== ".md") {
      throw new Error("Somente arquivos .md são permitidos.");
    }
    const top = clean.split("/")[0];
    if (!ALLOWED_DIRS.has(top) && clean !== "MEMORY.md") {
      throw new Error(`Diretório não permitido: ${top}`);
    }
    const full = resolve(join(this.root, clean));
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error("Caminho fora do vault.");
    }
    return full;
  }

  async ensureStructure(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    for (const dir of ALLOWED_DIRS) {
      await mkdir(join(this.root, dir), { recursive: true });
    }
    await this.writeIfMissing("MEMORY.md", MEMORY_SEED);
  }

  private async writeIfMissing(relative: string, content: string): Promise<void> {
    const path = this.safe(relative);
    try {
      await stat(path);
    } catch {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
    }
  }

  async list(): Promise<string[]> {
    const out: string[] = [];
    for (const dir of ["", ...ALLOWED_DIRS]) {
      const full = dir ? join(this.root, dir) : this.root;
      const entries = await readdir(full, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        out.push(dir ? `${dir}/${entry.name}` : entry.name);
      }
    }
    return out.sort();
  }

  async read(relative: string): Promise<string> {
    const path = this.safe(relative);
    const data = await readFile(path, "utf8");
    if (Buffer.byteLength(data, "utf8") > MAX_FILE_BYTES) {
      throw new Error("Arquivo muito grande.");
    }
    return data;
  }

  async write(relative: string, content: string): Promise<void> {
    if (relative === "MEMORY.md") {
      throw new Error("Use remember() para atualizar MEMORY.md sem apagar o resto.");
    }
    const path = this.safe(relative);
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
      throw new Error("Conteúdo muito grande (máx 60 KB).");
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }

  /**
   * Append a single bullet under a known section of MEMORY.md. Deliberately
   * append-only: an LLM must never rewrite the whole memory file.
   */
  async appendMemory(section: string, content: string): Promise<void> {
    const allowed = ["Operador", "Decisões", "Projetos ativos", "Notas de longo prazo"];
    if (!allowed.includes(section)) throw new Error(`Seção inválida: ${section}`);
    const bullet = `- ${content.replace(/[\r\n]+/g, " ").trim().slice(0, 500)}`;
    let text: string;
    try {
      text = await this.read("MEMORY.md");
    } catch {
      text = MEMORY_SEED;
    }
    // Idempotent: the model may call remember twice in one tool loop.
    if (text.split("\n").some((line) => line.trim() === bullet)) return;
    const lines = text.split("\n");
    const heading = `## ${section}`;
    const idx = lines.findIndex((l) => l.trim() === heading);
    if (idx === -1) {
      text = `${text.trimEnd()}\n\n${heading}\n${bullet}\n`;
    } else {
      lines.splice(idx + 1, 0, bullet);
      text = lines.join("\n");
    }
    await writeFile(this.safe("MEMORY.md"), text, "utf8");
  }

  /** Short memory block injected into the agent's context. */
  async memory(maxChars = 4000): Promise<string> {
    try {
      const text = await this.read("MEMORY.md");
      return text.length > maxChars ? `${text.slice(0, maxChars)}\n…[truncated]` : text;
    } catch {
      return "(memória ainda não inicializada)";
    }
  }
}
