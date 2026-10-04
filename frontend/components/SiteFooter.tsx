import Link from 'next/link'
import { LOGO } from './SiteNav'
export default function SiteFooter() {
  return <footer className="cx-foot"><div className="cx-w cx-foot-g">
    <div>{LOGO}<p className="mut" style={{ fontSize: '.85rem', marginTop: '.6rem', maxWidth: 320 }}>Fair access to high-demand events. Real people, real seats — allocated by a verifiable draw instead of a speed race.</p></div>
    <div className="col"><b>Explore</b><Link href="/events">All events</Link><Link href="/offers">Offers</Link><Link href="/tickets">My Tickets</Link></div>
    <div className="col"><b>Fair Drop</b><Link href="/how-it-works">How it works</Link><Link href="/events?status=LIVE">Live drops</Link></div>
    <div className="col"><b>Organizers</b><Link href="/admin/login">For organizers · operations console</Link></div>
  </div><div className="cx-w mut2" style={{ fontSize: '.75rem', paddingBottom: '1.5rem' }}>FAIR DROP is a hackathon prototype. Events, venues, organizers and prices are entirely fictional; payments are a demo and no money moves. Traffic and fairness figures shown to operators are SIMULATED / DEMO DATA.</div></footer>
}
