#!/usr/bin/env python3
"""Bundle src/ into four self-contained pages (no bundler, no server needed):

                 English                 Indonesian
  realistic      index.html              pages/realistic-id.html
  crochet        pages/crochet-en.html   pages/crochet-id.html

All UI text lives in src/i18n.json: {{key}} in the template is filled at build time,
and the same strings are passed to the scripts as I18N (used through t('key', vars)).

Usage:  python tools/build.py
"""
import glob, json, os, posixpath, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
read = lambda *p: open(os.path.join(ROOT, *p), encoding='utf-8').read()

PAGES = {  # (style, lang) -> output path, relative to the repo root
    ('real', 'en'): 'index.html',
    ('crochet', 'en'): 'pages/crochet-en.html',
    ('real', 'id'): 'pages/realistic-id.html',
    ('crochet', 'id'): 'pages/crochet-id.html',
}
# coloured inline markers shared by both languages
HTML_VARS = {
    'kBlue': '<span class="k" style="--c:#7fb2ff">', 'kGreen': '<span class="k" style="--c:#3fd987">',
    'kGold': '<span class="k" style="--c:#ffc61a">', 'kRed': '<span class="k" style="--c:#c0392b">',
    'beta': '<i class="sw" style="background:#e4eaf2"></i>', 'delta': '<i class="sw" style="background:#e0904a"></i>',
}


def rel(src, dst):
    """Relative link from page `src` to file `dst` (both repo-relative)."""
    return posixpath.relpath(dst, posixpath.dirname(src) or '.')


def main():
    tpl, css = read('src', 'index.template.html'), read('src', 'css', 'style.css')
    js = '\n\n'.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(ROOT, 'src', 'js', '*.js'))))
    i18n = json.loads(read('src', 'i18n.json'))
    fill = lambda s: re.sub(r'\{(\w+)\}', lambda m: HTML_VARS.get(m.group(1), m.group(0)), s)

    for (style, lang), name in PAGES.items():
        assets = rel(name, 'assets') + '/'
        T = dict(i18n[lang], style=style, assets=assets,
                 hrefEn=rel(name, PAGES[(style, 'en')]), hrefId=rel(name, PAGES[(style, 'id')]),
                 hrefReal=rel(name, PAGES[('real', lang)]), hrefCrochet=rel(name, PAGES[('crochet', lang)]))
        page = re.sub(r'\{\{(\w+)\}\}', lambda m: fill(T[m.group(1)]), tpl)
        missing = re.findall(r'\{\{\w+\}\}', page)
        assert not missing, f'{name}: untranslated {missing}'
        head = (f"const STYLE = '{style}';\nconst LANG = '{lang}';\nconst ASSETS = '{assets}';\n"
                f"const I18N = {json.dumps(i18n[lang], ensure_ascii=False)};\n\n")
        out = page.replace('/*__CSS__*/', css).replace('/*__JS__*/', head + js)
        path = os.path.join(ROOT, *name.split('/'))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, 'w', encoding='utf-8').write(out)
        print(f'{name:28s} {len(out) // 1024} KB')


if __name__ == '__main__':
    main()
