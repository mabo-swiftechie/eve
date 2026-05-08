import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { RuleCandidate, SpeakerProfile } from "@eve/shared";
import { SpeakerProfileStore } from "./speaker-profile-store";

const tempDirs: string[] = [];

describe("SpeakerProfileStore", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
  });

  it("saves and lists profiles", async () => {
    const store = new SpeakerProfileStore(await createStorePath());
    const profile = createProfile();

    await store.saveProfile(profile);

    await expect(store.getProfile(profile.speakerId)).resolves.toEqual(profile);
    await expect(store.listProfiles()).resolves.toEqual([profile]);
  });

  it("merges candidates by candidate id", async () => {
    const store = new SpeakerProfileStore(await createStorePath());
    const profile = createProfile();
    await store.saveProfile(profile);

    await store.upsertCandidate(profile.speakerId, createCandidate());
    await store.upsertCandidate(
      profile.speakerId,
      createCandidate({
        status: "confirmed",
        updatedAt: "2026-05-07T12:02:00.000Z"
      })
    );

    const stored = await store.getProfile(profile.speakerId);
    expect(stored?.ruleCandidates).toEqual([
      createCandidate({
        status: "confirmed",
        updatedAt: "2026-05-07T12:02:00.000Z"
      })
    ]);
  });

  it("writes a json object keyed by speaker id", async () => {
    const path = await createStorePath();
    const store = new SpeakerProfileStore(path);
    const profile = createProfile();

    await store.saveProfile(profile);

    const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, SpeakerProfile>;
    expect(raw[profile.speakerId]).toEqual(profile);
  });

  it("finds a profile by display name or alias", async () => {
    const store = new SpeakerProfileStore(await createStorePath());
    const profile = createProfile({ aliases: ["晋哥"] });
    await store.saveProfile(profile);

    await expect(store.findProfileByName("王晋")).resolves.toEqual(profile);
    await expect(store.findProfileByName("晋哥")).resolves.toEqual(profile);
  });
});

async function createStorePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "eve-speaker-profiles-"));
  tempDirs.push(dir);
  return join(dir, "speaker-profiles.json");
}

function createCandidate(
  overrides: Partial<RuleCandidate> = {}
): RuleCandidate {
  return {
    candidateId: "candidate-1",
    createdAt: "2026-05-07T12:01:00.000Z",
    fromText: "长劲短劲",
    language: "zh",
    segmentId: "seg-1",
    speakerId: "speaker-wj",
    status: "pending",
    toText: "长句短句",
    updatedAt: "2026-05-07T12:01:00.000Z",
    ...overrides
  };
}

function createProfile(
  overrides: Partial<SpeakerProfile> = {}
): SpeakerProfile {
  return {
    aliases: [],
    correctionLexiconJa: {},
    correctionLexiconZh: {
      "长劲短劲": "长句短句"
    },
    displayName: "王晋",
    languagesSeen: ["zh", "ja"],
    notes: "",
    ruleCandidates: [],
    sharedTerms: {
      Qwen3: "Qwen3"
    },
    speakerId: "speaker-wj",
    styleRulesJa: [],
    styleRulesZh: [],
    updatedAt: "2026-05-07T12:00:00.000Z",
    ...overrides
  };
}
