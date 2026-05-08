import { readdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { transcribeAudioFile, writeJsonAtomic } from "./audio-utils";

const AUDIO_EXTENSIONS = new Set([".flac", ".wav"]);

interface TranscribeAudioDirectoryOptions {
  inputDirectory: string;
  limit: number;
  recognizer: Parameters<typeof transcribeAudioFile>[0];
  requireFfmpeg: () => Promise<void>;
}

export async function transcribeAudioDirectory({
  inputDirectory,
  limit,
  recognizer,
  requireFfmpeg
}: TranscribeAudioDirectoryOptions): Promise<number> {
  const files = await collectAudioFiles(resolve(inputDirectory));
  let processed = 0;

  for (const audioPath of files) {
    if (limit > 0 && processed >= limit) {
      break;
    }
    if (extname(audioPath).toLowerCase() !== ".wav") {
      await requireFfmpeg();
    }

    const jsonPath = `${audioPath.slice(0, -extname(audioPath).length)}.json`;
    const result = await transcribeAudioFile(recognizer, audioPath);
    await writeJsonAtomic(jsonPath, {
      audio_file: basename(audioPath),
      audio_path: audioPath,
      backend: "sherpa-onnx",
      created_at: new Date().toISOString(),
      language: result.lang || null,
      model: "Qwen3 ASR",
      status: "ok",
      text: result.text.trim()
    });
    processed += 1;
  }

  return processed;
}

async function collectAudioFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectAudioFiles(fullPath);
      }
      if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(fullPath).toLowerCase())) {
        return [fullPath];
      }
      return [];
    })
  );
  return files.flat().sort();
}
