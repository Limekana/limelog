import { useState } from 'react';
import { useProgramStore } from '@/store/programStore';
import type { Program, SessionTemplate, DayOfWeek } from '@/types/program';
import { Button } from '@/components/ui';
import { SessionExerciseRow } from '@/components/SessionExerciseRow';
import { ChevronDown, ChevronUp, Plus, Trash2, BookmarkPlus, FolderOpen } from 'lucide-react';
import './SessionEditor.css';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  session: SessionTemplate;
  program: Program;
}

export function SessionEditor({ session, program }: Props) {
  const { updateSession, deleteSession, addSessionExercise, workoutTemplates, saveAsTemplate, applyTemplate, deleteWorkoutTemplate } = useProgramStore();
  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(session.name);

  // Template UI state
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showLoadTemplate, setShowLoadTemplate] = useState(false);

  const sortedExercises = [...session.exercises].sort((a, b) => a.orderIndex - b.orderIndex);

  function handleNameSave() {
    if (name.trim()) updateSession(session.id, { name: name.trim() });
    setEditingName(false);
  }

  function handleDayChange(day: DayOfWeek) {
    updateSession(session.id, { dayOfWeek: day });
  }

  function handleAddExercise() {
    const exercises = useProgramStore.getState().exercises;
    if (exercises.length === 0) return;
    addSessionExercise(session.id, {
      exerciseId: exercises[0].id,
      orderIndex: sortedExercises.length,
      targetSets: 3,
      targetReps: '8–10',
    });
  }

  function handleSaveTemplate() {
    if (!templateName.trim()) return;
    saveAsTemplate(templateName.trim(), session);
    setTemplateName('');
    setShowSaveTemplate(false);
  }

  function handleApplyTemplate(templateId: string) {
    applyTemplate(session.id, templateId);
    setShowLoadTemplate(false);
  }

  return (
    <div className="session-editor">
      <button className="session-editor__header" onClick={() => setOpen((v) => !v)}>
        <div className="session-editor__header-left">
          {editingName ? (
            <input
              className="session-editor__name-input"
              value={name}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
            />
          ) : (
            <span
              className="session-editor__name"
              onDoubleClick={(e) => { e.stopPropagation(); setEditingName(true); }}
            >
              {session.name}
            </span>
          )}
          <span className="session-editor__day">{DAY_NAMES[session.dayOfWeek]}</span>
        </div>
        <div className="session-editor__header-right">
          <button className="session-editor__del" onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}>
            <Trash2 size={12} />
          </button>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div className="session-editor__body">
          <div className="session-editor__days">
            {DAY_NAMES.map((d, i) => (
              <button
                key={d}
                className={`session-editor__day-btn${session.dayOfWeek === i ? ' session-editor__day-btn--active' : ''}`}
                onClick={() => handleDayChange(i as DayOfWeek)}
              >
                {d}
              </button>
            ))}
          </div>

          {/* ── Template toolbar ── */}
          <div className="session-editor__template-bar">
            <button
              className="session-editor__tpl-btn"
              onClick={() => { setShowLoadTemplate((v) => !v); setShowSaveTemplate(false); }}
              title="Load from template"
            >
              <FolderOpen size={13} /> Load template
            </button>
            <button
              className="session-editor__tpl-btn"
              onClick={() => { setShowSaveTemplate((v) => !v); setShowLoadTemplate(false); setTemplateName(session.name); }}
              title="Save as template"
            >
              <BookmarkPlus size={13} /> Save as template
            </button>
          </div>

          {/* ── Save template form ── */}
          {showSaveTemplate && (
            <div className="session-editor__tpl-form">
              <input
                autoFocus
                placeholder="Template name…"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTemplate()}
              />
              <div className="session-editor__tpl-form-actions">
                <Button size="sm" variant="ghost" onClick={() => setShowSaveTemplate(false)}>Cancel</Button>
                <Button size="sm" variant="primary" onClick={handleSaveTemplate} disabled={!templateName.trim()}>Save</Button>
              </div>
            </div>
          )}

          {/* ── Load template picker ── */}
          {showLoadTemplate && (
            <div className="session-editor__tpl-picker">
              {workoutTemplates.length === 0 ? (
                <p className="session-editor__tpl-empty">No saved templates yet. Build a session and save it above.</p>
              ) : (
                workoutTemplates.map((t) => (
                  <div key={t.id} className="session-editor__tpl-item">
                    <div className="session-editor__tpl-item-info">
                      <span className="session-editor__tpl-item-name">{t.name}</span>
                      <span className="session-editor__tpl-item-meta">{t.exercises.length} exercise{t.exercises.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="session-editor__tpl-item-actions">
                      <button
                        className="session-editor__tpl-load"
                        onClick={() => handleApplyTemplate(t.id)}
                        title="Load into this session (replaces current exercises)"
                      >
                        Load
                      </button>
                      <button
                        className="session-editor__tpl-del"
                        onClick={() => deleteWorkoutTemplate(t.id)}
                        title="Delete template"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
              <Button size="sm" variant="ghost" onClick={() => setShowLoadTemplate(false)}>Close</Button>
            </div>
          )}

          {sortedExercises.map((se) => (
            <SessionExerciseRow key={se.id} sessionExercise={se} sessionId={session.id} program={program} />
          ))}

          <Button size="sm" variant="ghost" onClick={handleAddExercise}>
            <Plus size={13} /> Add exercise
          </Button>
        </div>
      )}
    </div>
  );
}
