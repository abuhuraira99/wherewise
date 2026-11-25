import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

export function navigate(path: string) {
  if (path === location.pathname + location.search) return;
  history.pushState(null, '', path);
  listeners.forEach((l) => l());
  window.scrollTo({ top: 0 });
}

window.addEventListener('popstate', () => listeners.forEach((l) => l()));

export function usePath(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => location.pathname,
  );
}

export function useQuery(key: string): string | null {
  usePath();
  return new URLSearchParams(location.search).get(key);
}
