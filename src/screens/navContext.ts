import { createContext, useContext } from 'react';
import type { Habit } from '../types/models';

/**
 * Lightweight UI-navigation contract shared by all tab screens.
 * The shell (App.tsx) owns the modals and toast; screens just call these.
 */
export interface UiNav {
  openQubi: () => void;
  openSettings: () => void;
  showProof: (habit: Habit) => void;
  toast: (message: string) => void;
  openFriends?: () => void;
}

export const NavContext = createContext<UiNav | null>(null);

export function useNav(): UiNav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('useNav must be used within NavContext');
  return nav;
}
