// Shared contracts (mirror master reference §18). UI depends ONLY on these.
export type RiskEvent={session_id:string;event_id:string;risk_score:number;anomaly_score:number;coordination_score:number;campaign_id:string|null;attack_type:string|null;evidence:string[];model_version:string;timestamp:string}
export type AllocationEvent={event_id:string;session_id:string;allocation_id:string;inventory_id:string;state:'AVAILABLE'|'HELD'|'CONFIRMED';idempotency_key:string;timestamp:string}
export type ExperimentEvent={simulation_id:string;scenario:string;traffic_profile:any;attack_profile:any;metrics:any;mitigation_events:any[];allocation_outcomes:any}
export type Scn='NORMAL'|'FLASH_CROWD'|'SPEED'|'DISTRIBUTED'|'LOW_SLOW'|'MULTI_SESSION'|'ADAPTIVE'|'RECOVERY'
export type Ev={id:string;t:number;kind:'attack'|'risk'|'mitigation'|'alloc'|'resilience';text:string;sev:'info'|'warn'|'bad'|'ok';risk?:RiskEvent;alloc?:AllocationEvent}
export type Frame={t:number;rps:number;legit:number;susp:number;bot:number;sessions:number;queue:number;seats:{total:number;avail:number;held:number;confirmed:number};allocLegit:number;allocBot:number;dup:number;rejected:number;expired:number;oversell:number;p50:number;p95:number;p99:number;risk:number[];state:'HEALTHY'|'ELEVATED'|'SATURATED'|'DEGRADED'|'RECOVERING';load:number;shed:number;throttle:boolean;breaker:'CLOSED'|'HALF-OPEN'|'OPEN';mitigationMs:number|null;campaigns:number;phase:number;integrity:boolean;events:Ev[]}
export type Cfg={vol:number;auto:number|null;mult:number}
export interface FairDropService{mode:'SIMULATION'|'LIVE';frame(s:Scn,t:number,prev:Frame|undefined,cfg:Cfg):Frame}
