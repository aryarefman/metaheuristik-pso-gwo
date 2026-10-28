# Project brief — single source of truth

Read this before changing anything. If a new request contradicts this file, ask; do not silently drop an item.

## 1. Purpose (never lose this)
A school assignment: **an animation that demonstrates how two metaheuristics work**, Particle Swarm Optimization (PSO) and Grey Wolf Optimizer (GWO). The scene is the wrapper; **the algorithm demo is the point**. Every movement must come from the real update rules in `src/js/10_algorithms.js`. A pretty scene where animals just wander is a failure.

## 2. Scene
Two floating sky-land diorama islands side by side, clouds around and below, both framed together at the start (phones in portrait start on the eagle island; "Both" is one tap away).

| | PSO island (left) | GWO island (right) |
|---|---|---|
| Animal | Eagle swarm, 12 | Wolf pack, 12 (α β δ leaders larger and tagged) |
| Terrain | **Has water**: jade lake in the lowest valleys, karst towers, pavilion on an islet | **No water at all**: sandstone canyon, mesas, hoodoos, boulders |
| Person | Fisherman on a bamboo raft (straw hat, pole, 2 cormorants, lantern), drifting on the lake | none |

- Both islands use the **same landscape** (terrain height = objective value, lower is better) and the **same start positions**.
- Cut-away block with visible geological strata on the sides and a rocky underside (Pirate Jelly / King of the Table references in `docs/references/diorama/`). The side walls and the rock towers (karst, mesas, hoodoos) are carved 3D rock (layers stick out or sink in, grooves, ledges, rough tops), never flat painted shapes.
- **No trees.**

## 3. Look: two versions
- **Realistic** (`index.html`, `pages/realistic-id.html`): PBR rendering, soft shadows, ACES tone mapping, image-based lighting, procedural grain on rock, soil and wood, real-looking water, felt characters.
- **Crochet** (`pages/crochet-en.html`, `pages/crochet-id.html`): same scene and shapes, everything rendered as crocheted yarn (`src/js/05_yarn.js`), sewn edge stitches.
- One source, two builds: `STYLE` is set by `tools/build.py`. A switch in the top bar links the two.

## 3b. Two languages
- **English** and **Bahasa Indonesia** for every style: `index.html` / `pages/crochet-en.html` (EN), `pages/realistic-id.html` / `pages/crochet-id.html` (ID). EN | ID switch in the top bar.
- All text lives in `src/i18n.json` (template `{{key}}` at build time, `t('key', vars)` in JS). Never hard-code UI text; add the key in both languages.

## 4. Characters: like the mascot PNGs
- The 3D eagle and wolf must look like `assets/mascots/eagle.png` and `wolf.png`: **needle-felted mascots**.
  - Eagle: big round white head, yellow hooked felt beak, dark eyes with angry-cute brows, dark brown body, golden scalloped chest and wing coverts, dark fingered primaries, yellow feet, teal scarf with a cream button.
  - Wolf: grey body with darker saddle, cream face mask, bib and belly, big amber eyes, tall ears with cream insides, dark legs and paws, bushy tail with a cream tip, teal scarf with a cream button.
- Built as smooth felted forms (no visible seams between blobs), felt sheen + fibre bump, fine stray fibres.
- Natural motion: eagles flap in bursts, glide, bank into turns; wolves trot with a gait synced to ground speed, follow the slope, wag tails; scarves flutter.
- Mascot PNGs (transparent, no holes) appear in the UI cards.

## 5. The algorithm demo
- Real PSO (w 0.9 to 0.4, c1 = c2 = 1.6, pbest, gbest) and real GWO (a 2 to 0, A, C, X = (X1+X2+X3)/3).
- Each iteration in three calm stages: **1 evaluate, 2 compute, 3 move**.
- PSO overlays: pbest gems, gbest star with a light pillar, focus eagle's inertia + cognitive + social vector chain, everyone's new-velocity arrows.
- GWO overlays: α β δ tags, focus wolf's three guide arrows, X1 X2 X3 points, target ring, shrinking encircling ring.
- Trails, convergence chart (log error), live readouts (best error, iteration, w / a).
- Click an animal to make it the focus. Fixed seed, repeatable runs.

## 6. Easy to understand (the user found v2 hard to follow)
- First-visit introduction: goal (lowest point = best answer), PSO idea, GWO idea, how to watch.
- Narrator panel in plain words for the current step, with live numbers of the followed eagle and wolf.
- Play runs continuously (the user did not want it to stop at every step). Guide mode is optional and off by default: it pauses at every step until Continue.
- Labels on arrows, guesses, circle; flag on the true lowest point. Formulas live in the legend sheet.

## 6b. Explainer video
- 12 chapters incl. "The PSO formula" and "The GWO formula". In animation chapters each sentence = one step (Measure/Decide/Move), the step lasts as long as its sentence, and ONLY the swarm being explained moves (`sim.active`). Top-down camera in the 3D chapters. Numbers are spelled out for the voice; Indonesian uses decimal commas on screen.
- In-app info sheet has tabs: Legend, PSO in depth, GWO in depth (symbols, pseudocode, why it works, comparison). Full write-up: `docs/ALGORITHMS.md`.
- "Video" button: narrated chapters on PSO and GWO in cloud computing (jobs, VMs, makespan, why search is needed, island = all schedules, PSO, PSO in the cloud, GWO, GWO in the cloud, comparison, summary). Captions always; voice only if the browser has a voice for the language. Both languages.
- Followed animal: no recolour or outline (the user disliked it); blue ring + pin + label; drawn on top of other animals.

## 7. Pacing and UI
- Slow and calm (about 5 s per iteration at 1x), speed slider, play/pause, step, restart, views (both / PSO / GWO), info sheet with legend and landscape picker.
- Minimal UI, silhouette icons, no emoji. Works down to ~390 px wide.

## 8. Verification
1. `node tools/test_algorithms.js`: both algorithms converge on every landscape.
   `python tools/e2e_test.py`: every page in a real browser.
2. Screenshots at 1440x860 and 390x844 for both versions: overview, PSO view, GWO view, character close-ups, and views from the right and from behind (walls must be solid).
