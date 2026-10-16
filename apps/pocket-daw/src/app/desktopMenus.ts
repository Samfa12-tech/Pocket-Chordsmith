/** DOM-only desktop commands: opening a menu never updates project/audio state. */
export class DesktopMenus {
  private prefix = "";
  private prefixTime = 0;

  snapshot() {
    const group = this.openGroup();
    if (!group) return null;
    const focused = document.activeElement;
    return {
      id: group.querySelector<HTMLElement>(".menu-root")!.id,
      action: focused instanceof HTMLElement && group.contains(focused) ? focused.dataset.action : undefined,
      focused: !!focused && group.contains(focused),
      scroll: group.querySelector<HTMLElement>(".menu-popover")!.scrollTop
    };
  }

  restore(snapshot: ReturnType<DesktopMenus["snapshot"]>) {
    if (!snapshot || this.root.querySelector('[role="dialog"][aria-modal="true"]')) return;
    const trigger = this.root.querySelector<HTMLElement>(`#${CSS.escape(snapshot.id)}`);
    const group = trigger?.closest<HTMLElement>(".menu-group");
    if (!group) return;
    this.open(group);
    group.querySelector<HTMLElement>(".menu-popover")!.scrollTop = snapshot.scroll;
    if (snapshot.focused && document.activeElement === document.body) {
      if (snapshot.action) this.focusItem(group.querySelector<HTMLButtonElement>(`[data-action="${CSS.escape(snapshot.action)}"]`));
      else trigger!.focus({ preventScroll: true });
    }
  }

  constructor(private root: HTMLElement) {
    root.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      const trigger = target?.closest<HTMLButtonElement>(".menu-root");
      if (trigger) {
        const group = trigger.closest<HTMLElement>(".menu-group")!;
        if (this.openGroup() === group) this.close(true);
        else this.open(group);
      } else if (target?.closest(".menu-popover [data-action]")) {
        // Put focus on the visible trigger before the existing command runs.
        // Dialogs and shell rerenders can then retain a usable return target.
        this.close(true);
      }
    });
    root.addEventListener("pointerover", event => {
      const target = event.target instanceof Element ? event.target : null;
      const group = target?.closest<HTMLElement>(".menu-group");
      if (group && this.openGroup() && this.openGroup() !== group) {
        this.open(group);
        group.querySelector<HTMLElement>(".menu-root")?.focus({ preventScroll: true });
      }
    });
    root.addEventListener("focusout", event => {
      const next = event.relatedTarget;
      if (this.openGroup() && (!(next instanceof Node) || !this.openGroup()!.contains(next))) this.close(false);
    });
    document.addEventListener("pointerdown", event => {
      if (!(event.target instanceof Element) || !event.target.closest(".menu-group")) this.close(false);
    });
    window.addEventListener("resize", () => { const group = this.openGroup(); if (group) this.position(group); });
  }

  handleKeyboard(event: KeyboardEvent): boolean {
    const group = event.target instanceof Element ? event.target.closest<HTMLElement>(".menu-group") : null;
    if (!group || !this.root.contains(group)) return false;
    const items = Array.from(group.querySelectorAll<HTMLButtonElement>(".menu-popover button:not(:disabled)"));
    const index = items.indexOf(event.target as HTMLButtonElement);
    const open = this.openGroup() === group;
    if (event.key === "Tab") { this.close(true); return false; }
    if (event.ctrlKey || event.metaKey || event.altKey) { this.close(true); return false; }
    let handled = true;
    if (event.key === "Escape") this.close(true);
    else if (event.key === "Enter" || event.key === " ") (event.target as HTMLButtonElement).click();
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!open) this.open(group);
      const next = index < 0 ? (event.key === "ArrowDown" ? 0 : items.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      this.focusItem(items[next]);
    } else if ((event.key === "Home" || event.key === "End") && open) this.focusItem(items[event.key === "Home" ? 0 : items.length - 1]);
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const groups = Array.from(this.root.querySelectorAll<HTMLElement>(".menu-group"));
      const next = groups[(groups.indexOf(group) + (event.key === "ArrowRight" ? 1 : -1) + groups.length) % groups.length];
      this.close(false);
      if (open) this.open(next);
      next.querySelector<HTMLButtonElement>(".menu-root")?.focus({ preventScroll: true });
      if (open && index >= 0) this.focusItem(next.querySelector<HTMLButtonElement>(".menu-popover button:not(:disabled)"));
    } else if (open && event.key.length === 1) {
      const now = performance.now();
      this.prefix = now - this.prefixTime < 700 ? this.prefix + event.key.toLowerCase() : event.key.toLowerCase();
      this.prefixTime = now;
      const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)];
      const match = ordered.find(item => item.textContent?.trim().toLowerCase().startsWith(this.prefix))
        || ordered.find(item => item.textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase()));
      this.focusItem(match);
    } else handled = open;
    if (handled) { event.preventDefault(); event.stopPropagation(); }
    return handled;
  }

  private openGroup(): HTMLElement | null { return this.root.querySelector('.menu-group[data-menu-open="true"]'); }

  private open(group: HTMLElement) {
    this.close(false);
    group.dataset.menuOpen = "true";
    group.querySelector(".menu-root")?.setAttribute("aria-expanded", "true");
    group.querySelector<HTMLElement>(".menu-popover")!.hidden = false;
    this.position(group);
  }

  private close(restoreFocus: boolean) {
    const group = this.openGroup();
    if (!group) return;
    delete group.dataset.menuOpen;
    group.querySelector(".menu-root")?.setAttribute("aria-expanded", "false");
    group.querySelector<HTMLElement>(".menu-popover")!.hidden = true;
    this.prefix = "";
    if (restoreFocus) group.querySelector<HTMLElement>(".menu-root")?.focus({ preventScroll: true });
  }

  private position(group: HTMLElement) {
    const trigger = group.querySelector<HTMLElement>(".menu-root")!.getBoundingClientRect();
    const origin = group.getBoundingClientRect();
    const menu = group.querySelector<HTMLElement>(".menu-popover")!;
    const top = Math.min(trigger.bottom + 2, Math.max(8, window.innerHeight - 40));
    menu.style.top = `${top - origin.top}px`;
    menu.style.maxHeight = `${Math.max(28, window.innerHeight - top - 8)}px`;
    menu.style.left = `${Math.max(8, Math.min(trigger.left, window.innerWidth - menu.getBoundingClientRect().width - 8)) - origin.left}px`;
  }

  private focusItem(item: HTMLButtonElement | null | undefined) {
    if (!item) return;
    item.focus({ preventScroll: true });
    const menu = item.closest<HTMLElement>(".menu-popover")!;
    if (item.offsetTop < menu.scrollTop) menu.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > menu.scrollTop + menu.clientHeight) menu.scrollTop = item.offsetTop + item.offsetHeight - menu.clientHeight;
  }
}
