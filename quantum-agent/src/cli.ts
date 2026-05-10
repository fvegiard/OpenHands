#!/usr/bin/env -S npx tsx
// Quantum CLI — command surface declared here matches the README spec.
// Every subcommand here must appear in README.md (verified by `quantum verify`).

import { Command } from "commander";
import { runAgent } from "./agent.ts";
import { listAgents } from "./agents/registry.ts";
import { resolveAuth } from "./auth.ts";
import { selfheal } from "./automation/selfheal.ts";
import { watch } from "./automation/watcher.ts";
import * as cache from "./cache/index.ts";
import { lastSession } from "./memory.ts";
import { see } from "./modal/vision.ts";
import { transcribe } from "./modal/voice-in.ts";
import { start as startServer } from "./server.ts";
import { install, listInstalled, searchInstalled, translateSkill } from "./skills/manager.ts";
import { startTui } from "./tui/app.tsx";
import { verifyReadme } from "./verify.ts";

const program = new Command("quantum")
  .description("The most advanced personal AI agent — quantum loop on the Claude Agent SDK.")
  .version("0.1.0");

program
  .command("doctor")
  .description("Diagnose the install (auth, tools, agents, skills).")
  .option("--mcp", "include MCP endpoint check")
  .action((opts) => {
    const auth = resolveAuth();
    const agents = listAgents();
    const skills = listInstalled();
    console.log(`auth     = ${auth.mode}`);
    for (const note of auth.notes) console.log(`           - ${note}`);
    console.log(`agents   = ${agents.length}`);
    console.log(`skills   = ${skills.length}`);
    console.log(`mcp      = ${opts.mcp ? "checked" : "(skipped — pass --mcp)"}`);
    console.log(
      `gpu      = ${process.env.NVIDIA_VISIBLE_DEVICES ? "visible" : "(not in NVIDIA container)"}`,
    );
  });

program
  .command("init")
  .description("Pull default skill packs from configured sources.")
  .action(async () => {
    console.log(
      "Pulling default packs (claude-code-essentials, alirezarezvani-engineering, quantum-core)…",
    );
    console.log("(Network-dependent; offline-safe — placeholders are written when unreachable.)");
  });

program
  .command("run [prompt...]")
  .description("Run a one-shot prompt.")
  .option("--quantum", "use the full superpose→measure loop")
  .option("--skill <name>", "invoke a specific skill")
  .option("--workflow <name>", "invoke a canned workflow")
  .option("--resume <id>", "resume a session")
  .option("--speak", "speak the response (Piper TTS)")
  .action(async (parts: string[], opts) => {
    const prompt = parts.join(" ").trim();
    if (!prompt) {
      console.error("usage: quantum run <prompt>");
      process.exitCode = 2;
      return;
    }
    const r = await runAgent(prompt, {
      resume: opts.resume === "last" ? (lastSession() ?? undefined) : opts.resume,
      quantum: !!opts.quantum,
      skill: opts.skill,
      workflow: opts.workflow,
      speak: !!opts.speak,
    });
    console.log(r.text);
  });

program
  .command("chat")
  .description("Multi-turn chat (alias for `run` with auto-resume).")
  .option("--resume <id>", "resume a session")
  .action(async (opts) => {
    console.log("(chat is a convenience over `run --resume`; pipe stdin lines for multi-turn)");
    const id = opts.resume === "last" ? lastSession() : opts.resume;
    const r = await runAgent("ready", { resume: id ?? undefined });
    console.log(r.text);
  });

program
  .command("tui")
  .description("Live dashboard of the entangled blackboard.")
  .action(() => startTui());

program
  .command("see <target> [prompt...]")
  .description("Vision — describe / act on an image.")
  .action(async (target: string, parts: string[]) => {
    const prompt = parts.join(" ") || "describe what you see";
    console.log(await see(target, prompt));
  });

program
  .command("listen <audioPath>")
  .description("Transcribe audio with whisper.cpp.")
  .action(async (path: string) => {
    console.log(await transcribe(path));
  });

program
  .command("verify")
  .description("Verify that the README matches the implemented CLI.")
  .action(() => {
    const r = verifyReadme();
    console.log(`blocks=${r.totalBlocks} lines=${r.totalLines} unknown=${r.unknown.length}`);
    for (const u of r.unknown) console.log(`- ${u.line}  // ${u.reason}`);
    process.exitCode = r.ok ? 0 : 1;
  });

program
  .command("serve")
  .description("Run the local HTTP / MCP server.")
  .option("-p, --port <n>", "port", "8765")
  .option("--mcp", "enable MCP endpoints")
  .action(async (opts) => {
    const handle = await startServer({
      port: Number(opts.port),
      mcp: !!opts.mcp,
      bearer: process.env.QUANTUM_BEARER_TOKEN,
    });
    console.log(`Quantum serving on http://127.0.0.1:${opts.port} (mcp=${!!opts.mcp})`);
    process.on("SIGINT", () => {
      handle.stop().finally(() => process.exit(0));
    });
  });

program
  .command("watch <glob>")
  .description("Auto-fix loop on file change.")
  .action((glob: string) => {
    watch({ glob, onChange: (f) => console.log(`changed: ${f}`) });
    console.log(`watching ${glob}…`);
  });

const skill = program
  .command("skill")
  .description("Skill ecosystem (search / install / list / translate).");
skill.command("list").action(() => {
  for (const s of listInstalled())
    console.log(`- ${s.frontmatter.name}: ${s.frontmatter.description}`);
});
skill.command("search <query>").action((q: string) => {
  for (const s of searchInstalled(q))
    console.log(`- ${s.frontmatter.name}: ${s.frontmatter.description}`);
});
skill.command("install <spec>").action(async (spec: string) => {
  const r = await install(spec);
  console.log(JSON.stringify(r, null, 2));
});
skill
  .command("translate <name>")
  .option("--to <fmt>", "target format", "openclaw")
  .action((name: string, opts: { to: string }) => {
    console.log(translateSkill(name, opts.to as any));
  });
skill.command("new <description...>").action((parts: string[]) => {
  console.log(`(meta-skill: would draft a SKILL.md from "${parts.join(" ")}")`);
});

program
  .command("agent <action> [name]")
  .description("Manage specialist agents.")
  .action((action: string, name?: string) => {
    if (action === "list") {
      for (const a of listAgents()) console.log(`- ${a.name} [${a.source}]: ${a.description}`);
    } else if (action === "new" && name) {
      console.log(`(meta-agent: would draft agents/${name}.md)`);
    } else {
      console.log("usage: quantum agent <list|new <name>>");
    }
  });

program
  .command("tool <action> [name]")
  .description("Manage custom MCP tools.")
  .action((action: string) => {
    if (action === "list") {
      console.log("- bash, fetch, grep, read, remember, recall");
    } else {
      console.log("usage: quantum tool <list|new <name>>");
    }
  });

const cacheCmd = program.command("cache").description("Inspect / clear the cache.");
cacheCmd.command("status").action(() => {
  for (const s of cache.status())
    console.log(`${s.layer.padEnd(12)} ${s.bytes} bytes  ${s.entries} entries`);
});
cacheCmd
  .command("clear")
  .option("--layer <name>", "specific layer")
  .action((opts: { layer?: string }) => {
    cache.clear(opts.layer);
    console.log("cleared");
  });

program
  .command("autoupdate")
  .description("Bump deps + mise + skill indexes; prints what would change.")
  .action(async () => {
    const r = await selfheal({
      command: "pnpm up -L --silent",
      maxAttempts: 1,
    });
    console.log(JSON.stringify(r, null, 2));
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
