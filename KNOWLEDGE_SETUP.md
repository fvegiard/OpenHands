# Keep the agent aligned (easy setup)

You don’t need to code. You only maintain **one Markdown file** the agent can read.

## One-time setup

1. In the **root of this repo**, copy `MY_PROJECT_KNOWLEDGE.example.md` to **`MY_PROJECT_KNOWLEDGE.md`**.
2. Open `MY_PROJECT_KNOWLEDGE.md` and replace the placeholders with your answers (bullets are fine).
3. Save the file. It stays **private on your machine**: `MY_PROJECT_KNOWLEDGE.md` is listed in `.gitignore` and will not be committed.

## Day to day

- When you chat, say things like **“follow my project file”** or **“use my preferences”** so context loads naturally.
- When something important changes (new URL, new tool, new rule), **edit `MY_PROJECT_KNOWLEDGE.md`**—that is your knowledge update.
- **Do not** put API keys or passwords in that file.

## OpenHands note

A small **microagent** in `.openhands/microagents/my-project-knowledge.md` helps load this context when your message matches everyday phrases (e.g. “my app”, “vibe coding”).

## Want more later

- **Cursor:** add project rules or `@Docs` for frameworks you use ([indexing overview](https://cursor.com/help/customization/indexing)).
- **Bigger teams:** use a wiki or Notion plus an automated sync into a vector database (optional; not required for vibe coding).
