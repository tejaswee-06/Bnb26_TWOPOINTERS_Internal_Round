import Link from 'next/link'
export const metadata = { title: 'Offers' }
const OFFERS = [['Fair Drop Fridays', 'No convenience fee on Stand-up Comedy bookings made on Fridays.', '/events?category=Stand-up%20Comedy'], ['Student pass', 'Flat 15% off Seminars and Activities with a verified student account.', '/events?category=Seminars'], ['Bring a friend', 'Book 2 tickets to any Movie and get a free popcorn voucher.', '/events?category=Movies'], ['Early supporter', 'Join any live Fair Drop and get priority notification for the next one — joining early still never changes your draw odds.', '/events?status=LIVE']]
export default function Offers() {
  return <div className="cx-w cx-sec"><h1 style={{ fontSize: '1.9rem' }}>Offers</h1><p className="mut" style={{ margin: '.4rem 0 1.2rem' }}>Illustrative demo offers — none of these are real promotions.</p>
    <div className="grid g2">{OFFERS.map(([t, d, h]) => <div key={t} className="card col"><span className="pill acc" style={{ width: 'fit-content' }}>Demo offer</span><h3>{t}</h3><p className="mut">{d}</p><div><Link href={h} className="btn pri sm">Browse eligible events</Link></div></div>)}</div></div>
}
