(function registerInvestidor10Exporter() {
  const POSITIONS_PATH_PATTERN = /^\/wallet\/my-wallet(?:\/[^/]+)?\/positions\/?$/;
  const EXPORT_BASENAME = "investidor10-posicoes";

  if (globalThis.__investidor10ExporterRegistered) {
    return;
  }
  globalThis.__investidor10ExporterRegistered = true;
  syncToolbarIconWithColorScheme();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (!message || !message.action) {
        return false;
      }

      if (message.action === "EXTRACT_POSITIONS") {
        const data = extractPortfolio();
        sendResponse({ ok: true, data, warnings: data.warnings });
        return false;
      }

      if (message.action === "EXPAND_ALL_SECTIONS") {
        expandAllSections()
          .then(() => {
            const data = extractPortfolio();
            sendResponse({ ok: true, data, warnings: data.warnings });
          })
          .catch((error) => {
            sendResponse({ ok: false, error: error.message || "Erro inesperado ao expandir tabelas." });
          });
        return true;
      }

      if (message.action === "EXPORT_CSV") {
        const data = extractPortfolio();
        downloadTextBlob(buildCsv(data), `${EXPORT_BASENAME}-${dateStamp()}.csv`, "text/csv;charset=utf-8");
        sendResponse({ ok: true, data, warnings: data.warnings });
        return false;
      }

      if (message.action === "EXPORT_PDF") {
        const data = extractPortfolio();
        downloadBinaryBlob(buildPdf(data), `${EXPORT_BASENAME}-${dateStamp()}.pdf`, "application/pdf");
        sendResponse({ ok: true, data, warnings: data.warnings });
        return false;
      }

      sendResponse({ ok: false, error: "Acao desconhecida." });
      return false;
    } catch (error) {
      sendResponse({ ok: false, error: error.message || "Erro inesperado ao exportar." });
      return false;
    }
  });

  function syncToolbarIconWithColorScheme() {
    const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateIcon = () => {
      chrome.runtime.sendMessage({
        action: "SET_COLOR_SCHEME_ICON",
        scheme: colorSchemeQuery.matches ? "dark" : "light"
      });
    };

    updateIcon();
    colorSchemeQuery.addEventListener?.("change", updateIcon);
  }

  function extractPortfolio() {
    validatePositionPage();

    const tables = Array.from(document.querySelectorAll(".section-actives table, table"))
      .filter((table) => table.closest(".section-actives") || table.querySelector("tbody tr"));
    const sections = tables
      .map(extractSection)
      .filter((section) => section.headers.length > 0);

    if (sections.length === 0) {
      throw new Error("Nenhuma tabela de posições foi encontrada. Aguarde a página carregar e tente novamente.");
    }

    const warnings = [];
    for (const section of sections) {
      if (Number.isInteger(section.expectedCount) && section.expectedCount !== section.rowCount) {
        warnings.push(`${section.name}: cabeçalho indica ${section.expectedCount} ativos, mas ${section.rowCount} linhas foram capturadas.`);
      }
    }

    return {
      exportedAt: new Date().toISOString(),
      sourceUrl: location.href,
      sections,
      warnings
    };
  }

  async function expandAllSections() {
    validatePositionPage();

    const triggers = Array.from(document.querySelectorAll(".Collapsible__trigger, [class*='Collapsible__trigger']"));
    const closedTriggers = triggers.filter(isClosedTrigger);

    for (const trigger of closedTriggers) {
      trigger.click();
    }

    if (closedTriggers.length > 0) {
      await waitForTableRender();
    }
  }

  function validatePositionPage() {
    if (!location.hostname.endsWith("investidor10.com.br") || !POSITIONS_PATH_PATTERN.test(location.pathname)) {
      throw new Error("Abra a página de Posições da carteira do Investidor10.");
    }
  }

  function isClosedTrigger(trigger) {
    const className = String(trigger.className || "");
    const ariaExpanded = trigger.getAttribute("aria-expanded");
    return className.includes("is-closed") || ariaExpanded === "false";
  }

  function waitForTableRender() {
    return new Promise((resolve) => {
      window.setTimeout(resolve, 450);
    });
  }

  function extractSection(table, index) {
    const summaryText = findSectionSummary(table);
    const parsedSummary = parseSectionSummary(summaryText, index);
    const rawHeaders = Array.from(table.querySelectorAll("thead th, tr th")).map((cell) => normalizeText(cell.innerText || cell.textContent));
    const rowsAsCells = Array.from(table.querySelectorAll("tbody tr"))
      .map((row) => Array.from(row.children).map((cell) => normalizeText(cell.innerText || cell.textContent)));

    const headers = rawHeaders.length > 0
      ? rawHeaders
      : inferHeadersFromFirstRow(rowsAsCells);
    const exportIndexes = headers
      .map((header, headerIndex) => ({ header, headerIndex }))
      .filter(({ header, headerIndex }) => shouldExportColumn(header, rowsAsCells, headerIndex));

    const rows = rowsAsCells
      .filter((cells) => cells.some(Boolean))
      .map((cells) => {
        const row = {};
        for (const { header, headerIndex } of exportIndexes) {
          row[header] = cells[headerIndex] || "";
        }
        return row;
      });

    return {
      name: parsedSummary.name,
      summaryText,
      expectedCount: parsedSummary.expectedCount,
      rowCount: rows.length,
      headers: exportIndexes.map(({ header }) => header),
      rows
    };
  }

  function findSectionSummary(table) {
    let node = table;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const trigger = node.querySelector?.(".Collapsible__trigger, [class*='Collapsible__trigger']");
      if (trigger) {
        return normalizeText(trigger.innerText || trigger.textContent);
      }
      node = node.parentElement;
    }

    let sibling = table.previousElementSibling;
    for (let depth = 0; depth < 8 && sibling; depth += 1) {
      const text = normalizeText(sibling.innerText || sibling.textContent);
      if (/\bAtivos\s+\d+\b/.test(text)) {
        return text;
      }
      sibling = sibling.previousElementSibling;
    }

    return "";
  }

  function parseSectionSummary(summaryText, index) {
    const match = summaryText.match(/^(.*?)\s+Ativos\s+(\d+)\b/i);
    if (!match) {
      return {
        name: `Tipo de ativo ${index + 1}`,
        expectedCount: null
      };
    }

    return {
      name: match[1].trim(),
      expectedCount: Number.parseInt(match[2], 10)
    };
  }

  function formatSectionSummary(section) {
    const summaryText = normalizeText(section.summaryText);
    if (!summaryText) {
      return `${section.rowCount} posições`;
    }

    const prefix = `${section.name} `;
    const details = summaryText.startsWith(prefix)
      ? summaryText.slice(prefix.length)
      : summaryText;

    return details
      .replace(/\s+(Ativos)\s+(\d+)/g, ", $1 $2")
      .replace(/\s+(Valor total)\s+/g, ", $1 ")
      .replace(/\s+(Variação)\s+/g, ", $1 ")
      .replace(/\s+(Rentabilidade)\s+/g, ", $1 ")
      .replace(/\s+(% na carteira)\s+/g, ", $1 ")
      .replace(/^,\s*/, "")
      .trim();
  }

  function inferHeadersFromFirstRow(rowsAsCells) {
    const firstRow = rowsAsCells.find((cells) => cells.length > 0) || [];
    return firstRow.map((_cell, index) => `Coluna ${index + 1}`);
  }

  function shouldExportColumn(header, rowsAsCells, headerIndex) {
    if (!header) {
      return false;
    }

    if (header.toLowerCase() !== "opcoes" && header.toLowerCase() !== "opções") {
      return true;
    }

    return rowsAsCells.some((cells) => Boolean(cells[headerIndex]));
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildCsv(data) {
    const headers = unionHeaders(data.sections);
    const lines = [["Tipo de ativo", ...headers].map(csvEscape).join(";")];

    for (const section of data.sections) {
      for (const row of section.rows) {
        lines.push([section.name, ...headers.map((header) => row[header] || "")].map(csvEscape).join(";"));
      }
    }

    return `\ufeff${lines.join("\r\n")}\r\n`;
  }

  function unionHeaders(sections) {
    const seen = new Set();
    const headers = [];

    for (const section of sections) {
      for (const header of section.headers) {
        if (!seen.has(header)) {
          seen.add(header);
          headers.push(header);
        }
      }
    }

    return headers;
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (/[;"\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function buildPdf(data) {
    const doc = createPdfDocument();
    const state = { page: doc.addPage() };
    const margin = 34;
    const contentWidth = state.page.width - margin * 2;
    let y = state.page.height - margin;

    y = doc.text(state.page, "Investidor10 - Posições", margin, y, { size: 15, font: "bold" });
    y = doc.text(state.page, `Exportado em: ${formatDateTime(data.exportedAt)}`, margin, y - 8, { size: 8 });
    y = doc.text(state.page, `Origem: ${data.sourceUrl}`, margin, y - 4, { size: 8, maxWidth: contentWidth });
    y -= 10;

    y = ensureSpace(doc, state, y, 40);
    y = doc.text(state.page, "Resumo por tipo de ativo", margin, y, { size: 10, font: "bold" });
    for (const section of data.sections) {
      y = ensureSpace(doc, state, y, 18);
      y = doc.text(state.page, `${section.name}: ${formatSectionSummary(section)}`, margin, y - 2, {
        size: 7,
        maxWidth: contentWidth
      });
    }
    y -= 14;

    for (const section of data.sections) {
      y = ensureSpace(doc, state, y, 72);
      y = doc.text(state.page, section.name, margin, y, { size: 11, font: "bold" });
      if (section.summaryText) {
        y = doc.text(state.page, formatSectionSummary(section), margin, y - 2, { size: 7, maxWidth: contentWidth });
      }
      y -= 8;

      const headers = section.headers;
      const columnWidths = computePdfColumnWidths(headers, contentWidth);
      y = drawPdfRow(doc, state.page, y, margin, headers, columnWidths, { header: true });

      for (const row of section.rows) {
        y = ensureSpace(doc, state, y, 14);
        y = drawPdfRow(doc, state.page, y, margin, headers.map((header) => row[header] || ""), columnWidths, { header: false });
      }
      y -= 16;
    }

    return doc.finish();
  }

  function computePdfColumnWidths(headers, contentWidth) {
    const firstColumnWidth = Math.min(145, Math.max(90, contentWidth * 0.2));
    const remaining = contentWidth - firstColumnWidth;
    const otherCount = Math.max(headers.length - 1, 1);
    const otherWidth = remaining / otherCount;
    return headers.map((_header, index) => index === 0 ? firstColumnWidth : otherWidth);
  }

  function drawPdfRow(doc, page, y, x, values, widths, options) {
    const size = options.header ? 6.2 : 5.8;
    const font = options.header ? "bold" : "regular";
    const rowHeight = options.header ? 22 : 13;
    const topY = y;
    const textY = options.header ? topY - 8 : topY - 10;
    let cursorX = x;

    values.forEach((value, index) => {
      const width = widths[index] || 42;
      const text = truncateForWidth(String(value || ""), width, size);
      doc.cell(page, cursorX, topY - rowHeight, width, rowHeight, { header: options.header });
      doc.text(page, text, cursorX + 2, textY, { size, font, maxWidth: Math.max(8, width - 4) });
      cursorX += width;
    });

    return topY - rowHeight;
  }

  function truncateForWidth(value, width, size) {
    const maxChars = Math.max(4, Math.floor(width / (size * 0.48)));
    if (value.length <= maxChars) {
      return value;
    }
    return `${value.slice(0, Math.max(1, maxChars - 3))}...`;
  }

  function ensureSpace(doc, state, y, requiredHeight) {
    if (y >= 34 + requiredHeight) {
      return y;
    }

    state.page = doc.addPage();
    return state.page.height - 34;
  }

  function createPdfDocument() {
    const pages = [];
    const fonts = {
      regular: "F1",
      bold: "F2"
    };

    return {
      addPage() {
        const page = {
          width: 842,
          height: 595,
          commands: []
        };
        pages.push(page);
        return page;
      },
      text(page, text, x, y, options = {}) {
        const size = options.size || 9;
        const fontName = fonts[options.font || "regular"];
        const lines = wrapPdfText(text, options.maxWidth, size);
        let cursorY = y;

        for (const line of lines) {
          page.commands.push(`BT /${fontName} ${size} Tf ${x.toFixed(2)} ${cursorY.toFixed(2)} Td (${escapePdfString(line)}) Tj ET`);
          cursorY -= size + 2;
        }

        return cursorY;
      },
      cell(page, x, y, width, height, options = {}) {
        if (options.header) {
          page.commands.push(`q 0.94 g ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f Q`);
        }
        page.commands.push(`q 0.74 G 0.35 w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S Q`);
      },
      finish() {
        return writePdf(pages);
      }
    };
  }

  function wrapPdfText(text, maxWidth, size) {
    const value = String(text || "");
    if (!maxWidth) {
      return [value];
    }

    const maxChars = Math.max(8, Math.floor(maxWidth / (size * 0.48)));
    if (value.length <= maxChars) {
      return [value];
    }

    const words = value.split(" ");
    const lines = [];
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
        }
        current = word.length > maxChars ? `${word.slice(0, maxChars - 3)}...` : word;
      }
    }

    if (current) {
      lines.push(current);
    }

    return lines;
  }

  function writePdf(pages) {
    const objects = [];
    const addObject = (body) => {
      objects.push(body);
      return objects.length;
    };

    const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
    const pagesId = addObject("");
    const regularFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const pageIds = [];

    for (const page of pages) {
      const stream = page.commands.join("\n");
      const contentId = addObject(`<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`);
      const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
    }

    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

    const chunks = ["%PDF-1.4\n"];
    const offsets = [0];
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(byteLength(chunks.join("")));
      chunks.push(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`);
    }

    const xrefOffset = byteLength(chunks.join(""));
    chunks.push(`xref\n0 ${objects.length + 1}\n`);
    chunks.push("0000000000 65535 f \n");
    for (let index = 1; index < offsets.length; index += 1) {
      chunks.push(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
    }
    chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    return new Blob(chunks, { type: "application/pdf" });
  }

  function escapePdfString(value) {
    let escaped = "";

    for (const character of String(value)) {
      const replacement = unicodeToWinAnsiReplacement(character);
      for (let index = 0; index < replacement.length; index += 1) {
        escaped += pdfByteEscape(replacement.charCodeAt(index));
      }
    }

    return escaped;
  }

  function unicodeToWinAnsiReplacement(character) {
    const codePoint = character.codePointAt(0);
    const replacements = {
      0x2013: "-",
      0x2014: "-",
      0x2018: "'",
      0x2019: "'",
      0x201c: "\"",
      0x201d: "\"",
      0x2026: "..."
    };

    if (replacements[codePoint]) {
      return replacements[codePoint];
    }

    if (codePoint <= 0xff) {
      return character;
    }

    return "?";
  }

  function pdfByteEscape(code) {
    if (code === 0x28 || code === 0x29 || code === 0x5c) {
      return `\\${String.fromCharCode(code)}`;
    }

    if (code < 0x20 || code > 0x7e) {
      return `\\${code.toString(8).padStart(3, "0")}`;
    }

    return String.fromCharCode(code);
  }

  function byteLength(value) {
    return new Blob([value]).size;
  }

  function formatDateTime(isoDate) {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(isoDate));
  }

  function dateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function downloadTextBlob(text, filename, type) {
    downloadBinaryBlob(new Blob([text], { type }), filename, type);
  }

  function downloadBinaryBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.documentElement.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
})();
