import { describe, expect, it } from "vitest";
import { getPreferredWindowSize } from "./window-layout";

describe("getPreferredWindowSize", () => {
  it("prefers a large presentation-sized desktop window", () => {
    expect(getPreferredWindowSize({ height: 1200, width: 1600 })).toEqual({
      height: 860,
      width: 1280
    });
  });

  it("keeps a reasonable minimum size on smaller displays", () => {
    expect(getPreferredWindowSize({ height: 680, width: 980 })).toEqual({
      height: 640,
      width: 960
    });
  });
});
