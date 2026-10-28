# Notes for coding agents

1. Read `docs/BRIEF.md` (requirements) and `docs/ALGORITHMS.md` (what the algorithms do) first.
2. Edit only `src/`, then run `python tools/build.py`. It regenerates `index.html` and `pages/*.html`; never hand-edit those.
3. The algorithms live only in `src/js/10_algorithms.js`. Visuals must never invent movement.
4. All UI and narration text is in `src/i18n.json` (`en` and `id`). Use `{{key}}` in the template, `t('key')` in JS, `num()` for numbers on screen (Indonesian uses decimal commas). Never hard-code text.
5. Two looks from one source: `STYLE === 'real'` (PBR + grain) and `STYLE === 'crochet'` (yarnify). Keep both working.
6. The eagle and the wolf must keep matching `assets/mascots/*.png` (felt, teal scarf). No trees.
7. Before finishing: `node tools/test_algorithms.js` and `python tools/e2e_test.py` must pass.
