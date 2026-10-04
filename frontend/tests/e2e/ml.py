"""Person 2 ML integration e2e. MODE=online|offline. Run: BASE=http://localhost:3200 MODE=online python3 tests/e2e/ml.py"""
import os, re, sys
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:3200'); MODE = os.environ.get('MODE', 'online'); SHOTS = os.environ.get('SHOTS', 'shots/ml'); os.makedirs(SHOTS, exist_ok=True)
res = []; errs = []
def ok(n, c, x=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + (' — ' + x if x else ''))
with sync_playwright() as p:
    exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
    b = p.chromium.launch(executable_path=exe if os.path.exists(exe) else None, args=['--no-sandbox']); ctx = b.new_context(viewport={'width': 1440, 'height': 1000}); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE + '/admin/login'); pg.fill('input[type=email]', 'admin@fairdrop.demo'); pg.fill('input[type=password]', 'FairDrop@2026'); pg.click('button[type=submit]'); pg.wait_for_url(re.compile(r'/admin$'))
    for path, key in [('intelligence', 'Person 2 ML'), ('campaigns', 'Person 2 campaign RiskEvents'), ('attacks', 'Person 2 simulator')]:
        pg.goto(f'{BASE}/admin/{path}'); pg.wait_for_selector(f'text={key}'); pg.wait_for_timeout(2500); body = pg.inner_text('main'); pg.screenshot(path=f'{SHOTS}/{MODE}_{path}.png', full_page=True)
        if MODE == 'online':
            ok(f'{path}: CONNECTED', 'ML SERVICE CONNECTED' in body)
            if path == 'intelligence': ok('intelligence: Model 1 + Model 2 + live feed', all(t.lower() in body.lower() for t in ['Model 1 accuracy', 'Model 2 unusual', 'Live demo feed', 'bot probability']) and re.search(r'\b(HUMAN|BOT)\b', body) is not None); ok('intelligence: computed 93.0% / 97.78% / 88.0%', all(t in body for t in ['93.0%', '97.78%', '88.0%']))
            if path == 'intelligence': ok('intelligence: actual 110H/90B predictions shown', '110 H / 90 B' in body)
            if path == 'campaigns': ok('campaigns: 20 RiskEvents with campaign_001 + coordination_v1', pg.locator('table.t tbody tr').filter(has_text='campaign_001').count() >= 1 and 'coordination_v1' in body and pg.locator('text=n/a').count() >= 20, f"rows={pg.locator('table.t tbody tr').count()}")
            if path == 'attacks': ok('attacks: SIMULATED TRAFFIC + confusion matrix', 'SIMULATED TRAFFIC' in body and 'TP 88' in body and 'FN 12' in body)
        else:
            ok(f'{path}: ML SERVICE OFFLINE shown', 'ML SERVICE OFFLINE' in body); ok(f'{path}: no fabricated ML numbers', 'Model 1 accuracy' not in body and 'campaign_001' not in body and 'TP 88' not in body)
            ok(f'{path}: rest of page still renders', pg.locator('.adm-head h1').count() == 1 and pg.locator('.adm-panel').count() >= 1 and pg.locator('.adm-main').count() == 1)
    for path in ['', 'traffic', 'incidents', 'drop', 'fairness', 'system']:
        pg.goto(f'{BASE}/admin/{path}'); pg.wait_for_selector('.adm-head h1'); ok(f'existing admin page /admin/{path} renders', pg.locator('.adm-head h1').count() == 1)
    ok('no uncaught page errors', not errs, '; '.join(errs[:2])); b.close()
print(f'{sum(res)}/{len(res)}'); sys.exit(0 if all(res) else 1)
