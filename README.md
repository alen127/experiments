> [!NOTE]
> This is exclusively a **vibes only** repo - a playground for cloud based autonomous coding agents like Codex Web and Claude Code Web.

# PHP docs ➜ NotebookLM (GitHub Pages web app)

You asked for **no CLI hassle**. This project is now a browser app you can host on GitHub Pages.

## What changed

- A static web app lives in `docs/`.
- It runs fully in-browser (no backend, no local Python needed).
- It converts the official PHP manual tarball into NotebookLM-ready HTML bundles.
- Every merged section includes the canonical `php.net` URL so NotebookLM citations are readable in source view.

## Use it

After GitHub Pages is enabled for this repo, open your site and:

1. Click **Fetch from URL** (or upload a local `php_manual_en.tar.gz` file).
2. Set max bundles (default 50).
3. Click **Build bundle zip**.
4. Click **Download zip** and upload the generated HTML files to NotebookLM.

## Hosting on GitHub Pages

This repo includes `.github/workflows/pages.yml` to deploy `docs/` automatically.

- Push to `main`.
- In GitHub repo settings, ensure Pages uses **GitHub Actions**.
- Your app will be published at `https://<user>.github.io/<repo>/`.

## Local preview (optional)

If you want to test locally:

```bash
python3 -m http.server 8080 --directory docs
```

Then open `http://localhost:8080`.
