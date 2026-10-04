// Server-only helpers for the BFF routes (never imported by client code). Secrets live in process.env on the Next.js server.
import { createHmac, timingSafeEqual } from 'crypto'
export const BACKEND = (process.env.FAIRDROP_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
export const ADMIN_KEY = process.env.FAIRDROP_ADMIN_KEY || ''
export const INTEGRATION_KEY = process.env.FAIRDROP_INTEGRATION_KEY || ''
export const ADMIN_EMAIL = (process.env.FAIRDROP_ADMIN_EMAIL || 'admin@fairdrop.demo').toLowerCase()
export const ADMIN_PASSWORD = process.env.FAIRDROP_ADMIN_PASSWORD || 'FairDrop@2026'
const SECRET = process.env.FAIRDROP_COOKIE_SECRET || ADMIN_KEY || 'fairdrop-dev-cookie-secret'
export const COOKIE = 'fd_admin_srv'
export const sign = (v: string) => createHmac('sha256', SECRET).update(v).digest('hex')
export function adminCookieValue() { const exp = String(Math.floor(Date.now() / 1000) + 86400); return `${exp}.${sign('admin:' + exp)}` }
export function adminCookieValid(v: string | undefined) {
  if (!v) return false; const [exp, sig] = v.split('.'); if (!exp || !sig || Number(exp) < Date.now() / 1000) return false
  const good = sign('admin:' + exp); try { return timingSafeEqual(Buffer.from(sig), Buffer.from(good)) } catch { return false }
}
