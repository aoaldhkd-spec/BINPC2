import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { ParticipantNavController } from '../lib/participant-nav-history';

const ParticipantNavContext = createContext<ParticipantNavController | null>(null);

export function ParticipantNavProvider({
  nav,
  children,
}: {
  nav: ParticipantNavController;
  children: ReactNode;
}) {
  return <ParticipantNavContext.Provider value={nav}>{children}</ParticipantNavContext.Provider>;
}

export function useOptionalParticipantNav(): ParticipantNavController | null {
  return useContext(ParticipantNavContext);
}

/** Sync a boolean overlay with the shared History stack. No-ops without a provider (tests). */
export function useNavLayer(id: string, open: boolean, onClose: () => void) {
  const nav = useOptionalParticipantNav();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pushedRef = useRef(false);
  const fromNavRef = useRef(false);

  useEffect(() => {
    if (!nav) return;
    if (open) {
      if (!pushedRef.current) {
        nav.push(id, () => {
          fromNavRef.current = true;
          pushedRef.current = false;
          onCloseRef.current();
        });
        pushedRef.current = true;
      }
      return;
    }
    if (pushedRef.current) {
      pushedRef.current = false;
      if (fromNavRef.current) {
        fromNavRef.current = false;
        return;
      }
      nav.notifyClosed(id);
    }
  }, [nav, id, open]);
}

export function NavLayer({
  id,
  open,
  onClose,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
}) {
  useNavLayer(id, open, onClose);
  return null;
}
