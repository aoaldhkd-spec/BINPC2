// Shared localStorage wrapper — safe on environments where localStorage is unavailable
export function safeLocalStorage() {
  try { localStorage.getItem('_test'); return localStorage; }
  catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} } as Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; }
}

export const ls = safeLocalStorage();
