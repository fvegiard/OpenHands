// Source driver: filesystem (skills-core/ and skills/).

import { discover } from "../loader.ts";

export function localList(): { path: string; name: string }[] {
  return discover(["./skills-core", "./skills"]).map((m) => ({
    path: m.path,
    name: m.frontmatter.name,
  }));
}
