import { useState } from 'react';

// mode: 'create' | 'edit'. Solo gestiona el nombre — sin imagen, Jellyfin
// no la muestra de forma fiable y complicaba la experiencia sin aportar nada.
export default function PlaylistFormModal({ mode = 'create', initialName = '', onClose, onSubmit }) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ name: name.trim() });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === 'edit' ? 'Editar playlist' : 'Nueva playlist'}</h2>

        <form onSubmit={handleSubmit}>
          <label>
            Nombre
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mi nueva playlist"
              autoFocus
              required
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
