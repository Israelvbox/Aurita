import { useState } from 'react';

export default function ConfirmModal({
  title,
  message,
  mode = 'confirm',
  defaultValue = '',
  placeholder = '',
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
  confirmDanger = false,
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState(defaultValue);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    if (e?.preventDefault) e.preventDefault();
    if (mode === 'prompt' && !value.trim()) return;
    setSaving(true);
    try {
      await onConfirm(mode === 'prompt' ? value.trim() : undefined);
      onCancel();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {message && <p className="muted small" style={{ marginBottom: '1rem' }}>{message}</p>}

        <form onSubmit={handleSubmit}>
          {mode === 'prompt' && (
            <label>
              Nombre
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                autoFocus
                required
              />
            </label>
          )}

          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button
              type="submit"
              className={confirmDanger ? 'primary-btn danger-btn' : 'primary-btn'}
              disabled={saving || (mode === 'prompt' && !value.trim())}
            >
              {saving ? 'Guardando…' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
