import { useState } from 'react';
import { useProgramStore } from '@/store/programStore';
import { Button, Badge, Card, EmptyState } from '@/components/ui';
import { ProgramEditor } from '@/components/ProgramEditor';
import { PhaseList } from '@/components/PhaseList';
import { Plus, Layers } from 'lucide-react';
import './ProgramPage.css';

export function ProgramPage() {
  const { programs, activeProgram, createProgram, setActiveProgram } = useProgramStore();
  const [showNew, setShowNew] = useState(false);
  const [viewingProgramId, setViewingProgramId] = useState<string | null>(
    activeProgram?.id ?? null
  );

  const viewingProgram = programs.find((p) => p.id === viewingProgramId) ?? null;

  function handleCreate(name: string, description: string) {
    const p = createProgram({ name, description, status: 'archived' });
    setViewingProgramId(p.id);
    setShowNew(false);
  }

  if (viewingProgram) {
    return (
      <div className="program-page">
        <div className="program-page__header">
          <button className="program-page__back" onClick={() => setViewingProgramId(null)}>
            ← Programs
          </button>
          <div className="program-page__header-right">
            {viewingProgram.status !== 'active' && (
              <Button size="sm" variant="primary" onClick={() => setActiveProgram(viewingProgram.id)}>
                Set active
              </Button>
            )}
            {viewingProgram.status === 'active' && <Badge label="Active" variant="accent" size="md" />}
          </div>
        </div>
        <div className="program-page__title-row">
          <h1 className="program-page__title">{viewingProgram.name}</h1>
          {viewingProgram.description && (
            <p className="program-page__desc">{viewingProgram.description}</p>
          )}
        </div>
        <PhaseList program={viewingProgram} />
      </div>
    );
  }

  return (
    <div className="program-page">
      <div className="program-page__header">
        <h1 className="program-page__title">Programs</h1>
        <Button size="sm" variant="primary" onClick={() => setShowNew(true)}>
          <Plus size={14} /> New
        </Button>
      </div>

      {showNew && (
        <ProgramEditor onSave={handleCreate} onCancel={() => setShowNew(false)} />
      )}

      {programs.length === 0 && !showNew && (
        <EmptyState
          icon={<Layers size={36} />}
          title="No programs yet"
          description="Create your first training program to get started."
          action={<Button variant="primary" onClick={() => setShowNew(true)}>Create program</Button>}
        />
      )}

      {programs.map((p) => (
        <Card key={p.id} onClick={() => setViewingProgramId(p.id)} className="program-card">
          <div className="program-card__row">
            <span className="program-card__name">{p.name}</span>
            {p.status === 'active'
              ? <Badge label="Active" variant="accent" />
              : <Badge label="Archived" variant="muted" />}
          </div>
          {p.description && <p className="program-card__desc">{p.description}</p>}
          <p className="program-card__meta">
            {p.phases.length} phase{p.phases.length !== 1 ? 's' : ''} · {p.sessions.length} session{p.sessions.length !== 1 ? 's' : ''}
          </p>
        </Card>
      ))}
    </div>
  );
}
