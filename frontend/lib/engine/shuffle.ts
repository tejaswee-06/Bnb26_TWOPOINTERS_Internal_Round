// Verifiable randomization: commitment → seed → deterministic shuffle → reveal → verify.
// Real properties: SHA-256 hash commitment (binding), deterministic recomputation by any verifier,
// unbiased Fisher–Yates driven by a SHA-256 counter-mode stream (rejection sampling).
// NOT claimed: external randomness beacon, protection against a malicious operator choosing the
// seed *before* committing, or zero-knowledge properties. See ARCHITECTURE.md → "Verification limits".
import { sha256, sha256Bytes, utf8 } from './crypto'
export const ALGORITHM = 'Fisher–Yates over SHA-256 counter stream (rejection sampling), seed = SHA-256("shuffle:"+serverSeed+":"+eligibleRoot)'
export class HashStream {
  private buf = new Uint32Array(0); private i = 0; private ctr = 0
  constructor(private seedHex: string) {}
  next32(): number {
    if (this.i >= this.buf.length) {
      const b = sha256Bytes(utf8(this.seedHex + ':' + this.ctr++)), dv = new DataView(b.buffer)
      this.buf = new Uint32Array(8); for (let k = 0; k < 8; k++) this.buf[k] = dv.getUint32(k * 4); this.i = 0
    }
    return this.buf[this.i++]
  }
  /** unbiased integer in [0, n) */
  below(n: number): number { if (n <= 1) return 0; const lim = 4294967296 - (4294967296 % n); let x = this.next32(); while (x >= lim) x = this.next32(); return x % n }
}
export const commitmentOf = (serverSeed: string) => sha256('commit:' + serverSeed)
export const rootOf = (eligibleIds: ArrayLike<number | string>) => { const parts: string[] = []; for (let i = 0; i < eligibleIds.length; i++) parts.push(String(eligibleIds[i])); return sha256('root:' + parts.join(',')) }
export const shuffleSeed = (serverSeed: string, root: string) => sha256('shuffle:' + serverSeed + ':' + root)
export function deterministicShuffle<T>(items: readonly T[], seedHex: string): T[] {
  const a = items.slice(), hs = new HashStream(seedHex)
  for (let i = a.length - 1; i > 0; i--) { const j = hs.below(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t }
  return a
}
export interface ProofBundle {
  eventId: string; commitment: string; serverSeed: string; eligibleRoot: string; eligibleCount: number; seats: number
  algorithm: string; shuffleSeed: string
  /** presentation-only insertions (guided walkthrough lane) — declared, not hidden */
  guidedLane: { id: number; position: number }[]
}
export type EId = number | string
export interface VerifyResult { ok: boolean; checks: { name: string; ok: boolean; detail: string }[]; order?: EId[] }
/** Recompute everything from the revealed bundle + canonical eligible list. */
export function verifyBundle(b: ProofBundle, eligibleSorted: EId[], claim?: { id: EId; position: number }): VerifyResult {
  const checks: VerifyResult['checks'] = []
  const c1 = commitmentOf(b.serverSeed) === b.commitment
  checks.push({ name: 'Commitment matches revealed seed', ok: c1, detail: `SHA-256("commit:"+seed) ${c1 ? '=' : '≠'} published commitment` })
  const root = rootOf(eligibleSorted), c2 = root === b.eligibleRoot && eligibleSorted.length === b.eligibleCount
  checks.push({ name: 'Eligible list matches published root', ok: c2, detail: `${eligibleSorted.length.toLocaleString()} entries, root ${root.slice(0, 12)}… ${c2 ? '=' : '≠'} ${b.eligibleRoot.slice(0, 12)}…` })
  const sd = shuffleSeed(b.serverSeed, root), c3 = sd === b.shuffleSeed
  checks.push({ name: 'Shuffle seed derivation', ok: c3, detail: `derived ${sd.slice(0, 12)}…` })
  const guided = new Set(b.guidedLane.map(g => g.id))
  let order: EId[] = deterministicShuffle(eligibleSorted.filter(x => !guided.has(x as number)), sd)
  for (const g of [...b.guidedLane].sort((x, y) => x.position - y.position)) order.splice(Math.min(order.length, g.position - 1), 0, g.id)
  if (claim) {
    const pos = order.indexOf(claim.id) + 1, c4 = pos === claim.position
    checks.push({ name: 'Claimed admission position reproduced', ok: c4, detail: `recomputed #${pos.toLocaleString()} vs claimed #${claim.position.toLocaleString()}` })
  }
  return { ok: checks.every(c => c.ok), checks, order }
}
