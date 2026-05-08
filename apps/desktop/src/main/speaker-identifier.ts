import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import log from "electron-log/main";
import { app } from "electron";
import { sherpaOnnx, TARGET_SAMPLE_RATE } from "./audio-utils";

interface SpeakerEmbeddingExtractor {
  createStream(): {
    acceptWaveform(
      waveform: { sampleRate: number; samples: Float32Array } | number,
      samples?: Float32Array
    ): void;
    inputFinished(): void;
  };
  compute(stream: unknown): Float32Array;
  dim: number | (() => number);
  isReady(stream: unknown): boolean;
}

interface SpeakerEmbeddingManager {
  addV?: (name: string, embeddings: Float32Array[]) => boolean;
  addMulti?: (obj: { name: string; v: Float32Array[] }) => boolean;
  allSpeakers?: () => string[];
  contains(name: string): boolean;
  getAllSpeakerNames?: () => string[];
  getNumSpeakers?: () => number;
  numSpeakers?: () => number;
  remove(name: string): boolean;
  search:
    | ((embedding: Float32Array, threshold: number) => string)
    | ((obj: { v: Float32Array; threshold: number }) => string);
}

export interface SpeakerMatch {
  confidence: number;
  name: string;
}

export interface EnrolledSpeaker {
  name: string;
  sampleCount: number;
}

export class SpeakerIdentifier {
  private dim = 0;
  private enrolledSpeakers: Map<string, Float32Array[]> = new Map();
  private extractor: SpeakerEmbeddingExtractor | null = null;
  private initialized = false;
  private manager: SpeakerEmbeddingManager | null = null;

  constructor(private readonly modelPath: string) {}

  get enrolledSpeakerList(): EnrolledSpeaker[] {
    return Array.from(this.enrolledSpeakers.entries()).map(([name, embeddings]) => ({
      name,
      sampleCount: embeddings.length
    }));
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  get speakerDim(): number {
    return this.dim;
  }

  initialize(): boolean {
    if (this.initialized) {
      return true;
    }
    if (!this.modelPath || !existsSync(this.modelPath)) {
      log.warn("[eve][speaker] model not found, skipping initialization");
      return false;
    }
    try {
      const onnx = sherpaOnnx();
      const ExtractorClass = (onnx as Record<string, unknown>)[
        "SpeakerEmbeddingExtractor"
      ] as
        | (new (config: {
            debug?: number;
            model: string;
            numThreads?: number;
            provider?: string;
          }) => SpeakerEmbeddingExtractor)
        | undefined;
      const ManagerClass = (onnx as Record<string, unknown>)[
        "SpeakerEmbeddingManager"
      ] as
        | (new (dim: number) => SpeakerEmbeddingManager)
        | undefined;

      if (!ExtractorClass || !ManagerClass) {
        log.warn(
          "[eve][speaker] SpeakerEmbeddingExtractor or SpeakerEmbeddingManager not available in sherpa-onnx"
        );
        return false;
      }

      this.extractor = new ExtractorClass({
        debug: 0,
        model: this.modelPath,
        numThreads: 2,
        provider: "cpu"
      });
      this.dim = this.getExtractorDim(this.extractor);
      this.manager = new ManagerClass(this.dim);
      this.initialized = true;
      log.info(`[eve][speaker] initialized with dim=${this.dim}`);
      return true;
    } catch (error) {
      log.error("[eve][speaker] failed to initialize", error);
      return false;
    }
  }

  async loadSpeakerRegistry(registryDir: string): Promise<void> {
    if (!this.manager || !this.extractor) {
      return;
    }

    this.enrolledSpeakers.clear();
    for (const name of this.getAllSpeakerNames(this.manager)) {
      this.manager.remove(name);
    }

    if (!existsSync(registryDir)) {
      log.info(`[eve][speaker] registry dir not found: ${registryDir}`);
      return;
    }

    const entries = await readdir(registryDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const speakerName = entry.name;
      const speakerDir = join(registryDir, speakerName);
      const sampleFiles = await this.findAudioFiles(speakerDir);
      if (sampleFiles.length === 0) {
        continue;
      }

      const embeddings: Float32Array[] = [];
      for (const file of sampleFiles) {
        const embedding = this.extractEmbeddingFromFile(file);
        if (embedding) {
          embeddings.push(embedding);
        }
      }

      if (embeddings.length === 0) {
        continue;
      }

      this.enrolledSpeakers.set(speakerName, embeddings);
      const ok = this.addEmbeddings(this.manager, speakerName, embeddings);
      if (ok) {
        log.info(
          `[eve][speaker] registered "${speakerName}" with ${embeddings.length} sample(s)`
        );
      } else {
        log.warn(`[eve][speaker] failed to register "${speakerName}"`);
      }
    }
  }

  identify(samples: Float32Array, threshold = 0.5): SpeakerMatch | null {
    if (!this.manager || !this.extractor) {
      return null;
    }
    if (this.getSpeakerCount(this.manager) === 0) {
      return null;
    }
    const embedding = this.extractEmbedding(samples);
    if (!embedding) {
      return null;
    }
    const name = this.searchSpeaker(this.manager, embedding, threshold);
    if (!name) {
      return null;
    }
    return { confidence: this.computeConfidence(embedding, name), name };
  }

  private acceptWaveform(
    stream: ReturnType<SpeakerEmbeddingExtractor["createStream"]>,
    samples: Float32Array
  ): void {
    stream.acceptWaveform({ sampleRate: TARGET_SAMPLE_RATE, samples });
  }

  private addEmbeddings(
    manager: SpeakerEmbeddingManager,
    speakerName: string,
    embeddings: Float32Array[]
  ): boolean {
    if (manager.addV) {
      return manager.addV(speakerName, embeddings);
    }
    if (manager.addMulti) {
      return manager.addMulti({ name: speakerName, v: embeddings });
    }
    return false;
  }

  private computeConfidence(embedding: Float32Array, speakerName: string): number {
    const speakerEmbeddings = this.enrolledSpeakers.get(speakerName);
    if (!speakerEmbeddings || speakerEmbeddings.length === 0) {
      return 0;
    }
    let totalSim = 0;
    for (const ref of speakerEmbeddings) {
      totalSim += this.cosineSimilarity(embedding, ref);
    }
    return totalSim / speakerEmbeddings.length;
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private extractEmbedding(samples: Float32Array): Float32Array | null {
    if (!this.extractor) {
      return null;
    }
    try {
      const stream = this.extractor.createStream();
      this.acceptWaveform(stream, samples);
      stream.inputFinished();
      if (!this.extractor.isReady(stream)) {
        return null;
      }
      return this.extractor.compute(stream);
    } catch (error) {
      log.warn("[eve][speaker] failed to extract embedding", error);
      return null;
    }
  }

  private extractEmbeddingFromFile(wavPath: string): Float32Array | null {
    try {
      const onnx = sherpaOnnx();
      const wave = onnx.readWave(wavPath);
      if (!wave || wave.sampleRate !== TARGET_SAMPLE_RATE) {
        log.warn(`[eve][speaker] unsupported sample rate: ${wave?.sampleRate}`);
        return null;
      }
      return this.extractEmbedding(wave.samples);
    } catch (error) {
      log.warn(`[eve][speaker] failed to read wave ${wavPath}`, error);
      return null;
    }
  }

  private async findAudioFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const ext = extname(entry.name).toLowerCase();
      if (ext === ".wav" || ext === ".flac") {
        files.push(join(dir, entry.name));
      }
    }
    return files;
  }

  private getAllSpeakerNames(manager: SpeakerEmbeddingManager): string[] {
    if (manager.allSpeakers) {
      return manager.allSpeakers();
    }
    if (manager.getAllSpeakerNames) {
      return manager.getAllSpeakerNames();
    }
    return [];
  }

  private getExtractorDim(extractor: SpeakerEmbeddingExtractor): number {
    return typeof extractor.dim === "function" ? extractor.dim() : extractor.dim;
  }

  private getSpeakerCount(manager: SpeakerEmbeddingManager): number {
    if (manager.numSpeakers) {
      return manager.numSpeakers();
    }
    if (manager.getNumSpeakers) {
      return manager.getNumSpeakers();
    }
    return 0;
  }

  private searchSpeaker(
    manager: SpeakerEmbeddingManager,
    embedding: Float32Array,
    threshold: number
  ): string {
    return manager.search.length >= 2
      ? (manager.search as (embedding: Float32Array, threshold: number) => string)(
          embedding,
          threshold
        )
      : (manager.search as (obj: {
          threshold: number;
          v: Float32Array;
        }) => string)({
          threshold,
          v: embedding
        });
  }
}

export function getDefaultSpeakerRegistryPath(): string {
  return join(app.getPath("userData"), "speakers");
}
