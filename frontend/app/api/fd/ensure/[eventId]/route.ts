// Idempotently provisions a catalogue event in the backend (typed inventory from the static catalogue) and, when LIVE_AUTO_OPEN=1,
// opens the pre-queue on first visit (mirrors the simulator's auto-open). Uses the admin key server-side; only catalogue drop events qualify.
import { NextRequest, NextResponse } from 'next/server'
import { eventById } from '@/lib/data/events'
import { BACKEND, ADMIN_KEY } from '@/lib/live/server'
export const dynamic = 'force-dynamic'
const j = { 'content-type': 'application/json', ...(ADMIN_KEY ? { 'x-admin-key': ADMIN_KEY } : {}) }
export async function POST(req: NextRequest, { params }: { params: { eventId: string } }) {
  const e = eventById(params.eventId); if (!e || !e.drop) return NextResponse.json({ detail: 'No such drop event' }, { status: 404 })
  const open = req.nextUrl.searchParams.get('open') === '1' && e.dropStatus === 'LIVE' && process.env.LIVE_AUTO_OPEN !== '0'
  const prequeue = Number(process.env.LIVE_PREQUEUE_SECONDS || 45), limit = Number(process.env.LIVE_ADMISSION_LIMIT || 25)
  try {
    const body = { event_id: e.id, name: e.title, admission_limit: limit, prequeue_seconds: prequeue, auto_advance: process.env.LIVE_AUTOPILOT !== '0', ticket_types: e.ticketTypes.map((t, i) => ({ ticket_type: t.id, count: Math.max(1, t.cap - (e.presold[i] || 0)) })) }
    const p = await fetch(`${BACKEND}/admin/events/provision`, { method: 'POST', headers: j, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15000) })
    if (!p.ok) return NextResponse.json({ detail: 'PROVISION_FAILED', status: p.status, body: await p.text() }, { status: 502 })
    const prov = await p.json()
    if (open && prov.phase === 'PREPARED') await fetch(`${BACKEND}/admin/events/${e.id}/open?seconds=${prequeue}`, { method: 'POST', headers: j, cache: 'no-store', signal: AbortSignal.timeout(15000) })
    const info = await fetch(`${BACKEND}/events/${e.id}/drop`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
    return NextResponse.json({ provisioned: prov, drop: await info.json() })
  } catch (err) { return NextResponse.json({ detail: 'BACKEND_UNREACHABLE', message: (err as Error).message }, { status: 502 }) }
}
