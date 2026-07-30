import { create } from 'zustand';

let _id = 0;

export const useToastStore = create((set) => ({
  toasts: [],
  show(message, type = 'info', duration = 3000) {
    const id = ++_id;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
    return id;
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
