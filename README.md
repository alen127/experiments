# PHP docs ➜ NotebookLM bundle builder

This repo now includes a script that converts the **official PHP manual HTML distribution** into NotebookLM-friendly inputs.

## Why this helps

- NotebookLM supports a maximum of 50 uploads per notebook.
- The PHP docs are split across thousands of pages.
- This script merges pages into up to 50 large `.html` files.
- Each merged section includes the **canonical php.net URL**, so citations are still readable in NotebookLM source view (instead of opaque raw text).

## Usage

```bash
python3 tools/build_notebooklm_php_manual.py --output-dir dist/php-notebooklm --max-files 50
```

### What it does

1. Downloads the official tarball from `https://www.php.net/distributions/manual/php_manual_en.tar.gz`.
2. Extracts HTML pages.
3. Splits them into evenly sized bundles.
4. Writes files like:
   - `php-manual-bundle-01-of-50.html`
   - ...
   - `php-manual-bundle-50-of-50.html`
5. Writes `manifest.json` listing every source page and which bundle it landed in.

## Notes

- Output is HTML (not raw `.txt`), which improves NotebookLM source readability.
- You can test quickly with fewer pages:

```bash
python3 tools/build_notebooklm_php_manual.py --max-pages 20 --max-files 3 --output-dir dist/smoke
```
