'use client'
import { useParams } from 'next/navigation'
import { eventById } from '@/lib/data/events'
import { useRT } from '@/lib/store'
import type { DropSim } from '@/lib/engine/drop'
/** Everything a journey page needs for one drop; null runtime = still hydrating. */
export function useDrop() {
  const { id } = useParams<{ id: string }>(), e = eventById(id), rt = useRT()
  const sim = rt && e?.drop ? (rt.isLive ? (rt.liveFor(id) as unknown as DropSim | null) : rt.drops.get(id) ?? null) : null
  const st = rt && e ? rt.status(id) : null
  const settled = !rt || !rt.isLive || !e?.drop || !!rt.liveFor(id)?.settled
  return { id, e, rt, sim, st, ready: !!rt && settled }
}
