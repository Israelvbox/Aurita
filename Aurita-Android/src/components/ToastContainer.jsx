import { useToastStore } from '../store/toastStore.js';
import { X } from 'lucide-react';

const ICONS = {
  success: '✓',
  error: '✗',
  info: 'i',
};

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`} onClick={() => dismiss(t.id)}>
          <span className="toast__icon">{ICONS[t.type] || ICONS.info}</span>
          <span className="toast__msg">{t.message}</span>
          <X size={14} className="toast__close" />
        </div>
      ))}
    </div>
  );
}
