import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { useCooTelemetry } from '../../lib/cooTelemetry';
import ApprovalCard, { type Decision } from './ApprovalCard';
import AuditStream from './AuditStream';
import DirectiveTerminal from './DirectiveTerminal';
import TelemetryHeader from './TelemetryHeader';
import ToolMatrix from './ToolMatrix';
import WorkflowEngine from './WorkflowEngine';
import { MOCK_APPROVALS, MOCK_AUDIT, type ApprovalItem, type AuditEvent } from './mockData';

interface Props {
  onOpenWorkspace: () => void;
}

let seq = 0;
const nextId = () => `evt-${Date.now()}-${seq++}`;

export default function CooDashboard({ onOpenWorkspace }: Props) {
  const reduced = useReducedMotion();
  const telemetry = useCooTelemetry();
  const [approvals, setApprovals] = useState<ApprovalItem[]>(MOCK_APPROVALS);
  const [events, setEvents] = useState<AuditEvent[]>(MOCK_AUDIT);

  const onDecide = (id: string, decision: Decision) => {
    const item = approvals.find((a) => a.id === id);
    if (!item) return;
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    setEvents((prev) => [
      ...prev,
      {
        id: nextId(),
        time: new Date().toLocaleTimeString(),
        level: decision === 'reject' ? 'BLOCKED' : decision === 'approve' ? 'EXECUTED' : 'PENDING_APPROVAL',
        message: `${decision.toUpperCase()} (simulated) · ${item.title}`,
        promptHash: `sha256:decision...${id}`,
        reasoning: ['Human decision captured', 'No real system mutation performed'],
        txId: `sim-${id}`,
      },
    ]);
  };

  const onDirective = (text: string) => {
    setEvents((prev) => [
      ...prev,
      {
        id: nextId(),
        time: new Date().toLocaleTimeString(),
        level: 'EXECUTED',
        message: `Directive acknowledged (simulated): ${text}`,
        promptHash: `sha256:directive...${prev.length}`,
        reasoning: ['Directive parsed against allowlist', 'Execution simulated — no command run'],
        txId: `sim-dir-${prev.length}`,
      },
    ]);
  };

  return (
    <div className="hud-grid min-h-screen bg-hud-bg text-slate-200">
      <div className="mx-auto max-w-[1600px] space-y-4 p-4">
        <TelemetryHeader
          onOpenWorkspace={onOpenWorkspace}
          health={telemetry.health}
          live={telemetry.live}
          updatedAt={telemetry.updatedAt}
        />

        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <div className="min-w-0 space-y-4">
            <section className="hud-glass rounded-xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-hud-amber" />
                  <h2 className="text-sm font-semibold text-slate-100">Pending Human Approval Queue</h2>
                </div>
                <span className="rounded-full border border-hud-amber/40 bg-hud-amber/10 px-2.5 py-1 text-[10px] font-semibold text-hud-amber">
                  HITL GATE · {approvals.length} pending
                </span>
              </div>
              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {approvals.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={reduced ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <ApprovalCard item={item} onDecide={onDecide} />
                    </motion.div>
                  ))}
                </AnimatePresence>
                {approvals.length === 0 && (
                  <div className="rounded-lg border border-hud-emerald/30 bg-hud-emerald/5 p-6 text-center text-[12px] text-hud-emerald">
                    Queue clear — no actions awaiting executive sign-off.
                  </div>
                )}
              </div>
            </section>

            <WorkflowEngine />
          </div>

          <div className="min-w-0 space-y-4">
            <ToolMatrix
              totalRuns={telemetry.runs.length}
              lastRunStatus={telemetry.runs[0]?.status}
            />
            <AuditStream events={events} activity={telemetry.activity} />
          </div>
        </div>

        <DirectiveTerminal onDirective={onDirective} />
        <p className="pb-2 text-center font-mono text-[9px] text-slate-600">
          KAREN COO · BOUNDED AUTONOMY · approvals, kill-switch and directives are simulated; telemetry is read-only.
        </p>
      </div>
    </div>
  );
}
