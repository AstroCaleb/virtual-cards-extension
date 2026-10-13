// Firefox has no side panel, so the panel opens as a sidebar. Firefox only lets an
// extension open its sidebar straight from a click, which this listener is.
browser.action.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});
