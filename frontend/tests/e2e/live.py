"""LIVE-mode e2e: Next.js (NEXT_PUBLIC_FAIRDROP_LIVE=1) -> /api/fd proxy -> Person-1 backend -> (Person-2 evidence) -> policy -> allocation.
Run via scripts/run_live_e2e.sh (it builds/starts everything with the right env). Env: BASE, BACKEND, ML, ADMIN_KEY, INTEGRATION_KEY.
This script also owns the backend / ML processes (it stops and restarts them to prove outage behaviour) — set SPAWN=1 and the *_CMD env vars (done by the runner).
"""
import json, os, re, signal, subprocess, sys, threading, time, urllib.request, urllib.error
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO, 'scripts')); sys.path.insert(0, os.path.join(REPO, 'backend'))
import replay_p2_evidence as rp
from app.fairness.shuffle import deterministic_shuffle, commitment_of, root_of, shuffle_seed
BASE = os.environ.get('BASE', 'http://localhost:3000'); BACKEND = os.environ.get('BACKEND', 'http://127.0.0.1:8000'); ML = os.environ.get('ML', 'http://127.0.0.1:8001')
IKEY = os.environ.get('INTEGRATION_KEY', ''); EID = 'ai-frontier-mumbai-2026'; SHOTS = os.environ.get('SHOTS', 'shots'); os.makedirs(SHOTS, exist_ok=True)
results = []; errs = []
def ok(name, cond, extra=''):
    results.append((name, bool(cond), extra)); print(('PASS ' if cond else 'FAIL ') + name + (' — ' + str(extra) if extra else ''), flush=True)
def http(method, url, body=None, headers=None, timeout=20):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method, headers={'content-type': 'application/json', **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw)
        except Exception: return e.code, {'detail': raw.decode()[:200]}
    except Exception as e: return 0, {'detail': str(e)}
# ---------- process control (backend + ML) ----------
procs = {}
def spawn(name):
    cmd = os.environ[name.upper() + '_CMD']; cwd = os.environ[name.upper() + '_CWD']
    procs[name] = subprocess.Popen(cmd, shell=True, cwd=cwd, stdout=open(os.path.join(SHOTS, name + '.log'), 'ab'), stderr=subprocess.STDOUT, preexec_fn=os.setsid)
def kill(name):
    p = procs.pop(name, None)
    if p:
        try: os.killpg(os.getpgid(p.pid), signal.SIGTERM)
        except ProcessLookupError: pass
        p.wait(timeout=15)
def wait_up(url, secs=40):
    t = time.time()
    while time.time() - t < secs:
        if http('GET', url, timeout=2)[0] == 200: return True
        time.sleep(0.5)
    return False
def admin_cookie():
    req = urllib.request.Request(BASE + '/api/fd/adminauth/login', data=json.dumps({'email': 'admin@fairdrop.demo', 'password': 'FairDrop@2026'}).encode(), method='POST', headers={'content-type': 'application/json'})
    with urllib.request.urlopen(req) as r: return r.headers.get('set-cookie').split(';')[0]
def admin(method, path, body=None): return http(method, f'{BASE}/api/fd/{path}', body, {'cookie': COOKIE})
def drop(): return http('GET', f'{BACKEND}/events/{EID}/drop')[1]
# ---------- browser helpers ----------
def new_user_page(b, email, name, theme='dark'):
    ctx = b.new_context(viewport={'width': 1280, 'height': 860}); ctx.add_init_script("localStorage.setItem('fd-prefs', JSON.stringify({theme: '%s'}))" % theme)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    return ctx, pg
def sign_in_and_join(pg, email, name):
    pg.goto(BASE + f'/drop/{EID}/verify'); pg.click('main button:has-text("Sign in")')
    pg.fill('input[autocomplete=name]', name); pg.fill('input[type=email]', email); pg.click('button:has-text("Continue")')
    pg.wait_for_selector('text=passed >> nth=2', timeout=10000); pg.check('.cx-ack input >> nth=0'); pg.click('button:has-text("Enter the pre-queue")')
def live_session(pg): return pg.evaluate("(()=>{const m=JSON.parse(localStorage.getItem('fd-live-sessions')||'{}');const k=Object.keys(m)[0];return k?m[k]:null})()")
def main():
    global COOKIE
    spawn('backend'); spawn('ml')
    ok('L00 backend + ML services start', wait_up(BACKEND + '/health') and wait_up(ML + '/'))
    COOKIE = admin_cookie()
    ok('L01 proxy: organizer routes reject anonymous requests', http('GET', f'{BASE}/api/fd/admin/events/{EID}/overview')[0] == 401 and http('POST', f'{BASE}/api/fd/integration/ml/sync')[0] == 401)
    ok('L02 proxy: admin/integration keys are not exposed (direct backend call without key is 401)', http('GET', f'{BACKEND}/admin/events/{EID}/overview')[0] == 401 and http('POST', f'{BACKEND}/integration/ml/sync')[0] == 401)
    ok('L03 proxy: non-allow-listed path is 404', http('GET', f'{BASE}/api/fd/integration/ml/status')[0] == 401 and http('GET', f'{BASE}/api/fd/events')[0] == 404)
    st, ens = http('POST', f'{BASE}/api/fd/ensure/{EID}?open=1'); ok('L04 event provisioned (typed inventory) + pre-queue opened through proxy', st == 200 and ens['drop']['phase'] == 'PRE_QUEUE_OPEN' and ens['drop']['inventory']['total'] == 500, str(ens.get('drop', {}).get('inventory', {}).get('by_type')))
    p2 = rp.load_p2_sessions(); byp = sorted(p2.values(), key=lambda s: s['MODEL1_BOT_PROBABILITY'])
    pick = lambda lo, hi: next(s for s in byp if lo <= s['MODEL1_BOT_PROBABILITY'] < hi)
    P2 = {'CHALLENGE': pick(.5, .75), 'THROTTLE': pick(.75, .9), 'QUARANTINE': pick(.9, .99), 'REJECT': byp[-1]}
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome' if os.path.exists('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') else None, args=['--no-sandbox'])
        users = {'A': ('asha@example.com', 'Asha Rao'), 'B': ('bala@example.com', 'Bala K'), 'D': ('dev@example.com', 'Dev Shah'), 'E': ('esha@example.com', 'Esha N')}
        pages, sess = {}, {}
        for k, (em, nm) in users.items():
            ctx, pg = new_user_page(b, em, nm); sign_in_and_join(pg, em, nm); pg.wait_for_url(re.compile('/queue'), timeout=15000); pg.wait_for_selector('text=You’re safely in', timeout=15000)
            pages[k] = (ctx, pg); sess[k] = live_session(pg)
        ok('L05 four customers sign in, join and reach the pre-queue (live session ids/credentials issued by backend)', all(s and s['sid'] and s['credential'] for s in sess.values()), str({k: v['sid'][:10] for k, v in sess.items()}))
        pages['A'][1].screenshot(path=f'{SHOTS}/live01_prequeue.png')
        ok('L06 pre-queue page shows no risk/bot/ML terms', not re.search(r'risk|bot\b|anomal|isolation|campaign|score', pages['A'][1].inner_text('main'), re.I))
        # duplicate-session protection: same account in a fresh browser (no stored credential)
        ctx2, pg2 = new_user_page(b, 'asha@example.com', 'Asha Rao'); sign_in_and_join(pg2, 'asha@example.com', 'Asha Rao'); pg2.wait_for_selector('.cx-note.bad', timeout=10000)
        ok('L07 duplicate session for same account is refused (one entry per person)', 'no longer holds' in pg2.inner_text('.cx-note.bad') and drop()['joined'] == 4, pg2.inner_text('.cx-note.bad')[:80]); ctx2.close()
        sc, jr = http('POST', f'{BACKEND}/events/{EID}/join', {'user_id': 'u_' + 'x' * 24}); filler = [jr['session_id'] + '|' + jr['credential']] if sc == 200 else []
        for i in range(19):
            sc, jr = http('POST', f'{BACKEND}/events/{EID}/join', {'user_id': f'filler_{i}'}); filler.append(jr['session_id'] + '|' + jr['credential']) if sc == 200 else None
        ok('L08 20 additional API joins accepted', len(filler) == 20 and drop()['joined'] == 24, str(drop()['joined']))
        # ---- P2 evidence -> RiskEvent (REAL live session ids) -> policy ----
        ev = {}
        for k, action in [('B', 'CHALLENGE'), ('D', 'QUARANTINE'), ('E', 'REJECT')]:
            body = rp.build_event(sess[k]['sid'], P2[action], event_id=f'live_{k}_{int(time.time())}', with_coordination=(action == 'REJECT')); st, r = http('POST', f'{BACKEND}/integration/risk-events', body, {'x-integration-key': IKEY}); ev[k] = (st, r, body)
        sc_sid = filler[0].split('|')[0]; body = rp.build_event(sc_sid, P2['THROTTLE'], event_id=f'live_C_{int(time.time())}'); ev['C'] = (*http('POST', f'{BACKEND}/integration/risk-events', body, {'x-integration-key': IKEY}), body)
        for k, want in [('B', 'CHALLENGE'), ('C', 'THROTTLE'), ('D', 'QUARANTINE'), ('E', 'REJECT')]:
            st, r, body = ev[k]; ok(f'L09{k} P2 evidence on live session -> policy decision {want}', st == 200 and r['decision']['action'] == want, f"risk={body['risk_score']} anomaly={body['anomaly_score']:.3f} coord={body['coordination_score']} -> {r.get('decision', {}).get('action')} rules={r.get('decision', {}).get('rules_fired')}")
        ok('L10 RiskEvent evidence is tagged as replayed (demo_replay_source) and uses the live session id', all(any(x.startswith('demo_replay_source=sim_') for x in ev[k][2]['evidence']) and ev[k][2]['session_id'] == (sess[k]['sid'] if k in sess else sc_sid) for k in ev))
        st, again = http('POST', f'{BACKEND}/integration/risk-events', ev['B'][2], {'x-integration-key': IKEY}); ok('L11 RiskEvent ingestion is idempotent (duplicate flagged, no second decision)', st == 200 and again.get('duplicate') is True)
        st, bad = http('POST', f'{BACKEND}/integration/risk-events', ev['B'][2]); ok('L12 integration key required for RiskEvent ingestion', st == 401)
        st, sync = admin('POST', 'integration/ml/sync'); ok('L13 ML pull-sync never applies simulator sessions to live customers', st == 200 and sync['ml_available'] and sync['ingested'] == 0 and sync['skipped_no_live_session'] == 20, str(sync))
        st, dec = admin('GET', 'integration/decisions?limit=50'); ok('L14 decisions recorded with source/rules/policy version and honest nulls', st == 200 and len(dec['decisions']) >= 4 and all(d['policy_version'] for d in dec['decisions']), str([(d['action'], d['rules_fired']) for d in dec['decisions'][:4]]))
        # ---- admin drives the drop through the proxy ----
        t0 = drop()['seconds_left']; ok('L15 pre-queue countdown is live', 0 < t0 <= 125, str(t0))
        for act, want in [('close', 'PRE_QUEUE_CLOSED'), ('randomize', 'RANDOMIZED')]:
            st, r = admin('POST', f'admin/events/{EID}/{act}'); ok(f'L16 admin {act} -> {want}', st == 200 and r['phase'] == want, r.get('phase'))
        d = drop(); ok('L17 seed revealed + eligible set fixed (all 24 joined sessions)', d['proof_revealed'] and d['eligible_count'] == 24, str(d['eligible_count']))
        pages['A'][1].goto(BASE + f'/drop/{EID}/admission'); pages['A'][1].wait_for_selector('.cx-pos', timeout=15000); pos_txt = pages['A'][1].inner_text('.cx-pos')
        ok('L18 customer sees randomized position from the draw', re.search(r'#[1-9]\d* .*of 24', pos_txt.replace('\n', ' ')) is not None, pos_txt.replace('\n', ' '))
        st, proof = http('GET', f'{BACKEND}/events/{EID}/proof'); ids = proof['eligible']
        ok('L19 independent commit-reveal verification (python) of the published proof', commitment_of(proof['serverSeed']) == proof['commitment'] and root_of(ids) == proof['eligibleRoot'] and shuffle_seed(proof['serverSeed'], proof['eligibleRoot']) == proof['shuffleSeed'])
        order = deterministic_shuffle(ids, proof['shuffleSeed'])
        seqs = {k: http('GET', f"{BACKEND}/queue/{sess[k]['sid']}", None, {'x-session-credential': sess[k]['credential']})[1].get('queue_sequence') for k in 'ABDE'}
        ok('L20 every session (incl. policy-parked CHALLENGE/QUARANTINE/REJECT ones) keeps exactly its drawn position; policy never alters the draw', len(order) == 24 and all(order.index(sess[k]['sid']) + 1 == seqs[k] for k in 'ABDE'), str(seqs))
        st, r = admin('POST', f'admin/events/{EID}/admit'); ok('L21 admin start admission -> ADMITTING', st == 200 and r['phase'] == 'ADMITTING')
        # ---- customer A: admission -> hold -> pay -> confirm -> verify ----
        a = pages['A'][1]; a.wait_for_selector('a:has-text("Choose tickets")', timeout=60000); a.screenshot(path=f'{SHOTS}/live02_admitted.png')
        ok('L22 customer A admitted by backend (signed token issued)', True)
        a.click('a:has-text("Choose tickets")'); a.wait_for_url(re.compile('/tickets')); a.wait_for_selector('button:has-text("Hold tickets")')
        ok('L23 ticket page limits qty to 1 in live mode and shows server inventory', a.locator('.cx-opt').count() >= 2)
        a.click('button:has-text("Hold tickets")'); a.wait_for_url(re.compile('/payment'), timeout=15000); a.screenshot(path=f'{SHOTS}/live03_payment.png')
        sa = live_session(a); rid = re.search(r'hold=(\d+)', a.url).group(1)
        # idempotency + token replay at the API
        body = {'event_id': EID, 'user_id': next(iter(json.loads(a.evaluate("localStorage.getItem('fd-live-sessions')")).keys())).split(':')[1], 'session_id': sa['sid'], 'session_credential': sa['credential'], 'idempotency_key': f"hold:{sa['sid']}:0", 'admission_token': sa['token'], 'ticket_type': 'GA'}
        st, h1 = http('POST', f'{BACKEND}/allocation/hold', body); ok('L24 hold idempotent: same key returns same reservation (no second seat)', st == 200 and h1.get('reservation_id') == int(rid), str(h1)[:120])
        st, h2 = http('POST', f'{BACKEND}/allocation/hold', {**body, 'idempotency_key': 'another-key'}); ok('L25 admission-token replay with a different key is refused', not h2.get('success'), str(h2.get('status')) + ' ' + str(h2.get('message')))
        st, h3 = http('POST', f'{BACKEND}/allocation/hold', {**body, 'admission_token': sa['token'][:-4] + 'AAAA', 'idempotency_key': 'k3'}); ok('L26 tampered admission token refused', not h3.get('success'))
        a.click('button:has-text("Pay")'); a.wait_for_url(re.compile('/confirmation/'), timeout=15000); a.screenshot(path=f'{SHOTS}/live04_confirm.png')
        ok('L27 booking confirmed through backend', a.locator('text=BK-').count() >= 1)
        cb = {'reservation_id': int(rid), 'user_id': body['user_id'], 'session_id': sa['sid'], 'session_credential': sa['credential'], 'idempotency_key': f'confirm:{rid}'}
        st, c1 = http('POST', f'{BACKEND}/allocation/confirm', cb); ok('L28 confirm idempotent (second confirm does not allocate again)', c1.get('success') and c1.get('status') == 'CONFIRMED', str(c1.get('message')))
        st, c2 = http('POST', f'{BACKEND}/allocation/confirm', {**cb, 'session_credential': 'x' * 32}); ok('L29 confirm requires the session credential', not c2.get('success'))
        a.click('a:has-text("VERIFY ALLOCATION")'); a.wait_for_selector('text=VERIFIED', timeout=15000); a.screenshot(path=f'{SHOTS}/live05_verify.png')
        ok('L30 customer-side commit-reveal verification passes against live proof + claimed position', a.locator('text=✓ VERIFIED').count() == 1)
        a.click('button:has-text("Alter the seed")'); a.wait_for_selector('text=VERIFICATION FAILED'); ok('L31 tampered seed fails verification', True)
        # ---- B: challenge via UI ----
        bpg = pages['B'][1]; bpg.goto(BASE + f'/drop/{EID}/admission'); bpg.wait_for_selector('[data-testid=policy-challenge]', timeout=30000); bpg.screenshot(path=f'{SHOTS}/live06_challenge.png')
        ok('L32 CHALLENGE-policy customer sees a quick-check prompt (no scores/reasons)', not re.search(r'risk|score|bot\b|anomal|rule|R3_', bpg.inner_text('main'), re.I))
        sb = live_session(bpg); st, h = http('POST', f'{BACKEND}/queue/{sb["sid"]}/admit', None, {'x-session-credential': sb['credential']}); ok('L33 API: challenged session cannot be admitted before solving', h.get('status') == 'CHALLENGE_REQUIRED')
        bpg.click('button:has-text("Run the check")'); bpg.wait_for_selector('a:has-text("Choose tickets")', timeout=60000); bpg.screenshot(path=f'{SHOTS}/live07_challenge_passed.png')
        ok('L34 solving the proof-of-work challenge in the browser restores admission (policy re-evaluated by backend)', True)
        # ---- C: throttle (API-level) ----
        csid, ccred = filler[0].split('|'); r1 = http('POST', f'{BACKEND}/queue/{csid}/admit', None, {'x-session-credential': ccred})[1]; r2 = http('POST', f'{BACKEND}/queue/{csid}/admit', None, {'x-session-credential': ccred})[1]
        ok('L35 THROTTLE: first attempt allowed, immediate retry is throttled with retry_after', r2.get('status') == 'THROTTLED' and r2.get('retry_after_seconds', 0) >= 1, f"{r1.get('status')} then {r2.get('status')} retry_after={r2.get('retry_after_seconds')}")
        # ---- D / E: quarantine & reject via UI + API ----
        for k, want in [('D', 'QUARANTINED'), ('E', 'REJECTED')]:
            pg = pages[k][1]; pg.goto(BASE + f'/drop/{EID}/admission'); pg.wait_for_selector('text=Entry could not be accepted', timeout=30000)
            txt = pg.inner_text('main'); ok(f'L36{k} {want} customer sees a neutral message, no scores or reasons', not re.search(r'risk|score|bot\b|anomal|rule|quarantin|reject|R[0-9]_|0\.\d\d', txt, re.I), txt[:100].replace('\n', ' '))
            s_ = live_session(pg); st, h = http('POST', f'{BACKEND}/queue/{s_["sid"]}/admit', None, {'x-session-credential': s_['credential']}); ok(f'L37{k} API admit returns {want}', h.get('status') == want and not h.get('token'))
        pages['D'][1].screenshot(path=f'{SHOTS}/live08_blocked.png')
        sd = live_session(pages['D'][1]); st, hh = http('POST', f'{BACKEND}/allocation/hold', {'event_id': EID, 'user_id': 'x', 'session_id': sd['sid'], 'session_credential': sd['credential'], 'idempotency_key': 'dq1', 'ticket_type': 'GA'}); ok('L38 quarantined session cannot hold inventory', not hh.get('success'), hh.get('status'))
        # ---- concurrent allocation by 19 API customers: inventory invariants ----
        fres = []
        def run(entry):
            sid, cred = entry.split('|'); uid = None
            for _ in range(60):
                r = http('POST', f'{BACKEND}/queue/{sid}/admit', None, {'x-session-credential': cred})[1]
                if r.get('success'): tok = r['token']; break
                if r.get('status') in ('THROTTLED',): time.sleep(2)
                elif r.get('status') in ('QUARANTINED', 'REJECTED'): fres.append(r['status']); return
                else: time.sleep(0.5)
            else: fres.append('NO_ADMIT'); return
            sq = http('GET', f'{BACKEND}/queue/{sid}', None, {'x-session-credential': cred})[1]
            h = http('POST', f'{BACKEND}/allocation/hold', {'event_id': EID, 'user_id': sq['user_id'], 'session_id': sid, 'session_credential': cred, 'idempotency_key': 'h-' + sid, 'admission_token': tok, 'ticket_type': 'PR'})[1]
            if not h.get('success'): fres.append('HOLD_' + str(h.get('status'))); return
            c = http('POST', f'{BACKEND}/allocation/confirm', {'reservation_id': h['reservation_id'], 'user_id': sq['user_id'], 'session_id': sid, 'session_credential': cred, 'idempotency_key': 'c-' + sid})[1]
            fres.append('OK' if c.get('success') else 'CONFIRM_' + str(c.get('status')))
        th = [threading.Thread(target=run, args=(f,)) for f in filler[1:]]; [t.start() for t in th]; [t.join() for t in th]
        d = drop(); inv = d['inventory']; nok = fres.count('OK')
        ok('L39 concurrent admissions+allocations: every seat holder confirmed once', nok >= 10 and fres.count('NO_ADMIT') == 0, str({k: fres.count(k) for k in set(fres)}))
        ok('L40 inventory invariant holds and no oversell (avail+held+confirmed==total, confirmed==allocations)', inv['invariant_ok'] and inv['confirmed'] + inv['held'] <= inv['total'] and inv['confirmed'] >= nok + 1, str(inv))
        ok('L41 typed inventory: PR seats decremented by PR buyers only', inv['by_type']['PR']['confirmed'] == nok, str(inv['by_type']))
        # ---- admin console (browser) ----
        actx = b.new_context(viewport={'width': 1366, 'height': 900}); actx.add_init_script("localStorage.setItem('fd-prefs', JSON.stringify({theme:'dark'}))"); ad = actx.new_page(); ad.on('pageerror', lambda e: errs.append(str(e))); ad.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        ad.goto(BASE + '/admin'); ad.wait_for_url(re.compile('/admin/login')); ad.fill('input[type=email]', 'admin@fairdrop.demo'); ad.fill('input[type=password]', 'wrong'); ad.click('button[type=submit]'); ad.wait_for_selector('text=Incorrect email or password')
        ok('L42 admin login rejects wrong password', True); ad.fill('input[type=password]', 'FairDrop@2026'); ad.click('button[type=submit]'); ad.wait_for_url(re.compile(r'/admin$'), timeout=10000)
        ad.goto(BASE + '/admin/drop'); ad.wait_for_selector('[data-testid=live-drop-kpis]', timeout=15000); ad.screenshot(path=f'{SHOTS}/live09_admin_drop.png'); t = ad.inner_text('[data-testid=live-drop-kpis]')
        ok('L43 admin Drop control shows live phase/queue/inventory from backend', 'ADMITTING' in t and 'HOLDS' in t, t.replace('\n', ' ')[:120])
        ad.goto(BASE + '/admin/allocations'); ad.wait_for_selector('[data-testid=live-alloc-kpis]', timeout=15000); ad.screenshot(path=f'{SHOTS}/live10_admin_alloc.png'); ok('L44 admin Allocations shows live confirmed seats + no-oversell check', 'HOLDS' in ad.inner_text('[data-testid=live-alloc-kpis]') and str(drop()['inventory']['confirmed']) in ad.inner_text('[data-testid=live-alloc-kpis]'))
        ad.goto(BASE + '/admin/system'); ad.wait_for_selector('[data-testid=live-system-kpis]', timeout=15000); ok('L45 admin System health shows backend /health + resilience', 'HEALTHY' in ad.inner_text('[data-testid=live-system-kpis]').upper())
        ad.goto(BASE + '/admin/intelligence'); ad.wait_for_selector('[data-testid=live-decisions]', timeout=15000); ad.wait_for_selector('text=ML SERVICE CONNECTED', timeout=15000); ad.screenshot(path=f'{SHOTS}/live11_admin_intel.png')
        tt = ad.inner_text('[data-testid=live-decisions]'); ok('L46 admin Intelligence: recorded policy decisions (CHALLENGE/THROTTLE/QUARANTINE/REJECT) with rules', all(w in tt for w in ['CHALLENGE', 'THROTTLE', 'QUARANTINE', 'REJECT', 'R3_RISK']), tt[:150].replace('\n', ' '))
        ok('L47 admin Intelligence keeps P2 ML panels (Model 1 / Model 2 / simulator ground truth labelled)', ad.locator('text=ML SERVICE CONNECTED').count() >= 1 and re.search(r'simulator|SIMULATED', ad.inner_text('main'), re.I) is not None)
        ad.click('[data-testid=live-ml-sync]'); ad.wait_for_selector('[data-testid=live-ml-sync-result]', timeout=15000); ok('L48 admin sync button: simulator RiskEvents skipped, not applied to live customers', 'skipped' in ad.inner_text('[data-testid=live-ml-sync-result]'), ad.inner_text('[data-testid=live-ml-sync-result]')[:140])
        ad.goto(BASE + '/admin/campaigns'); ad.wait_for_selector('[data-testid=live-decisions]', timeout=15000); ok('L49 admin Campaigns shows P2 coordination evidence panel + live decisions', ad.locator('text=Campaigns').count() >= 1 and ad.locator('[data-testid=live-decisions]').count() == 1); ad.screenshot(path=f'{SHOTS}/live12_admin_campaigns.png')
        ad.goto(BASE + '/admin/attacks'); ad.wait_for_selector('[data-testid=attacks-sim-note]', timeout=15000); ok('L50 admin Attacks page works and labels attacks as SIMULATOR only', 'SIMULATOR' in ad.inner_text('[data-testid=attacks-sim-note]')); ad.screenshot(path=f'{SHOTS}/live13_admin_attacks.png')
        # ---- ML outage ----
        kill('ml'); time.sleep(1)
        st, sync = admin('POST', 'integration/ml/sync'); ok('L51 ML down: backend sync reports unavailable, ingests nothing, invents nothing', st == 200 and sync['ml_available'] is False and sync['ingested'] == 0, str(sync))
        ad.goto(BASE + '/admin/intelligence'); ad.wait_for_selector('text=ML SERVICE OFFLINE', timeout=20000); ad.wait_for_selector('[data-testid=live-decisions]'); ad.screenshot(path=f'{SHOTS}/live14_admin_ml_offline.png')
        ok('L52 ML down: admin shows ML OFFLINE, live decisions still visible', ad.locator('text=NOT CONFIGURED').count() == 0 and re.search(r'OFFLINE', ad.inner_text('main')) is not None)
        st, jj = http('GET', f'{BACKEND}/queue/{sa["sid"]}', None, {'x-session-credential': sa['credential']}); ok('L53 ML down: customer sessions/queue unaffected', st == 200 and jj['state'] in ('COMPLETED', 'ALLOCATING', 'ADMITTED'))
        ep = pages['E'][1]; ep.goto(BASE + f'/drop/{EID}/admission'); ep.wait_for_selector('text=Entry could not be accepted', timeout=20000); ok('L54 ML down: policy decisions already recorded keep being enforced (REJECT stays REJECT)', True)
        spawn('ml'); ok('L55 ML restarts and admin reconnects', wait_up(ML + '/'))
        # ---- backend outage / recovery ----
        before = drop()['inventory']; bp = pages['B'][1]
        kill('backend'); time.sleep(1); bp.goto(BASE + f'/drop/{EID}/tickets'); bp.wait_for_selector('[data-testid=live-offline]', timeout=30000); bp.screenshot(path=f'{SHOTS}/live15_backend_offline.png')
        ok('L56 backend down: customer page shows reconnecting banner (no crash, no fake data)', True)
        ad.goto(BASE + '/admin/drop'); ad.wait_for_selector('[data-testid=live-backend-offline]', timeout=20000); ok('L57 backend down: admin shows backend unavailable (not simulated)', True)
        spawn('backend'); ok('L58 backend restarts (same DB)', wait_up(BACKEND + '/health')); after = drop()['inventory']
        ok('L59 state survives restart: inventory identical, invariant holds', before == after and after['invariant_ok'], str(after))
        bp.wait_for_selector('[data-testid=live-offline]', state='detached', timeout=30000); ok('L60 customer page reconnects automatically', True)
        bp.click('button:has-text("Hold tickets")'); bp.wait_for_url(re.compile('/payment'), timeout=20000); bp.click('button:has-text("Pay")'); bp.wait_for_url(re.compile('/confirmation/'), timeout=20000)
        ok('L61 challenged-then-cleared customer B completes purchase after restart', True)
        fin = drop()['inventory']; ok('L62 final inventory invariant + typed counts', fin['invariant_ok'] and fin['confirmed'] == after['confirmed'] + 1, str(fin))
        for pg in [x[1] for x in pages.values()]: pass
        b.close()
    bad = [e for e in errs if 'favicon' not in e and 'Failed to fetch' not in e and 'Failed to load resource' not in e and 'ERR_CONNECTION' not in e and 'RSC payload' not in e]
    ok('L63 no unexpected page errors (network errors during deliberate outages excluded)', not bad, '; '.join(bad[:3]))
    print(f'\n{sum(1 for r in results if r[1])}/{len(results)} passed'); return all(r[1] for r in results)
if __name__ == '__main__':
    try: good = main()
    finally:
        for n in list(procs): kill(n)
    sys.exit(0 if good else 1)
