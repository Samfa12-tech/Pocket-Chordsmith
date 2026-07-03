export function scrollTopToReveal({
  scrollerTop,
  currentScrollTop,
  targetTop,
  inset = 0
}: {
  scrollerTop: number;
  currentScrollTop: number;
  targetTop: number;
  inset?: number;
}) {
  return Math.max(0, currentScrollTop + targetTop - scrollerTop - inset);
}

export function revealElementInScroller(scroller: HTMLElement, target: HTMLElement, inset = 0) {
  const scrollerRect = scroller.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  scroller.scrollTop = scrollTopToReveal({
    scrollerTop: scrollerRect.top,
    currentScrollTop: scroller.scrollTop,
    targetTop: targetRect.top,
    inset
  });
}
