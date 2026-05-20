import { useState, useMemo } from 'react';
import { useProgramStore } from '@/store/programStore';
import { BUILTIN_EXERCISES } from '@/data/builtinExercises';
import type { MovementPattern, Equipment } from '@/types';
import { Button } from '@/components/ui';
import { Plus, Trash2, Search, ChevronDown, ChevronUp, Dumbbell } from 'lucide-react';
import './ExerciseLibrary.css';

const PATTERNS: MovementPattern[] = ['push','pull','hinge','squat','carry','jump','core','accessory'];
const EQUIPMENT: Equipment[] = ['barbell','dumbbell','machine','cable','bodyweight','band','kettlebell','other'];

const PATTERN_LABELS: Record<MovementPattern, string> = {
  push: 'Push', pull: 'Pull', hinge: 'Hinge', squat: 'Squat',
  carry: 'Carry', jump: 'Jump / Plyo', core: 'Core', accessory: 'Accessory',
};

type Tab = 'library' | 'custom';

export function ExerciseLibrary() {
  const { exercises, addExercise, deleteExercise } = useProgramStore();

  const [tab, setTab] = useState<Tab>('library');
  const [search, setSearch] = useState('');
  const [filterPattern, setFilterPattern] = useState<MovementPattern | 'all'>('all');
  const [filterEquip, setFilterEquip] = useState<Equipment | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Custom exercise form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', movementPattern: 'squat' as MovementPattern,
    primaryMuscle: '', equipment: 'barbell' as Equipment, isBilateral: true,
  });

  // Split exercises into built-in vs custom
  const builtinNames = useMemo(() => new Set(BUILTIN_EXERCISES.map((e) => e.name)), []);
  const customExercises = exercises.filter((e) => !builtinNames.has(e.name));

  // Filter logic for library tab (shows built-ins, can add them if not already in store)
  const filteredBuiltin = useMemo(() => {
    return BUILTIN_EXERCISES.filter((e) => {
      const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.primaryMuscle.toLowerCase().includes(search.toLowerCase());
      const matchPattern = filterPattern === 'all' || e.movementPattern === filterPattern;
      const matchEquip = filterEquip === 'all' || e.equipment === filterEquip;
      return matchSearch && matchPattern && matchEquip;
    });
  }, [search, filterPattern, filterEquip]);

  // Filter logic for custom tab
  const filteredCustom = useMemo(() => {
    return customExercises.filter((e) => {
      const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.primaryMuscle.toLowerCase().includes(search.toLowerCase());
      const matchPattern = filterPattern === 'all' || e.movementPattern === filterPattern;
      const matchEquip = filterEquip === 'all' || e.equipment === filterEquip;
      return matchSearch && matchPattern && matchEquip;
    });
  }, [customExercises, search, filterPattern, filterEquip]);

  const inStoreIds = useMemo(() => new Set(exercises.map((e) => e.name)), [exercises]);

  function handleAddBuiltin(ex: typeof BUILTIN_EXERCISES[number]) {
    if (inStoreIds.has(ex.name)) return;
    addExercise(ex);
  }

  function handleAddCustom() {
    if (!form.name.trim()) return;
    addExercise({ ...form, name: form.name.trim(), primaryMuscle: form.primaryMuscle.trim() });
    setForm({ name: '', movementPattern: 'squat', primaryMuscle: '', equipment: 'barbell', isBilateral: true });
    setShowForm(false);
  }

  return (
    <div className="ex-lib">
      {/* Tabs */}
      <div className="ex-lib__tabs">
        <button className={`ex-lib__tab${tab === 'library' ? ' ex-lib__tab--active' : ''}`}
          onClick={() => setTab('library')}>
          <Dumbbell size={13} /> Built-in ({BUILTIN_EXERCISES.length})
        </button>
        <button className={`ex-lib__tab${tab === 'custom' ? ' ex-lib__tab--active' : ''}`}
          onClick={() => setTab('custom')}>
          <Plus size={13} /> Custom ({customExercises.length})
        </button>
      </div>

      {/* Search + Filter bar */}
      <div className="ex-lib__search-row">
        <div className="ex-lib__search-wrap">
          <Search size={13} className="ex-lib__search-icon" />
          <input className="ex-lib__search" placeholder="Search exercises or muscle…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="ex-lib__filter-toggle" onClick={() => setShowFilters((v) => !v)}>
          Filters {showFilters ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {showFilters && (
        <div className="ex-lib__filters">
          <select value={filterPattern} onChange={(e) => setFilterPattern(e.target.value as MovementPattern | 'all')}>
            <option value="all">All patterns</option>
            {PATTERNS.map((p) => <option key={p} value={p}>{PATTERN_LABELS[p]}</option>)}
          </select>
          <select value={filterEquip} onChange={(e) => setFilterEquip(e.target.value as Equipment | 'all')}>
            <option value="all">All equipment</option>
            {EQUIPMENT.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <button className="ex-lib__filter-reset"
            onClick={() => { setFilterPattern('all'); setFilterEquip('all'); setSearch(''); }}>
            Reset
          </button>
        </div>
      )}

      {/* ── LIBRARY TAB ── */}
      {tab === 'library' && (
        <div className="ex-lib__list">
          {filteredBuiltin.length === 0 && (
            <p className="ex-lib__empty">No exercises match your filters.</p>
          )}
          {filteredBuiltin.map((ex) => {
            const inStore = inStoreIds.has(ex.name);
            const storeEntry = exercises.find((e) => e.name === ex.name);
            return (
              <div key={ex.name} className="ex-lib__item">
                <div className="ex-lib__item-left">
                  <span className="ex-lib__item-name">{ex.name}</span>
                  <span className="ex-lib__item-meta">
                    {PATTERN_LABELS[ex.movementPattern]} · {ex.equipment} · {ex.primaryMuscle}
                  </span>
                </div>
                {inStore && storeEntry ? (
                  <button
                    className="ex-lib__item-del"
                    onClick={() => deleteExercise(storeEntry.id)}
                    title="Remove from library"
                  >
                    <Trash2 size={13} />
                  </button>
                ) : (
                  <button
                    className="ex-lib__item-add"
                    onClick={() => handleAddBuiltin(ex)}
                    title="Add to library"
                  >
                    <Plus size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── CUSTOM TAB ── */}
      {tab === 'custom' && (
        <div className="ex-lib__list">
          <div className="ex-lib__custom-header">
            <Button size="sm" variant="primary" onClick={() => setShowForm((v) => !v)}>
              <Plus size={14} /> New exercise
            </Button>
          </div>

          {showForm && (
            <div className="ex-lib__form">
              <input placeholder="Exercise name" value={form.name} autoFocus
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <input placeholder="Primary muscle" value={form.primaryMuscle}
                onChange={(e) => setForm((f) => ({ ...f, primaryMuscle: e.target.value }))} />
              <select value={form.movementPattern}
                onChange={(e) => setForm((f) => ({ ...f, movementPattern: e.target.value as MovementPattern }))}>
                {PATTERNS.map((p) => <option key={p} value={p}>{PATTERN_LABELS[p]}</option>)}
              </select>
              <select value={form.equipment}
                onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value as Equipment }))}>
                {EQUIPMENT.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <label className="ex-lib__bilateral">
                <input type="checkbox" checked={form.isBilateral}
                  onChange={(e) => setForm((f) => ({ ...f, isBilateral: e.target.checked }))} />
                Bilateral
              </label>
              <div className="ex-lib__form-actions">
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button size="sm" variant="primary" onClick={handleAddCustom} disabled={!form.name.trim()}>Save</Button>
              </div>
            </div>
          )}

          {filteredCustom.length === 0 && !showForm && (
            <p className="ex-lib__empty">
              {customExercises.length === 0
                ? 'No custom exercises yet. Create one above.'
                : 'No custom exercises match your filters.'}
            </p>
          )}

          {filteredCustom.map((ex) => (
            <div key={ex.id} className="ex-lib__item">
              <div className="ex-lib__item-left">
                <span className="ex-lib__item-name">{ex.name}</span>
                <span className="ex-lib__item-meta">
                  {PATTERN_LABELS[ex.movementPattern as MovementPattern]} · {ex.equipment} · {ex.primaryMuscle}
                </span>
              </div>
              <button className="ex-lib__item-del" onClick={() => deleteExercise(ex.id)} title="Delete">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
