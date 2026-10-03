import {rng} from './sim'
export async function sha(s:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export const entries=(n:number)=>Array.from({length:n},(_,i)=>'E-'+String(i).padStart(4,'0'))
export async function allocate(seed:string,ids:string[],seats:number){const h=await sha('shuffle:'+seed),r=rng(parseInt(h.slice(0,8),16)),a=[...ids]
for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return{order:a,winners:a.slice(0,seats),h}}
