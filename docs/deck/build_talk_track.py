"""
Render docs/TALK-TRACK.md to docs/Subsurface-Intelligence-Talk-Track.pdf (headless Chrome).

Handles the Markdown subset the talk track uses: headings, paragraphs,
blockquotes, bullet and numbered lists, bold, italic, and inline code.
"""
import html
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

CSS = """
@page { size: letter; margin: 0.7in 0.75in }
body { font-family: Inter, 'Helvetica Neue', Arial, sans-serif; color: #1B2A33; font-size: 11pt; line-height: 1.5 }
h1 { font-size: 22pt; margin: 0 0 6px } h2 { font-size: 14pt; margin: 22px 0 6px; color: #E8541E; border-bottom: 1px solid #D5DDE1; padding-bottom: 3px }
h3 { font-size: 11.5pt; margin: 14px 0 4px }
blockquote { margin: 6px 0 8px; padding: 6px 12px; border-left: 3px solid #0E8C86; background: #F4F6F7; color: #2A3B45 }
code { font-family: Menlo, monospace; font-size: 9.5pt; background: #F1F3F4; padding: 0 3px; border-radius: 3px }
ul, ol { margin: 4px 0 8px; padding-left: 22px } li { margin: 2px 0 } p { margin: 5px 0 }
table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; font-size: 9.8pt } th, td { border: 1px solid #D5DDE1; padding: 5px 7px; text-align: left; vertical-align: top } th { background: #F4F6F7 } tr { page-break-inside: avoid }
h2, h3 { page-break-after: avoid } blockquote, li { page-break-inside: avoid }
"""


def inline(t: str) -> str:
    t = html.escape(t, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", t)
    return t


def convert(md: str) -> str:
    out, lst = [], None
    def close():
        nonlocal lst
        if lst:
            out.append(f"</{lst}>")
            lst = None
    rows = []
    def flush_table():
        if rows:
            cells = [[c.strip() for c in r.strip("|").split("|")] for r in rows if not re.match(r"^\|[\s:|-]+\|$", r)]
            out.append("<table><tr>" + "".join(f"<th>{inline(c)}</th>" for c in cells[0]) + "</tr>"
                       + "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in cells[1:])
                       + "</table>")
            rows.clear()
    for line in md.splitlines():
        s = line.strip()
        if s.startswith("|"):
            close(); rows.append(s)
            continue
        flush_table()
        m_ul = re.match(r"^[-*] (.*)", s)
        m_ol = re.match(r"^\d+\. (.*)", s)
        if m_ul or m_ol:
            kind = "ul" if m_ul else "ol"
            if lst != kind:
                close(); out.append(f"<{kind}>"); lst = kind
            out.append(f"<li>{inline((m_ul or m_ol).group(1))}</li>")
            continue
        if s.startswith(">") and lst:
            out.append(f"<blockquote>{inline(s.lstrip('> '))}</blockquote>")
            continue
        close()
        if not s:
            continue
        h = re.match(r"^(#{1,3}) (.*)", s)
        if h:
            out.append(f"<h{len(h.group(1))}>{inline(h.group(2))}</h{len(h.group(1))}>")
        elif s.startswith(">"):
            out.append(f"<blockquote>{inline(s.lstrip('> '))}</blockquote>")
        else:
            out.append(f"<p>{inline(s)}</p>")
    close(); flush_table()
    return "\n".join(out)


def main():
    body = convert((ROOT / "docs" / "TALK-TRACK.md").read_text())
    src = HERE / "talk-track.html"
    src.write_text(f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{body}</body></html>")
    pdf = ROOT / "docs" / "Subsurface-Intelligence-Talk-Track.pdf"
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={pdf}", src.as_uri()], check=True, capture_output=True)
    print(pdf)


if __name__ == "__main__":
    main()
