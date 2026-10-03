'use client'
import {useEffect,useState} from 'react';import {setPref} from '@/lib/prefs';import Ic from './Icon'
export default function A11y({bottom}:{bottom?:boolean}){const [open,setOpen]=useState(false),[p,setP]=useState<any>({}),[sp,setSp]=useState('')
useEffect(()=>{if(open)setP({...document.documentElement.dataset});const k=(e:KeyboardEvent)=>e.key==='Escape'&&setOpen(false);addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[open])
const set=(k:string,v:string)=>{setPref(k,v);setP({...p,[k]:v})}
const say=(t:string)=>{if(!('speechSynthesis' in window)){setSp('Speech not supported in this browser');return};speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t.slice(0,6000));u.onend=()=>setSp('');speechSynthesis.speak(u);setSp('Reading…')}
const Seg=({k,o}:{k:string;o:[string,string][]})=><div className="seg" role="radiogroup">{o.map(([v,l])=><button key={v} role="radio" aria-checked={p[k]===v} className={p[k]===v?'on':''} onClick={()=>set(k,v)}>{l}</button>)}</div>
return<><button className={'fab'+(bottom?' up':'')} aria-label="Accessibility options" aria-expanded={open} onClick={()=>setOpen(!open)}><Ic n="access" s={24}/></button>
{open&&<div className={'a11y'+(bottom?' up':'')} role="dialog" aria-label="Accessibility panel"><div className="row"><b className="eyebrow">ACCESSIBILITY</b><button className="ib" onClick={()=>setOpen(false)} aria-label="Close"><Ic n="x" s={16}/></button></div>
<div className="eyebrow">Text size</div><Seg k="font" o={[['m','A'],['l','A+'],['xl','A++']]}/>
<div className="eyebrow">Contrast</div><Seg k="contrast" o={[['normal','Normal'],['high','High']]}/>
<div className="eyebrow">Motion</div><Seg k="motion" o={[['full','Normal'],['reduce','Reduced']]}/>
<div className="eyebrow">Font</div><Seg k="dys" o={[['off','Default'],['on','Dyslexia-friendly']]}/>
<div className="eyebrow">Read aloud</div><div className="seg"><button onClick={()=>say((document.querySelector('main') as HTMLElement)?.innerText||'')}>🔊 Page</button><button onClick={()=>say(window.getSelection()?.toString()||'Select some text first.')}>Selection</button><button onClick={()=>speechSynthesis.pause()}>⏸</button><button onClick={()=>speechSynthesis.resume()}>▶</button><button onClick={()=>{speechSynthesis.cancel();setSp('')}}>⏹</button></div>
<div className="row mut" style={{fontSize:'.72rem'}}><span>Keyboard navigation <b className="ok">ON</b></span><span>Screen-reader labels <b className="ok">ON</b></span></div><span className="sr" aria-live="polite">{sp}</span>{sp&&<div className="mut" style={{fontSize:'.72rem'}}>{sp}</div>}</div>}</>}
