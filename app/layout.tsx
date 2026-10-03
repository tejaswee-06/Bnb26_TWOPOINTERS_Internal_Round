import './globals.css';import {Provider} from '@/lib/store';import Shell from '@/components/Shell'
export const metadata={title:'FAIR DROP — Fair access under adversarial load'}
const init=`try{var p=JSON.parse(localStorage.getItem('fd-prefs')||'{}'),d=document.documentElement.dataset;d.theme=p.theme||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');d.font=p.font||'m';d.contrast=p.contrast||'normal';d.motion=p.motion||(matchMedia('(prefers-reduced-motion: reduce)').matches?'reduce':'full');d.dys=p.dys||'off'}catch(e){}`
export default function L({children}:{children:React.ReactNode}){return<html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:init}}/></head><body><Provider><Shell>{children}</Shell></Provider></body></html>}
