// Voice out — bridges to piper (when present) for offline TTS.

import { execa } from "execa";

export async function speak(text: string, outPath = "/tmp/quantum-voice.wav"): Promise<string> {
  try {
    await execa("piper", ["--output_file", outPath], {
      input: text,
      timeout: 60_000,
      reject: false,
    });
    return outPath;
  } catch {
    return "[piper not available — text would have been spoken]";
  }
}
