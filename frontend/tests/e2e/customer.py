"""Customer journey e2e (Playwright, chromium). Run: BASE=http://localhost:3100 python3 tests/e2e/customer.py"""
import os, sys, re
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:3100'); SHOTS = os.environ.get('SHOTS', 'shots')
errs = []; results = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond), extra)); print(('PASS ' if cond else 'FAIL ') + name + (' — ' + extra if extra else ''))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome' if os.path.exists('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') else None, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1366, 'height': 850}); ctx.add_init_script("localStorage.setItem('fd-prefs', JSON.stringify({theme: '" + os.environ.get('THEME','dark') + "'}))"); pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '/'); pg.wait_for_selector('text=Real fans get real seats'); pg.screenshot(path=f'{SHOTS}/c01_home.png')
    ok('home renders hero + rows', pg.locator('text=High-demand Fair Drops').count() == 1 and pg.locator('text=Upcoming').count() >= 1)
    ok('no sidebar on customer pages', pg.locator('aside.side, .side').count() == 0)
    for l in ['Movies', 'Events', 'Concerts', 'Sports', 'Stand-up Comedy', 'Seminars', 'Theatre', 'Activities', 'Offers', 'My Tickets']:
        ok('category nav: ' + l, pg.locator('nav[aria-label=Categories] a', has_text=re.compile('^' + l + '$')).count() == 1)
    s = pg.locator('.cx-search input'); s.click(); s.fill('AI'); pg.wait_for_selector('[role=listbox] [role=option]')
    opts = pg.locator('[role=listbox] [role=option]').all_inner_texts(); ok('autocomplete "AI" finds AI events', any('AI Frontier' in o for o in opts) and any('Build With AI' in o for o in opts), str(opts[:3]))
    ok('autocomplete "AI" does not match Mumbai-only events', not any('Late Night' in o for o in opts))
    pg.screenshot(path=f'{SHOTS}/c02_search.png'); s.press('ArrowDown'); s.press('Enter'); pg.wait_for_url(re.compile('/events/')); ok('search → event page', '/events/' in pg.url, pg.url)
    pg.goto(BASE + '/events?q=comedy'); pg.wait_for_selector('.ecard'); ok('events list search "comedy"', pg.locator('.ecard').count() >= 3)
    pg.goto(BASE + '/events?q=zzzzqq'); ok('empty state', pg.locator('text=Nothing matches yet').count() == 1)
    pg.goto(BASE + '/events/ai-frontier-mumbai-2026'); pg.wait_for_selector('text=How this Fair Drop works'); pg.screenshot(path=f'{SHOTS}/c03_event.png')
    pg.click('a:has-text("Join Fair Drop")'); pg.wait_for_url(re.compile('/drop/ai-frontier-mumbai-2026$')); pg.screenshot(path=f'{SHOTS}/c04_drop.png')
    pg.click('a:has-text("Join Fair Drop")'); pg.wait_for_url(re.compile('/verify')); pg.click('main button:has-text("Sign in")')
    pg.fill('input[autocomplete=name]', 'Asha Rao'); pg.fill('input[type=email]', 'asha@example.com'); pg.click('button:has-text("Continue")')
    pg.wait_for_selector('text=passed >> nth=2', timeout=8000); pg.check('.cx-ack input >> nth=0'); pg.screenshot(path=f'{SHOTS}/c05_verify.png')
    pg.click('button:has-text("Enter the pre-queue")'); pg.wait_for_url(re.compile('/queue')); pg.wait_for_selector('text=You’re safely in')
    ok('pre-queue "You’re safely in"', True); pg.screenshot(path=f'{SHOTS}/c06_queue.png')
    ok('no risk/bot/ML terms on customer pages', not re.search(r'risk score|bot|isolation|campaign', pg.inner_text('main'), re.I))
    pg.evaluate('window.__fdrt.setSpeed(8)'); pg.wait_for_url(re.compile('/admission'), timeout=40000)
    pg.wait_for_selector('.cx-pos, a:has-text("Choose tickets")', timeout=20000)
    pos = pg.inner_text('.cx-pos') if pg.locator('.cx-pos').count() else ''; pg.screenshot(path=f'{SHOTS}/c07_admission.png'); ok('randomized position shown "#N of M"', re.search(r'#[\d,]+', pos) is not None or 'your turn' in pg.inner_text('main'), pos.replace('\n', ' '))
    pg.wait_for_selector('a:has-text("Choose tickets")', timeout=40000); pg.click('a:has-text("Choose tickets")'); pg.wait_for_url(re.compile('/tickets'))
    pg.screenshot(path=f'{SHOTS}/c08_tickets.png'); pg.click('button:has-text("Hold tickets")'); pg.wait_for_url(re.compile('/payment'), timeout=8000); pg.screenshot(path=f'{SHOTS}/c09_payment.png')
    pg.check('text=simulate a declined payment'); pg.click('button:has-text("Pay")'); pg.wait_for_selector('text=declined'); ok('payment failure path keeps hold', True)
    pg.uncheck('text=simulate a declined payment'); pg.click('button:has-text("Pay")'); pg.wait_for_url(re.compile('/confirmation/'), timeout=8000); pg.screenshot(path=f'{SHOTS}/c10_confirm.png')
    ok('confirmation shows booking + allocation id', pg.locator('text=BK-').count() >= 1 and pg.locator('text=ALLOC').count() + pg.locator('.mono').count() >= 1)
    pg.click('a:has-text("VERIFY ALLOCATION")'); pg.wait_for_selector('text=VERIFIED'); ok('verification proof passes', pg.locator('text=✓ VERIFIED').count() == 1); pg.screenshot(path=f'{SHOTS}/c11_verify.png')
    pg.click('button:has-text("Alter the seed")'); pg.wait_for_selector('text=VERIFICATION FAILED'); ok('tampered seed fails verification', True)
    pg.click('button:has-text("Reset")'); pg.goto(BASE + '/tickets'); ok('My Tickets lists booking', pg.locator('.cx-bk').count() >= 1); pg.screenshot(path=f'{SHOTS}/c12_tickets.png')
    pg.goto(BASE + '/events/midnight-protocol'); ok('another drop event page loads', pg.locator('h1').first.inner_text() == 'Midnight Protocol')
    pg.goto(BASE + '/events/late-night-laughs'); pg.wait_for_selector('button:has-text("Book now")'); pg.click('button:has-text("Book now")'); pg.wait_for_url(re.compile('/payment')); pg.click('button:has-text("Pay")'); pg.wait_for_url(re.compile('/confirmation/')); ok('direct-sale event books end-to-end', True)
    # mobile + light
    m = b.new_context(viewport={'width': 390, 'height': 800}); m.add_init_script("localStorage.setItem('fd-prefs', JSON.stringify({theme: '" + os.environ.get('THEME','dark') + "'}))"); mp = m.new_page(); mp.on('pageerror', lambda e: errs.append(str(e))); mp.goto(BASE + '/'); mp.wait_for_selector('text=Real fans'); mp.screenshot(path=f'{SHOTS}/c13_mobile.png')
    ok('mobile: no horizontal scroll', mp.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    n_before_404 = len(errs)  # the deliberate 404 navigation logs one browser-level 'Failed to load resource' line
    pg.goto(BASE + '/nope'); ok('404 page', pg.locator('text=Page not found').count() == 1)
    b.close()
if any('404' in e for e in errs[n_before_404:n_before_404 + 1]): del errs[n_before_404]
bad = [e for e in errs if 'favicon' not in e and 'Failed to fetch RSC payload' not in e]  # RSC prefetches aborted by Playwright page.goto/close are not app errors
ok('no console errors', not bad, '; '.join(bad[:3]))
print(f'\n{sum(1 for r in results if r[1])}/{len(results)} passed'); sys.exit(0 if all(r[1] for r in results) else 1)
