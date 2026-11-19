export type Stage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost';

export const STAGES: { id: Stage; label: string; tone: string }[] = [
  { id: 'new', label: 'New', tone: '#00f0ff' },
  { id: 'contacted', label: 'Contacted', tone: '#38bdf8' },
  { id: 'qualified', label: 'Qualified', tone: '#10b981' },
  { id: 'proposal', label: 'Proposal', tone: '#f59e0b' },
  { id: 'won', label: 'Won', tone: '#22c55e' },
  { id: 'lost', label: 'Lost', tone: '#ef4444' },
];

export type Temperature = 'hot' | 'warm' | 'cold';

export interface CrmLead {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  city: string | null;
  category: string | null;
  website: string | null;
  mapsUrl: string | null;
  rating: number | null;
  value: number;
  stage: Stage;
  owner: string;
  temperature: Temperature;
  lastActivity: string;
  source: 'live' | 'mock';
  draft?: { model?: string; signal?: string; firstTouch?: string; followUp?: string };
}

export interface CrmActivity {
  id: string;
  leadId: string;
  time: string;
  type: 'email' | 'call' | 'meeting' | 'note' | 'task';
  text: string;
  done?: boolean;
}

export const MOCK_LEADS: CrmLead[] = [
  { id: 'm1', name: 'Café Aurora', contact: 'Marina Costa', phone: '(11) 98801-2244', city: 'Guarulhos, SP', category: 'Cafeteria', website: 'cafeaurora.example', mapsUrl: 'https://maps.google.com/?q=Cafe+Aurora', rating: 4.7, value: 2400, stage: 'new', owner: 'KAREN', temperature: 'warm', lastActivity: '2h ago', source: 'mock', draft: { signal: 'High ratings, no website presence', firstTouch: 'Oi! Vi que o Café Aurora tem avaliações ótimas...', followUp: 'Só para confirmar: conseguiu ver a mensagem?' } },
  { id: 'm2', name: 'Studio Norte', contact: 'Rafael Lima', phone: '(11) 99712-8801', city: 'Guarulhos, SP', category: 'Design studio', website: 'studionorte.example', mapsUrl: 'https://maps.google.com/?q=Studio+Norte', rating: 4.5, value: 5200, stage: 'new', owner: 'KAREN', temperature: 'hot', lastActivity: '5h ago', source: 'mock', draft: { signal: 'Growing studio, active on social', firstTouch: 'Olá Rafael! Notei o trabalho do Studio Norte...' } },
  { id: 'm3', name: 'Borracharia 24h', contact: 'Carlos Souza', phone: '(11) 97654-1100', city: 'Guarulhos, SP', category: 'Auto service', website: null, mapsUrl: 'https://maps.google.com/?q=Borracharia+24h', rating: 4.2, value: 1800, stage: 'contacted', owner: 'KAREN', temperature: 'warm', lastActivity: 'Yesterday', source: 'mock', draft: { signal: 'No online presence', firstTouch: 'Boa tarde! Encontrei a Borracharia 24h no mapa...' } },
  { id: 'm4', name: 'Clínica Vida', contact: 'Dra. Helena Prado', phone: '(11) 98888-1010', city: 'São Paulo, SP', category: 'Healthcare', website: 'clinicavida.example', mapsUrl: 'https://maps.google.com/?q=Clinica+Vida', rating: 4.9, value: 8900, stage: 'contacted', owner: 'KAREN', temperature: 'hot', lastActivity: 'Yesterday', source: 'mock', draft: { signal: 'Top-rated clinic, expansion signs', firstTouch: 'Dra. Helena, parabéns pelo trabalho na Clínica Vida...' } },
  { id: 'm5', name: 'Mercado Bela Vista', contact: 'João Pereira', phone: '(11) 95544-3321', city: 'Guarulhos, SP', category: 'Retail', website: null, mapsUrl: 'https://maps.google.com/?q=Mercado+Bela+Vista', rating: 4.0, value: 3600, stage: 'qualified', owner: 'EVA', temperature: 'warm', lastActivity: '3d ago', source: 'mock', draft: { signal: 'Neighborhood staple', firstTouch: 'Olá João! O Mercado Bela Vista é referência no bairro...' } },
  { id: 'm6', name: 'Acme Corp', contact: 'Beatriz Nunes', phone: '(11) 91234-5678', city: 'São Paulo, SP', category: 'B2B services', website: 'acme.example', mapsUrl: 'https://maps.google.com/?q=Acme+Corp', rating: 4.3, value: 15000, stage: 'qualified', owner: 'KAREN', temperature: 'hot', lastActivity: '3d ago', source: 'mock', draft: { signal: 'Enterprise lead from SLA escalation', firstTouch: 'Beatriz, vi que tivemos um SLA em aberto...' } },
  { id: 'm7', name: 'Pet Shop Amigo', contact: 'Lucas Ferreira', phone: '(11) 97777-2211', city: 'Guarulhos, SP', category: 'Pet care', website: 'petshopamigo.example', mapsUrl: 'https://maps.google.com/?q=Pet+Shop+Amigo', rating: 4.6, value: 4200, stage: 'proposal', owner: 'EVA', temperature: 'hot', lastActivity: '4d ago', source: 'mock', draft: { signal: 'Proposal sent', firstTouch: 'Oi Lucas! Segue a proposta que preparamos...' } },
  { id: 'm8', name: 'Oficina Prime', contact: 'Diego Alves', phone: '(11) 93333-4455', city: 'Guarulhos, SP', category: 'Auto service', website: null, mapsUrl: 'https://maps.google.com/?q=Oficina+Prime', rating: 4.1, value: 2900, stage: 'proposal', owner: 'KAREN', temperature: 'warm', lastActivity: '5d ago', source: 'mock', draft: { signal: 'Awaiting decision', firstTouch: 'Diego, alguma dúvida sobre a proposta?' } },
  { id: 'm9', name: 'Padaria Estrela', contact: 'Ana Ribeiro', phone: '(11) 94444-6677', city: 'Guarulhos, SP', category: 'Bakery', website: 'padariaestrela.example', mapsUrl: 'https://maps.google.com/?q=Padaria+Estrela', rating: 4.8, value: 6100, stage: 'won', owner: 'KAREN', temperature: 'hot', lastActivity: '1w ago', source: 'mock', draft: { signal: 'Contract signed', firstTouch: 'Obrigado Ana! Vamos começar...' } },
  { id: 'm10', name: 'Loja Horizonte', contact: 'Paulo Mendes', phone: '(11) 96666-8899', city: 'Guarulhos, SP', category: 'Retail', website: null, mapsUrl: 'https://maps.google.com/?q=Loja+Horizonte', rating: 3.6, value: 1200, stage: 'lost', owner: 'EVA', temperature: 'cold', lastActivity: '2w ago', source: 'mock', draft: { signal: 'No fit — out of budget', firstTouch: 'Olá Paulo! Tudo bem?' } },
];

export const MOCK_ACTIVITIES: CrmActivity[] = [
  { id: 'a1', leadId: 'm7', time: '09:12', type: 'email', text: 'Proposal sent to Pet Shop Amigo' },
  { id: 'a2', leadId: 'm4', time: '08:40', type: 'call', text: 'Qualification call — budget confirmed' },
  { id: 'a3', leadId: 'm6', time: 'Yesterday', type: 'meeting', text: 'SLA escalation sync with Legal' },
  { id: 'a4', leadId: 'm1', time: 'Yesterday', type: 'note', text: 'Lead captured from OSM scrape' },
  { id: 'a5', leadId: 'm9', time: '2d ago', type: 'task', text: 'Onboarding checklist', done: true },
  { id: 'a6', leadId: 'm3', time: '3d ago', type: 'email', text: 'First-touch draft ready for review' },
];

export const MOCK_FORECAST = [
  { month: 'Jun', actual: 8, target: 10 },
  { month: 'Jul', actual: 12, target: 11 },
  { month: 'Aug', actual: 9, target: 12 },
  { month: 'Sep', actual: 15, target: 14 },
  { month: 'Oct', actual: 18, target: 16 },
  { month: 'Nov', actual: 21, target: 19 },
];
