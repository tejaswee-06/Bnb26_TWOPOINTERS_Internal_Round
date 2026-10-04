import { runWorld, defaultConfig } from '../lib/engine/drop'
const t0 = Date.now()
const { sim, result: r } = runWorld(defaultConfig({ scenario: (process.argv[2] || 'SPEED') as any, legit: +(process.argv[3] || 40000) }))
console.log('total ms', Date.now() - t0, 'sessions', sim.sessions.length, 'ticks', r.ticks)
console.log(Object.fromEntries(Object.entries(sim.prof).map(([k, v]) => [k, Math.round(v)])))
console.log('peakLoad', r.peakLoad.toFixed(2), 'shed', r.shedPeak.toFixed(2), 'p99', Math.round(r.peakP99), 'seats L/B', r.seatsLegit, r.seatsBot, 'elig', r.eligible)
