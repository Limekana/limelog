import { useState } from 'react';
import { Button } from '@/components/ui';
import './ProgramEditor.css';

interface Props {
  initialName?: string;
  initialDesc?: string;
  onSave: (name: string, description: string) => void;
  onCancel: () => void;
}

export function ProgramEditor({ initialName = '', initialDesc = '', onSave, onCancel }: Props) {
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDesc);

  return (
    <div className="prog-editor">
      <p className="prog-editor__heading">Program details</p>
      <input
        type="text"
        placeholder="Program name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <input
        type="text"
        placeholder="Description (optional)"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />
      <div className="prog-editor__actions">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => name.trim() && onSave(name.trim(), desc.trim())}
          disabled={!name.trim()}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
