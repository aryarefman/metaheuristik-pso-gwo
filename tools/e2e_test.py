"""End-to-end test of every built page in a real browser (Chrome via Playwright).

Covers: arrows = PSO/GWO formulas, intro, Guide, keyboard (incl. focused buttons / slider), Step, views and labels at every step,
click-to-follow, Restart mid-move, all landscapes, phone size, a full 60-round run + Replay,
the explainer video, and the language / style links. Fails on page errors, missing files,
NaN positions, overlapping or off-screen labels.

Usage:   pip install playwright && playwright install chrome
         python tools/e2e_test.py                 # all four pages
         python tools/e2e_test.py index.html      # one page
"""
import functools, http.server, json, os, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = sys.argv[1:] or ['index.html', 'pages/crochet-en.html', 'pages/realistic-id.html', 'pages/crochet-id.html']

# serve the repo on a free local port (pages load three.js from the CDN, so the machine needs internet)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Quiet, directory=ROOT)
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{server.server_address[1]}/'

HEALTH = """(() => {
  const A = __app, W = A.W, bad = [];
  for (const s of W.swarms) for (const a of s.agents) {
    const p = a.rig.position; if (![p.x, p.y, p.z].every(Number.isFinite)) bad.push(s.kind + a.i);
  }
  // visible labels must not overlap each other
  const r = [...document.querySelectorAll('.note')].filter(e => e.style.opacity === '1').map(e => e.getBoundingClientRect());
  let overlaps = 0;
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++)
    if (r[i].left < r[j].right - 1 && r[j].left < r[i].right - 1 && r[i].top < r[j].bottom - 1 && r[j].top < r[i].bottom - 1) overlaps++;
  const off = r.filter(b => b.left < 0 || b.right > innerWidth || b.top < 0 || b.bottom > innerHeight).length;
  return { nan: bad, overlaps, offscreen: off, labels: r.length, stage: A.sim.stage, iter: W.pso.iter, playing: A.sim.playing,
           cardRound: document.querySelector('#psoIter').textContent, narrRound: document.querySelector('#nround').textContent };
})()"""

def check(pg, tag, problems):
    h = pg.evaluate(HEALTH)
    if h['nan'] or h['overlaps'] or h['offscreen']: problems.append((tag, h))
    return h

FAILED = 0
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', args=['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'])
    for page in PAGES:
        problems, errs, missing = [], [], []
        pg = b.new_page(viewport={'width': 1440, 'height': 860})
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200]))
        pg.on('response', lambda r: r.status >= 400 and missing.append(r.url))
        pg.goto(BASE + page)
        pg.wait_for_function('window.__app && window.__app.W', timeout=90000)
        pg.wait_for_timeout(1500)
        # tour: keyboard navigation, then close -> guide waits at step 1
        for _ in range(3): pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(120)
        pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        st = pg.evaluate("({open: document.querySelector('#tour').classList.contains('open'), waiting: __app.guide.waiting, playing: __app.sim.playing})")
        if st['open'] or st['waiting'] or not st['playing']: problems.append(('tour close -> should play continuously', st))
        h = check(pg, 'start', problems)
        if h['cardRound'].split(' ')[0] not in h['narrRound']: problems.append(('round mismatch', h['cardRound'], h['narrRound']))

        # Space on a focused button must toggle exactly once
        pg.evaluate('__app.resume()'); pg.wait_for_timeout(200)
        pg.focus('#btnPlay'); before = pg.evaluate('__app.sim.playing')
        pg.keyboard.press('Space'); pg.wait_for_timeout(200)
        after = pg.evaluate('__app.sim.playing')
        if before == after: problems.append(('space on focused play button did not toggle', before, after))
        # body-focused Space also toggles once
        pg.evaluate('document.activeElement.blur()'); b0 = pg.evaluate('__app.sim.playing')
        pg.keyboard.press('Space'); pg.wait_for_timeout(200)
        if pg.evaluate('__app.sim.playing') == b0: problems.append(('space on page did not toggle',))

        # speed slider arrows must not step the simulation
        pg.evaluate('__app.guide.on = true'); pg.focus('#speed'); s0 = pg.evaluate('__app.sim.stage + __app.W.pso.iter')
        pg.evaluate('__app.sim.playing=false'); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(300)
        if pg.evaluate('__app.sim.playing'): problems.append(('slider arrow started playback',))
        pg.evaluate("document.querySelector('#btnGuide').click()")    # guide off
        pg.evaluate('document.activeElement.blur()')

        # step button: advances exactly one step, then pauses
        stage0 = pg.evaluate('__app.sim.stage'); pg.evaluate('__app.sim.speed = 4'); pg.click('#btnStep')
        pg.wait_for_function('!__app.sim.playing', timeout=20000)
        stage1 = pg.evaluate('__app.sim.stage')
        order = ['eval', 'plan', 'move']
        if order[(order.index(stage0) + 1) % 3] != stage1: problems.append(('step did not advance exactly one step', stage0, stage1))

        # views + labels at each step
        for v in ['pso', 'gwo', 'both']:
            pg.evaluate(f"__app.setView('{v}')"); pg.wait_for_timeout(1700)
            for _ in range(3):
                pg.click('#btnStep'); pg.wait_for_function('!__app.sim.playing', timeout=20000); pg.wait_for_timeout(400)
                check(pg, f'view {v} stage', problems)

        # click to follow an eagle
        pg.evaluate("__app.setView('pso', true)"); pg.wait_for_timeout(300)
        xy = pg.evaluate("""(() => { const A = __app, a = A.W.swPSO.agents.find(a => a.i !== A.W.swPSO.focus), v = new A.THREE.Vector3();
            a.rig.getWorldPosition(v); v.y += .1; v.project(A.camera); return { x: (v.x*.5+.5)*innerWidth, y: (-v.y*.5+.5)*innerHeight, i: a.i }; })()""")
        pg.mouse.click(xy['x'], xy['y']); pg.wait_for_timeout(300)
        if pg.evaluate('__app.W.swPSO.focus') != xy['i']: problems.append(('click-to-follow missed', xy))

        # restart in the middle of a move
        pg.evaluate("__app.setView('both', true); __app.resume()")
        pg.wait_for_function("__app.sim.stage === 'move' && __app.sim.p > .3", timeout=30000)
        pg.evaluate('__app.sim.speed = .8'); pg.click('#btnReset'); pg.wait_for_timeout(500)
        r = pg.evaluate("({iter: __app.W.pso.iter, stage: __app.sim.stage, nxt: __app.W.pso.nxt})")
        if r['iter'] != 0 or r['stage'] != 'eval': problems.append(('restart mid-move', {k: r[k] for k in ('iter', 'stage')}))
        check(pg, 'after restart', problems)

        # every landscape: load, run a few rounds fast, health check
        for f in ['sphere', 'rastrigin', 'himmelblau', 'ackley']:
            pg.click('#btnInfo'); pg.wait_for_timeout(300)
            pg.click(f'#fnPick button[data-f={f}]'); pg.wait_for_timeout(400)
            pg.click('#sheetClose')
            pg.evaluate('__app.sim.speed = 12; __app.resume()')
            pg.wait_for_function('__app.W.pso.iter >= 4', timeout=60000)
            check(pg, f'landscape {f}', problems)

        # phone size and back
        pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(800); check(pg, 'phone', problems)
        pg.set_viewport_size({'width': 1440, 'height': 860}); pg.wait_for_timeout(800)

        # run to the end, then replay
        pg.evaluate('__app.sim.speed = 40; __app.resume()')
        pg.wait_for_function('__app.sim.done', timeout=180000)
        end = check(pg, 'finished', problems)
        if end['cardRound'] != '60 / 60': problems.append(('final card round', end['cardRound']))
        pg.evaluate('__app.sim.speed = .8'); pg.click('#btnPlay'); pg.wait_for_timeout(600)
        rp = pg.evaluate("({done: __app.sim.done, iter: __app.W.pso.iter, playing: __app.sim.playing})")
        if rp['done'] or rp['iter'] != 0: problems.append(('replay', rp))

        # arrows = formulas: pause right after Decide (Guide mode) and compare every drawn vector with the algorithm's numbers
        ARROWS = open(os.path.join(ROOT, 'tools', 'e2e_arrows.js'), encoding='utf-8').read()
        for f in ['ackley', 'rastrigin']:
            pg.evaluate(f"__app.loadWorld('{f}'); __app.guide.on = true; __app.sim.speed = 4; __app.resume()")
            done = 0
            while done < 4:
                pg.wait_for_function('__app.guide.waiting', timeout=60000, polling=16)
                if pg.evaluate('__app.sim.stage') == 'move':
                    pg.wait_for_timeout(120)
                    bad = pg.evaluate(ARROWS)
                    if bad: problems.append((f'arrows vs formulas ({f})', bad))
                    done += 1
                pg.evaluate('__app.resume()')
        pg.evaluate("__app.guide.on = false; __app.resume()")

        # explainer video: open, run every chapter, close -> demo still works
        pg.click('#btnVideo'); pg.wait_for_timeout(500)
        for k in range(10):
            pg.evaluate(f'__app.video.go({k})'); pg.wait_for_timeout(250)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        vs = pg.evaluate("({open: __app.video.state.open, playing: __app.sim.playing, hidden: document.body.classList.contains('video')})")
        if vs['open'] or vs['hidden'] or not vs['playing']: problems.append(('video close', vs))
        # language and style links lead to the matching built pages
        for sel in ('#langs a', '#styles a'):
            for href in pg.eval_on_selector_all(sel, 'els => els.map(e => e.href)'):
                st = pg.request.get(href).status
                if st != 200: problems.append(('broken link', href, st))
        ok = not (errs or missing or problems)
        FAILED += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'}  {page}" + ('' if ok else f'  errors={errs} missing={missing} problems={json.dumps(problems)[:1500]}'))
        pg.close()
    b.close()
    server.shutdown()
    sys.exit(1 if FAILED else 0)
