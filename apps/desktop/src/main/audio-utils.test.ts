import { describe, expect, it } from "vitest";
import * as audioUtils from "./audio-utils";

describe("audio utils exports", () => {
  it("exposes the sherpa runtime loader for speaker identification", () => {
    expect(audioUtils.sherpaOnnx).toBeTypeOf("function");
  });
});
