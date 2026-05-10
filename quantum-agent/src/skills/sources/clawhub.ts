// Source driver: ClawHub HTTP API. Offline-safe.

import { request } from "undici";

const BASE = "https://clawhub.dev/api/v1";

export interface ClawHubSkill {
  name: string;
  description: string;
  url: string;
}

export async function clawhubSearch(query: string): Promise<ClawHubSkill[]> {
  try {
    const { statusCode, body } = await request(`${BASE}/skills/search?q=${encodeURIComponent(query)}`);
    if (statusCode !== 200) return [];
    const text = await body.text();
    const data = JSON.parse(text) as { skills?: ClawHubSkill[] };
    return data.skills ?? [];
  } catch {
    return [];
  }
}
