const TARGET_URL = "https://investidor10.com.br/wallet/my-wallet/positions";
const WALLET_HOST = "investidor10.com.br";
const PAGE_PATTERNS = {
  positions: /^\/wallet\/my-wallet(?:\/[^/]+)?\/positions\/?$/i,
  transactions: /^\/wallet\/my-wallet\/[^/]+\/entries\/?$/i,
  dividends: /^\/wallet\/my-wallet\/[^/]+\/earnings\/?$/i
};
const PAGE_LABELS = {
  positions: "Posições",
  transactions: "Lançamentos",
  dividends: "Proventos"
};

const statusEl = document.getElementById("status");
const sectionCountEl = document.getElementById("section-count");
const rowCountEl = document.getElementById("row-count");
const warningsEl = document.getElementById("warnings");
const earningsFilterNoticeEl = document.getElementById("earnings-filter-notice");
const pageKindEl = document.getElementById("page-kind");
const walletLinksEl = document.getElementById("wallet-links");
const expandButton = document.getElementById("expand-button");
const csvButton = document.getElementById("csv-button");
const pdfButton = document.getElementById("pdf-button");

let activeTabId = null;
let latestExport = null;
let refreshTimer = null;
let isBusy = false;

document.addEventListener("DOMContentLoaded", initialize);
expandButton.addEventListener("click", expandAllSections);
csvButton.addEventListener("click", () => exportData("EXPORT_CURRENT_CSV"));
pdfButton.addEventListener("click", () => exportData("EXPORT_CURRENT_PDF"));

async function initialize() {
  syncToolbarIconWithColorScheme();
  setBusy(true, "Verificando página...");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;

  if (!tab?.url || !isAcceptedWalletUrl(tab.url)) {
    setBusy(false);
    setUnavailableWithTargetLink("Abra uma aba de Posições, Lançamentos ou Proventos da carteira do Investidor10 para exportar.");
    return;
  }

  expandButton.textContent = getPageTypeFromUrl(tab.url) === "positions"
    ? "Expandir tudo"
    : "Carregar todas as páginas";
  earningsFilterNoticeEl.hidden = getPageTypeFromUrl(tab.url) !== "dividends";

  await refreshData({ force: true });
  await loadWalletLinks();
  refreshTimer = window.setInterval(() => refreshData({ silent: true }), 2000);
  setBusy(false);
}

function getPageTypeFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname !== WALLET_HOST) {
      return null;
    }
    return Object.entries(PAGE_PATTERNS).find(([, pattern]) => pattern.test(parsedUrl.pathname))?.[0] || null;
  } catch (_error) {
    return null;
  }
}

function isAcceptedWalletUrl(url) {
  return Boolean(getPageTypeFromUrl(url));
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

  const label = action.endsWith("CSV") ? "CSV" : "PDF";
  setBusy(true, `Gerando ${label}...`);

  const response = await sendAction(action, latestExport?.allPages ? { data: latestExport } : {});
  if (!response.ok) {
    setBusy(false);
    setUnavailable(response.error || `Não foi possível gerar o ${label}.`);
    return;
  }

  const warnings = response.warnings || latestExport.warnings || [];
  if (response.data?.allPages) {
    stopRefreshTimer();
  }
  setBusy(false);
  renderSummary(response.data || latestExport, warnings);
  statusEl.textContent = `${label} exportado com sucesso.`;
}

async function expandAllSections() {
  if (isBusy || !latestExport) {
    return;
  }

  setBusy(true, expandButton.textContent === "Expandir tudo" ? "Expandindo todos os tipos de ativo..." : "Carregando todas as páginas...");

  const response = await sendAction("EXPAND_ALL");
  if (!response.ok) {
    setBusy(false);
    setUnavailable(response.error || "Não foi possível expandir as tabelas.");
    return;
  }

  latestExport = response.data;
  if (latestExport?.allPages) {
    stopRefreshTimer();
  }
  setBusy(false);
  renderSummary(latestExport, response.warnings || latestExport.warnings || []);
  statusEl.textContent = expandButton.textContent === "Expandir tudo"
    ? "Tabelas expandidas e contadores atualizados."
    : "Todas as páginas foram carregadas e os contadores atualizados.";
}

async function refreshData(options = {}) {
  if ((isBusy || latestExport?.allPages) && !options.force) {
    return;
  }

  const response = await sendAction("EXTRACT_CURRENT");
  if (!response.ok) {
    if (!options.silent) {
      setUnavailable(response.error || "Não foi possível ler as posições da página.");
    }
    return;
  }

  latestExport = response.data;
  renderSummary(latestExport, response.warnings || latestExport.warnings || []);
}

function stopRefreshTimer() {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

async function sendAction(action, extra = {}) {
  const message = { action, ...extra };

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
    ? `Pronto para exportar ${rowCount} registros de ${String(data.title || "dados").toLowerCase()}.`
    : `Nenhuma tabela de ${String(data.title || "dados").toLowerCase()} encontrada.`;
  pageKindEl.textContent = PAGE_LABELS[data.pageType] || data.title || "";
  earningsFilterNoticeEl.hidden = data.pageType !== "dividends";

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
  pageKindEl.textContent = "";
  walletLinksEl.hidden = true;
  walletLinksEl.replaceChildren();
  toggleActions(false);
}

async function loadWalletLinks() {
  const response = await sendAction("GET_WALLET_LINKS");
  if (!response.ok || !response.links) {
    return;
  }

  renderWalletLinks(response.links);
}

function renderWalletLinks(links) {
  walletLinksEl.replaceChildren();
  for (const link of links) {
    const anchor = document.createElement("a");
    anchor.href = link.href;
    anchor.textContent = `Abrir ${link.label}`;
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      chrome.tabs.update({ url: link.href });
      window.close();
    });
    walletLinksEl.appendChild(anchor);
  }
  walletLinksEl.hidden = links.length === 0;
}

function setUnavailableWithTargetLink(message) {
  setUnavailable(message);
  renderWalletLinks([
    { label: "Posições", href: TARGET_URL },
    { label: "Dividendos", href: "https://investidor10.com.br/wallet/my-wallet/pro/earnings" },
    { label: "Lançamentos", href: "https://investidor10.com.br/wallet/my-wallet/pro/entries" }
  ]);
}

function toggleActions(enabled) {
  const disabled = isBusy || !enabled;
  expandButton.disabled = disabled;
  csvButton.disabled = disabled;
  pdfButton.disabled = disabled;
}
