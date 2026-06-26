import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import './ProgramEditor.css';

interface Props {
  initialName?: string;
  initialDesc?: string;
  onSave: (name: string, description: string) => void;
  onCancel: () => void;
}

export function ProgramEditor({ initialName = '', initialDesc = '', onSave, onCancel }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDesc);

  return (
    <div className="prog-editor">
      <p className="prog-editor__heading">{t('program.detailsHeading')}</p>
      <input
        type="text"
        placeholder={t('program.namePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <input
        type="text"
        placeholder={t('program.descPlaceholder')}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />
      <div className="prog-editor__actions">
        <Button variant="ghost" size="sm" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => name.trim() && onSave(name.trim(), desc.trim())}
          disabled={!name.trim()}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
