"use strict";

function enableSidePanel() {
  if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {
    // The in-page panel does not depend on the side panel.
  });
}

chrome.runtime.onInstalled.addListener(enableSidePanel);
enableSidePanel();
