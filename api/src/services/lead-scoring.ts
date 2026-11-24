/**
 * Explainable lead scoring for the Climara pipeline (Fase 5).
 * Pure functions: no DB, no network, no side effects.
 */
export interface ScoreInput {
  title?: string | null;
  phone?: string | null;
  website?: string | null;
  category?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  mapsUrl?: string | null;
  openingHours?: string | null;
}

export interface ScoreResult {
  score: number;
  bucket: "high" | "medium" | "low";
  reasons: string[];
}

const FIT_CATEGORIES = [
  "restaurant", "cafe", "bar", "shop", "store", "clinic", "dentist",
  "pharmacy", "bakery", "salon", "loja", "comércio", "comercio",
  "serviço", "servico", "escritório", "escritorio",
];

function isSocialSite(website: string): boolean {
  return /facebook|instagram|linkedin|wa\.me|whatsapp|youtube/i.test(website);
}

/** Score 0–100 with the exact reasons that produced it. */
export function scoreLead(input: ScoreInput): ScoreResult {
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(`+${points} ${reason}`);
  };

  if (input.phone?.trim()) add(25, "telefone público disponível");
  if (input.address?.trim()) add(10, "endereço público disponível");
  if (input.mapsUrl?.trim()) add(5, "perfil no mapas disponível");

  const website = input.website?.trim() ?? "";
  if (!website) add(25, "sem site próprio encontrado");
  else if (isSocialSite(website)) add(15, "presença apenas em rede social");
  else reasons.push("+0 já possui site próprio");

  const category = (input.category ?? "").toLowerCase();
  if (FIT_CATEGORIES.some((term) => category.includes(term))) {
    add(15, "categoria adequada para um site simples");
  } else {
    add(5, "categoria fora do recorte principal");
  }

  if ((input.rating ?? 0) >= 4) add(10, "avaliação pública positiva");
  if ((input.reviewsCount ?? 0) >= 20) add(10, "volume de avaliações indica atividade");
  if (input.openingHours?.trim()) add(5, "horário de funcionamento público");

  const words = (input.title ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) add(5, "nome específico, não genérico");

  const capped = Math.min(100, Math.max(0, score));
  const bucket = capped >= 70 ? "high" : capped >= 50 ? "medium" : "low";
  return { score: capped, bucket, reasons };
}
