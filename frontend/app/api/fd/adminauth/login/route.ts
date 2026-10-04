// Issues the signed httpOnly cookie that authorizes organizer calls through the proxy. Same demo credentials as the existing admin login form
// (override with FAIRDROP_ADMIN_EMAIL / FAIRDROP_ADMIN_PASSWORD). This hardens the proxy; it is not a second login system.
import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_EMAIL, ADMIN_PASSWORD, COOKIE, adminCookieValue } from '@/lib/live/server'
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { email?: string; password?: string }
  if (String(b.email || '').trim().toLowerCase() !== ADMIN_EMAIL || b.password !== ADMIN_PASSWORD) return NextResponse.json({ ok: false }, { status: 401 })
  const r = NextResponse.json({ ok: true }); r.cookies.set(COOKIE, adminCookieValue(), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 86400 }); return r
}
