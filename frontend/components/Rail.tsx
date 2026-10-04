import Link from 'next/link'
export default function Rail({ title, sub, href, children, id }: { title: string; sub?: string; href?: string; children: React.ReactNode; id?: string }) {
  return <section className="cx-w cx-sec" aria-labelledby={id}><div className="row sb" style={{ marginBottom: '.9rem' }}><div><h2 id={id}>{title}</h2>{sub && <p className="mut" style={{ fontSize: '.88rem' }}>{sub}</p>}</div>{href && <Link href={href} className="btn sm ghost">See all</Link>}</div>{children}</section>
}
