import type { SegmentRecord, SpeakerProfile } from "@eve/shared";

export async function backfillSpeakerProfile({
  lookupProfile,
  onResolved,
  speaker,
  segment
}: {
  lookupProfile: (speakerName: string) => Promise<SpeakerProfile | null>;
  onResolved: () => void;
  speaker: string | null;
  segment: SegmentRecord;
}): Promise<void> {
  const observedSpeaker = speaker?.trim();
  if (!observedSpeaker) {
    return;
  }
  const profile = await lookupProfile(observedSpeaker);
  if (!profile) {
    return;
  }
  segment.speakerDisplayName = profile.displayName;
  segment.speakerId = profile.speakerId;
  onResolved();
}
