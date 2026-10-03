'use client'
import Link from 'next/link';import {useEffect,useState} from 'react';import {sha} from '@/lib/proof';import {Pill,nf} from '@/components/charts'
const S=['Event','Joined','Fair pre-queue','Admitted','Allocating','Confirmed']
export default function Drop(){const [st,setSt]=useState(0),[pos,setPos]=useState(12842),[id,setId]=useState('')
useEffect(()=>{if(st!==2)return;const t=setInterval(()=>setPos(p=>{if(p<=410){setSt(3);return 0}return p-410}),1000);return()=>clearInterval(t)},[st])
useEffect(()=>{if(st===4){const t=setTimeout(async()=>{setId('AL-'+(await sha('demo-session')).slice(0,10));setSt(5)},1500);return()=>clearTimeout(t)}},[st])
const secs=Math.ceil(pos/410)
return<div className="g"><h2 className="eyebrow" style={{fontSize:".8rem"}}>Drop · 500 seats</h2><span className="pill sim">◆ SIMULATION — position and window are simulated estimates</span>
<div className="steps" role="list" aria-label="Progress">{S.map((s,i)=><span role="listitem" key={s} className={'step '+(i<st?'done':i===st?'on':'')} aria-current={i===st?'step':undefined}>{i<st?'✓ ':''}{s}</span>)}</div>
<div className="card" style={{padding:'2rem'}}>
{st===0&&<><h2>Event</h2><p style={{fontSize:'1.3rem'}}>You do not need to refresh. You do not need to spam requests. <b>Speed does not determine your allocation.</b></p><button className="btn pri" onClick={()=>{setSt(1);setTimeout(()=>setSt(2),1200)}}>JOIN DROP</button></>}
{st===1&&<p className="live">Creating a durable session…</p>}
{st===2&&<><h2>Fair pre-queue</h2><p>Your request has been accepted.</p><div className="kpi"><div className="l">Position</div><div className="v" aria-live="polite">#{nf(pos)}</div></div>
<p>Estimated admission window: <b>~{secs}s</b> <span className="mut">(estimate; not a guarantee)</span></p><Pill s="ok">PROTECTED</Pill><div className="stack" style={{marginTop:'1rem'}} role="img" aria-label={`Queue progress ${Math.round((1-pos/12842)*100)} percent`}><span style={{width:(1-pos/12842)*100+'%',background:'var(--acc)'}}/></div><p className="mut">Refreshing does not improve your place. Queue state is held by the server.</p></>}
{st===3&&<><h2>Admitted</h2><p>A signed admission token was validated server-side.</p><button className="btn pri" onClick={()=>setSt(4)}>CLAIM SEAT</button></>}
{st===4&&<p className="live">Atomic allocation in progress (idempotent)…</p>}
{st===5&&<><h2>Confirmed</h2><Pill s="ok">CONFIRMED</Pill><p className="mono">Allocation ID: {id}</p><Link className="btn pri" href="/verify">VERIFY ALLOCATION</Link></>}</div></div>}
