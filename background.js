const ICONS = {
  dark: "icon-dark.png",
  light: "icon-light.png"
};

chrome.runtime.onInstalled.addListener(() => {
  setActionIcon("light");
});

chrome.runtime.onStartup.addListener(() => {
  setActionIcon("light");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== "SET_COLOR_SCHEME_ICON") {
    return false;
  }

  setActionIcon(message.scheme === "dark" ? "dark" : "light")
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

function setActionIcon(scheme) {
  return chrome.action.setIcon({
    path: {
      24: ICONS[scheme]
    }
  });
}
