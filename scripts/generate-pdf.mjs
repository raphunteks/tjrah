// Generator PDF Resmi Dokumen PENJELASAN.MD Harum.in
// Mengonversi berkas PENJELASAN.MD ke HTML berformat cetak eksekutif lalu mencetak ke PENJELASAN.PDF via Chrome headless.
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MD_FILE = path.join(ROOT, "PENJELASAN.MD");
const OUT_PDF = path.join(ROOT, "PENJELASAN.PDF");
const TEMP_HTML = path.join(ROOT, ".tmp_penjelasan.html");

const mdContent = readFileSync(MD_FILE, "utf8");

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseMarkdown(md) {
  const lines = md.split("\n");
  const html = [];
  let inCodeBlock = false;
  let codeBuffer = [];
  let inTable = false;
  let tableHeader = false;
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        if (inList) { html.push("</ul>"); inList = false; }
        if (inTable) { html.push("</tbody></table></div>"); inTable = false; }
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      continue;
    }

    // Table rows
    if (line.startsWith("|") && line.endsWith("|")) {
      if (inList) { html.push("</ul>"); inList = false; }
      const cells = line.slice(1, -1).split("|").map((c) => c.trim());
      // Check if separator line
      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        tableHeader = false;
        continue;
      }
      if (!inTable) {
        html.push('<div class="table-container"><table><thead><tr>');
        for (const cell of cells) {
          html.push(`<th>${formatInline(cell)}</th>`);
        }
        html.push('</tr></thead><tbody>');
        inTable = true;
        tableHeader = true;
        continue;
      } else {
        html.push('<tr>');
        for (const cell of cells) {
          html.push(`<td>${formatInline(cell)}</td>`);
        }
        html.push('</tr>');
        continue;
      }
    } else {
      if (inTable) {
        html.push('</tbody></table></div>');
        inTable = false;
      }
    }

    // Empty lines
    if (!line) {
      if (inList) { html.push("</ul>"); inList = false; }
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<h1 id="${slugify(line.slice(2))}">${formatInline(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith("## ")) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<h2 id="${slugify(line.slice(3))}">${formatInline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("### ")) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<h3 id="${slugify(line.slice(4))}">${formatInline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("#### ")) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<h4 id="${slugify(line.slice(5))}">${formatInline(line.slice(5))}</h4>`);
      continue;
    }

    // Horizontal rule
    if (line === "---" || line === "***") {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push("<hr />");
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<blockquote>${formatInline(line.slice(2))}</blockquote>`);
      continue;
    }

    // Unordered lists
    if (line.startsWith("* ") || line.startsWith("- ")) {
      if (!inList) { html.push("<ul>"); inList = true; }
      html.push(`<li>${formatInline(line.slice(2))}</li>`);
      continue;
    }

    // Ordered list (simplified)
    const numMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<p class="ordered-item"><span class="list-num">${numMatch[1]}.</span> ${formatInline(numMatch[2])}</p>`);
      continue;
    }

    // Regular paragraphs
    if (inList) { html.push("</ul>"); inList = false; }
    html.push(`<p>${formatInline(line)}</p>`);
  }

  if (inTable) html.push("</tbody></table></div>");
  if (inList) html.push("</ul>");

  return html.join("\n");
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatInline(text) {
  return text
    // Bold
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

const parsedBody = parseMarkdown(mdContent);

const fullHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>DOKUMEN RBAC & DIREKTORI FITUR LENGKAP TIJARAH</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 15mm 20mm 15mm;
      @bottom-right {
        content: counter(page);
      }
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 9.5pt;
      line-height: 1.55;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }
    .header-banner {
      border-bottom: 3px solid #0B5D4B;
      padding-bottom: 12px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 18pt;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 6px 0;
      letter-spacing: -0.02em;
    }
    h2 {
      font-size: 13.5pt;
      font-weight: 700;
      color: #0B5D4B;
      margin: 22px 0 10px 0;
      padding-bottom: 4px;
      border-bottom: 1px solid #a7f3d0;
      page-break-after: avoid;
    }
    h3 {
      font-size: 11pt;
      font-weight: 600;
      color: #0f172a;
      margin: 16px 0 6px 0;
      page-break-after: avoid;
    }
    h4 {
      font-size: 10pt;
      font-weight: 600;
      color: #334155;
      margin: 12px 0 4px 0;
      page-break-after: avoid;
    }
    p {
      margin: 0 0 8px 0;
    }
    strong {
      color: #0f172a;
      font-weight: 600;
    }
    hr {
      border: 0;
      border-top: 1px dashed #cbd5e1;
      margin: 16px 0;
    }
    blockquote {
      margin: 10px 0;
      padding: 8px 12px;
      background: #f0fdf4;
      border-left: 4px solid #10b981;
      border-radius: 0 4px 4px 0;
      font-size: 9pt;
      color: #064e3b;
    }
    pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 10px 14px;
      border-radius: 6px;
      font-family: ui-monospace, Menlo, Monaco, "Courier New", monospace;
      font-size: 8pt;
      line-height: 1.4;
      overflow-x: auto;
      margin: 10px 0;
      page-break-inside: avoid;
    }
    code {
      font-family: ui-monospace, Menlo, Monaco, monospace;
      font-size: 8.5pt;
      background: #f1f5f9;
      color: #0f172a;
      padding: 1px 4px;
      border-radius: 3px;
      border: 1px solid #e2e8f0;
    }
    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
      border: 0;
    }
    ul {
      margin: 4px 0 10px 0;
      padding-left: 20px;
    }
    li {
      margin-bottom: 4px;
    }
    .ordered-item {
      margin-bottom: 4px;
      padding-left: 4px;
    }
    .list-num {
      font-weight: 600;
      color: #0B5D4B;
    }
    /* Tables */
    .table-container {
      width: 100%;
      margin: 12px 0;
      overflow: hidden;
      page-break-inside: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin: 0;
      page-break-inside: auto;
    }
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 5px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      font-weight: 600;
      color: #0f172a;
    }
    tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    .footer-note {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      font-size: 8pt;
      color: #64748b;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header-banner">
    <div style="display: flex; justify-content: space-between; align-items: baseline;">
      <span style="font-weight: 700; font-size: 15pt; color: #0B5D4B; letter-spacing: -0.01em;">TIJARAH</span>
      <span style="font-size: 8.5pt; color: #64748b; text-transform: uppercase; font-weight: 600;">Smart Trade, Better Business · Cloud OS & POS Multi-Tenant</span>
    </div>
  </div>

  ${parsedBody}

  <div class="footer-note">
    Dokumen Arsitektur Sistem & Direktori Hak Akses RBAC Resmi · Platform Tijarah Cloud OS · Dokumen Paripurna Versi 3.1
  </div>
</body>
</html>
`;

writeFileSync(TEMP_HTML, fullHtml, "utf8");

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
console.log(`Mengonversi HTML ke ${OUT_PDF} via Google Chrome headless...`);

try {
  execSync(`"${chromePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${OUT_PDF}" "${TEMP_HTML}"`, { stdio: "inherit" });
  console.log(`✓ PDF berhasil dibuat: ${OUT_PDF}`);
} catch (e) {
  console.error("Gagal mengonversi PDF via Chrome:", e.message);
  process.exit(1);
} finally {
  try {
    if (existsSync(TEMP_HTML)) unlinkSync(TEMP_HTML);
  } catch {
    // abaikan jika pembersihan gagal
  }
}

