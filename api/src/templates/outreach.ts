/**
 * The four proven WhatsApp templates, stored as data so the agent never
 * improvises the outreach rules. Each draft uses only real scraped signals;
 * the first touch never carries a link.
 */
import type { ScrapedPlace } from "../services/apify.js";

export interface OutreachDraft {
  model: "vizinho" | "observador" | "agilidade";
  signal: string;
  firstTouch: string;
  followUp: string;
}

export interface DraftContext {
  operatorName: string;
  exampleLink: string;
}

function compactPlace(place: ScrapedPlace): string {
  return [place.neighborhood, place.city].filter(Boolean).join(", ");
}

function pickModel(place: ScrapedPlace): OutreachDraft["model"] {
  const category = (place.category ?? "").toLowerCase();
  if (/marmita|self[- ]?service|lanch|burger|pizza|pastel|acompanh/.test(category)) {
    return "agilidade";
  }
  if ((place.rating ?? 0) >= 4 || (place.reviewsCount ?? 0) >= 20) {
    return "observador";
  }
  return "vizinho";
}

function signalFor(place: ScrapedPlace): string {
  if ((place.rating ?? 0) >= 4) {
    return `suas avaliações (${place.rating!.toFixed(1)} estrelas${place.reviewsCount ? `, ${place.reviewsCount} avaliações` : ""})`;
  }
  if ((place.reviewsCount ?? 0) >= 20) {
    return `suas ${place.reviewsCount} avaliações no Google`;
  }
  if (place.category) return `a categoria ${place.category}`;
  return "o perfil de vocês no Google Maps";
}

export function draftFor(place: ScrapedPlace, ctx: DraftContext): OutreachDraft {
  const model = pickModel(place);
  const name = place.title;
  const local = compactPlace(place);
  const who = ctx.operatorName;
  const first = `${name}`;
  const signal = signalFor(place);
  let firstTouch: string;

  if (model === "observador") {
    firstTouch = [
      `Oi, equipe do ${first}! Tudo bom?`,
      "",
      `Sou da região${local ? ` (${local})` : ""} e estava olhando o perfil de vocês. Vi ${signal}, mas notei que não têm um link de cardápio online para facilitar o pedido do cliente.`,
      "",
      `Desenvolvi um cardápio digital bem leve e rápido. Posso te mandar um exemplo de como ficaria o de vocês? Leva 1 minuto para ver.`,
    ].join("\n");
  } else if (model === "agilidade") {
    firstTouch = [
      `Olá, tudo bem? Me chamo ${who}, sou da região${local ? ` (${local})` : ""}.`,
      "",
      `Sei que no horário do almoço a correria é grande e atender muitos pedidos no WhatsApp pode gerar confusão ou demora. Estou ajudando restaurantes aqui por perto a organizarem os pedidos com um cardápio digital que o próprio cliente monta.`,
      "",
      `Posso te mostrar um modelo rapidinho de como funciona? É só para vocês conhecerem, sem compromisso.`,
    ].join("\n");
  } else {
    firstTouch = [
      `Olá, tudo bem? Me chamo ${who}, sou desenvolvedor aqui da região${local ? ` (${local})` : ""}.`,
      "",
      `Estou criando uma ferramenta simples de cardápio digital para ajudar restaurantes da região a receberem pedidos de forma mais organizada (sem aquele monte de mensagem solta no WhatsApp).`,
      "",
      `Fiz um protótipo rápido e gratuito com o nome de vocês só para vocês verem como ficaria. Posso te enviar o link aqui sem compromisso para darem uma olhada?`,
    ].join("\n");
  }

  const followUp = [
    `Oi, ${first}! Imagino que a correria aí seja grande.`,
    "",
    `Só passando para deixar o link do modelo que comentei, caso queiram dar uma olhada quando tiverem um tempinho: ${ctx.exampleLink}`,
    "",
    `Se fizer sentido para vocês, me avisem que explico como é simples de configurar. Um abraço!`,
  ].join("\n");

  return { model, signal, firstTouch, followUp };
}
