export type ThemeMode = 'dark' | 'light';

export function getInitialTheme(): ThemeMode {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('clerkship_theme');
    if (saved === 'dark' || saved === 'light') return saved;
  }
  return 'dark';
}

export function setInstantTheme(theme: ThemeMode) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('clerkship_theme', theme);
  }
}

export function triggerThemeToggle(currentTheme: ThemeMode): ThemeMode {
  const nextTheme: ThemeMode = currentTheme === 'dark' ? 'light' : 'dark';

  if (typeof document !== 'undefined') {
    // Activa transiciones CSS unicamente cuando el usuario hace clic explicito en cambiar tema
    document.documentElement.classList.add('theme-animating');
    document.documentElement.setAttribute('data-theme', nextTheme);
    document.body.setAttribute('data-theme', nextTheme);
    localStorage.setItem('clerkship_theme', nextTheme);

    // Emite evento para actualizar todos los toggles montados en la app
    window.dispatchEvent(new CustomEvent('clerkship-theme-change', { detail: nextTheme }));

    // Retira la clase de animacion tras 500ms para garantizar que refrescos (F5) no animen
    setTimeout(() => {
      document.documentElement.classList.remove('theme-animating');
    }, 500);
  }

  return nextTheme;
}
