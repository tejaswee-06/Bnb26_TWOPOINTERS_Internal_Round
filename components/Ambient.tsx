'use client'
import {useEffect,useRef} from 'react';import {useFD} from '@/lib/store'
const COLS=7,LBL=['CLIENTS','EDGE','RISK','POLICY','QUEUE','ADMISSION','ALLOCATION']
export default function Ambient(){const ref=useRef<HTMLCanvasElement>(null),{last}=useFD(),L=useRef({load:.15,bot:0})
L.current={load:last?Math.min(1,last.load):.15,bot:last&&last.rps?last.bot/last.rps:0}
useEffect(()=>{const c=ref.current!,x=c.getContext('2d')!;let w=0,h=0,raf=0,lt=0,fr=0,N:any[][]=[],P:any[]=[],K:any={}
const sd=(i:number)=>{const s=Math.sin(i*127.1)*43758.5453;return s-Math.floor(s)}
const css=()=>{const s=getComputedStyle(document.documentElement),g=(k:string)=>s.getPropertyValue(k).trim();K={sys:g('--sys'),warn:g('--warn'),bad:g('--bad'),mut:g('--mut2'),light:document.documentElement.dataset.theme==='light'}}
const lay=()=>{const d=Math.min(2,devicePixelRatio||1);w=innerWidth;h=innerHeight;c.width=w*d;c.height=h*d;x.setTransform(d,0,0,d,0,0);N=[];for(let i=0;i<COLS;i++){const n=i===0?9:i===COLS-1?4:i===3?5:7,a=[];for(let j=0;j<n;j++)a.push({x:w*(.04+.92*i/(COLS-1))+(sd(i*13+j)-.5)*w*.025,y:h*(.1+.78*(j+.5)/n)+(sd(i*7+j*3)-.5)*h*.03});N.push(a)}}
const tg=(i:number,j:number)=>{const n1=N[i].length,n2=N[i+1].length,k=Math.round(j*(n2-1)/Math.max(1,n1-1));return[k,Math.min(n2-1,k+1)]}
const spawn=(bot:boolean)=>{const j=Math.floor(Math.random()*N[0].length),t=tg(0,j);P.push({i:0,j,k:t[Math.floor(Math.random()*2)],t:0,sp:.006+Math.random()*.008,bot})}
const draw=(mv:boolean)=>{x.clearRect(0,0,w,h);const{load,bot}=L.current,A=K.light?.55:1
x.lineWidth=1;x.strokeStyle=K.mut;x.globalAlpha=.16*A;x.beginPath();for(let i=0;i<COLS-1;i++)N[i].forEach((n,j)=>tg(i,j).forEach(k=>{x.moveTo(n.x,n.y);x.lineTo(N[i+1][k].x,N[i+1][k].y)}));x.stroke()
N.forEach((a,i)=>a.forEach(n=>{x.globalAlpha=.5*A;x.fillStyle=(i===2||i===3)&&bot>0?K.warn:K.sys;x.beginPath();x.arc(n.x,n.y,1.7,0,7);x.fill()}))
if(bot>0){x.strokeStyle=K.warn;x.globalAlpha=(.25+.15*Math.sin(fr/12))*A;[2,3].forEach(i=>N[i].forEach(n=>{x.beginPath();x.arc(n.x,n.y,6+Math.sin(fr/10+n.y)*1.5,0,7);x.stroke()}))}
x.font='10px ui-monospace,monospace';x.fillStyle=K.mut;x.globalAlpha=.55;x.textAlign='center';LBL.forEach((l,i)=>x.fillText(l,N[i][0].x,h-14))
if(!mv)return
const target=Math.round(24+load*70);while(P.length<target)spawn(Math.random()<bot*1.4)
for(const p of P){p.t+=p.sp*(1+load);const a=N[p.i][p.j],b=N[p.i+1][p.k],e=Math.min(1,p.t),px=a.x+(b.x-a.x)*e,py=a.y+(b.y-a.y)*e
x.globalAlpha=(p.bot?.9:.75)*A;x.fillStyle=p.bot?K.warn:K.sys;x.beginPath();x.arc(px,py,p.bot?2.2:1.8,0,7);x.fill()
x.globalAlpha=.25*A;x.strokeStyle=x.fillStyle;x.beginPath();x.moveTo(px,py);x.lineTo(px-(b.x-a.x)*.06,py-(b.y-a.y)*.06);x.stroke()
if(p.t>=1){p.i++;p.j=p.k;p.t=0;if(p.i>=COLS-1||(p.bot&&p.i===3&&Math.random()<.6)){if(p.bot&&p.i===3){x.globalAlpha=.7*A;x.strokeStyle=K.bad;x.beginPath();x.arc(N[3][p.j].x,N[3][p.j].y,10,0,7);x.stroke()}p.dead=true}else p.k=tg(p.i,p.j)[Math.floor(Math.random()*2)]}}
P=P.filter(p=>!p.dead)}
const loop=(ts:number)=>{raf=requestAnimationFrame(loop);const reduce=document.documentElement.dataset.motion==='reduce';if(document.hidden||ts-lt<(reduce?1000:33))return;lt=ts;fr++;if(fr%60===0)css();draw(!reduce)}
css();lay();raf=requestAnimationFrame(loop);const rs=()=>{lay();draw(false)};addEventListener('resize',rs);return()=>{cancelAnimationFrame(raf);removeEventListener('resize',rs)}},[])
return<canvas ref={ref} className="env" aria-hidden="true"/>}
