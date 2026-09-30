export const DARK_MODE_KEY = 'phonemail_setting_dark_mode';

export function applyDarkMode(enabled: boolean) {
  document.documentElement.classList.toggle('dark', enabled);
  document.documentElement.style.colorScheme = enabled ? 'dark' : 'light';
  document.getElementById('app-favicon')?.setAttribute(
    'href',
    enabled ? '/phonemail-icon-navy.svg' : '/phonemail-icon-blue.svg',
  );
}

export function readDarkMode() {
  return localStorage.getItem(DARK_MODE_KEY) === 'true';
}
