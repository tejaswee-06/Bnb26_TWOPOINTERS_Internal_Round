'use client'
import {createContext,useContext,useEffect,useRef,useState,ReactNode} from 'react'
import {svc} from './sim'
import {Scn,Frame,Ev,Cfg} from './types'
const Ctx=createContext<any>(null);export const useFD=()=>useContext(Ctx)
export function Provider({children}:{children:ReactNode}){
const [scn,setScnS]=useState<Scn>('NORMAL'),[cfg,setCfg]=useState<Cfg>({vol:1,auto:null,mult:3}),[frames,setFrames]=useState<Frame[]>([]),[events,setEvents]=useState<Ev[]>([]),[demo,setDemo]=useState(-1)
const R=useRef({scn,cfg,t:0,fr:[] as Frame[]});R.current.scn=scn;R.current.cfg=cfg
const setScn=(s:Scn)=>{if(s===R.current.scn)return;R.current.t=0;R.current.fr=[];setFrames([]);setEvents([]);setScnS(s)}
useEffect(()=>{const id=setInterval(()=>{const c=R.current,f=svc.frame(c.scn,c.t++,c.fr[c.fr.length-1],c.cfg);c.fr=[...c.fr.slice(-89),f];setFrames(c.fr);if(f.events.length)setEvents(e=>[...f.events.slice().reverse(),...e].slice(0,80))},1000);return()=>clearInterval(id)},[])
return<Ctx.Provider value={{scn,setScn,cfg,setCfg,frames,events,demo,setDemo,last:frames[frames.length-1],mode:svc.mode}}>{children}</Ctx.Provider>}
