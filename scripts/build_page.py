#!/usr/bin/env python3
"""Generate docs/index.html — the interactive pre-build planning site.

Reads docs/requirements.md and docs/build-manual.md, converts them to HTML
with a small line-based markdown parser, and injects them into the template
below (single self-contained file: inline CSS + JS, no external requests).

Regenerate:  python3 scripts/build_page.py
"""

import html
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
OUT = DOCS / "index.html"

# ---------------------------------------------------------------- inline ----

def inline(text):
    """Escape text and apply inline markdown: code, links, bold, italic."""
    esc = html.escape(text, quote=False)
    codes = []

    def stash(m):
        codes.append(m.group(1))
        return "\x00%d\x00" % (len(codes) - 1)

    esc = re.sub(r"`([^`\n]+)`", stash, esc)
    esc = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', esc)
    esc = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", esc)
    esc = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])", r"<em>\1</em>", esc)
    esc = re.sub(r"(?<![\w_])_([^_\n]+)_(?![\w_])", r"<em>\1</em>", esc)
    for i, c in enumerate(codes):
        esc = esc.replace("\x00%d\x00" % i, "<code>%s</code>" % c)
    return esc


def plain(text):
    """Plain-text version of an inline-formatted string (for TOC/slugs)."""
    return re.sub(r"[*_`]", "", text).strip()

# ---------------------------------------------------------------- blocks ----

BLOCK_START = re.compile(
    r"^(#{1,6})\s|^```|^\s*([-*_]\s*){3,}$|^\s*\||^\s*>|"
    r"^\s*([-*+]|\d{1,2}[.)])\s"
)
LIST_ITEM = re.compile(r"^(\s*)([-*+]|\d{1,2}[.)])\s+(.*\S)\s*$")
HR = re.compile(r"^\s*([-*_]\s*){3,}$")
TABLE_SEP = re.compile(r"^[\s|:\-]+$")


def is_table_sep(line):
    return "-" in line and bool(TABLE_SEP.match(line))


def split_blocks(md):
    """Split markdown into a flat list of typed blocks."""
    lines = md.split("\n")
    blocks = []
    i, n = 0, len(lines)
    while i < n:
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            blocks.append(("h", (len(m.group(1)), m.group(2).strip())))
            i += 1
            continue
        if re.match(r"^\s*```", line):
            i += 1
            buf = []
            while i < n and not re.match(r"^\s*```", lines[i]):
                buf.append(lines[i])
                i += 1
            i += 1  # skip closing fence
            blocks.append(("code", "\n".join(buf)))
            continue
        if HR.match(line):
            blocks.append(("hr", None))
            i += 1
            continue
        if line.lstrip().startswith("|"):
            rows = []
            while i < n and lines[i].lstrip().startswith("|") and "|" in lines[i]:
                rows.append(lines[i])
                i += 1
            blocks.append(("table", rows))
            continue
        if line.lstrip().startswith(">"):
            buf = []
            while i < n and lines[i].lstrip().startswith(">"):
                buf.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            blocks.append(("quote", buf))
            continue
        if LIST_ITEM.match(line):
            items = []
            while i < n:
                m2 = LIST_ITEM.match(lines[i])
                if not m2:
                    break
                items.append(m2)
                i += 1
            blocks.append(("list", items))
            continue
        buf = [line]
        i += 1
        while i < n and lines[i].strip() and not BLOCK_START.match(lines[i]):
            buf.append(lines[i])
            i += 1
        blocks.append(("para", buf))
    return blocks

# ------------------------------------------------------------------ lists ---

def list_tree(items):
    root = {"indent": -1, "children": []}
    stack = [root]
    for m in items:
        indent = len(m.group(1).expandtabs(4))
        node = {
            "indent": indent,
            "ordered": m.group(2)[0].isdigit(),
            "text": m.group(3),
            "children": [],
        }
        while indent <= stack[-1]["indent"]:
            stack.pop()
        stack[-1]["children"].append(node)
        stack.append(node)
    return root["children"]


def render_nodes(nodes, prefix, counter):
    if not nodes:
        return ""
    tag = "ol" if nodes[0]["ordered"] else "ul"
    parts = ["<" + tag + ">"]
    for node in nodes:
        text = node["text"]
        mc = re.match(r"\[([ xX])\]\s+(.*)$", text)
        if mc:
            counter[0] += 1
            key = "%s-todo-%d" % (prefix, counter[0])
            chk = " checked" if mc.group(1).lower() == "x" else ""
            parts.append(
                '<li class="task"><label><input type="checkbox" class="persist" '
                'data-key="%s"%s> %s</label>' % (key, chk, inline(mc.group(2)))
            )
        else:
            parts.append("<li>%s" % inline(text))
        if node["children"]:
            parts.append(render_nodes(node["children"], prefix, counter))
        parts.append("</li>")
    parts.append("</" + tag + ">")
    return "".join(parts)

# ------------------------------------------------------------------ table ---

def split_row(r):
    r = r.strip()
    if r.startswith("|"):
        r = r[1:]
    if r.endswith("|"):
        r = r[:-1]
    return [c.strip() for c in r.split("|")]


def render_table(rows):
    cells = [split_row(r) for r in rows]
    head, body = None, cells
    if len(rows) > 1 and is_table_sep(rows[1]):
        head, body = cells[0], cells[2:]
    out = ['<div class="table-wrap"><table>']
    if head:
        out.append(
            "<thead><tr>" + "".join("<th>%s</th>" % inline(c) for c in head)
            + "</tr></thead>"
        )
    out.append("<tbody>")
    for row in body:
        out.append("<tr>" + "".join("<td>%s</td>" % inline(c) for c in row) + "</tr>")
    out.append("</tbody></table></div>")
    return "".join(out)

# -------------------------------------------------------------- document ----

def render_doc(md, prefix, quote_class):
    """Render one markdown doc to HTML wrapped in nested .md-section divs.
    quote_class styles blockquotes ('prompt' in the manual, 'note' elsewhere)."""
    blocks = split_blocks(md)
    used = set()
    headings = []
    out = []
    stack = []
    counter = [0]

    def slug(text):
        s = re.sub(r"[^a-z0-9]+", "-", plain(text).lower()).strip("-") or "section"
        s = "%s-%s" % (prefix, s)
        base, i = s, 2
        while s in used:
            s = "%s-%d" % (base, i)
            i += 1
        used.add(s)
        return s

    for kind, data in blocks:
        if kind == "h":
            level, text = data
            while stack and level <= stack[-1]:
                out.append("</div></div>")
                stack.pop()
            hid = slug(text)
            headings.append((level, plain(text), hid))
            out.append(
                '<div class="md-section">'
                '<h%d class="sec-head" id="%s">'
                '<button class="caret" type="button" aria-label="Collapse section" '
                'aria-expanded="true"></button>%s</h%d>'
                '<div class="md-body">' % (level, hid, inline(text), level)
            )
            stack.append(level)
        elif kind == "para":
            out.append("<p>%s</p>" % inline(" ".join(data)))
        elif kind == "code":
            out.append("<pre><code>%s</code></pre>" % html.escape(data))
        elif kind == "hr":
            out.append("<hr>")
        elif kind == "quote":
            out.append(
                '<blockquote class="%s"><p>%s</p></blockquote>'
                % (quote_class, inline(" ".join(data)))
            )
        elif kind == "table":
            out.append(render_table(data))
        elif kind == "list":
            out.append(render_nodes(list_tree(data), prefix, counter))
    while stack:
        out.append("</div></div>")
        stack.pop()
    return "\n".join(out), headings


def toc_html(headings):
    """Nested <ul> TOC from (level, text, id) headings, levels >= 2."""
    root = {"children": []}
    stack = [(1, root)]
    for level, text, hid in headings:
        if level < 2:
            continue
        node = {"t": text, "h": hid, "children": []}
        while stack[-1][0] >= level:
            stack.pop()
        stack[-1][1]["children"].append(node)
        stack.append((level, node))

    def rend(nodes):
        if not nodes:
            return ""
        return "<ul>" + "".join(
            '<li><a href="#%s">%s</a>%s</li>'
            % (n["h"], html.escape(n["t"]), rend(n["children"]))
            for n in nodes
        ) + "</ul>"

    return rend(root["children"])

# --------------------------------------------------------------- template ---

TEMPLATE = r"""<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%9A%93%3C/text%3E%3C/svg%3E">
<title>Battleship — Pre-Build Planning</title>
<style>
*{box-sizing:border-box}
:root{
  --bg:#f2f6fa;--panel:#ffffff;--ink:#152637;--muted:#54697d;--line:#c9d6e2;
  --accent:#17537e;--accent-ink:#ffffff;--accent-soft:#e3edf5;--code-bg:#e9eff5;
  --mark:#ffe08a;--ok:#1c7a4a;--link:#17537e;
  --note-bg:#fdf3dc;--note-line:#a97c10;--note-ink:#7a5a08;
}
[data-theme="dark"]{
  --bg:#0b1620;--panel:#12212f;--ink:#d8e4ee;--muted:#93a8ba;--line:#274155;
  --accent:#86bde0;--accent-ink:#0b1620;--accent-soft:#19303f;--code-bg:#0e1c29;
  --mark:#6d5b00;--ok:#5ecb90;--link:#9cccec;
  --note-bg:#292217;--note-line:#d4a63c;--note-ink:#e3bd62;
}
html{scroll-padding-top:76px}
body{margin:0;background:var(--bg);color:var(--ink);
  font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--link)}
a:focus-visible,button:focus-visible,input:focus-visible,[tabindex]:focus-visible,label:focus-within{
  outline:2px solid var(--accent);outline-offset:2px}
.top{position:sticky;top:0;z-index:20;background:var(--panel);border-bottom:1px solid var(--line)}
.top-inner,.layout,.foot{max-width:1240px;margin:0 auto}
.top-inner{padding:10px 16px;display:flex;flex-wrap:wrap;
  align-items:center;gap:10px 16px}
.site-title{font-size:1.15rem;margin:0;font-weight:700;letter-spacing:.01em}
.site-title .sub{font-weight:400;color:var(--muted);font-size:.85rem}
.tabs{display:flex;gap:2px}
.tab{border:0;background:none;color:var(--ink);font:inherit;font-weight:600;cursor:pointer;
  padding:8px 12px;border-bottom:3px solid transparent}
.tab:hover,.ghost:hover,.copy-btn:hover{background:var(--accent-soft)}
.tab[aria-selected="true"]{border-bottom-color:var(--accent);color:var(--accent)}
.tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-left:auto}
#search{font:inherit;padding:6px 10px;border:1px solid var(--line);border-radius:6px;
  background:var(--bg);color:var(--ink);min-width:170px}
.search-count{font-size:.8rem;color:var(--muted);min-width:70px}
.ghost,.copy-btn{font:inherit;border:1px solid var(--line);background:var(--panel);
  color:var(--ink);cursor:pointer}
.ghost{font-size:.85rem;padding:6px 10px;border-radius:6px}
.layout{padding:20px 16px 60px;display:grid;
  grid-template-columns:250px minmax(0,1fr);gap:28px}
.sidebar{position:sticky;top:76px;align-self:start;max-height:calc(100vh - 96px);
  overflow:auto;font-size:.88rem}
.toc{border-left:2px solid var(--line);padding-left:0}
.toc ul{list-style:none;margin:0;padding:0}
.toc li{margin:0}
.toc a{display:block;color:var(--muted);text-decoration:none;padding:3px 10px;
  border-left:2px solid transparent;margin-left:-2px}
.toc a:hover{color:var(--ink);background:var(--accent-soft)}
.toc a.current{color:var(--accent);border-left-color:var(--accent);font-weight:600}
.toc ul ul a{padding-left:24px}
.toc ul ul ul a{padding-left:38px}
.panel-tools{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px}
.progress{flex:1;min-width:120px;max-width:340px;height:8px;border-radius:4px;
  background:var(--line);overflow:hidden}
.progress .bar{height:100%;width:0;background:var(--ok);transition:width .2s}
.progress-label{font-size:.82rem;color:var(--muted)}
.doc-flow h1.sec-head{font-size:1.5rem}
.doc-flow h2.sec-head{font-size:1.22rem}
.doc-flow h3.sec-head{font-size:1.05rem}
.sec-head{scroll-margin-top:76px;margin:1.1em 0 .5em;line-height:1.3}
.md-section>.md-body{margin-left:2px}
.md-section.collapsed>.md-body{display:none}
.caret{border:0;background:none;color:var(--muted);cursor:pointer;font:inherit;
  padding:0;margin-right:6px;line-height:1}
.caret::before{content:"\25B8";display:inline-block;transition:transform .15s}
.md-section:not(.collapsed)>.sec-head>.caret::before{transform:rotate(90deg)}
.caret:hover{color:var(--accent)}
p{margin:.55em 0}
ul,ol{margin:.5em 0;padding-left:1.6em}
li{margin:.25em 0}
li.task{list-style:none;margin-left:-1.4em}
li.task label{display:flex;gap:8px;align-items:flex-start;cursor:pointer}
li.task input{margin-top:4px}
input[type="checkbox"].persist{width:16px;height:16px;accent-color:var(--accent);cursor:pointer;flex:none}
h3 .step-check{margin-right:8px;vertical-align:middle}
.table-wrap{overflow-x:auto;margin:.7em 0}
table{border-collapse:collapse;width:100%;font-size:.92rem}
th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
th{background:var(--accent-soft)}
code{background:var(--code-bg);padding:1px 5px;border-radius:4px;font-size:.9em;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
pre{background:var(--code-bg);border:1px solid var(--line);border-radius:8px;
  padding:12px 14px;overflow-x:auto;position:relative}
pre code{background:none;padding:0}
blockquote.prompt{margin:.7em 0;padding:10px 14px;border-left:4px solid var(--accent);
  background:var(--accent-soft);border-radius:0 8px 8px 0;position:relative}
blockquote.prompt::before{content:"PROMPT";display:block;font-size:.68rem;
  font-weight:700;letter-spacing:.08em;color:var(--accent);margin-bottom:4px}
blockquote.note{margin:.7em 0;padding:10px 14px;border-left:4px solid var(--note-line);
  background:var(--note-bg);border-radius:0 8px 8px 0}
blockquote.note::before{content:"NOTE";display:block;font-size:.68rem;
  font-weight:700;letter-spacing:.08em;color:var(--note-ink);margin-bottom:4px}
/* variant toggles (requirements 6.1) */
.variant-cell{white-space:nowrap}
.switch{display:inline-flex;align-items:center;gap:8px;font:inherit;font-size:.85rem;
  padding:3px 10px 3px 4px;border:1px solid var(--line);border-radius:14px;
  background:var(--panel);color:var(--ink);cursor:pointer}
.sw-track{width:34px;height:18px;border-radius:9px;background:var(--line);
  position:relative;flex:none;transition:background .15s}
.sw-thumb{position:absolute;top:1px;left:2px;width:14px;height:14px;border-radius:50%;
  background:var(--panel);border:1px solid var(--muted);transition:left .15s}
.switch[aria-checked="true"] .sw-track{background:var(--accent)}
.switch[aria-checked="true"] .sw-thumb{left:17px;background:#fff;border-color:transparent}
.switch[disabled]{opacity:.55;cursor:not-allowed}
.sw-label{min-width:22px;font-weight:600}
.var-hint{display:block;font-size:.75rem;color:var(--muted);margin-top:4px}
.var-print{display:none}
.variant-warning{margin:.6em 0;padding:10px 14px;border:1px solid var(--note-line);
  border-left-width:4px;border-radius:8px;background:var(--note-bg);
  color:var(--ink);font-weight:600}
.variant-chip{font-size:.78rem;font-weight:600;color:var(--accent);
  border:1px solid var(--line);border-radius:999px;padding:3px 10px;
  background:var(--accent-soft)}
hr{border:0;border-top:1px solid var(--line);margin:1.4em 0}
mark{background:var(--mark);color:inherit;border-radius:2px;padding:0 1px}
.copyable{position:relative}
.copy-btn{position:absolute;top:6px;right:6px;font-size:.75rem;
  padding:3px 8px;border-radius:5px;z-index:2}
.search-hidden{display:none!important}
body.searching .md-section.collapsed>.md-body{display:block}
/* gates stepper */
.gate-stepper{list-style:none;padding-left:0;margin:.8em 0}
.gate-item{position:relative;padding:4px 0 4px 36px}
.gate-item::before{content:"";position:absolute;left:46px;top:26px;bottom:-11px;
  width:2px;background:var(--line)}
.gate-item:last-child::before{display:none}
.gate-label{display:flex;gap:12px;align-items:flex-start;cursor:pointer}
input[type="checkbox"].gate-check{appearance:none;-webkit-appearance:none;
  width:22px;height:22px;flex:none;border:2px solid var(--accent);
  border-radius:50%;background:var(--panel);position:relative;cursor:pointer;
  margin:2px 0 0}
input[type="checkbox"].gate-check:checked{background:var(--accent)}
input[type="checkbox"].gate-check:checked::after{content:"\2713";position:absolute;
  inset:0;display:flex;align-items:center;justify-content:center;
  color:var(--accent-ink);font-size:13px;font-weight:700}
.gate-item.done .gate-text{opacity:.6}
.gate-item.done .gate-text strong{color:var(--ok)}
/* decision log */
.decision-table input.dec-input{width:100%;font:inherit;padding:4px 6px;
  border:1px dashed var(--line);border-radius:4px;background:var(--panel);color:var(--ink)}
.decision-table input.dec-input:focus{border-style:solid;border-color:var(--accent)}
.dec-actions{display:flex;gap:10px;margin:.5em 0}
.foot{padding:14px 16px 30px;font-size:.8rem;
  color:var(--muted);border-top:1px solid var(--line)}
@media (max-width:1200px){
  .tools{flex-basis:100%;margin-left:0}
  #search{flex:1 1 auto;max-width:420px}
  #reset{margin-left:auto}
}
@media (max-width:900px){
  .layout{grid-template-columns:1fr;gap:16px}
  .sidebar{position:static;max-height:220px;border:1px solid var(--line);
    border-radius:8px;padding:8px;background:var(--panel)}
  .tools{margin-left:0}
  .site-title{width:100%}
}
@media (max-width:420px){
  .top-inner{padding:8px 10px}
  .layout{padding:14px 10px 50px}
  #search{min-width:120px;flex:1}
}
@media print{
  .top,.sidebar,.panel-tools,.copy-btn,.caret,.dec-actions,.foot{display:none!important}
  .layout{display:block;padding:0}
  .panel{display:block!important;page-break-before:auto}
  .panel+.panel{page-break-before:always}
  .md-section,.md-body{display:block!important}
  .search-hidden{display:revert!important}
  body{background:#fff;color:#000}
  a{color:#000}
  .decision-table input.dec-input{border:0;border-bottom:1px solid #999}
  .switch,.var-hint{display:none!important}
  .var-print{display:inline!important}
  .variant-warning{border-color:#999;background:#fff}
}
</style>
</head>
<body>
<header class="top">
  <div class="top-inner">
    <h1 class="site-title">Battleship <span class="sub">— pre-build planning</span></h1>
    <nav class="tabs" role="tablist" aria-label="Documents">
      <button class="tab" id="tab-requirements" role="tab" data-panel="requirements"
        aria-selected="true" aria-controls="panel-requirements">Requirements &amp; Discovery</button>
      <button class="tab" id="tab-manual" role="tab" data-panel="manual"
        aria-selected="false" aria-controls="panel-manual">Build Manual</button>
    </nav>
    <div class="tools">
      <input id="search" type="search" placeholder="Search docs…" aria-label="Search documents">
      <span id="search-count" class="search-count" aria-live="polite"></span>
      <button id="reset" type="button" class="ghost">Reset progress</button>
      <button id="theme-toggle" type="button" class="ghost">Dark theme</button>
    </div>
  </div>
</header>
<div class="layout">
  <aside class="sidebar">
    <nav id="toc-requirements" class="toc" aria-label="Requirements contents">%%REQ_TOC%%</nav>
    <nav id="toc-manual" class="toc" aria-label="Build manual contents" hidden>%%MAN_TOC%%</nav>
  </aside>
  <main>
    <section id="panel-requirements" class="panel active" role="tabpanel"
      aria-labelledby="tab-requirements">
      <div class="panel-tools">
        <button class="ghost js-expand" type="button" data-panel="requirements">Expand all</button>
        <button class="ghost js-collapse" type="button" data-panel="requirements">Collapse all</button>
        <div class="progress" role="progressbar" aria-label="Requirements checklist progress"
          aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="bar"></div></div>
        <span class="progress-label"></span>
        <span id="variant-chip" class="variant-chip">Variants: Classic only</span>
      </div>
      <div class="doc-flow">%%REQ_HTML%%</div>
    </section>
    <section id="panel-manual" class="panel" role="tabpanel"
      aria-labelledby="tab-manual" hidden>
      <div class="panel-tools">
        <button class="ghost js-expand" type="button" data-panel="manual">Expand all</button>
        <button class="ghost js-collapse" type="button" data-panel="manual">Collapse all</button>
        <div class="progress" role="progressbar" aria-label="Build manual checklist progress"
          aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="bar"></div></div>
        <span class="progress-label"></span>
      </div>
      <div class="doc-flow">%%MAN_HTML%%</div>
    </section>
  </main>
</div>
<footer class="foot">Generated from <code>docs/requirements.md</code> and
<code>docs/build-manual.md</code> by <code>scripts/build_page.py</code> · %%GEN_DATE%% ·
anchors: <code>#requirements</code> / <code>#manual</code></footer>
<script>
(function () {
"use strict";
var PREFIX = "bsplan:";
function sget(k){ try { return localStorage.getItem(PREFIX + k); } catch (e) { return null; } }
function sset(k,v){ try { localStorage.setItem(PREFIX + k, v); } catch (e) {} }
function sdel(k){ try { localStorage.removeItem(PREFIX + k); } catch (e) {} }
function qa(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

/* ---------- theme ---------- */
var theme = sget("theme");
if (theme !== "light" && theme !== "dark") {
  theme = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
}
document.documentElement.setAttribute("data-theme", theme);
var themeBtn = document.getElementById("theme-toggle");
function paintTheme(){ themeBtn.textContent = theme === "dark" ? "Light theme" : "Dark theme"; }
themeBtn.addEventListener("click", function () {
  theme = theme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme);
  sset("theme", theme); paintTheme();
});
paintTheme();

/* ---------- tabs ---------- */
var panels = {
  requirements: document.getElementById("panel-requirements"),
  manual: document.getElementById("panel-manual")
};
var tocs = {
  requirements: document.getElementById("toc-requirements"),
  manual: document.getElementById("toc-manual")
};
var tabs = qa(".tab");
var current = "requirements";
function activate(name, fromHashNav) {
  if (!panels[name]) name = "requirements";
  current = name;
  tabs.forEach(function (t) {
    t.setAttribute("aria-selected", t.getAttribute("data-panel") === name ? "true" : "false");
  });
  Object.keys(panels).forEach(function (k) {
    var on = k === name;
    panels[k].classList.toggle("active", on);
    panels[k].hidden = !on;
    if (tocs[k]) tocs[k].hidden = !on;
  });
  if (!fromHashNav && ("#" + name) !== location.hash) {
    try { history.replaceState(null, "", "#" + name); } catch (e) { location.hash = name; }
  }
  updateSpy();
  if (typeof searchBox !== "undefined" && searchBox.value.trim().length >= 2) runSearch();
}
tabs.forEach(function (t) {
  t.addEventListener("click", function () { activate(t.getAttribute("data-panel"), false); });
});
document.querySelector(".tabs").addEventListener("keydown", function (e) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  var i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  var j = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
  tabs[j].focus();
  tabs[j].click();
  e.preventDefault();
});

/* ---------- deep links ---------- */
function fromHash() {
  var id = "";
  try { id = decodeURIComponent(location.hash.replace(/^#/, "")); } catch (e) { id = location.hash.slice(1); }
  if (!id) { activate("requirements", true); return; }
  if (id === "requirements" || id === "manual") { activate(id, true); window.scrollTo(0, 0); return; }
  var el = document.getElementById(id);
  if (!el) return;
  var p = el.closest(".panel");
  if (p) activate(p.id.replace("panel-", ""), true);
  var a = el.parentElement;
  while (a) {
    if (a.classList && a.classList.contains("md-section")) a.classList.remove("collapsed");
    a = a.parentElement;
  }
  setTimeout(function () { el.scrollIntoView(); }, 0);
}
window.addEventListener("hashchange", fromHash);

/* ---------- collapsible headings ---------- */
document.addEventListener("click", function (e) {
  var c = e.target && e.target.closest ? e.target.closest(".caret") : null;
  if (!c) return;
  var s = c.closest(".md-section");
  if (!s) return;
  s.classList.toggle("collapsed");
  c.setAttribute("aria-expanded", s.classList.contains("collapsed") ? "false" : "true");
});
qa(".js-expand").forEach(function (b) {
  b.addEventListener("click", function () {
    qa(".md-section", panels[b.getAttribute("data-panel")]).forEach(function (s) {
      s.classList.remove("collapsed");
    });
  });
});
qa(".js-collapse").forEach(function (b) {
  b.addEventListener("click", function () {
    qa(".md-section", panels[b.getAttribute("data-panel")]).forEach(function (s) {
      s.classList.add("collapsed");
    });
  });
});

/* ---------- gates stepper (requirements 2.3) ---------- */
function setupGates() {
  var heads = qa("h3", panels.requirements);
  for (var i = 0; i < heads.length; i++) {
    if (!/Gates/.test(heads[i].textContent)) continue;
    var sec = heads[i].closest(".md-section");
    var ol = sec ? sec.querySelector("ol") : null;
    if (!ol) return;
    ol.classList.add("gate-stepper");
    for (var j = 0; j < ol.children.length; j++) {
      var li = ol.children[j];
      var span = document.createElement("span");
      span.className = "gate-text";
      while (li.firstChild) span.appendChild(li.firstChild);
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "persist gate-check";
      cb.setAttribute("data-key", "gate-" + (j + 1));
      cb.setAttribute("aria-label", "Mark gate " + (j + 1) + " complete");
      var lab = document.createElement("label");
      lab.className = "gate-label";
      lab.appendChild(cb);
      lab.appendChild(span);
      li.className = "gate-item";
      li.appendChild(lab);
    }
    return;
  }
}

/* ---------- step checkboxes (build manual "### Step x.y") ---------- */
function setupSteps() {
  qa("h3", panels.manual).forEach(function (h) {
    var m = h.textContent.match(/Step\s+([\d.]+)/);
    if (!m) return;
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "persist step-check";
    cb.setAttribute("data-key", "step-" + m[1].replace(/\.$/, ""));
    cb.setAttribute("aria-label", "Mark " + h.textContent.trim() + " done");
    h.insertBefore(cb, h.childNodes[1] || null);
  });
}

/* ---------- persisted checkboxes ---------- */
function initPersist() {
  qa("input.persist").forEach(function (inp) {
    var key = "check:" + inp.getAttribute("data-key");
    inp.checked = sget(key) === "1";
    var li = inp.closest(".gate-item");
    if (li) li.classList.toggle("done", inp.checked);
    inp.addEventListener("change", function () {
      if (this.checked) sset(key, "1"); else sdel(key);
      var l = this.closest(".gate-item");
      if (l) l.classList.toggle("done", this.checked);
      updateProgress();
    });
  });
}

/* ---------- progress bars ---------- */
function updateProgress() {
  Object.keys(panels).forEach(function (name) {
    var p = panels[name];
    var all = qa("input.persist", p), done = 0;
    all.forEach(function (i2) { if (i2.checked) done++; });
    var bar = p.querySelector(".progress .bar");
    var lab = p.querySelector(".progress-label");
    var pb = p.querySelector(".progress");
    var pct = all.length ? Math.round(done * 100 / all.length) : 0;
    if (bar) bar.style.width = pct + "%";
    if (lab) lab.textContent = done + "/" + all.length + " done";
    if (pb) pb.setAttribute("aria-valuenow", String(pct));
  });
}

/* ---------- decision log (requirements 9) ---------- */
var decTable = null;
var decCols = {};
function setupDecisions() {
  var heads = qa("h2", panels.requirements);
  for (var i = 0; i < heads.length; i++) {
    if (!/Decision Log/.test(heads[i].textContent)) continue;
    var sec = heads[i].closest(".md-section");
    decTable = sec ? sec.querySelector("table") : null;
    if (!decTable) return;
    decTable.classList.add("decision-table");
    var ths = qa("thead th", decTable);
    ths.forEach(function (th, idx) {
      var t = th.textContent.trim().toLowerCase();
      if (t === "decision" || t === "date") decCols[t] = idx;
    });
    qa("tbody tr", decTable).forEach(function (row, r) {
      ["decision", "date"].forEach(function (which) {
        var idx = decCols[which];
        if (idx == null || !row.children[idx]) return;
        var cell = row.children[idx];
        var existing = cell.textContent.trim();
        cell.textContent = "";
        var inp = document.createElement("input");
        inp.type = "text";
        inp.className = "dec-input";
        var k = "dec:" + which + "-" + r;
        inp.setAttribute("data-k", k);
        inp.placeholder = which === "date" ? "YYYY-MM-DD" : "…";
        var saved = sget(k);
        inp.value = saved != null ? saved : existing;
        var q = row.children[1] ? row.children[1].textContent.trim() : "row " + (r + 1);
        inp.setAttribute("aria-label", q + " — " + which);
        inp.addEventListener("input", function () {
          var kk = this.getAttribute("data-k");
          if (this.value) sset(kk, this.value); else sdel(kk);
        });
        cell.appendChild(inp);
      });
    });
    var wrap = document.createElement("div");
    wrap.className = "dec-actions";
    var bj = document.createElement("button");
    bj.type = "button"; bj.className = "ghost"; bj.textContent = "Export decisions (JSON)";
    bj.addEventListener("click", function () {
      download("battleship-decisions.json", toJSON(), "application/json");
    });
    var bm = document.createElement("button");
    bm.type = "button"; bm.className = "ghost"; bm.textContent = "Export decisions (Markdown)";
    bm.addEventListener("click", function () {
      download("battleship-decisions.md", toMD(), "text/markdown");
    });
    wrap.appendChild(bj);
    wrap.appendChild(bm);
    decTable.parentNode.insertBefore(wrap, decTable.nextSibling);
    return;
  }
}
function collectDecisions() {
  var out = [];
  qa("tbody tr", decTable).forEach(function (row) {
    var c = row.children;
    var val = function (idx) {
      if (idx == null || !c[idx]) return "";
      var inp = c[idx].querySelector("input");
      return inp ? inp.value : c[idx].textContent.trim();
    };
    out.push({
      n: c[0] ? c[0].textContent.trim() : "",
      question: c[1] ? c[1].textContent.trim() : "",
      decision: val(decCols.decision),
      role: c[3] ? c[3].textContent.trim() : "",
      date: val(decCols.date)
    });
  });
  return out;
}
/* ---------- variant toggles (requirements 6.1) ---------- */
var VARIANT_DEPS = { salvoHiddenHits: "salvo" };
var variantState = {};
var variantBtns = {};
var variantWarn = null;
var variantChip = null;
function variantsJSON() {
  var o = {};
  Object.keys(variantBtns).forEach(function (f) { o[f] = !!variantState[f]; });
  return o;
}
function setVariant(flag, on) {
  var dep = VARIANT_DEPS[flag];
  if (dep && !variantState[dep]) on = false;
  variantState[flag] = on;
  if (on) sset("variant:" + flag, "1"); else sdel("variant:" + flag);
  refreshVariants();
}
function refreshVariants() {
  var count = 0;
  Object.keys(variantBtns).forEach(function (flag) {
    var v = variantBtns[flag];
    var dep = VARIANT_DEPS[flag];
    var depOff = !!(dep && !variantState[dep]);
    if (depOff && variantState[flag]) {
      variantState[flag] = false;
      sdel("variant:" + flag);
    }
    var on = !!variantState[flag] && !depOff;
    v.btn.setAttribute("aria-checked", on ? "true" : "false");
    v.label.textContent = on ? "On" : "Off";
    if (depOff) {
      var depName = dep.charAt(0).toUpperCase() + dep.slice(1);
      v.btn.disabled = true;
      v.btn.title = "Requires " + depName;
      v.btn.setAttribute("aria-describedby", "hint-" + flag);
      v.hint.textContent = "Requires " + depName;
      v.hint.hidden = false;
    } else {
      v.btn.disabled = false;
      v.btn.removeAttribute("title");
      v.btn.removeAttribute("aria-describedby");
      v.hint.hidden = true;
    }
    v.print.textContent = on ? "On (default: " + v.dflt + ")" : v.dflt;
    if (on) count++;
  });
  if (variantWarn) {
    variantWarn.hidden = count === 0;
    variantWarn.textContent = "Scope change: " + count +
      " variant(s) enabled — add to Decision Log and re-approve at Gate 5.";
  }
  if (variantChip) {
    variantChip.textContent = count ? "Variants: " + count + " on" : "Variants: Classic only";
  }
}
function setupVariants() {
  var heads = qa("h3", panels.requirements), sec = null;
  for (var i = 0; i < heads.length; i++) {
    if (/Variants/.test(heads[i].textContent)) { sec = heads[i].closest(".md-section"); break; }
  }
  if (!sec) return;
  var table = sec.querySelector("table");
  if (!table) return;
  var flagIdx = -1, defIdx = -1;
  qa("thead th", table).forEach(function (th, idx) {
    var t = th.textContent.trim().toLowerCase();
    if (t === "flag") flagIdx = idx;
    if (t === "default") defIdx = idx;
  });
  if (flagIdx < 0 || defIdx < 0) return;
  table.classList.add("variant-table");
  qa("tbody tr", table).forEach(function (row) {
    var cells = row.children;
    if (!cells[flagIdx] || !cells[defIdx]) return;
    var flag = cells[flagIdx].textContent.trim();
    var cell = cells[defIdx];
    var dflt = cell.textContent.trim() || "Off";
    cell.setAttribute("data-default", dflt);
    cell.textContent = "";
    cell.classList.add("variant-cell");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "switch";
    btn.setAttribute("role", "switch");
    btn.setAttribute("aria-checked", "false");
    btn.setAttribute("aria-label", cells[1] ? cells[1].textContent.trim() + " variant" : flag + " variant");
    var track = document.createElement("span");
    track.className = "sw-track";
    var thumb = document.createElement("span");
    thumb.className = "sw-thumb";
    track.appendChild(thumb);
    var lab = document.createElement("span");
    lab.className = "sw-label";
    lab.textContent = "Off";
    btn.appendChild(track);
    btn.appendChild(lab);
    var hint = document.createElement("span");
    hint.className = "var-hint";
    hint.id = "hint-" + flag;
    hint.hidden = true;
    var prn = document.createElement("span");
    prn.className = "var-print";
    prn.textContent = dflt;
    cell.appendChild(btn);
    cell.appendChild(hint);
    cell.appendChild(prn);
    variantBtns[flag] = { btn: btn, label: lab, print: prn, hint: hint, dflt: dflt };
    variantState[flag] = sget("variant:" + flag) === "1";
    btn.addEventListener("click", function () { setVariant(flag, !variantState[flag]); });
  });
  var warn = document.createElement("div");
  warn.className = "variant-warning";
  warn.setAttribute("role", "status");
  warn.hidden = true;
  var wrap = table.closest(".table-wrap") || table;
  wrap.parentNode.insertBefore(warn, wrap.nextSibling);
  variantWarn = warn;
  variantChip = document.getElementById("variant-chip");
  refreshVariants();
}

function toJSON() {
  return JSON.stringify({ decisions: collectDecisions(), variants: variantsJSON() }, null, 2) + "\n";
}
function toMD() {
  var esc = function (s) { return s.replace(/\|/g, "\\|").replace(/\n/g, " "); };
  var lines = ["| # | Question | Decision | Role | Date |", "|---|----------|----------|------|------|"];
  collectDecisions().forEach(function (d) {
    lines.push("| " + [d.n, esc(d.question), esc(d.decision), esc(d.role), esc(d.date)].join(" | ") + " |");
  });
  var vkeys = Object.keys(variantBtns);
  if (vkeys.length) {
    lines.push("", "## Variants", "", "| Flag | State |", "|------|-------|");
    vkeys.forEach(function (f) {
      lines.push("| " + f + " | " + (variantState[f] ? "On" : "Off") + " |");
    });
  }
  return lines.join("\n") + "\n";
}
function download(name, text, mime) {
  var blob = new Blob([text], { type: mime });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

/* ---------- copy buttons (manual prompts + code blocks) ---------- */
function cleanText(el) {
  var c = el.cloneNode(true);
  qa(".copy-btn", c).forEach(function (b) { b.parentNode.removeChild(b); });
  return c.textContent.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
}
function legacyCopy(text) {
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  document.body.removeChild(ta);
}
function doCopy(text, btn) {
  var ok = function () {
    btn.textContent = "Copied!";
    setTimeout(function () { btn.textContent = "Copy"; }, 1200);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(ok, function () { legacyCopy(text); ok(); });
  } else {
    legacyCopy(text); ok();
  }
}
qa("pre, blockquote", panels.manual).forEach(function (el) {
  el.classList.add("copyable");
  var b = document.createElement("button");
  b.type = "button";
  b.className = "copy-btn";
  b.textContent = "Copy";
  b.addEventListener("click", function () { doCopy(cleanText(el), b); });
  el.appendChild(b);
});

/* ---------- search ---------- */
var searchBox = document.getElementById("search");
var searchCount = document.getElementById("search-count");
var searchTimer = null;
function clearSearch() {
  qa("mark").forEach(function (m) {
    if (m.parentNode) m.parentNode.replaceChild(document.createTextNode(m.textContent), m);
  });
  qa(".doc-flow").forEach(function (f) { f.normalize(); });
  qa(".search-hidden").forEach(function (el) { el.classList.remove("search-hidden"); });
  document.body.classList.remove("searching");
  searchCount.textContent = "";
}
function splitMark(tn, q) {
  var val = tn.nodeValue, low = val.toLowerCase();
  var frag = document.createDocumentFragment(), pos = 0, idx = low.indexOf(q);
  while (idx !== -1) {
    frag.appendChild(document.createTextNode(val.slice(pos, idx)));
    var mk = document.createElement("mark");
    mk.textContent = val.slice(idx, idx + q.length);
    frag.appendChild(mk);
    pos = idx + q.length;
    idx = low.indexOf(q, pos);
  }
  frag.appendChild(document.createTextNode(val.slice(pos)));
  tn.parentNode.replaceChild(frag, tn);
}
function markIn(root, q) {
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, function (n) {
    if (!n.nodeValue || n.nodeValue.toLowerCase().indexOf(q) === -1) return NodeFilter.FILTER_SKIP;
    var p = n.parentNode;
    while (p && p !== root) {
      var t = p.nodeName;
      if (t === "SCRIPT" || t === "STYLE" || t === "INPUT" || t === "TEXTAREA" || t === "BUTTON" || t === "MARK")
        return NodeFilter.FILTER_SKIP;
      p = p.parentNode;
    }
    return NodeFilter.FILTER_ACCEPT;
  });
  var nodes = [], n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach(function (tn) { splitMark(tn, q); });
}
function runSearch() {
  var q = searchBox.value.trim().toLowerCase();
  clearSearch();
  if (q.length < 2) return;
  var p = panels[current];
  document.body.classList.add("searching");
  markIn(p.querySelector(".doc-flow"), q);
  qa(".md-body > *, .doc-flow > *", p).forEach(function (el) {
    if (el.classList && el.classList.contains("md-section")) return;
    if (!el.querySelector("mark")) el.classList.add("search-hidden");
  });
  qa(".md-section", p).forEach(function (s) {
    if (!s.querySelector("mark")) s.classList.add("search-hidden");
  });
  var count = p.querySelectorAll("mark").length;
  searchCount.textContent = count ? count + " match" + (count === 1 ? "" : "es") : "no matches";
}
searchBox.addEventListener("input", function () {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 150);
});
searchBox.addEventListener("keydown", function (e) {
  if (e.key === "Escape") { searchBox.value = ""; clearSearch(); }
});

/* ---------- scroll spy ---------- */
var ticking = false;
function updateSpy() {
  var p = panels[current];
  if (!p) return;
  var heads = qa(".sec-head", p), id = null;
  for (var i = 0; i < heads.length; i++) {
    if (heads[i].getBoundingClientRect().top <= 110) id = heads[i].id;
    else break;
  }
  qa(".toc a").forEach(function (a) {
    a.classList.toggle("current", a.getAttribute("href") === "#" + id);
  });
}
window.addEventListener("scroll", function () {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(function () { updateSpy(); ticking = false; });
}, { passive: true });

/* ---------- reset ---------- */
document.getElementById("reset").addEventListener("click", function () {
  if (!window.confirm("Reset all saved progress — checklists, gates, decisions?")) return;
  var del = [], i;
  try {
    for (i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(PREFIX) === 0 && k !== PREFIX + "theme") del.push(k);
    }
    del.forEach(function (k) { localStorage.removeItem(k); });
  } catch (e) {}
  location.reload();
});

/* ---------- init ---------- */
setupGates();
setupSteps();
initPersist();
setupDecisions();
setupVariants();
updateProgress();
fromHash();
updateSpy();
})();
</script>
</body>
</html>
"""


def panel_tools(name):
    return name  # placeholder for readability


def main():
    req_md = (DOCS / "requirements.md").read_text(encoding="utf-8")
    man_md = (DOCS / "build-manual.md").read_text(encoding="utf-8")
    req_html, req_heads = render_doc(req_md, "req", "note")
    man_html, man_heads = render_doc(man_md, "man", "prompt")
    page = TEMPLATE
    page = page.replace("%%REQ_HTML%%", req_html)
    page = page.replace("%%MAN_HTML%%", man_html)
    page = page.replace("%%REQ_TOC%%", toc_html(req_heads))
    page = page.replace("%%MAN_TOC%%", toc_html(man_heads))
    page = page.replace("%%GEN_DATE%%", date.today().isoformat())
    OUT.write_text(page, encoding="utf-8")
    print("wrote %s (%d bytes, %d req headings, %d manual headings)"
          % (OUT, len(page), len(req_heads), len(man_heads)))


if __name__ == "__main__":
    main()
