// Voice-out: speak text with Piper (Linux/Windows) or macOS `say`. Returns
// the audio file path on success, or a status message on failure. Never throws.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";

export async function speak(text: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "quantum-tts-"));
  const out = join(dir, "out.wav");
  try {
    const piper = await execa("piper", ["--output_file", out], {
      input: text,
      timeout: 30_000,
      reject: false,
    });
    if (piper.exitCode === 0) return out;
  } catch {
    // fall through
  }
  try {
    const say = await execa("say", ["-o", out, text], { timeout: 30_000, reject: false });
    if (say.exitCode === 0) return out;
  } catch {
    // fall through
  }
  return "[voice-out] piper / say not available — text would have been spoken";
}
