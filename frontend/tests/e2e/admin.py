"""Admin portal e2e (Playwright, chromium). Run: BASE=http://localhost:3100 python3 tests/e2e/admin.py"""
import os, sys, re
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:3100'); SHOTS = os.environ.get('SHOTS', 'shots'); os.makedirs(SHOTS, exist_ok=True)
errs = []; results = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond), extra)); print(('PASS ' if cond else 'FAIL ') + name + (' — ' + extra if extra else ''))
with sync_playwright() as p:
    exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
    b = p.chromium.launch(executable_path=exe if os.path.exists(exe) else None, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    # --- gate + customer menu entry ---
    pg.goto(BASE + '/admin'); pg.wait_for_url(re.compile('/admin/login')); ok('unauthenticated /admin → /admin/login', '/admin/login' in pg.url)
    pg.goto(BASE + '/admin/traffic'); pg.wait_for_url(re.compile('/admin/login')); ok('unauthenticated deep link gated', 'next=' in pg.url)
    pg.goto(BASE + '/'); pg.wait_for_selector('text=Real fans get real seats')
    ok('no ADMIN ACCESS in main navbar', pg.locator('.cx-nav1 >> text=ADMIN ACCESS').count() == 0 and pg.locator('.cx-nav2 >> text=ADMIN ACCESS').count() == 0)
    pg.click('button[aria-label="Open menu"]'); la = pg.locator('.cx-drawer a.cx-admin-access'); la.wait_for()
    ok('hamburger shows ADMIN ACCESS directly', la.is_visible() and 'ADMIN ACCESS' in la.inner_text()); pg.screenshot(path=f'{SHOTS}/a00_menu.png')
    la.click(); pg.wait_for_url(re.compile('/admin/login')); ok('ADMIN ACCESS → /admin/login', pg.url.endswith('/admin/login'))
    # --- login ---
    pg.screenshot(path=f'{SHOTS}/a01_login.png')
    pg.fill('input[type=email]', 'admin@fairdrop.demo'); pg.fill('input[type=password]', 'wrong'); pg.click('button[type=submit]')
    ok('wrong password rejected', pg.locator('p[role=alert]').count() == 1 and '/admin/login' in pg.url)
    pg.fill('input[type=password]', 'FairDrop@2026'); pg.click('button[type=submit]'); pg.wait_for_url(re.compile(r'/admin$')); pg.wait_for_selector('text=Operations overview')
    ok('login → /admin overview', True)
    for g in ['Overview', 'Traffic', 'Intelligence', 'Admission', 'Fairness', 'Operations']:
        ok('nav group: ' + g, pg.locator('nav[aria-label="Admin navigation"] .adm-dd > button', has_text=re.compile('^' + g)).count() == 1)
    ok('no permanent sidebar', pg.locator('aside.side, .side').count() == 0)
    ok('shows drop + simulation state + identity', pg.locator('#adm-drop').count() == 1 and pg.locator('.adm-ctx >> text=SIMULATION').count() >= 1 and pg.locator('text=admin@fairdrop.demo').count() >= 1)
    def nav(group, item):
        pg.click(f'nav[aria-label="Admin navigation"] .adm-dd > button:has-text("{group}")'); pg.click(f'.adm-menu a:has-text("{item}")'); pg.wait_for_selector('main h1'); pg.wait_for_timeout(250)
    for g, items in {'Traffic': ['Live Traffic', 'Queue', 'Load Lab'], 'Intelligence': ['Detection', 'Campaigns', 'Attack Lab', 'Risk Signals'], 'Admission': ['Pre-Queue', 'Randomization', 'Admission', 'Allocations'], 'Fairness': ['Fairness Lab', 'Allocation Advantage', 'Verification'], 'Operations': ['Incidents', 'System Health', 'Reports'], 'Overview': ['Drop Control', 'Simulation']}.items():
        pg.click(f'nav[aria-label="Admin navigation"] .adm-dd > button:has-text("{g}")'); got = pg.locator('.adm-menu a b').all_inner_texts(); pg.keyboard.press('Escape')
        ok(f'dropdown {g}: ' + ', '.join(items), all(i in got for i in items), str(got))
    nav('Overview', 'Simulation'); ok('simulation integration slot only', pg.locator('[data-testid=simulation-slot]').count() == 1)
    # --- drop control: soft navigation keeps the shared runtime ---
    nav('Overview', 'Drop Control'); pg.screenshot(path=f'{SHOTS}/a02_drop.png')
    ok('drop control PREPARED', pg.locator('.adm-steps li.cur', has_text='prepared').count() == 1)
    pg.click('button:has-text("Open Pre-Queue")'); pg.wait_for_selector('.adm-steps li.cur:has-text("pre queue open")'); ok('Open Pre-Queue → PRE_QUEUE_OPEN', True)
    nav('Traffic', 'Load Lab'); pg.click('.seg button:has-text("×8")'); pg.wait_for_timeout(500)
    nav('Traffic', 'Live Traffic'); pg.wait_for_selector('text=Requests / sec'); pg.wait_for_timeout(5000); pg.screenshot(path=f'{SHOTS}/a03_traffic.png')
    ok('live traffic shows SIMULATED label + p99', pg.locator('text=SIMULATED').count() >= 1 and pg.locator('text=p50 / p95 / p99').count() == 1)
    nav('Overview', 'Drop Control'); pg.click('button:has-text("Close Pre-Queue")'); pg.wait_for_selector('.adm-steps li.cur:has-text("pre queue closed")'); ok('Close Pre-Queue', True)
    nav('Admission', 'Pre-Queue'); pg.wait_for_selector('text=Eligible pool composition'); ok('pre-queue eligible pool', True); pg.screenshot(path=f'{SHOTS}/a04_prequeue.png')
    nav('Overview', 'Drop Control'); pg.click('button:has-text("Randomize")'); pg.wait_for_selector('.adm-steps li.cur:has-text("randomized")'); ok('Randomize → RANDOMIZED', True)
    nav('Admission', 'Randomization'); pg.wait_for_selector('text=Seed chain'); ok('randomization recompute PASS', pg.locator('text=PASS').count() >= 1 and pg.locator('.adm-code').count() == 4); pg.screenshot(path=f'{SHOTS}/a05_random.png')
    nav('Overview', 'Drop Control'); pg.click('button:has-text("Start Admission")'); pg.wait_for_selector('.adm-steps li.cur:has-text("admitting")'); ok('Start Admission → ADMITTING', True)
    pg.click('button:has-text("Pause Admission")'); pg.wait_for_selector('text=(paused)'); ok('Pause Admission', True); pg.click('button:has-text("Resume Admission")'); pg.wait_for_selector('.adm-steps li.cur:has-text("admitting")')
    nav('Admission', 'Admission'); pg.wait_for_timeout(4000); pg.screenshot(path=f'{SHOTS}/a06_admission.png'); ok('admission page cohort table', pg.locator('text=Cohort at the admission pointer').count() == 1)
    nav('Admission', 'Allocations'); pg.wait_for_selector('.adm-big'); pg.wait_for_timeout(5000)
    txt = pg.inner_text('.adm-big'); m = re.findall(r'\d[\d,]*', txt); a, h, c, tot, total = [int(x.replace(',', '')) for x in m[:5]]
    ok('CONFIRMED + HELD + AVAILABLE = TOTAL (live)', a + h + c == tot == total and total == 500, txt.replace('\n', ' ')); pg.screenshot(path=f'{SHOTS}/a07_alloc.png')
    ok('allocation stream columns', all(pg.locator('th', has_text=t).count() >= 1 for t in ['Allocation', 'Session', 'State', 'Idempotency']))
    # --- customer + admin share state: customer sees the same drop ---
    nav('Fairness', 'Verification'); pg.wait_for_selector('text=Untouched proof bundle'); pg.screenshot(path=f'{SHOTS}/a08_verify.png')
    ok('verification: untouched VERIFIED, 3 tamper cases detected', pg.locator('.pill:has-text("VERIFIED")').count() == 1 and pg.locator('.pill:has-text("TAMPER DETECTED")').count() == 3)
    # --- attack lab ---
    nav('Intelligence', 'Attack Lab')
    pg.select_option('main select >> nth=0', 'DISTRIBUTED'); pg.locator('main input[type=range] >> nth=0').fill('6000'); pg.click('button:has-text("Start — reset")'); pg.wait_for_selector('text=ATTACK ACTIVE')
    nav('Traffic', 'Load Lab'); pg.click('.seg button:has-text("×8")'); nav('Intelligence', 'Attack Lab'); pg.wait_for_timeout(9000); pg.screenshot(path=f'{SHOTS}/a09_attack.png')
    ok('attack lab shows 6-stage chain', all(pg.locator('.adm-flow .eyebrow', has_text=t).count() == 1 for t in ['Attack', 'Detection', 'Mitigation', 'Queue effect', 'Admission effect', 'Allocation effect']))
    ok('attack produced bot sessions', not re.search(r'^0 bot sessions', pg.locator('.adm-flow li').first.inner_text().split('\n')[1] if pg.locator('.adm-flow li').count() else '0 bot sessions'))
    nav('Intelligence', 'Detection'); pg.wait_for_selector('text=ML is advisory'); ok('detection: advisory/deterministic note', pg.locator('text=policy is deterministic').count() == 1); pg.screenshot(path=f'{SHOTS}/a10_detect.png')
    nav('Intelligence', 'Risk Signals'); pg.wait_for_selector('text=Model feature weights'); ok('risk signals', True)
    nav('Intelligence', 'Campaigns'); pg.wait_for_timeout(3000); pg.wait_for_selector('text=Detected campaigns'); ok('campaigns page', True); pg.screenshot(path=f'{SHOTS}/a11_campaigns.png')
    # --- fairness ---
    nav('Fairness', 'Fairness Lab'); pg.locator('main input[type=range] >> nth=0').fill('4000'); pg.click('button:has-text("Run counterfactual")'); pg.wait_for_selector('text=World A vs World B vs naive baseline', timeout=90000)
    ok('fairness experiment computed', pg.locator('th:has-text("Naive")').count() == 1 and pg.locator('td:has-text("Attack Allocation Advantage")').count() == 1); pg.screenshot(path=f'{SHOTS}/a12_fairness.png')
    nav('Fairness', 'Allocation Advantage'); pg.wait_for_selector('text=AAA'); ok('allocation advantage with experiment table', pg.locator('th:has-text("AAA")').count() == 1); pg.screenshot(path=f'{SHOTS}/a13_adv.png')
    # --- ops ---
    nav('Operations', 'Incidents'); pg.wait_for_selector('text=Incident log'); ok('incidents page', True); pg.screenshot(path=f'{SHOTS}/a14_inc.png')
    nav('Operations', 'System Health'); pg.wait_for_selector('text=NOT CONNECTED'); ok('system health labels simulation honestly', pg.locator('td:has-text("Database") + td:has-text("NOT CONNECTED")').count() == 1 and pg.locator('text=SIMULATED').count() >= 1); pg.screenshot(path=f'{SHOTS}/a15_system.png')
    nav('Operations', 'Reports'); pg.wait_for_selector('text=Inventory integrity'); secs = ['What happened', 'Traffic', 'Detected abuse', 'Mitigation', 'Admission', 'Allocations', 'Fairness', 'Inventory integrity', 'Final outcome']
    ok('report has all 9 sections', all(pg.locator('.adm-panel h2', has_text=re.compile('^' + s + '$', re.I)).count() >= 1 for s in secs)); ok('report states no LLM', pg.locator('text=deterministic-template').count() == 1); pg.screenshot(path=f'{SHOTS}/a16_report.png')
    # --- drop control / overview carry state ---
    nav('Overview', 'Overview'); pg.wait_for_selector('text=Seats remaining'); pg.screenshot(path=f'{SHOTS}/a17_overview.png'); ok('overview KPIs', pg.locator('.adm-kpi').count() >= 12)
    # --- logout ---
    pg.click('button:has-text("Log out")'); pg.wait_for_url(re.compile('/admin/login')); ok('logout → /admin/login', True)
    pg.goto(BASE + '/admin/fairness'); pg.wait_for_url(re.compile('/admin/login')); ok('after logout console is gated', True)
    real = [e for e in errs if 'Failed to fetch RSC payload' not in e and 'Failed to load resource' not in e]  # aborted prefetch on page.goto / intentional 404s are not app errors
    ok('no console / page errors', not real, str(real[:3]))
    b.close()
bad = [r for r in results if not r[1]]; print(f'\n{len(results) - len(bad)}/{len(results)} checks passed'); sys.exit(1 if bad else 0)
