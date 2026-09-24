// Lexical data must retain the capitalization and spelling the user enters.
export function disableAutomaticTextChanges() {
  const selector = "input, textarea, [contenteditable]";
  const configure = (element: Element) => {
    element.setAttribute("autocapitalize", "off");
    element.setAttribute("autocorrect", "off");
  };
  const configureTree = (root: Element) => {
    if (root.matches(selector)) configure(root);
    root.querySelectorAll(selector).forEach(configure);
  };
  configureTree(document.body);
  // Entry, sense and custom fields are created dynamically after selection.
  new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) configureTree(node);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
  // Also cover a new field that is focused before the observer runs.
  document.addEventListener("focus", (event) => {
    if (event.target instanceof Element && event.target.matches(selector)) {
      configure(event.target);
    }
  }, true);
}
