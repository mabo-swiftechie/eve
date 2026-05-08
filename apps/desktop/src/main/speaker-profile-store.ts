import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { RuleCandidate, SpeakerProfile } from "@eve/shared";

type SpeakerProfileMap = Record<string, SpeakerProfile>;

export class SpeakerProfileStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath?: string) {}

  async listProfiles(): Promise<SpeakerProfile[]> {
    await this.writeQueue;
    const profiles = await this.readProfiles();
    return Object.values(profiles);
  }

  async getProfile(speakerId: string): Promise<SpeakerProfile | null> {
    await this.writeQueue;
    const profiles = await this.readProfiles();
    return profiles[speakerId] ?? null;
  }

  async findProfileByName(name: string): Promise<SpeakerProfile | null> {
    const observedName = name.trim();
    if (!observedName) {
      return null;
    }
    await this.writeQueue;
    const profiles = await this.readProfiles();
    return (
      Object.values(profiles).find((profile) => {
        return (
          profile.displayName === observedName ||
          profile.aliases.includes(observedName) ||
          profile.speakerId === observedName
        );
      }) ?? null
    );
  }

  async saveProfile(profile: SpeakerProfile): Promise<SpeakerProfile> {
    await this.writeTransaction(async (profiles) => {
      profiles[profile.speakerId] = profile;
      await this.writeProfiles(profiles);
    });
    return profile;
  }

  async upsertCandidate(
    speakerId: string,
    candidate: RuleCandidate
  ): Promise<void> {
    await this.writeTransaction(async (profiles) => {
      const profile = profiles[speakerId];
      if (!profile) {
        throw new Error(`Speaker profile not found for ${speakerId}`);
      }

      const existingIndex = profile.ruleCandidates.findIndex(
        (item) => item.candidateId === candidate.candidateId
      );
      const nextCandidates = [...profile.ruleCandidates];
      if (existingIndex >= 0) {
        nextCandidates[existingIndex] = candidate;
      } else {
        nextCandidates.push(candidate);
      }

      profiles[speakerId] = {
        ...profile,
        ruleCandidates: nextCandidates,
        updatedAt: candidate.updatedAt
      };
      await this.writeProfiles(profiles);
    });
  }

  private async readProfiles(): Promise<SpeakerProfileMap> {
    const filePath = this.getFilePath();
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as SpeakerProfileMap;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  private async writeProfiles(profiles: SpeakerProfileMap): Promise<void> {
    const filePath = this.getFilePath();
    await mkdir(dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(profiles, null, 2)}\n`, "utf8");
    await rename(tempPath, filePath);
  }

  private async writeTransaction(
    operation: (profiles: SpeakerProfileMap) => Promise<void>
  ): Promise<void> {
    const run = this.writeQueue.then(async () => {
      const profiles = await this.readProfiles();
      await operation(profiles);
    });
    this.writeQueue = run.then(() => undefined, () => undefined);
    await run;
  }

  private getFilePath(): string {
    return this.filePath ?? resolveSpeakerProfilePath();
  }
}

const resolveSpeakerProfilePath = (): string => {
  const baseDirectory =
    process.env.EVE_STORE_DIR ?? app?.getPath("userData") ?? process.cwd();
  return join(baseDirectory, "speaker-profiles.json");
};
