// Thin client for the Person-1 backend through the Next.js proxy. Never throws for HTTP errors — returns {ok,status,data}.
import { FD } from './config'
export interface ApiResult<T = any> { ok: boolean; status: number; data: T; offline?: boolean }
export async function api<T = any>(method: 'GET' | 'POST', path: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResult<T>> {
  try {
    const r = await fetch(`${FD}/${path}`, { method, cache: 'no-store', headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined })
    const text = await r.text(); let data: any = null; try { data = text ? JSON.parse(text) : null } catch { data = { detail: text } }
    return { ok: r.ok, status: r.status, data: data as T, offline: r.status === 502 || r.status === 504 }
  } catch (e) { return { ok: false, status: 0, data: { detail: (e as Error).message } as unknown as T, offline: true } }
}
export const errText = (r: ApiResult) => { const d = r.data?.detail; return typeof d === 'string' ? d : d?.message || d?.status || r.data?.message || `HTTP ${r.status}` }
