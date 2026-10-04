// Backend-for-frontend proxy. Browsers only ever talk to /api/fd/*; this route forwards to the Person-1 backend.
// Customer routes are an explicit allow-list (the session credential / admission token are validated by the backend, not here).
// Organizer routes require the signed httpOnly cookie set by /api/fd/_admin/login and get X-Admin-Key / X-Integration-Key injected server-side,
// so neither key ever reaches a browser.
import { NextRequest, NextResponse } from 'next/server'
import { BACKEND, ADMIN_KEY, INTEGRATION_KEY, COOKIE, adminCookieValid } from '@/lib/live/server'
export const dynamic = 'force-dynamic'

const PUBLIC: [string, RegExp][] = [
  ['GET', /^health$/], ['GET', /^events\/[\w-]+\/drop$/], ['GET', /^events\/[\w-]+\/proof$/], ['POST', /^events\/[\w-]+\/join$/],
  ['GET', /^queue\/[\w-]+$/], ['POST', /^queue\/[\w-]+\/admit$/], ['GET', /^sessions\/[\w-]+$/],
  ['POST', /^allocation\/(hold|confirm|release)$/], ['GET', /^verify\/[\w-]+$/], ['GET', /^inventory\/stats\/[\w-]+$/], ['GET', /^policy\/config$/],
  ['POST', /^policy\/challenge\/[\w-]+$/], ['POST', /^policy\/challenge\/[\w-]+\/solve$/],
]
const ADMIN: [string, RegExp, 'admin' | 'integration' | 'none'][] = [
  ['POST', /^admin\/events\/[\w-]+\/(open|close|randomize|admit|pause|end)$/, 'admin'], ['GET', /^admin\/events\/[\w-]+\/overview$/, 'admin'],
  ['GET', /^integration\/(ml\/status|decisions|sessions|policy\/session\/[\w-]+)$/, 'integration'], ['POST', /^integration\/ml\/sync$/, 'integration'],
  ['GET', /^(resilience|metrics)$/, 'none'], ['GET', /^audit\/[\w-]+$/, 'none'],
]
async function handle(req: NextRequest, ctx: { params: { path: string[] } }) {
  const path = ctx.params.path.join('/'), method = req.method
  let key: 'admin' | 'integration' | 'none' | null = null
  if (PUBLIC.some(([m, re]) => m === method && re.test(path))) key = 'none'
  else { const hit = ADMIN.find(([m, re]) => m === method && re.test(path)); if (hit) { if (!adminCookieValid(req.cookies.get(COOKIE)?.value)) return NextResponse.json({ detail: 'Organizer sign-in required' }, { status: 401 }); key = hit[2] } }
  if (key === null) return NextResponse.json({ detail: 'Not found' }, { status: 404 })
  const headers: Record<string, string> = {}
  const cred = req.headers.get('x-session-credential'); if (cred) headers['x-session-credential'] = cred
  if (key === 'admin' && ADMIN_KEY) headers['x-admin-key'] = ADMIN_KEY
  if (key === 'integration' && INTEGRATION_KEY) headers['x-integration-key'] = INTEGRATION_KEY
  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD') { body = await req.text(); headers['content-type'] = req.headers.get('content-type') || 'application/json' }
  try {
    const r = await fetch(`${BACKEND}/${path}${req.nextUrl.search}`, { method, headers, body, cache: 'no-store', signal: AbortSignal.timeout(15000) })
    const text = await r.text(); const out = new NextResponse(text, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json' } })
    const ra = r.headers.get('retry-after'); if (ra) out.headers.set('retry-after', ra); return out
  } catch (e) { return NextResponse.json({ detail: 'BACKEND_UNREACHABLE', message: (e as Error).message }, { status: 502 }) }
}
export { handle as GET, handle as POST }
