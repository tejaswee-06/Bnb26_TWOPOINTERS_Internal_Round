import {Scn,Frame,Ev,Cfg,FairDropService} from './types'
export function rng(seed:number){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const hs=(s:string)=>[...s].reduce((a,c)=>(a*31+c.charCodeAt(0))|0,7)
export const SCN:Record<Scn,{label:string;rps:number;bot:number;susp:number;camp:number;blurb:string}>={
NORMAL:{label:'Normal crowd',rps:2200,bot:0,susp:.02,camp:0,blurb:'Legitimate users only.'},
FLASH_CROWD:{label:'Flash crowd',rps:11000,bot:0,susp:.03,camp:0,blurb:'Large legitimate surge; tests resilience.'},
SPEED:{label:'Speed attack',rps:9000,bot:.45,susp:.05,camp:1,blurb:'Fast automated requests chasing first-come advantage.'},
DISTRIBUTED:{label:'Distributed bot campaign',rps:13000,bot:.6,susp:.06,camp:3,blurb:'Many sources coordinated as one campaign.'},
LOW_SLOW:{label:'Low-and-slow bot',rps:5000,bot:.2,susp:.12,camp:2,blurb:'Human-like timing to evade rate rules.'},
MULTI_SESSION:{label:'Multi-session attack',rps:8000,bot:.4,susp:.08,camp:4,blurb:'Identity multiplication across sessions.'},
ADAPTIVE:{label:'Adaptive attacker',rps:10000,bot:.45,susp:.08,camp:3,blurb:'Changes strategy after defenses activate.'},
RECOVERY:{label:'Recovery',rps:12000,bot:0,susp:.03,camp:0,blurb:'Load subsides; system recovers.'}}
const CAP=24000,TOTAL=500
export const PH=['Speed attack','Low-and-slow','Distributed multi-session']
export const mockService:FairDropService={mode:'SIMULATION',frame(s,t,prev,cfg){
const c=SCN[s],r=rng(hs(s)*997+t),phase=s==='ADAPTIVE'?Math.min(2,Math.floor(t/15)):0
let bot=c.bot>0&&cfg.auto!=null?cfg.auto:c.bot; if(s==='ADAPTIVE')bot=[.5,.2,.4][phase]
const ramp=Math.min(1,(t+1)/10),rec=s==='RECOVERY'?Math.max(.12,1-t/45):1
const rps=Math.round(c.rps*cfg.vol*ramp*rec*(.92+r()*.16)),det=Math.min(1,Math.max(0,(t-4)/10))
const botR=Math.round(rps*bot),susp=Math.round(rps*(c.susp+bot*.2*(1-det))),legit=Math.max(0,rps-botR-susp)
const load=rps/CAP,state=s==='RECOVERY'?'RECOVERING':load<.35?'HEALTHY':load<.6?'ELEVATED':load<.85?'SATURATED':'DEGRADED'
const shed=Math.max(0,load-.6),p50=Math.round(38+load*60+r()*6),p95=Math.round(p50*(2+load*2.5)),p99=Math.round(p95*(1.5+load))
const pq=prev?prev.queue:0,queue=Math.max(0,Math.round(pq+rps*.02*(1-shed)-90))
const avail0=prev?prev.seats.avail:TOTAL,conf0=prev?prev.seats.confirmed:0
let aL=prev?prev.allocLegit:0,aB=prev?prev.allocBot:0,n=0
if(t>6)for(let i=0;i<5&&avail0-n>12;i++){n++;if(r()<bot*(1-det*.93))aB++;else aL++}
const confirmed=conf0+n,held=Math.min(12,TOTAL-confirmed),avail=TOTAL-confirmed-held
const sessions=Math.round(rps*1.8),f=(x:number)=>Math.round(sessions*x/Math.max(1,rps))
const risk=[f(legit),f(susp),Math.round(f(botR)*(1-det*.5)),Math.round(f(botR)*det*.5)]
const campaigns=Math.floor(c.camp*det),ev:Ev[]=[],pf=prev
const E=(kind:Ev['kind'],text:string,sev:Ev['sev'],x:any={})=>ev.push({id:`${s}-${t}-${ev.length}`,t,kind,text,sev,...x})
if(bot>0){
 if(t===5)E('attack',`Attack signature detected: ${c.label}`,'bad')
 if(t===8)E('mitigation',`Behavioral correlation: ${c.camp} campaign cluster(s) inferred (coordinated activity)`,'warn')
 if(t===10)E('mitigation','Policy: admission weight reduced for correlated identity clusters','ok')
 if(s==='ADAPTIVE'&&t>0&&t%15===0&&phase>0)E('attack',`Attacker strategy changed → ${PH[phase]}; policy re-evaluating`,'warn')
 if(t%3===0&&t>2)E('risk',`Risk update: ${s==='ADAPTIVE'?PH[phase]:c.label}`,bot>.3?'warn':'info',{risk:{session_id:`S-${1000+Math.floor(r()*9000)}`,event_id:`R-${t}`,risk_score:+(.55+r()*.4).toFixed(2),anomaly_score:+(.4+r()*.5).toFixed(2),coordination_score:+(.5+r()*.45).toFixed(2),campaign_id:`C-${180+Math.floor(r()*4)}`,attack_type:s,evidence:['burst_structure','low_timing_variance','shared_behavior_fingerprint'],model_version:'sim-mock-0.1',timestamp:new Date(1760000000000+t*1000).toISOString()}})}
if(shed>0&&(!pf||pf.shed===0))E('resilience','Load shedding engaged for non-critical endpoints','warn')
if(s==='RECOVERY'&&t===20)E('resilience','Recovery: queue draining, throttling relaxed','ok')
if(n>0)E('alloc',`${n} seat(s) CONFIRMED via atomic allocation`,'ok',{alloc:{event_id:`A-${t}`,session_id:`S-${t}`,allocation_id:`AL-${confirmed}`,inventory_id:'INV-500',state:'CONFIRMED',idempotency_key:`idem-${t}-${confirmed}`,timestamp:new Date(1760000000000+t*1000).toISOString()}})
const dup=(prev?prev.dup:0)+(bot>0?Math.floor(r()*bot*8):0)
return{t,rps,legit,susp,bot:botR,sessions,queue,seats:{total:TOTAL,avail,held,confirmed},allocLegit:aL,allocBot:aB,dup,rejected:dup,expired:prev?prev.expired+(r()<.1?1:0):0,oversell:0,p50,p95,p99,risk,state,load,shed,throttle:load>.45,breaker:load>.85?'OPEN':load>.6?'HALF-OPEN':'CLOSED',mitigationMs:bot>0&&det>0?Math.round(900+r()*300):null,campaigns,phase,integrity:confirmed+held+avail===TOTAL,events:ev}}}
// Real adapter must implement the same interface (WebSocket/SSE) — swap here, no UI change.
export const svc:FairDropService=mockService
