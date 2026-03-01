#!/usr/bin/env python3
"""Build NotebookLM-friendly HTML bundles from the official PHP manual.

NotebookLM accepts a limited number of source files. This script downloads the
official PHP manual HTML tarball and merges pages into at most N large HTML
files (default: 50) while preserving each page's canonical php.net URL so
NotebookLM citations remain inspectable in source view.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import re
import tarfile
import tempfile
import urllib.request
from pathlib import Path
from typing import Iterable

DEFAULT_URL = "https://www.php.net/distributions/manual/php_manual_en.tar.gz"


TITLE_RE = re.compile(r"<title>(.*?)</title>", re.IGNORECASE | re.DOTALL)
MAIN_RE = re.compile(
    r"<div[^>]*id=[\"']layout-content[\"'][^>]*>(.*?)</div>\s*</div>",
    re.IGNORECASE | re.DOTALL,
)
BODY_RE = re.compile(r"<body[^>]*>(.*?)</body>", re.IGNORECASE | re.DOTALL)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manual-url",
        default=DEFAULT_URL,
        help="PHP manual tar.gz URL (default: official php.net distribution)",
    )
    parser.add_argument(
        "--output-dir",
        default="notebooklm-php-manual",
        help="Output directory for bundled HTML files",
    )
    parser.add_argument(
        "--max-files",
        type=int,
        default=50,
        help="Maximum number of output files for NotebookLM",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Optional cap to process only first N pages (useful for testing)",
    )
    return parser.parse_args()


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url) as response, dest.open("wb") as f:
        f.write(response.read())


def discover_pages(root: Path) -> list[Path]:
    pages: list[Path] = []
    for path in root.rglob("*.html"):
        if path.name.startswith("_"):
            continue
        if path.name in {"index.html", "copyright.html"}:
            continue
        pages.append(path)
    pages.sort(key=lambda p: p.name)
    return pages


def clean_title(raw_title: str, fallback: str) -> str:
    title = html.unescape(raw_title).strip()
    title = re.sub(r"\s+", " ", title)
    if "::" in title:
        title = title.split("::", 1)[0].strip()
    if "-" in title and "PHP" in title:
        title = title.split("-", 1)[0].strip()
    return title or fallback


def extract_page_bits(path: Path) -> tuple[str, str]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    title_match = TITLE_RE.search(text)
    fallback_title = path.stem
    title = clean_title(title_match.group(1), fallback_title) if title_match else fallback_title

    main_match = MAIN_RE.search(text)
    if main_match:
        body = main_match.group(1)
    else:
        body_match = BODY_RE.search(text)
        body = body_match.group(1) if body_match else text

    body = body.strip()
    return title, body


def to_manual_url(path: Path) -> str:
    return f"https://www.php.net/manual/en/{path.name}"


def chunked(items: list[Path], chunks: int) -> Iterable[list[Path]]:
    if not items:
        return []
    chunk_size = math.ceil(len(items) / chunks)
    for i in range(0, len(items), chunk_size):
        yield items[i : i + chunk_size]


def write_bundle(bundle_paths: list[Path], index: int, total: int, out_dir: Path) -> dict:
    bundle_name = f"php-manual-bundle-{index:02d}-of-{total:02d}.html"
    output_path = out_dir / bundle_name

    toc_items: list[str] = []
    sections: list[str] = []
    page_entries: list[dict] = []

    for page in bundle_paths:
        title, content = extract_page_bits(page)
        slug = re.sub(r"[^a-zA-Z0-9]+", "-", page.stem).strip("-").lower() or page.stem
        canonical_url = to_manual_url(page)
        toc_items.append(f'<li><a href="#{slug}">{html.escape(title)}</a></li>')
        sections.append(
            "\n".join(
                [
                    f'<article id="{slug}" class="page">',
                    f"<h2>{html.escape(title)}</h2>",
                    f'<p><strong>Canonical source:</strong> <a href="{canonical_url}">{canonical_url}</a></p>',
                    f'<p class="source-file">Original file: <code>{html.escape(page.name)}</code></p>',
                    '<div class="content">',
                    content,
                    "</div>",
                    "</article>",
                ]
            )
        )
        page_entries.append({"file": page.name, "title": title, "url": canonical_url})

    template = f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <title>PHP Manual bundle {index}/{total}</title>
  <style>
    body {{ font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; margin: 2rem auto; max-width: 1100px; padding: 0 1rem; }}
    code {{ background: #f2f4f6; padding: 0.1rem 0.25rem; border-radius: 4px; }}
    article {{ border-top: 1px solid #ddd; padding-top: 1.5rem; margin-top: 1.5rem; }}
    nav ul {{ columns: 2; gap: 2rem; }}
    .source-file {{ color: #555; font-size: 0.95rem; }}
  </style>
</head>
<body>
  <header>
    <h1>PHP Manual (NotebookLM bundle {index} of {total})</h1>
    <p>This file contains merged pages from the official PHP manual. Each section includes a canonical php.net source URL so NotebookLM citations remain human-readable in source view.</p>
  </header>
  <nav>
    <h2>Pages in this bundle</h2>
    <ul>
      {''.join(toc_items)}
    </ul>
  </nav>
  {''.join(sections)}
</body>
</html>
"""
    output_path.write_text(template, encoding="utf-8")
    return {"bundle": bundle_name, "pages": page_entries}


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="php-manual-") as tmp:
        tmp_path = Path(tmp)
        archive = tmp_path / "php_manual_en.tar.gz"
        download(args.manual_url, archive)

        extract_root = tmp_path / "manual"
        extract_root.mkdir(parents=True, exist_ok=True)
        with tarfile.open(archive, "r:gz") as tf:
            tf.extractall(extract_root)

        pages = discover_pages(extract_root)
        if args.max_pages:
            pages = pages[: args.max_pages]

        if not pages:
            raise RuntimeError("No HTML pages found in extracted manual.")

        total_bundles = min(args.max_files, len(pages))
        bundles = list(chunked(pages, total_bundles))

        manifest = {
            "source": args.manual_url,
            "total_pages": len(pages),
            "bundle_count": len(bundles),
            "bundles": [],
        }

        for idx, bundle in enumerate(bundles, start=1):
            manifest["bundles"].append(write_bundle(bundle, idx, len(bundles), output_dir))

        (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"Wrote {manifest['bundle_count']} bundles and manifest to {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
