import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_THEME, type ThemeSettings } from '@guadalupana/shared';
import { api } from '../api/client.ts';

export const themeKey = ['theme'] as const;

const DENSITY = { compacta: 0.86, normal: 1, amplia: 1.14 } as const;

/** Escribe el tema como variables CSS: el resto del sistema se deriva de ellas. */
export function applyTheme(theme: ThemeSettings, el: HTMLElement = document.documentElement): void {
  el.style.setProperty('--brand', theme.primary);
  el.style.setProperty('--accent', theme.accent);
  el.style.setProperty('--bg', theme.background);
  el.style.setProperty('--text', theme.text);
  el.style.setProperty('--radius', `${theme.radius}px`);
  el.style.setProperty('--scale', String(theme.fontScale));
  el.style.setProperty('--density', String(DENSITY[theme.density]));
  el.dataset.buttonShape = theme.buttonShape;
  el.dataset.header = theme.headerStyle;
}

interface ThemeValue {
  theme: ThemeSettings;
  /** Logo para fondos claros. */
  logo: string;
  /** Logo para fondos de marca; un logo personalizado se muestra sobre una placa blanca. */
  logoOnBrand: { src: string; custom: boolean };
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: themeKey,
    queryFn: () => api<{ theme: ThemeSettings }>('/settings/theme').then((r) => r.theme),
    staleTime: 60_000,
  });
  const theme = data ?? DEFAULT_THEME;

  useLayoutEffect(() => {
    applyTheme(theme);
    document.title = `${theme.appName} · Cooperativa Guadalupana`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.primary);
  }, [theme]);

  const custom = theme.logoDataUrl !== null;
  const value: ThemeValue = {
    theme,
    logo: theme.logoDataUrl ?? '/logo.webp',
    logoOnBrand: { src: theme.logoDataUrl ?? '/logo-white.webp', custom },
  };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
}
