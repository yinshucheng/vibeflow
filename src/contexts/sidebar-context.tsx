'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

interface SidebarContextType {
  isCollapsed: boolean;
  isHovering: boolean;
  toggle: () => void;
  setHovering: (hovering: boolean) => void;
  effectiveWidth: number;
  showLabels: boolean;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

const STORAGE_KEY = 'vibeflow-sidebar-collapsed';
const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 48;

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      setIsCollapsed(stored === 'true');
    }
    setIsHydrated(true);
  }, []);

  const toggle = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const handleSetHovering = useCallback((hovering: boolean) => {
    setIsHovering(hovering);
  }, []);

  // Effective width considers hover state for temporary expansion
  const effectiveWidth = isCollapsed && !isHovering ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  // Show labels when expanded or when hovering while collapsed
  const showLabels = !isCollapsed || isHovering;

  // Prevent hydration mismatch by rendering collapsed state on server
  if (!isHydrated) {
    return (
      <SidebarContext.Provider
        value={{
          isCollapsed: false,
          isHovering: false,
          toggle: () => {},
          setHovering: () => {},
          effectiveWidth: EXPANDED_WIDTH,
          showLabels: true,
        }}
      >
        {children}
      </SidebarContext.Provider>
    );
  }

  return (
    <SidebarContext.Provider
      value={{
        isCollapsed,
        isHovering,
        toggle,
        setHovering: handleSetHovering,
        effectiveWidth,
        showLabels,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within SidebarProvider');
  }
  return context;
}
