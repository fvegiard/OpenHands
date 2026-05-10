// File-watch driven autonomous fix loop.

import chokidar from "chokidar";
import { runAgent } from "../agent.ts";

export interface WatchOptions {
  glob: string;
  onChange?: (file: string) => void;
}

export function watch(opts: WatchOptions): () => Promise<void> {
  const watcher = chokidar.watch(opts.glob, { ignoreInitial: true });
  watcher.on("change", async (file) => {
    opts.onChange?.(file);
    await runAgent(`File ${file} changed. If tests exist, run them. If they fail, fix.`);
  });
  return () => watcher.close();
}
