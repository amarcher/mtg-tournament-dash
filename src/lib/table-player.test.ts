import { describe, expect, it } from "vitest";
import type { Player } from "@/db/schema";
import { toTablePlayer } from "./table-player";

describe("toTablePlayer", () => {
  it("keeps only what the scorekeeper renders", () => {
    const row = {
      id: "p1",
      leagueId: "l1",
      displayName: "Ada",
      leagueToken: "secret-token",
      selfieUrl: "https://example.test/selfie.jpg",
      avatarUrl: "a",
      avatarWoundedUrl: "b",
      avatarCriticalUrl: "c",
      avatarVictoryUrl: "d",
      avatarDefeatUrl: "e",
    } as unknown as Player;
    const out = toTablePlayer(row);
    expect(Object.keys(out).sort()).toEqual([
      "avatarCriticalUrl",
      "avatarDefeatUrl",
      "avatarUrl",
      "avatarVictoryUrl",
      "avatarWoundedUrl",
      "displayName",
      "id",
    ]);
    expect(JSON.stringify(out)).not.toContain("secret-token");
  });
});
