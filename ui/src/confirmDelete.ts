// Use an HTML dialog: browser confirm() is not reliable in desktop webviews.
export function confirmDelete(entryName: string): Promise<boolean> {
  const dialog = document.createElement("dialog");
  dialog.className = "delete-confirm-dialog";
  dialog.setAttribute("aria-labelledby", "deleteConfirmTitle");
  dialog.innerHTML = `
    <div class="dialog-header"><h3 id="deleteConfirmTitle">Delete entry?</h3></div>
    <div class="dialog-body"><p></p></div>
    <form method="dialog" class="dialog-footer">
      <button class="button" value="cancel" autofocus>Cancel</button>
      <button class="button danger" value="delete">Delete</button>
    </form>`;
  dialog.querySelector("p")!.textContent = entryName
    ? `Delete “${entryName}”? This change is written to the file when you save.`
    : "Delete this entry? This change is written to the file when you save.";
  document.body.appendChild(dialog);
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      const confirmed = dialog.returnValue === "delete";
      dialog.remove();
      resolve(confirmed);
    }, { once: true });
    dialog.showModal();
  });
}
