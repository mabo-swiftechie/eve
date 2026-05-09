import { EMPTY_LIVE_STAGE_SNAPSHOT, type LiveStageSnapshot } from "@eve/shared";
import type { EnrichedSegmentRecord, RecordingSegment } from "./desktop-engine-segment-output";

export function buildLiveStageSnapshot(
  segment: Pick<RecordingSegment, "speechSegments"> | null
): LiveStageSnapshot {
  if (!segment || segment.speechSegments.length === 0) {
    return EMPTY_LIVE_STAGE_SNAPSHOT;
  }
  const recentSegments = segment.speechSegments.slice(-5).reverse();
  return {
    activeSegment: (recentSegments[0] as EnrichedSegmentRecord | undefined) ?? null,
    recentSegments
  };
}
