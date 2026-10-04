// Accessibility / theme preferences (client only). Applied as data-* attributes on <html>; the inline script in app/layout.tsx applies them before paint.
export type PrefKey = 'theme' | 'font' | 'contrast' | 'motion' | 'dys'
export const getPrefs = (): Partial<Record<PrefKey, string>> => { try { return JSON.parse(localStorage.getItem('fd-prefs') || '{}') } catch { return {} } }
export function setPref(k: PrefKey, v: string) {
  try { localStorage.setItem('fd-prefs', JSON.stringify({ ...getPrefs(), [k]: v })) } catch { /* private mode */ }
  document.documentElement.dataset[k] = v
}
export const INIT_SCRIPT = `try{var p=JSON.parse(localStorage.getItem('fd-prefs')||'{}'),d=document.documentElement.dataset;d.theme=p.theme||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');d.font=p.font||'m';d.contrast=p.contrast||'normal';d.motion=p.motion||(matchMedia('(prefers-reduced-motion: reduce)').matches?'reduce':'full');d.dys=p.dys||'off'}catch(e){document.documentElement.dataset.theme='dark'}`
