// Opens the side panel when the toolbar icon is clicked. onClicked only fires
// because the action deliberately has no default_popup.
chrome.action.onClicked.addListener(async tab => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});
