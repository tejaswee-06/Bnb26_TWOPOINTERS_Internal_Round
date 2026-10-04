const P: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10', drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z', gauge: 'M4 18a9 9 0 1 1 16 0M12 13l4-4', zap: 'M13 2L4 14h7l-1 8 9-12h-7z',
  net: 'M6 4a2 2 0 1 0 .01 0M18 4a2 2 0 1 0 .01 0M12 18a2 2 0 1 0 .01 0M7 6l4 10M17 6l-4 10M8 5h8', scale: 'M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5', alert: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  cpu: 'M7 7h10v10H7zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4', search: 'M11 4a7 7 0 1 0 .01 0M21 21l-5-5',
  sun: 'M12 8a4 4 0 1 0 .01 0M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5', moon: 'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z',
  access: 'M12 4a1.5 1.5 0 1 0 .01 0M5 9l7 1.5L19 9M12 10.5V15l-3 6M12 15l3 6', menu: 'M4 6h16M4 12h16M4 18h16', play: 'M7 4l13 8-13 8z', pause: 'M7 4v16M17 4v16',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4', x: 'M6 6l12 12M18 6L6 18', chev: 'M9 6l6 6-6 6', down: 'M6 9l6 6 6-6',
  pin: 'M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11zM12 7.5a2.5 2.5 0 1 0 .01 0', cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', user: 'M12 4a4 4 0 1 0 .01 0M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7',
  ticket: 'M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4v0a2 2 0 0 0 0-4V6H3zM14 6v12', check: 'M5 12l5 5 9-10', lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  key: 'M14 10a4 4 0 1 0-3.9 4L11 15v3h3v3h3v-4l-3-3', clock: 'M12 4a8 8 0 1 0 .01 0M12 8v4l3 2', file: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7', logout: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9',
  star: 'M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z', refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5', external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6', info: 'M12 4a8 8 0 1 0 .01 0M12 11v5M12 8v.5',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z', target: 'M12 4a8 8 0 1 0 .01 0M12 8a4 4 0 1 0 .01 0M12 11.5v1', tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5a1 1 0 1 0 .01 0', film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M16 9h4M4 15h4M16 15h4',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4', ball: 'M12 3a9 9 0 1 0 .01 0M12 3v18M3 12h18', mask: 'M4 5h16v7a8 8 0 0 1-16 0zM8 10h2M14 10h2M9 15c1.5 1.5 4.5 1.5 6 0', book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM8 7h7', spark: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z', gift: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-4 0M12 7c2-4 6-3 4 0',
}
export default function Ic({ n, s = 18 }: { n: string; s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={P[n] || P.info} /></svg>
}
