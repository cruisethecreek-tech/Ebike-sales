#!/usr/bin/env python3
"""
Extract the <style> block(s) from an HTML file into a sibling .css file.

Useful for shipping CSS to a code reviewer (Gemini, etc.) without dragging
the surrounding HTML along. The original .html is left untouched.

Usage:
  python3 extract_css.py                         # default: home, shop, our-story
  python3 extract_css.py file.html               # one file
  python3 extract_css.py file1.html file2.html   # several
"""
import re
import sys
import pathlib

DEFAULT_FILES = ["home.html", "shop.html", "our-story.html"]
STYLE_RE = re.compile(r"<style[^>]*>(.*?)</style>", flags=re.DOTALL | re.IGNORECASE)


def extract(path: str) -> None:
    src = pathlib.Path(path)
    if not src.exists():
        print(f"  missing      {src}")
        return

    text = src.read_text()
    blocks = STYLE_RE.findall(text)
    if not blocks:
        print(f"  no <style>   {src}")
        return

    css = "\n\n".join(b.strip() for b in blocks).rstrip() + "\n"
    out = src.with_suffix(".css")
    out.write_text(css)
    print(f"  {src.name:<20} -> {out.name:<20} ({len(css):>6,} bytes, {css.count(chr(10))} lines)")


if __name__ == "__main__":
    files = sys.argv[1:] or DEFAULT_FILES
    for f in files:
        extract(f)
