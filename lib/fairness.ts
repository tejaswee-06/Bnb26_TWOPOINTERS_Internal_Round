import {rng} from './sim'
export type XO={legit:number;botAcc:number;mult:number;seats:number;detect:number;seed:number;formula:'proportional'|'worldA'}
type En={id:string;bot:boolean;cl:string;speed:number}
export function runExperiment(o:XO){const r=rng(o.seed)
const L:En[]=Array.from({length:o.legit},(_,i)=>({id:'L'+i,bot:false,cl:'L'+i,speed:r()*.8}))
const B:En[]=[];for(let i=0;i<o.botAcc;i++)for(let j=0;j<o.mult;j++)B.push({id:`B${i}.${j}`,bot:true,cl:'B'+i,speed:.8+r()*.2})
const shuf=(a:En[])=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
const summ=(w:En[],ord:En[])=>{const l=w.filter(x=>!x.bot).length,b=w.length-l,cl=new Set(w.map(x=>x.cl)).size
 const lp=ord.map((x,i)=>x.bot?-1:i).filter(i=>i>=0);const mean=lp.reduce((a,x,k)=>a+(x-k),0)/Math.max(1,lp.length)/Math.max(1,ord.length)
 return{legit:l,bot:b,share:b/Math.max(1,w.length),dupClusters:w.length-cl,oversell:Math.max(0,w.length-o.seats),distortion:mean}}
const oA=shuf(L),A=summ(oA.slice(0,o.seats),oA)
const oN=[...L,...B].sort((a,b)=>b.speed-a.speed),N=summ(oN.slice(0,o.seats),oN)
const flagged=new Set<string>();for(let i=0;i<o.botAcc;i++)if(r()<o.detect)flagged.add('B'+i)
const seen=new Set<string>(),elig=[...L,...B].filter(x=>{if(flagged.has(x.cl))return false;if(x.bot){if(seen.has(x.cl))return false;seen.add(x.cl)}return true})
const oF=shuf(elig),F=summ(oF.slice(0,o.seats),oF)
const base=o.formula==='worldA'?A.share:o.botAcc/Math.max(1,o.legit+o.botAcc)
return{A,N,F,base,aaaN:N.share-base,aaaF:F.share-base,entries:{legit:o.legit,botSessions:B.length,eligibleFair:elig.length,flaggedClusters:flagged.size}}}
