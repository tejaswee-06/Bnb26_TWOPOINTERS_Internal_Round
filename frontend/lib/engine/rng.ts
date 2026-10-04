// Seeded PRNG (mulberry32) used for the *simulation* (population, timing, outcomes).
// NOT used for the verifiable allocation shuffle — that uses the SHA-256 stream in shuffle.ts.
export type Rand = () => number
export function mulberry(seed: number): Rand {
  let s = seed | 0
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
export function hashStr(s: string): number { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 } return h >>> 0 }
export const rng = (seed: number | string): Rand => mulberry(typeof seed === 'number' ? seed : hashStr(seed))
export const U = (r: Rand, a: number, b: number) => a + (b - a) * r()
export function normal(r: Rand): number { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
export const logn = (r: Rand, median: number, sigma: number) => median * Math.exp(sigma * normal(r))
export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)
export const pick = <T,>(r: Rand, a: readonly T[]) => a[Math.floor(r() * a.length)]
export function weighted<T>(r: Rand, items: readonly T[], w: readonly number[]): T { const t = w.reduce((a, b) => a + b, 0); let x = r() * t; for (let i = 0; i < items.length; i++) { x -= w[i]; if (x <= 0) return items[i] } return items[items.length - 1] }
