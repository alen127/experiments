import { gunzipSync, strFromU8, strToU8, zipSync } from 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js';

const state = {
  archiveBytes: null,
  archiveSource: null,
  zipBlob: null,
};

const el = {
  manualUrl: document.getElementById('manualUrl'),
  fetchBtn: document.getElementById('fetchBtn'),
  fileInput: document.getElementById('fileInput'),
  archiveInfo: document.getElementById('archiveInfo'),
  maxFiles: document.getElementById('maxFiles'),
  maxPages: document.getElementById('maxPages'),
  buildBtn: document.getElementById('buildBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  status: document.getElementById('status'),
};

const TITLE_RE = /<title>([\s\S]*?)<\/title>/i;
const MAIN_RE = /<div[^>]*id=["']layout-content["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i;
const BODY_RE = /<body[^>]*>([\s\S]*?)<\/body>/i;

function setStatus(text) {
  el.status.textContent = text;
}

function htmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function splitIntoChunks(items, chunkCount) {
  const size = Math.ceil(items.length / chunkCount);
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function decodeTar(tarBytes) {
  const out = [];
  let offset = 0;

  while (offset + 512 <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + 512);
    const name = strFromU8(header.subarray(0, 100)).replace(/\0.*$/, '');
    if (!name) break;

    const sizeOctal = strFromU8(header.subarray(124, 136)).replace(/\0.*$/, '').trim();
    const size = parseInt(sizeOctal || '0', 8);
    const typeflag = header[156];

    offset += 512;
    const content = tarBytes.subarray(offset, offset + size);

    if (typeflag === 48 || typeflag === 0) {
      out.push({ name, content });
    }

    offset += Math.ceil(size / 512) * 512;
  }

  return out;
}

function cleanTitle(rawTitle, fallback) {
  let title = rawTitle.replace(/\s+/g, ' ').trim();
  if (title.includes('::')) title = title.split('::', 1)[0].trim();
  if (title.includes('-') && title.includes('PHP')) title = title.split('-', 1)[0].trim();
  return title || fallback;
}

function extractPageBits(html, fallbackTitle) {
  const titleMatch = html.match(TITLE_RE);
  const title = titleMatch ? cleanTitle(titleMatch[1], fallbackTitle) : fallbackTitle;

  const mainMatch = html.match(MAIN_RE);
  if (mainMatch) return { title, content: mainMatch[1].trim() };

  const bodyMatch = html.match(BODY_RE);
  if (bodyMatch) return { title, content: bodyMatch[1].trim() };

  return { title, content: html };
}

function canonicalUrl(filename) {
  return `https://www.php.net/manual/en/${filename}`;
}

function renderBundle(bundlePages, index, total) {
  const toc = [];
  const sections = [];
  const entries = [];

  for (const page of bundlePages) {
    const slug = page.filename.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || page.filename;
    const source = canonicalUrl(page.filename);
    toc.push(`<li><a href="#${slug}">${htmlEscape(page.title)}</a></li>`);
    sections.push(
      `<article id="${slug}" class="page">` +
      `<h2>${htmlEscape(page.title)}</h2>` +
      `<p><strong>Canonical source:</strong> <a href="${source}">${source}</a></p>` +
      `<p class="source-file">Original file: <code>${htmlEscape(page.filename)}</code></p>` +
      `<div class="content">${page.content}</div>` +
      `</article>`
    );
    entries.push({ file: page.filename, title: page.title, url: source });
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>PHP Manual bundle ${index}/${total}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; margin: 2rem auto; max-width: 1100px; padding: 0 1rem; }
    code { background: #f2f4f6; padding: 0.1rem 0.25rem; border-radius: 4px; }
    article { border-top: 1px solid #ddd; padding-top: 1.5rem; margin-top: 1.5rem; }
    nav ul { columns: 2; gap: 2rem; }
    .source-file { color: #555; font-size: 0.95rem; }
  </style>
</head>
<body>
  <header>
    <h1>PHP Manual (NotebookLM bundle ${index} of ${total})</h1>
    <p>This file contains merged pages from the official PHP manual. Each section includes a canonical php.net source URL so NotebookLM citations remain human-readable in source view.</p>
  </header>
  <nav>
    <h2>Pages in this bundle</h2>
    <ul>${toc.join('')}</ul>
  </nav>
  ${sections.join('')}
</body>
</html>`;

  return { html, entries };
}

async function fetchArchive() {
  const url = el.manualUrl.value.trim();
  if (!url) {
    setStatus('Please enter a tarball URL.');
    return;
  }

  setStatus(`Downloading archive from URL...\n${url}`);
  el.fetchBtn.disabled = true;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();

    state.archiveBytes = new Uint8Array(buffer);
    state.archiveSource = url;
    el.archiveInfo.textContent = `Loaded ${state.archiveBytes.length.toLocaleString()} bytes from URL.`;
    el.buildBtn.disabled = false;
    setStatus('Archive loaded from URL. Ready to build.');
  } catch (error) {
    setStatus(`Failed to fetch URL archive: ${error.message}\nTip: use manual file upload instead.`);
  } finally {
    el.fetchBtn.disabled = false;
  }
}

function onFilePicked(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    state.archiveBytes = new Uint8Array(reader.result);
    state.archiveSource = `local-file:${file.name}`;
    el.archiveInfo.textContent = `Loaded ${file.name} (${state.archiveBytes.length.toLocaleString()} bytes).`;
    el.buildBtn.disabled = false;
    setStatus('Archive loaded from local file. Ready to build.');
  };
  reader.onerror = () => setStatus(`Failed to read file: ${reader.error?.message || 'unknown error'}`);
  reader.readAsArrayBuffer(file);
}

function build() {
  if (!state.archiveBytes) {
    setStatus('Load an archive first.');
    return;
  }

  const maxFiles = Math.max(1, Math.min(50, Number.parseInt(el.maxFiles.value, 10) || 50));
  const maxPages = Number.parseInt(el.maxPages.value, 10);

  setStatus('Decompressing .tar.gz...');

  try {
    const tarBytes = gunzipSync(state.archiveBytes);
    const files = decodeTar(tarBytes);

    const pageFiles = files
      .filter((f) => f.name.endsWith('.html'))
      .filter((f) => {
        const filename = f.name.split('/').pop();
        if (!filename) return false;
        if (filename.startsWith('_')) return false;
        return !['index.html', 'copyright.html'].includes(filename);
      })
      .map((f) => {
        const filename = f.name.split('/').pop();
        return {
          filename,
          html: strFromU8(f.content),
        };
      })
      .sort((a, b) => a.filename.localeCompare(b.filename));

    const boundedPages = Number.isFinite(maxPages) && maxPages > 0 ? pageFiles.slice(0, maxPages) : pageFiles;
    if (!boundedPages.length) throw new Error('No documentation pages found in archive.');

    setStatus(`Preparing ${boundedPages.length.toLocaleString()} pages across up to ${maxFiles} bundles...`);

    const pages = boundedPages.map((p) => {
      const pageBits = extractPageBits(p.html, p.filename.replace(/\.html$/i, ''));
      return { filename: p.filename, title: pageBits.title, content: pageBits.content };
    });

    const bundleCount = Math.min(maxFiles, pages.length);
    const chunks = splitIntoChunks(pages, bundleCount);

    const manifest = {
      source: state.archiveSource,
      total_pages: pages.length,
      bundle_count: chunks.length,
      bundles: [],
    };

    const zipEntries = {};

    chunks.forEach((chunk, idx) => {
      const bundleNumber = idx + 1;
      const name = `php-manual-bundle-${String(bundleNumber).padStart(2, '0')}-of-${String(chunks.length).padStart(2, '0')}.html`;
      const { html, entries } = renderBundle(chunk, bundleNumber, chunks.length);
      zipEntries[name] = strToU8(html);
      manifest.bundles.push({ bundle: name, pages: entries });
    });

    zipEntries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
    const zipped = zipSync(zipEntries, { level: 6 });
    state.zipBlob = new Blob([zipped], { type: 'application/zip' });

    el.downloadBtn.disabled = false;
    setStatus(
      `Done.\nCreated ${chunks.length} bundle HTML files + manifest.json.\nClick "Download zip" and upload those HTML files to NotebookLM.`
    );
  } catch (error) {
    setStatus(`Build failed: ${error.message}`);
  }
}

function downloadZip() {
  if (!state.zipBlob) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(state.zipBlob);
  link.download = 'php-notebooklm-bundles.zip';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

el.fetchBtn.addEventListener('click', fetchArchive);
el.fileInput.addEventListener('change', onFilePicked);
el.buildBtn.addEventListener('click', build);
el.downloadBtn.addEventListener('click', downloadZip);
