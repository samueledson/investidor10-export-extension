const TARGET_URL = "https://investidor10.com.br/wallet/my-wallet/positions";
const POSITIONS_PATH_PATTERN = /^\/wallet\/my-wallet(?:\/[^/]+)?\/positions\/?$/;

const statusEl = document.getElementById("status");
const sectionCountEl = document.getElementById("section-count");
const rowCountEl = document.getElementById("row-count");
const warningsEl = document.getElementById("warnings");
const expandButton = document.getElementById("expand-button");
const csvButton = document.getElementById("csv-button");
const pdfButton = document.getElementById("pdf-button");

let activeTabId = null;
let latestExport = null;
let refreshTimer = null;
let isBusy = false;

document.addEventListener("DOMContentLoaded", initialize);
expandButton.addEventListener("click", expandAllSections);
csvButton.addEventListener("click", () => exportData("EXPORT_CSV"));
pdfButton.addEventListener("click", () => exportData("EXPORT_PDF"));

async function initialize() {
  syncToolbarIconWithColorScheme();
  setBusy(true, "Verificando página...");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;

  if (!tab?.url || !isAcceptedPositionsUrl(tab.url)) {
    setBusy(false);
    setUnavailableWithTargetLink("Abra a página de Posições da carteira do Investidor10 para exportar.");
    return;
  }

  await refreshData({ force: true });
  refreshTimer = window.setInterval(() => refreshData({ silent: true }), 2000);
  setBusy(false);
}

function isAcceptedPositionsUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.endsWith("investidor10.com.br")
      && POSITIONS_PATH_PATTERN.test(parsedUrl.pathname);
  } catch (_error) {
    return false;
  }
}

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

async function exportData(action) {
  if (isBusy || !latestExport) {
    return;
  }

  const label = action === "EXPORT_CSV" ? "CSV" : "PDF";
  setBusy(true, `Gerando ${label}...`);

  const response = await sendAction(action);
  if (!response.ok) {
    setBusy(false);
    setUnavailable(response.error || `Não foi possível gerar o ${label}.`);
    return;
  }

  const warnings = response.warnings || latestExport.warnings || [];
  setBusy(false);
  renderSummary(response.data || latestExport, warnings);
  statusEl.textContent = `${label} exportado com sucesso.`;
}

async function expandAllSections() {
  if (isBusy || !latestExport) {
    return;
  }

  setBusy(true, "Expandindo todos os tipos de ativo...");

  const response = await sendAction("EXPAND_ALL_SECTIONS");
  if (!response.ok) {
    setBusy(false);
    setUnavailable(response.error || "Não foi possível expandir as tabelas.");
    return;
  }

  latestExport = response.data;
  setBusy(false);
  renderSummary(latestExport, response.warnings || latestExport.warnings || []);
  statusEl.textContent = "Tabelas expandidas e contadores atualizados.";
}

async function refreshData(options = {}) {
  if (isBusy && !options.force) {
    return;
  }

  const response = await sendAction("EXTRACT_POSITIONS");
  if (!response.ok) {
    if (!options.silent) {
      setUnavailable(response.error || "Não foi possível ler as posições da página.");
    }
    return;
  }

  latestExport = response.data;
  renderSummary(latestExport, response.warnings || latestExport.warnings || []);
}

async function sendAction(action) {
  const message = { action };

  try {
    return await chrome.tabs.sendMessage(activeTabId, message);
  } catch (firstError) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        files: ["content.js"]
      });
      return await chrome.tabs.sendMessage(activeTabId, message);
    } catch (secondError) {
      return { ok: false, error: secondError.message };
    }
  }
}

function renderSummary(data, warnings) {
  const sectionCount = data.sections.length;
  const rowCount = data.sections.reduce((total, section) => total + section.rowCount, 0);

  sectionCountEl.textContent = String(sectionCount);
  rowCountEl.textContent = String(rowCount);
  statusEl.textContent = sectionCount
    ? `Pronto para exportar ${rowCount} posições.`
    : "Nenhuma tabela de posições encontrada.";

  warningsEl.replaceChildren();
  warningsEl.hidden = warnings.length === 0;
  for (const warning of warnings) {
    const p = document.createElement("p");
    p.textContent = warning;
    warningsEl.appendChild(p);
  }

  toggleActions(sectionCount > 0);
}

function setBusy(busy, message) {
  isBusy = busy;
  if (message) {
    statusEl.textContent = message;
  }
  toggleActions(Boolean(latestExport?.sections?.length));
}

function setUnavailable(message) {
  isBusy = false;
  statusEl.textContent = message;
  sectionCountEl.textContent = "-";
  rowCountEl.textContent = "-";
  warningsEl.hidden = true;
  warningsEl.replaceChildren();
  toggleActions(false);
}

function setUnavailableWithTargetLink(message) {
  setUnavailable("");
  statusEl.replaceChildren(document.createTextNode(`${message} `));

  const link = document.createElement("a");
  link.href = TARGET_URL;
  link.textContent = "Abrir página";
  link.target = "_blank";
  link.rel = "noreferrer";
  link.addEventListener("click", (event) => {
    event.preventDefault();
    chrome.tabs.update({ url: TARGET_URL });
    window.close();
  });

  statusEl.appendChild(link);
}

function toggleActions(enabled) {
  const disabled = isBusy || !enabled;
  expandButton.disabled = disabled;
  csvButton.disabled = disabled;
  pdfButton.disabled = disabled;
}
