import { useState } from 'react';
import { useProgramStore } from '@/store/programStore';
import type { Program, PhaseType } from '@/types/program';
import { Button, Badge } from '@/components/ui';
import { SessionEditor } from '@/components/SessionEditor';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import './PhaseList.css';

const PHASE_TYPES: PhaseType[] = ['accumulation', 'intensification', 'peaking', 'deload'];
const PHASE_VARIANT: Record<PhaseType, 'muted' | 'warning' | 'accent' | 'info'> = {
  accumulation: 'muted', intensification: 'warning', peaking: 'accent', deload: 'info',
};

interface Props { program: Program; }

export function PhaseList({ program }: Props) {
  const { addPhase, deletePhase, addSession } = useProgramStore();
  const [openPhase, setOpenPhase] = useState<string | null>(program.phases[0]?.id ?? null);
  const [addingPhase, setAddingPhase] = useState(false);
  const [phaseForm, setPhaseForm] = useState({ name: '', type: 'accumulation' as PhaseType, weekStart: 1, weekEnd: 4 });

  function handleAddPhase() {
    if (!phaseForm.name.trim()) return;
    addPhase(program.id, {
      name: phaseForm.name.trim(),
      type: phaseForm.type,
      orderIndex: program.phases.length,
      weekStart: phaseForm.weekStart,
      weekEnd: phaseForm.weekEnd,
    });
    setAddingPhase(false);
    setPhaseForm({ name: '', type: 'accumulation', weekStart: 1, weekEnd: 4 });
  }

  const phaseSessions = (phaseId: string) =>
    program.sessions.filter((s) => s.phaseId === phaseId).sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div className="phase-list">
      {program.phases.map((phase) => (
        <div key={phase.id} className="phase-list__item">
          <button className="phase-list__header" onClick={() => setOpenPhase(openPhase === phase.id ? null : phase.id)}>
            <div className="phase-list__header-left">
              <Badge label={phase.type} variant={PHASE_VARIANT[phase.type]} />
              <span className="phase-list__name">{phase.name}</span>
            </div>
            <div className="phase-list__header-right">
              <span className="phase-list__weeks">Wk {phase.weekStart}–{phase.weekEnd}</span>
              <button className="phase-list__del" onClick={(e) => { e.stopPropagation(); deletePhase(program.id, phase.id); }}>
                <Trash2 size={13} />
              </button>
              {openPhase === phase.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </div>
          </button>

          {openPhase === phase.id && (
            <div className="phase-list__body">
              {phaseSessions(phase.id).map((session) => (
                <SessionEditor key={session.id} session={session} program={program} />
              ))}
              <Button size="sm" variant="ghost" onClick={() => addSession({
                phaseId: phase.id,
                name: 'New session',
                dayOfWeek: 1,
                orderIndex: phaseSessions(phase.id).length,
              })}>
                <Plus size={13} /> Add session
              </Button>
            </div>
          )}
        </div>
      ))}

      {addingPhase ? (
        <div className="phase-form">
          <input placeholder="Phase name" value={phaseForm.name}
            onChange={(e) => setPhaseForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
          <select value={phaseForm.type} onChange={(e) => setPhaseForm((f) => ({ ...f, type: e.target.value as PhaseType }))}>
            {PHASE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <div className="phase-form__weeks">
            <label>Week start<input type="number" min="1" value={phaseForm.weekStart}
              onChange={(e) => setPhaseForm((f) => ({ ...f, weekStart: Number(e.target.value) }))} /></label>
            <label>Week end<input type="number" min="1" value={phaseForm.weekEnd}
              onChange={(e) => setPhaseForm((f) => ({ ...f, weekEnd: Number(e.target.value) }))} /></label>
          </div>
          <div className="phase-form__actions">
            <Button size="sm" variant="ghost" onClick={() => setAddingPhase(false)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={handleAddPhase} disabled={!phaseForm.name.trim()}>Add phase</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setAddingPhase(true)}>
          <Plus size={14} /> Add phase
        </Button>
      )}
    </div>
  );
}
