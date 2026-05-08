import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_STATUS,
  EMPTY_LIVE_STAGE_SNAPSHOT,
  EMPTY_REVIEW_SNAPSHOT
} from "@eve/shared";
import { statusTone } from "./status-tone";

vi.mock("@/lib/i18n", () => ({
  createT: () => () => "translated"
}));

vi.mock("@/lib/toast-store", () => ({
  toastActions: {
    show: vi.fn()
  }
}));

describe("statusTone", () => {
  it("maps recording status to tone", () => {
    expect(
      statusTone({
        ...DEFAULT_STATUS,
        elapsed: "00:00:01",
        recording: true,
        statusMessage: ""
      })
    ).toBe("recording");
  });

  it("keeps desktop-store bootstrap compatible with required stage and review snapshots", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.assign(globalThis, {
      window: {
        eve: undefined
      }
    });

    const { getDesktopSnapshot } = await import("./desktop-store");
    const snapshot = getDesktopSnapshot();

    expect(snapshot.permission.state).toBe("denied");
    expect(snapshot.liveStage).toEqual(EMPTY_LIVE_STAGE_SNAPSHOT);
    expect(snapshot.review).toEqual(EMPTY_REVIEW_SNAPSHOT);
  });
});
