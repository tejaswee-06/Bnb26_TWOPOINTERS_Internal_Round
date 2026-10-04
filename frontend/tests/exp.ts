import { runWorld, defaultConfig } from '../lib/engine/drop'
import type { Scenario } from '../lib/engine/types'
const legit = +(process.argv[2] || 8000)
const scs = (process.argv[3] || 'NORMAL,SPEED').split(',') as Scenario[]
const f = (x: number, d = 2) => x.toFixed(d)
for (const sc of scs) {
  for (const mode of ['FAIR', 'NAIVE'] as const) {
    const t0 = Date.now()
    const { result: r, sim } = runWorld(defaultConfig({ legit, scenario: sc, mode, seats: undefined } as any, ))
    console.log(`${sc.padEnd(13)} ${mode.padEnd(5)} ${(Date.now() - t0 + 'ms').padEnd(7)} botAcc=${r.botAccounts} sess=${r.sessions} elig=${r.eligible}(${r.eligibleBot}b) seats L/B=${r.seatsLegit}/${r.seatsBot} botShare=${f(r.botSeatShare)} idShare=${f(r.botIdentityShare)} AAA=${f(r.aaaRatio)}x legitRate=${f(r.legitAllocationRate * 100)}% shift=${f(r.legitRankShift, 3)} peakLoad=${f(r.peakLoad)} p99=${r.peakP99} mit=${r.mitigationMs} prec=${f(r.precision)} rec=${f(r.recall)} fpr=${f(r.fpr, 4)} ticks=${r.ticks} integ=${r.integrity} over=${r.oversell} esc=${r.escalations} chg=${r.strategyChanges} late=${r.lateRejected} joinedL=${f(r.legitJoinedFrac)}`)
  }
}
