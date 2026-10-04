import { sha256 } from '@/lib/engine/crypto'
/** QR-STYLE visual derived from a hash of the allocation id. Decorative — it is NOT a scannable QR code and encodes nothing. */
export default function QrArt({ seed, size = 168 }: { seed: string; size?: number }) {
  const N = 25, bits: boolean[] = []; let h = sha256('qr:' + seed); while (bits.length < N * N) { for (const ch of h) { const v = parseInt(ch, 16); for (let k = 3; k >= 0; k--) bits.push(((v >> k) & 1) === 1) } h = sha256(h) }
  const finder = (x: number, y: number) => (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8)
  const fin = (x: number, y: number) => { const f = (cx: number, cy: number) => { const dx = Math.abs(x - cx), dy = Math.abs(y - cy), d = Math.max(dx, dy); return d === 3 || d <= 1 }; return f(3, 3) || f(N - 4, 3) || f(3, N - 4) }
  const cells: React.ReactNode[] = []
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const on = finder(x, y) ? fin(x, y) : bits[y * N + x]; if (on) cells.push(<rect key={x + '-' + y} x={x} y={y} width="1" height="1" />) }
  return <svg role="img" aria-label="Decorative QR-style code (not scannable)" width={size} height={size} viewBox={`-1 -1 ${N + 2} ${N + 2}`} style={{ background: '#fff', borderRadius: 10, padding: 4 }} shapeRendering="crispEdges"><g fill="#0a0b12">{cells}</g></svg>
}
