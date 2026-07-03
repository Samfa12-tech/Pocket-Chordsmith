import { describe, expect, it } from "vitest";
import { revealElementInScroller, scrollTopToReveal } from "../src/app/scrollReveal";

describe("scroll reveal helpers", () => {
  it("calculates the app scroller offset needed to bring a section to the top", () => {
    expect(scrollTopToReveal({ scrollerTop: 100, currentScrollTop: 40, targetTop: 460 })).toBe(400);
  });

  it("clamps upward reveals to the top of the scroller", () => {
    expect(scrollTopToReveal({ scrollerTop: 120, currentScrollTop: 15, targetTop: 80 })).toBe(0);
  });

  it("applies the calculated offset to an element scroller", () => {
    const scroller = {
      scrollTop: 25,
      getBoundingClientRect: () => ({ top: 50 })
    } as HTMLElement;
    const target = {
      getBoundingClientRect: () => ({ top: 350 })
    } as HTMLElement;

    revealElementInScroller(scroller, target);

    expect(scroller.scrollTop).toBe(325);
  });
});
