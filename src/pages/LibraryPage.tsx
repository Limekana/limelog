import { useState, useMemo } from 'react';
import { useProgramStore } from '@/store/programStore';
import { BUILTIN_EXERCISES } from '@/data/builtinExercises';
import type { MovementPattern, Equipment } from '@/types';
import { Button, Tabs, TabPanel } from '@/components/ui';
import { Plus, Trash2, Search, Dumbbell } from 'lucide-react';
import './LibraryPage.css';

const PATTERNS: MovementPattern[] = ['push', 'pull', 'hinge', 'squat', 'carry', 'jump', 'core', 'accessory'];
const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'kettlebell', 'other'];

const PATTERN_LABELS: Record<MovementPattern, string> = {
  push: 'Push', pull: 'Pull', hinge: 'Hinge', squat: 'Squat',
  carry: 'Carry', jump: 'Jump / Plyo', core: 'Core', accessory: 'Accessory',
};

type Tab = 'my' | 'browse';

function matchesFilter(
  name: string,
  muscle: string,
  pattern: MovementPattern,
  equip: Equipment,
  search: string,
  filterPattern: MovementPattern | 'all',
  filterEquip: Equipment | 'all',
) {
  const matchSearch = !search
    || name.toLowerCase().includes(search.toLowerCase())
    || muscle.toLowerCase().includes(search.toLowerCase());
  const matchPattern = filterPattern === 'all' || pattern === filterPattern;
  const matchEquip = filterEquip === 'all' || equip === filterEquip;
  return matchSearch && matchPattern && matchEquip;
}

export function LibraryPage() {
  const { exercises, addExercise, deleteExercise } = useProgramStore();

  const [tab, setTab] = useState<Tab>('my');
  const [search, setSearch] = useState('');
  const [filterPattern, setFilterPattern] = useState<MovementPattern | 'all'>('all');
  const [filterEquip, setFilterEquip] = useState<Equipment | 'all'>('all');

  // Custom exercise form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', movementPattern: 'squat' as MovementPattern,
    primaryMuscle: '', equipment: 'dumbbell' as Equipment, isBilateral: true,
  });

  const builtinNames = useMemo(() => new Set(BUILTIN_EXERCISES.map((e) => e.name)), []);
  const inStoreNames = useMemo(() => new Set(exercises.map((e) => e.name)), [exercises]);

  // "My Library" tab: all exercises currently in store
  const myExercises = useMemo(() => {
    return exercises.filter((e) =>
      matchesFilter(e.name, e.primaryMuscle, e.movementPattern, e.equipment, search, filterPattern, filterEquip)
    );
  }, [exercises, search, filterPattern, filterEquip]);

  // "Browse" tab: all builtins not yet in store
  const browseExercises = useMemo(() => {
    return BUILTIN_EXERCISES.filter((e) =>
      !inStoreNames.has(e.name) &&
      matchesFilter(e.name, e.primaryMuscle, e.movementPattern, e.equipment, search, filterPattern, filterEquip)
    );
  }, [inStoreNames, search, filterPattern, filterEquip]);

  // Unfiltered count for tab badge
  const browseTotalCount = useMemo(
    () => BUILTIN_EXERCISES.filter((e) => !inStoreNames.has(e.name)).length,
    [inStoreNames]
  );

  function handleAddBuiltin(ex: typeof BUILTIN_EXERCISES[number]) {
    addExercise(ex);
  }

  function handleAddCustom() {
    if (!form.name.trim()) return;
    addExercise({ ...form, name: form.name.trim(), primaryMuscle: form.primaryMuscle.trim() });
    setForm({ name: '', movementPattern: 'squat', primaryMuscle: '', equipment: 'dumbbell', isBilateral: true });
    setShowForm(false);
  }

  const customCount = exercises.filter((e) => !builtinNames.has(e.name)).length;

  return (
    <div className="lib-page">
      <div className="lib-page__header">
        <div className="lib-page__title-row">
          <Dumbbell size={20} aria-hidden="true" />
          <h1 className="lib-page__title">Exercise Library</h1>
        </div>
        <p className="lib-page__subtitle">
          {exercises.length} exercise{exercises.length !== 1 ? 's' : ''} in your library
          {customCount > 0 && ` · ${customCount} custom`}
        </p>
      </div>

      {/* ── Tabs ── */}
      <Tabs
        tabs={[
          { key: 'my', label: 'My Library', count: exercises.length },
          { key: 'browse', label: 'Browse & Add', count: browseTotalCount },
        ]}
        activeKey={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      {/* ── Search + Filters ── */}
      <div className="lib-page__controls">
        <div className="lib-page__search-wrap">
          <Search size={13} className="lib-page__search-icon" aria-hidden="true" />
          <input
            className="lib-page__search"
            placeholder="Search by name or muscle…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search exercises"
          />
        </div>
        <div className="lib-page__filters">
          <select
            aria-label="Filter by movement pattern"
            value={filterPattern}
            onChange={(e) => setFilterPattern(e.target.value as MovementPattern | 'all')}
          >
            <option value="all">All patterns</option>
            {PATTERNS.map((p) => <option key={p} value={p}>{PATTERN_LABELS[p]}</option>)}
          </select>
          <select
            aria-label="Filter by equipment"
            value={filterEquip}
            onChange={(e) => setFilterEquip(e.target.value as Equipment | 'all')}
          >
            <option value="all">All equipment</option>
            {EQUIPMENT.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          {(search || filterPattern !== 'all' || filterEquip !== 'all') && (
            <button
              className="lib-page__reset"
              onClick={() => { setSearch(''); setFilterPattern('all'); setFilterEquip('all'); }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── MY LIBRARY TAB ── */}
      <TabPanel tabKey="my" activeKey={tab}>
        <div className="lib-page__list">
          <div className="lib-page__list-header">
            <Button size="sm" variant="primary" onClick={() => setShowForm((v) => !v)}>
              <Plus size={13} aria-hidden="true" /> New custom exercise
            </Button>
          </div>

          {showForm && (
            <div className="lib-page__form">
              <input placeholder="Exercise name *" value={form.name} autoFocus
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <input placeholder="Primary muscle" value={form.primaryMuscle}
                onChange={(e) => setForm((f) => ({ ...f, primaryMuscle: e.target.value }))} />
              <select
                aria-label="Movement pattern"
                value={form.movementPattern}
                onChange={(e) => setForm((f) => ({ ...f, movementPattern: e.target.value as MovementPattern }))}
              >
                {PATTERNS.map((p) => <option key={p} value={p}>{PATTERN_LABELS[p]}</option>)}
              </select>
              <select
                aria-label="Equipment"
                value={form.equipment}
                onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value as Equipment }))}
              >
                {EQUIPMENT.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <label className="lib-page__bilateral">
                <input type="checkbox" checked={form.isBilateral}
                  onChange={(e) => setForm((f) => ({ ...f, isBilateral: e.target.checked }))} />
                Bilateral
              </label>
              <div className="lib-page__form-actions">
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button size="sm" variant="primary" onClick={handleAddCustom} disabled={!form.name.trim()}>Add</Button>
              </div>
            </div>
          )}

          {myExercises.length === 0 && !showForm && (
            <p className="lib-page__empty">
              {exercises.length === 0
                ? 'No exercises yet. Browse & Add to populate your library.'
                : 'No exercises match your filters.'}
            </p>
          )}

          {myExercises.map((ex) => {
            const isCustom = !builtinNames.has(ex.name);
            return (
              <div key={ex.id} className="lib-page__item">
                <div className="lib-page__item-left">
                  <div className="lib-page__item-name-row">
                    <span className="lib-page__item-name">{ex.name}</span>
                    {isCustom && <span className="lib-page__item-badge">custom</span>}
                  </div>
                  <span className="lib-page__item-meta">
                    {PATTERN_LABELS[ex.movementPattern as MovementPattern]} · {ex.equipment}
                    {ex.primaryMuscle && ` · ${ex.primaryMuscle}`}
                  </span>
                </div>
                <button
                  className="lib-page__item-del"
                  onClick={() => deleteExercise(ex.id)}
                  aria-label={`Remove ${ex.name} from library`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      </TabPanel>

      {/* ── BROWSE TAB ── */}
      <TabPanel tabKey="browse" activeKey={tab}>
        <div className="lib-page__list">
          {browseExercises.length === 0 && (
            <p className="lib-page__empty">
              {BUILTIN_EXERCISES.every((e) => inStoreNames.has(e.name))
                ? 'All built-in exercises are already in your library.'
                : 'No exercises match your filters.'}
            </p>
          )}
          {browseExercises.map((ex) => (
            <div key={ex.name} className="lib-page__item">
              <div className="lib-page__item-left">
                <span className="lib-page__item-name">{ex.name}</span>
                <span className="lib-page__item-meta">
                  {PATTERN_LABELS[ex.movementPattern]} · {ex.equipment}
                  {ex.primaryMuscle && ` · ${ex.primaryMuscle}`}
                </span>
              </div>
              <button
                className="lib-page__item-add"
                onClick={() => handleAddBuiltin(ex)}
                aria-label={`Add ${ex.name} to my library`}
              >
                <Plus size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </TabPanel>
    </div>
  );
}
