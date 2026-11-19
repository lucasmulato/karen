export interface ApprovalItem {
  id: string;
  title: string;
  risk: number;
  severity: 'medium' | 'high';
  target: string;
  system: string;
  diff: string;
  requestedBy: string;
  createdAt: string;
}

export const MOCK_APPROVALS: ApprovalItem[] = [
  {
    id: 'apr-2041',
    title: 'Draft Invoice Payout — $420.00',
    risk: 35,
    severity: 'medium',
    target: 'Invoice #INV-0891 · Vendor: Northwind Supplies',
    system: 'QuickBooks',
    diff: `{\n  "action": "create_bill_payment",\n  "amount": 420.00,\n  "currency": "USD",\n  "vendor_id": "VN-118",\n  "memo": "Q4 infrastructure supplies",\n  "requires_human_signoff": true\n}`,
    requestedBy: 'autonomous://finance-loop',
    createdAt: '12:41:08',
  },
  {
    id: 'apr-2042',
    title: 'Route Urgent SLA Email to Legal',
    risk: 72,
    severity: 'high',
    target: 'Thread #SLA-4471 · Customer: Acme Corp',
    system: 'Gmail / Jira',
    diff: `{\n  "action": "escalate_thread",\n  "to": "legal@company.local",\n  "ticket": "LEG-902",\n  "priority": "P1",\n  "reason": "SLA breach — 6h overdue",\n  "external_send": false\n}`,
    requestedBy: 'autonomous://sla-monitor',
    createdAt: '12:38:52',
  },
  {
    id: 'apr-2043',
    title: 'Inventory Order #8042',
    risk: 48,
    severity: 'medium',
    target: 'SKU-2291 · Restock threshold reached',
    system: 'Inventory DB',
    diff: `{\n  "action": "create_purchase_order",\n  "sku": "SKU-2291",\n  "quantity": 120,\n  "unit_cost": 4.75,\n  "approver": "executive",\n  "dry_run": true\n}`,
    requestedBy: 'autonomous://inventory-loop',
    createdAt: '12:31:17',
  },
];

export type AuditLevel = 'INFO' | 'POLICY_PASS' | 'PENDING_APPROVAL' | 'EXECUTED' | 'BLOCKED';

export interface AuditEvent {
  id: string;
  time: string;
  level: AuditLevel;
  message: string;
  promptHash: string;
  reasoning: string[];
  txId: string;
}

export const MOCK_AUDIT: AuditEvent[] = [
  {
    id: 'log-1', time: '12:44:02', level: 'INFO',
    message: 'Webhook received from Jira · issue LEG-902 updated',
    promptHash: 'sha256:9f2c1a...e41b', reasoning: ['Normalize inbound payload', 'Map fields to internal schema'], txId: 'tx-0000-0000',
  },
  {
    id: 'log-2', time: '12:43:58', level: 'POLICY_PASS',
    message: 'GBNF schema compliance 100% · output validated',
    promptHash: 'sha256:3ba81d...77c0', reasoning: ['Validate tool call against allowlist', 'Confirm no arbitrary shell access'], txId: 'tx-a1f0-2291',
  },
  {
    id: 'log-3', time: '12:42:31', level: 'PENDING_APPROVAL',
    message: 'Financial action queued · awaiting executive sign-off',
    promptHash: 'sha256:7de902...ab13', reasoning: ['Risk score 35 exceeds auto-execute threshold', 'Escalate to HITL gate'], txId: 'tx-b203-1180',
  },
  {
    id: 'log-4', time: '12:41:09', level: 'EXECUTED',
    message: 'READ_ONLY query completed · inventory snapshot',
    promptHash: 'sha256:0cc451...9d2f', reasoning: ['Permission READ_ONLY verified', 'Query parameterized'], txId: 'tx-cc40-7712',
  },
  {
    id: 'log-5', time: '12:39:44', level: 'BLOCKED',
    message: 'Prompt injection pattern rejected by sanitizer',
    promptHash: 'sha256:fa0193...0b77', reasoning: ['Detected instruction override in untrusted document', 'Drop untrusted segment'], txId: 'tx-0000-0009',
  },
  {
    id: 'log-6', time: '12:38:12', level: 'POLICY_PASS',
    message: 'Role binding verified · BOUNDED_WRITE within scope',
    promptHash: 'sha256:bc7710...3ef2', reasoning: ['Check RBAC badge for target', 'Confirm write confined to fields'], txId: 'tx-8a10-4431',
  },
];

export type Rbac = 'READ_ONLY' | 'BOUNDED_WRITE' | 'APPROVAL_REQUIRED';

export interface ToolStatus {
  id: string;
  name: string;
  rbac: Rbac;
  status: 'connected' | 'degraded' | 'offline';
  callsToday: number;
}

export const MOCK_TOOLS: ToolStatus[] = [
  { id: 'gmail', name: 'Gmail', rbac: 'APPROVAL_REQUIRED', status: 'connected', callsToday: 38 },
  { id: 'jira', name: 'Jira', rbac: 'BOUNDED_WRITE', status: 'connected', callsToday: 27 },
  { id: 'quickbooks', name: 'QuickBooks', rbac: 'APPROVAL_REQUIRED', status: 'connected', callsToday: 12 },
  { id: 'inventory', name: 'Inventory DB', rbac: 'READ_ONLY', status: 'connected', callsToday: 41 },
  { id: 'slack', name: 'Slack', rbac: 'BOUNDED_WRITE', status: 'degraded', callsToday: 9 },
];

export const MOCK_DEFENSE = {
  sanitizerActive: true,
  breaches: 0,
  documentsSanitized: 142,
  grammarViolations: 0,
  compliance: 100,
};

export const WORKFLOW_STAGES = [
  'Perceive / Webhook',
  'Schema Parse',
  'Policy Check',
  'HITL Gate',
  'Execution',
] as const;

export interface ActiveLoop {
  id: string;
  name: string;
  stage: number;
  detail: string;
}

export const MOCK_LOOPS: ActiveLoop[] = [
  { id: 'loop-mail', name: 'Email triage', stage: 2, detail: 'Monitoring inbox · 12 messages scanned' },
  { id: 'loop-tickets', name: 'Ticket watch', stage: 3, detail: 'SLA queue · 1 escalation pending' },
  { id: 'loop-inventory', name: 'Inventory', stage: 1, detail: 'Stock thresholds · 4 SKUs watched' },
  { id: 'loop-logs', name: 'Log sentinel', stage: 4, detail: 'Audit stream · 0 anomalies' },
];

export const MOCK_VRAM = [2.1, 2.2, 2.4, 2.3, 2.6, 2.5, 2.7, 2.6, 2.8, 2.7, 2.8, 2.8];

export const MOCK_CALL_FREQUENCY = [
  { hour: '00', calls: 3 }, { hour: '04', calls: 1 }, { hour: '08', calls: 14 },
  { hour: '12', calls: 22 }, { hour: '16', calls: 18 }, { hour: '20', calls: 7 },
];

export const TELEMETRY_MOCK = {
  model: 'Qwen3-4B-Q4_K_M',
  runtime: 'Ollama',
  vramUsed: 2.8,
  vramTotal: 11.0,
  context: 8192,
  tokensPerSecond: 34.2,
  policyGateway: 'Active',
  compliance: 100,
};
