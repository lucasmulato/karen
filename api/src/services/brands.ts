/**
 * Brand/context configuration for the multi-company setup.
 *
 * Karen (microagência + segurança) and Climara (empresa da Lucas e da Maria
 * Luiza) share the same engine but must never mix leads, prompts or approvals.
 * Nothing here is a secret; secrets stay in the env file outside the repo.
 */
export const BRANDS = ["karen", "climara"] as const;
export type Brand = (typeof BRANDS)[number];

export type Role = "owner" | "marketing";

export interface BrandConfig {
  id: Brand;
  name: string;
  operatorName: string;
  exampleLink: string;
  offer: string;
  voice: string;
}

const DEFAULTS: Record<Brand, BrandConfig> = {
  karen: {
    id: "karen",
    name: "KAREN",
    operatorName: process.env.OPERATOR_NAME?.trim() || "Lucas Mulato",
    exampleLink:
      process.env.KAREN_EXAMPLE_LINK?.trim() || "[LINK DO CARDAPIFY DE EXEMPLO]",
    offer:
      "sites e cardápios digitais leves para estabelecimentos locais",
    voice: "direta, 1:1, sem link na primeira mensagem, sem jargão",
  },
  climara: {
    id: "climara",
    name: "Climara",
    operatorName: process.env.CLIMARA_OPERATOR_NAME?.trim() || "Maria Luiza",
    exampleLink: process.env.CLIMARA_EXAMPLE_LINK?.trim() || "[LINK DA CLIMARA]",
    // Real briefing from the public site (24/11/2026). Sites are the main
    // frente; energia limpa/eficiência vem depois. Qualitative on purpose:
    // no price, percentage, deadline, partner name or any other number may
    // enter a prompt. Partners remain only in EVA's internal weekly plan.
    offer:
      "construção de sites claros, rápidos e adaptados ao celular, feitos para apresentar o negócio e facilitar o contato; como segunda frente, energia limpa e eficiência para casa e pequeno comércio",
    voice:
      "direta e acolhedora, sem jargão, sem greenwashing, português brasileiro, sem números ou promessa que não esteja no briefing",
  },
};

export function isBrand(value: unknown): value is Brand {
  return typeof value === "string" && (BRANDS as readonly string[]).includes(value);
}

export function brandConfig(value: unknown): BrandConfig {
  const id: Brand = isBrand(value) ? value : "karen";
  return { ...DEFAULTS[id] };
}

/** Brands a session may see. Marketing is scoped to Climara only. */
export function brandsForRole(role: Role | undefined, allowed?: string[]): Brand[] {
  const explicit = (allowed ?? []).filter(isBrand);
  if (role === "marketing") {
    const scoped = explicit.length ? explicit.filter((b) => b === "climara") : ["climara" as Brand];
    return scoped.length ? scoped : ["climara" as Brand];
  }
  return explicit.length ? explicit : [...BRANDS];
}

/** Throw-style guard used by HTTP handlers before touching brand data. */
export function assertBrandAllowed(
  role: Role | undefined,
  allowed: string[] | undefined,
  brand: unknown
): Brand {
  if (!isBrand(brand)) throw new Error("Marca inválida. Use karen ou climara.");
  if (!brandsForRole(role, allowed).includes(brand)) {
    throw new Error("Sem acesso a essa marca.");
  }
  return brand;
}
