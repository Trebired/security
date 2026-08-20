import { normalizers as normalize } from "@trebired/utils";
import *as state from "./state.js";

function indexBansById(list: any[]) {
  const bansById = new Map<string, any>();

  for (const ban of list) {
    if (!state.isBanRow(ban)) continue;
    const banId = normalize.toString(ban && ban.id);
    if (!banId) continue;
    bansById.set(banId, ban);
  }

  return bansById;
}

export { indexBansById };
