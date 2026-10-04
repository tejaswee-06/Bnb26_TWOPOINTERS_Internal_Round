import Link from 'next/link'
export const metadata = { title: 'How Fair Drop works' }
export default function How() {
  return <div className="cx-w cx-sec" style={{ maxWidth: 820 }}>
    <h1 style={{ fontSize: '2rem' }}>How Fair Drop works</h1>
    <p className="mut" style={{ fontSize: '1.05rem', margin: '.5rem 0 1.4rem' }}>High-demand tickets usually go to whoever has the fastest connection — or a bot. Fair Drop replaces the click race with a process that is equal for everyone and can be checked afterwards.</p>
    <ol className="cx-proof">{[['Join the pre-queue', 'Sign in and verify your session. We bind it to your account so opening extra tabs or sessions can’t multiply your chances. Everyone who joins before the window closes is treated the same.'], ['The window closes — then the draw', 'Before entries open we publish a cryptographic commitment to a random seed. After the window closes we reveal the seed and shuffle the entries with a published algorithm.'], ['Controlled admission', 'People are admitted in shuffled order at a controlled pace, matched to remaining seats — so there is no speed race even among admitted people.'], ['Choose, hold, pay', 'Admitted people hold seats for a few minutes. Each seat is held, then confirmed, using atomic inventory — no seat can be sold twice.'], ['Verify it yourself', 'Open your confirmation and press “Verify allocation”. Your browser recomputes the draw from the published data.']].map(([t, d], i) => <li key={t}><span className="cx-n">{i + 1}</span><div><b>{t}</b><p className="mut" style={{ fontSize: '.92rem' }}>{d}</p></div></li>)}</ol>
    <div className="card" style={{ margin: '1.4rem 0' }}><h3>Questions</h3>
      <p style={{ marginTop: '.6rem' }}><b>Does joining early help?</b> <span className="mut">No. Position is assigned only after the window closes.</span></p>
      <p style={{ marginTop: '.4rem' }}><b>Do bots get tickets?</b> <span className="mut">Automated traffic is detected from behaviour and de-duplicated by identity; the draw then treats everyone left equally.</span></p>
      <p style={{ marginTop: '.4rem' }}><b>Can I be wrongly blocked?</b> <span className="mut">Detection can make mistakes. Challenges are used before blocks, and the operator monitors false positives.</span></p></div>
    <div className="row"><Link className="btn pri lg" href="/events?status=LIVE">See live Fair Drops</Link><Link className="btn lg" href="/">Home</Link></div>
  </div>
}
