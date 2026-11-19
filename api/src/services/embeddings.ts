/**
 * Cloudflare Workers AI embeddings — free tier, zero data retention.
 *
 * Uses the OpenAI-compatible /v1/embeddings endpoint so the same code works
 * against any compatible provider. Disabled when credentials are absent;
 * the vault then falls back to plain ILIKE search.
 */
export interface EmbeddingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  dim: number;
}

export function embeddingConfigFromEnv(): EmbeddingConfig | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) return null;
  return {
    baseUrl:
      process.env.EMBEDDING_BASE_URL ??
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
    apiKey: token,
    model: process.env.EMBEDDING_MODEL ?? "@cf/baai/bge-m3",
    dim: Number(process.env.EMBEDDING_DIM ?? 1024),
  };
}

export class EmbeddingService {
  constructor(private readonly config: EmbeddingConfig) {}

  get model(): string {
    return this.config.model;
  }

  get dim(): number {
    return this.config.dim;
  }

  /** pgvector literal, e.g. "[0.1,0.2,...]" */
  toPgVector(values: number[]): string {
    if (values.length !== this.config.dim) {
      throw new Error(
        `Embedding dim mismatch: got ${values.length}, expected ${this.config.dim}`
      );
    }
    return `[${values.join(",")}]`;
  }

  async embed(inputs: string[]): Promise<number[][]> {
    if (inputs.length === 0) return [];
    const res = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({ model: this.config.model, input: inputs }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Embedding API error ${res.status}: ${body.slice(0, 300)}`);
    }
    const json: any = await res.json();
    const vectors: number[][] = (json.data ?? [])
      .slice()
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
      .map((item: any) => item.embedding as number[]);
    if (vectors.length !== inputs.length) {
      throw new Error(
        `Embedding count mismatch: got ${vectors.length}, expected ${inputs.length}`
      );
    }
    return vectors;
  }

  async embedOne(input: string): Promise<number[]> {
    return (await this.embed([input]))[0];
  }
}
