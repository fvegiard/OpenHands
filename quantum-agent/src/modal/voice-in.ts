// Voice in — bridges to whisper.cpp (when present) for offline ASR.

import { execa } from "execa";

export async function transcribe(audioPath: string): Promise<string> {
  try {
    const r = await execa("whisper", [audioPath, "--output-format", "txt", "--quiet"], {
      reject: false,
      timeout: 120_000,
    });
    return r.stdout.trim();
  } catch {
    return "[whisper not available — install via `brew install whisper-cpp` or use the Docker image]";
  }
}
