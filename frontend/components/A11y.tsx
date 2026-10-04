'use client'
import { useEffect, useState } from 'react'
import { setPref, PrefKey } from '@/lib/prefs'
import Ic from './Icon'
export default function A11y({ up }: { up?: boolean }) {
  const [open, setOpen] = useState(false), [p, setP] = useState<Record<string, string | undefined>>({}), [sp, setSp] = useState('')
  useEffect(() => { if (!open) return; setP({ ...document.documentElement.dataset }); const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [open])
  const set = (k: PrefKey, v: string) => { setPref(k, v); setP({ ...p, [k]: v }) }
  const say = (t: string) => { if (!('speechSynthesis' in window)) { setSp('Speech is not supported in this browser'); return } speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t.slice(0, 6000)); u.onend = () => setSp(''); speechSynthesis.speak(u); setSp('Reading…') }
  const Seg = ({ k, o, label }: { k: PrefKey; o: [string, string][]; label: string }) => <div><div className="eyebrow">{label}</div><div className="seg" role="radiogroup" aria-label={label}>{o.map(([v, l]) => <button key={v} role="radio" aria-checked={p[k] === v} className={p[k] === v ? 'on' : ''} onClick={() => set(k, v)}>{l}</button>)}</div></div>
  return <>
    <button className={'fab' + (up ? ' up' : '')} aria-label="Accessibility options" aria-expanded={open} onClick={() => setOpen(!open)}><Ic n="access" s={22} /></button>
    {open && <div className={'a11y' + (up ? ' up' : '')} role="dialog" aria-label="Accessibility panel">
      <div className="row sb"><b className="eyebrow">Accessibility</b><button className="ib" onClick={() => setOpen(false)} aria-label="Close accessibility panel"><Ic n="x" s={16} /></button></div>
      <Seg k="theme" label="Theme" o={[['dark', 'Dark'], ['light', 'Light']]} />
      <Seg k="font" label="Text size" o={[['m', 'A'], ['l', 'A+'], ['xl', 'A++']]} />
      <Seg k="contrast" label="Contrast" o={[['normal', 'Normal'], ['high', 'High']]} />
      <Seg k="motion" label="Motion" o={[['full', 'Normal'], ['reduce', 'Reduced']]} />
      <Seg k="dys" label="Font" o={[['off', 'Default'], ['on', 'Dyslexia-friendly']]} />
      <div><div className="eyebrow">Read aloud</div><div className="seg"><button onClick={() => say((document.querySelector('main') as HTMLElement)?.innerText || '')}>Page</button><button onClick={() => say(window.getSelection()?.toString() || 'Select some text first.')}>Selection</button><button onClick={() => { speechSynthesis.cancel(); setSp('') }}>Stop</button></div></div>
      <div className="mut" style={{ fontSize: '.72rem' }}>Keyboard navigation and screen-reader labels are always on. Status is never conveyed by colour alone.</div>
      <span className="sr" aria-live="polite">{sp}</span>{sp && <div className="mut" style={{ fontSize: '.72rem' }}>{sp}</div>}
    </div>}
  </>
}
