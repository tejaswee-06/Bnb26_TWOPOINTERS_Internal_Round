export const DEMO=[{p:'/drop',s:'NORMAL',v:1,stage:5,label:'DROP BEGINS · QUEUE OPEN',t:'Drop launches. Legitimate users enter the fair pre-queue — speed does not decide allocation.'},
{p:'/control',s:'FLASH_CROWD',v:1,stage:4,label:'LEGITIMATE CROWD ARRIVES',t:'Flash crowd: millions of requests collapse into controlled admission.'},
{p:'/attacks',s:'DISTRIBUTED',v:1,stage:1,label:'ATTACK BEGINS · CAMPAIGN CORRELATED',t:'Distributed bot campaign. Separate sessions show coordinated behavior → one identity cluster.'},
{p:'/attacks',s:'ADAPTIVE',v:1,stage:3,label:'ATTACKER ADAPTS · POLICY ADAPTS',t:'Attacker changes strategy; policy adapts from logged evidence.'},
{p:'/control',s:'SPEED',v:1.9,stage:4,label:'TRAFFIC SPIKE · RESILIENCE',t:'Traffic spike. Throttling, load shedding and breakers keep inventory correct.'},
{p:'/allocations',s:'SPEED',v:1.9,stage:6,label:'ALLOCATION OCCURS',t:'Atomic allocation: CONFIRMED + HELD + AVAILABLE = TOTAL.'},
{p:'/verify',s:'RECOVERY',v:1,stage:7,label:'ALLOCATION VERIFIED',t:'Commitment → seed → shuffle → reveal, recomputed in your browser.'},
{p:'/fairness',s:'RECOVERY',v:1,stage:8,label:'FAIRNESS EXPERIMENT RUNS',t:'World A vs World B: measured Attack Allocation Advantage (simulation data).'},
{p:'/incidents',s:'RECOVERY',v:1,stage:10,label:'INCIDENT REPORT',t:'Observed telemetry is kept separate from AI-generated interpretation.'}]
