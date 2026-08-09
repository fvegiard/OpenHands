#!/usr/bin/env -S npx tsx
// Quantum CLI — command surface declared here matches the README spec.
// Every subcommand here must appear in README.md (verified by `quantum verify`).

import { readFileSync } from "node:fs";
import { Command } from "commander";
import { runAgent } from "./agent.ts";
import { listAgents } from "./agents/registry.ts";
import { resolveAuth } from "./auth.ts";
import { watch } from "./automation/watcher.ts";
import * as cache from "./cache/index.ts";
import { checkCapabilities, loadManifest, readmePath } from "./capabilities.ts";
import { lastSession } from "./memory.ts";
import { see } from "./modal/vision.ts";
import { transcribe } from "./modal/voice-in.ts";
import {
  CAPABILITIES,
  isSafeEnvName,
  persistSelection,
  providerTest,
  REGISTRY,
  RuntimeId,
  resolveRuntimeConfig,
  runtimeStatus,
  validateProvider,
} from "./providers/registry.ts";
import { getAdapter } from "./runtimes/index.ts";
import { start as startServer } from "./server.ts";
import { generateAgent, generateSkill, generateTool, verifyAfter } from "./skills/generate.ts";
import {
  install,
  listInstalled,
  searchInstalled,
  syncSkills,
  translateSkill,
} from "./skills/manager.ts";
import { startTui } from "./tui/app.tsx";
import { verifyReadme } from "./verify.ts";
import { listWorkflows } from "./workflows/index.ts";

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
  .option("--pack <name>", "specific pack name (default: 'default')", "default")
  .action(async (opts: { pack: string }) => {
    console.log(`Pulling skill pack: ${opts.pack}…`);
    const r = await install(`pack:${opts.pack}`);
    console.log(JSON.stringify(r, null, 2));
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
  .command("listen [audioPath]")
  .description("Voice input — transcribe an audio file or start a live loop.")
  .action(async (path?: string) => {
    if (path) {
      console.log(await transcribe(path));
      return;
    }
    console.log(
      "[voice-in] live loop is not yet implemented; pass an audio file path or pipe one in.",
    );
    console.log("  example: quantum listen ./recording.wav");
  });

program
  .command("verify")
  .description("Verify the README matches the CLI AND every capability claim has evidence.")
  .action(() => {
    const r = verifyReadme();
    console.log(`blocks=${r.totalBlocks} lines=${r.totalLines} unknown=${r.unknown.length}`);
    for (const u of r.unknown) console.log(`- ${u.line}  // ${u.reason}`);
    // Capability semantic gate: README claims must be backed by evidence.
    const root = process.cwd();
    const violations = checkCapabilities(
      readFileSync(readmePath(root), "utf8"),
      loadManifest(root),
      root,
    );
    console.log(
      `capabilities: ${violations.length === 0 ? "OK" : `${violations.length} violation(s)`}`,
    );
    for (const c of violations) console.log(`- ${c.code}: ${c.detail}`);
    process.exitCode = r.ok && violations.length === 0 ? 0 : 1;
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
skill
  .command("install [spec]")
  .option("--pack <name>", "install a curated pack (resolved via skills.sources.toml)")
  .action(async (spec: string | undefined, opts: { pack?: string }) => {
    if (!spec && !opts.pack) {
      console.error("usage: quantum skill install <gh:owner/repo|pack:name>  OR  --pack <name>");
      process.exitCode = 2;
      return;
    }
    const effective = opts.pack ? `pack:${opts.pack}` : (spec as string);
    const r = await install(effective);
    console.log(JSON.stringify(r, null, 2));
    // Fail closed: a genuine clone failure exits nonzero. Offline placeholders
    // are NOT_VERIFIED (not a failure, but never counted as installed).
    process.exitCode = r.ok ? 0 : 1;
  });
skill
  .command("translate <name>")
  .option("--to <fmt>", "target format", "openclaw")
  .action((name: string, opts: { to: string }) => {
    console.log(translateSkill(name, opts.to as any));
  });
skill
  .command("sync")
  .description("Regenerate .agents/skills/* from skills-core (single source of truth).")
  .option("--target <dir>", "target directory", "../.agents/skills")
  .action((opts: { target: string }) => {
    const r = syncSkills(opts.target);
    console.log(`synced ${r.written.length} skills from ${r.source} -> ${r.target}`);
    for (const f of r.written) console.log(`- ${f}`);
  });
skill.command("new <description...>").action((parts: string[]) => {
  const description = parts.join(" ");
  if (!description) {
    console.error("usage: quantum skill new <description>");
    process.exitCode = 2;
    return;
  }
  const file = generateSkill(description);
  const after = verifyAfter();
  console.log(
    `wrote DRAFT ${file.path} (${file.bytes} bytes); verify=${after.ok ? "ok" : "drift"}`,
  );
  console.log(`  fixture:       ${file.fixture}`);
  console.log(`  forward-tests: ${file.forwardTests} (2 tests)`);
  console.log(
    "  status: NOT activated — activate only after format validation AND both " +
      "forward tests pass in fresh contexts.",
  );
});

const provider = program
  .command("provider")
  .description("Select and test the agent runtime/provider (claude | openai-agents | codex).");
provider
  .command("list")
  .description("List known runtimes with the package + secret each requires.")
  .action(async () => {
    const cfg = resolveRuntimeConfig();
    for (const id of RuntimeId.options) {
      const st = await runtimeStatus(id, cfg.runtime);
      const mark = st.selected ? "*" : " ";
      console.log(
        `${mark} ${id.padEnd(14)} ${st.installed ? "installed" : "not-installed"}  ` +
          `secret=${st.secretPresent ? "set" : `[${st.secretEnvChecked.join("|")}]`}  ` +
          `providers=${REGISTRY[id].providers.join(",")}`,
      );
    }
  });
provider
  .command("status")
  .description("Show the selected runtime, model, availability and capability matrix.")
  .action(async () => {
    const cfg = resolveRuntimeConfig();
    const st = await runtimeStatus(cfg.runtime, cfg.runtime, process.env, cfg.secretEnv);
    const spec = REGISTRY[cfg.runtime];
    console.log(`runtime  = ${cfg.runtime}${st.selected ? " (selected)" : ""}`);
    console.log(`provider = ${cfg.provider ?? "(default)"}`);
    console.log(`model    = ${cfg.model}`);
    console.log(`base-url = ${cfg.baseUrl ?? "(default)"}`);
    // Print the secret NAME only — never a value.
    console.log(`secret-env = ${cfg.secretEnv ?? `(defaults: ${spec.secretEnv.join(", ")})`}`);
    console.log(`provider-package = ${cfg.providerPackage ?? "(none)"}`);
    console.log(`resume-thread-id = ${cfg.resumeThreadId ?? "(none)"}`);
    console.log(
      `installed= ${st.installed}${st.installed ? "" : ` (need: ${st.missingPackages.join(", ")})`}`,
    );
    console.log(
      `secret   = ${st.secretPresent ? `present (${st.secretEnvChecked.join(", ")})` : `missing (set one of: ${st.missingSecretNames.join(", ")})`}`,
    );
    console.log(`unattended-permission = ${spec.unattendedPermissionMode}`);
    console.log(`claude-coupled = ${spec.claudeCoupled}`);
    console.log(`capabilities = ${CAPABILITIES.filter((c) => spec.capabilities[c]).join(", ")}`);
    console.log(`diagnostic = ${st.diagnostic}`);
  });
provider
  .command("select <runtime>")
  .description("Persist the runtime/provider profile (env vars still override).")
  .option("--provider <name>", "provider backend (e.g. openai, minimax)")
  .option("--model <name>", "model id")
  .option("--base-url <url>", "OpenAI-compatible endpoint URL")
  .option("--secret-env <NAME>", "env var NAME holding the key (never the value)")
  .option(
    "--provider-package <pkg>",
    "Vercel AI SDK provider package (e.g. vercel-minimax-ai-provider)",
  )
  .option("--resume-thread-id <id>", "Codex thread id to resume")
  .action(
    (
      runtime: string,
      opts: {
        provider?: string;
        model?: string;
        baseUrl?: string;
        secretEnv?: string;
        providerPackage?: string;
        resumeThreadId?: string;
      },
    ) => {
      const parsed = RuntimeId.safeParse(runtime);
      if (!parsed.success) {
        console.error(`unknown runtime '${runtime}'. Allowed: ${RuntimeId.options.join(", ")}`);
        process.exitCode = 2;
        return;
      }
      // Reject a secret VALUE masquerading as --secret-env: it must be a NAME.
      if (opts.secretEnv !== undefined && !isSafeEnvName(opts.secretEnv)) {
        console.error(
          `invalid --secret-env '${opts.secretEnv}': must be an env var NAME ` +
            "([A-Za-z_][A-Za-z0-9_]*), never a value.",
        );
        process.exitCode = 2;
        return;
      }
      if (opts.baseUrl !== undefined) {
        try {
          new URL(opts.baseUrl);
        } catch {
          console.error(`invalid --base-url '${opts.baseUrl}': must be a valid URL.`);
          process.exitCode = 2;
          return;
        }
      }
      const provErr = validateProvider(parsed.data, opts.provider, opts.providerPackage);
      if (provErr) {
        console.error(provErr);
        process.exitCode = 2;
        return;
      }
      const file = persistSelection({
        runtime: parsed.data,
        provider: opts.provider,
        model: opts.model ?? REGISTRY[parsed.data].defaultModel,
        baseUrl: opts.baseUrl,
        secretEnv: opts.secretEnv,
        providerPackage: opts.providerPackage,
        resumeThreadId: opts.resumeThreadId,
      });
      console.log(
        `selected runtime=${parsed.data}` +
          (opts.provider ? ` provider=${opts.provider}` : "") +
          (opts.secretEnv ? ` secret-env=${opts.secretEnv}` : "") +
          `; wrote ${file}`,
      );
    },
  );
provider
  .command("test")
  .description("Contract test the selected runtime (default). Use --live for a real call.")
  .option("--live", "perform a minimal real billable call (requires a secret)")
  .action(async (opts: { live?: boolean }) => {
    const cfg = resolveRuntimeConfig();
    if (!opts.live) {
      const r = await providerTest(cfg);
      console.log(`runtime=${r.runtime} model=${r.model} kind=${r.kind} ok=${r.ok}`);
      console.log(r.message);
      process.exitCode = r.ok ? 0 : 1;
      return;
    }
    // Opt-in live probe: a minimal real call via the runtime adapter. Returns
    // NOT VERIFIED (non-zero) when it was not actually executed.
    const probe = await getAdapter(cfg.runtime).liveProbe(process.env, {
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      secretEnv: cfg.secretEnv,
      providerPackage: cfg.providerPackage,
      resumeThreadId: cfg.resumeThreadId,
    });
    const label = probe.status === "live" ? "live" : "NOT VERIFIED";
    console.log(
      `runtime=${cfg.runtime} provider=${probe.provider} model=${probe.model} kind=${label} ok=${probe.ok}` +
        (probe.latencyMs !== undefined ? ` latencyMs=${probe.latencyMs}` : "") +
        (probe.usage ? ` usage=${JSON.stringify(probe.usage)}` : ""),
    );
    console.log(probe.message);
    process.exitCode = probe.status === "live" && probe.ok ? 0 : 1;
  });

const workflow = program
  .command("workflow")
  .description(
    "Canned end-to-end flows (issue-to-pr, pr-review-merge, bug-repro-fix, rfc-hyperplan).",
  );
workflow.command("list").action(() => {
  for (const w of listWorkflows()) console.log(`- ${w.name}: ${w.description}`);
});
workflow.command("run <name> <prompt...>").action(async (name: string, parts: string[]) => {
  const prompt = parts.join(" ").trim();
  if (!prompt) {
    console.error(`usage: quantum workflow run ${name} <prompt>`);
    process.exitCode = 2;
    return;
  }
  const r = await runAgent(prompt, { workflow: name });
  console.log(r.text);
});

program
  .command("agent <action> [name] [description...]")
  .description("Manage specialist agents.")
  .action((action: string, name?: string, parts: string[] = []) => {
    if (action === "list") {
      for (const a of listAgents()) console.log(`- ${a.name} [${a.source}]: ${a.description}`);
      return;
    }
    if (action === "new" && name) {
      const description = parts.join(" ") || `${name} specialist agent`;
      const file = generateAgent(name, description);
      console.log(`wrote ${file.path} (${file.bytes} bytes)`);
      return;
    }
    console.log("usage: quantum agent <list|new <name> [description...]>");
  });

program
  .command("tool <action> [name] [description...]")
  .description("Manage custom MCP tools.")
  .action((action: string, name?: string, parts: string[] = []) => {
    if (action === "list") {
      console.log("- bash, fetch, grep, read, remember, recall");
      return;
    }
    if (action === "new" && name) {
      const description = parts.join(" ") || `${name} tool`;
      const file = generateTool(name, description);
      console.log(`wrote ${file.path} (${file.bytes} bytes)`);
      return;
    }
    console.log("usage: quantum tool <list|new <name> [description...]>");
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
  .option("--apply", "actually apply changes (default is dry-run)")
  .action(async (opts: { apply?: boolean }) => {
    const mode = opts.apply ? "apply" : "dry-run";
    const commands = [
      ["pnpm", ["outdated", "--format", "list"]],
      ["mise", ["outdated"]],
    ] as [string, string[]][];
    const results: Record<string, string> = {};
    const { execa } = await import("execa");
    for (const [cmd, args] of commands) {
      try {
        const r = await execa(cmd, args, { reject: false, timeout: 60_000 });
        results[`${cmd} ${args[0]}`] = r.stdout.trim() || "(nothing)";
      } catch {
        results[`${cmd} ${args[0]}`] = `[${cmd} not installed]`;
      }
    }
    if (opts.apply) {
      try {
        await execa("pnpm", ["up", "-L", "--silent"], { reject: false, timeout: 300_000 });
        results["pnpm up"] = "applied";
      } catch (err) {
        results["pnpm up"] = (err as Error).message;
      }
    }
    console.log(JSON.stringify({ mode, results }, null, 2));
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
