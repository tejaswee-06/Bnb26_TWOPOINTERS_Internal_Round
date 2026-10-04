// Signed queue / admission tokens (HMAC-SHA256). The server never trusts a client-supplied queue position:
// position, session binding, event binding and expiry are all inside the signed payload.
import { hmacSha256, safeEqual } from './crypto'
export type TokenKind = 'entry' | 'admit'
export interface TokenClaims { kind: TokenKind; sid: string; eid: string; pos: number; exp: number }
export type TokenFail = 'BAD_FORMAT' | 'BAD_SIGNATURE' | 'EXPIRED' | 'SESSION_MISMATCH' | 'EVENT_MISMATCH' | 'WRONG_KIND'
const enc = (c: TokenClaims) => `${c.kind}|${c.sid}|${c.eid}|${c.pos}|${c.exp}`
export function signToken(secret: string, c: TokenClaims): string { const p = enc(c); return `FD1.${p.replace(/\|/g, '~')}.${hmacSha256(secret, p)}` }
export function verifyToken(secret: string, token: string, expect: { sid: string; eid: string; kind: TokenKind; now: number }): { ok: true; claims: TokenClaims } | { ok: false; reason: TokenFail } {
  const parts = (token || '').split('.')
  if (parts.length !== 3 || parts[0] !== 'FD1') return { ok: false, reason: 'BAD_FORMAT' }
  const p = parts[1].replace(/~/g, '|'), f = p.split('|')
  if (f.length !== 5) return { ok: false, reason: 'BAD_FORMAT' }
  if (!safeEqual(hmacSha256(secret, p), parts[2])) return { ok: false, reason: 'BAD_SIGNATURE' }
  const claims: TokenClaims = { kind: f[0] as TokenKind, sid: f[1], eid: f[2], pos: +f[3], exp: +f[4] }
  if (claims.kind !== expect.kind) return { ok: false, reason: 'WRONG_KIND' }
  if (claims.sid !== expect.sid) return { ok: false, reason: 'SESSION_MISMATCH' }
  if (claims.eid !== expect.eid) return { ok: false, reason: 'EVENT_MISMATCH' }
  if (claims.exp < expect.now) return { ok: false, reason: 'EXPIRED' }
  return { ok: true, claims }
}
