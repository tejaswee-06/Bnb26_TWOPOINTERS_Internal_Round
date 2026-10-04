import type { FDEvent } from '@/lib/data/events'
/** Procedural poster art (SVG) — no external images, no real artwork. Pure function of the event's poster spec, so SSR and client agree. */
export function PosterArt({ poster, id }: { poster: FDEvent['poster']; id: string }) {
  const [a, b, c] = poster.colors, g = 'g' + id.replace(/[^a-z0-9]/gi, '')
  const m = poster.motif
  return <svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" className="poster-svg" aria-hidden="true" focusable="false">
    <defs><linearGradient id={g} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset=".55" stopColor={b} /><stop offset="1" stopColor={c} /></linearGradient>
      <radialGradient id={g + 'r'} cx=".7" cy=".25" r=".7"><stop offset="0" stopColor="#fff" stopOpacity=".35" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient></defs>
    <rect width="300" height="400" fill={`url(#${g})`} /><rect width="300" height="400" fill={`url(#${g}r)`} />
    {m === 'film' && <g opacity=".35" fill="#000">{Array.from({ length: 9 }, (_, i) => <rect key={i} x="14" y={20 + i * 42} width="14" height="26" rx="3" />)}{Array.from({ length: 9 }, (_, i) => <rect key={'b' + i} x="272" y={20 + i * 42} width="14" height="26" rx="3" />)}<circle cx="210" cy="120" r="46" fill="none" stroke="#fff" strokeWidth="2" opacity=".6" /></g>}
    {m === 'spotlight' && <g opacity=".3" fill="#fff"><polygon points="150,0 70,400 120,400" /><polygon points="150,0 180,400 230,400" /><polygon points="150,0 10,400 50,400" opacity=".6" /></g>}
    {m === 'grid' && <g stroke="#fff" opacity=".28" strokeWidth="1">{Array.from({ length: 11 }, (_, i) => <line key={i} x1={i * 30} y1="0" x2={i * 30} y2="400" />)}{Array.from({ length: 14 }, (_, i) => <line key={'h' + i} x1="0" y1={i * 30} x2="300" y2={i * 30} />)}<circle cx="210" cy="110" r="52" fill="none" strokeWidth="2" opacity=".8" /><circle cx="210" cy="110" r="24" fill="#fff" opacity=".35" stroke="none" /></g>}
    {m === 'waves' && <g fill="none" stroke="#fff" opacity=".4" strokeWidth="2">{Array.from({ length: 9 }, (_, i) => <path key={i} d={`M0 ${120 + i * 26} C 70 ${90 + i * 26}, 140 ${160 + i * 26}, 210 ${120 + i * 26} S 280 ${100 + i * 26}, 300 ${130 + i * 26}`} />)}</g>}
    {m === 'field' && <g fill="none" stroke="#fff" opacity=".35" strokeWidth="2"><rect x="30" y="150" width="240" height="200" rx="6" /><line x1="150" y1="150" x2="150" y2="350" /><circle cx="150" cy="250" r="34" /><rect x="30" y="205" width="40" height="90" /><rect x="230" y="205" width="40" height="90" /></g>}
    {m === 'curtain' && <g opacity=".3">{Array.from({ length: 10 }, (_, i) => <path key={i} d={`M${i * 30 + 15} 0 Q ${i * 30 + 35} 200 ${i * 30 + 15} 400`} stroke="#000" strokeWidth="14" fill="none" />)}<ellipse cx="150" cy="330" rx="110" ry="22" fill="#fff" opacity=".4" /></g>}
    {m === 'hex' && <g fill="none" stroke="#fff" opacity=".3" strokeWidth="1.5">{Array.from({ length: 6 }, (_, r) => Array.from({ length: 5 }, (_, q) => { const x = 30 + q * 62 + (r % 2) * 31, y = 40 + r * 52; return <polygon key={r + '-' + q} points={`${x},${y - 28} ${x + 24},${y - 14} ${x + 24},${y + 14} ${x},${y + 28} ${x - 24},${y + 14} ${x - 24},${y - 14}`} /> }))}</g>}
    <rect y="230" width="300" height="170" fill="#000" opacity=".28" />
  </svg>
}
export default function Poster({ e, size = 'md', showTitle = true }: { e: FDEvent; size?: 'sm' | 'md' | 'lg'; showTitle?: boolean }) {
  return <div className={'poster ' + size} role="img" aria-label={`Poster for ${e.title}`}>
    <PosterArt poster={e.poster} id={e.id} />
    <div className="poster-txt">{showTitle && <><span className="poster-cat">{e.category}</span><b>{e.title}</b><i>{e.poster.tagline}</i></>}</div>
  </div>
}
