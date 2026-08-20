import { test, expect, describe } from "bun:test";
import { calculateCardDiscardReward, CARD_DISCARD_REWARDS } from "../constants";

describe("calculateCardDiscardReward", () => {
  test("multiplies base reward by quantity and the income inflation rate", () => {
    expect(calculateCardDiscardReward('Lendário', 1, 1)).toBe(CARD_DISCARD_REWARDS.Lendário);
    expect(calculateCardDiscardReward('Lendário', 3, 1)).toBe(CARD_DISCARD_REWARDS.Lendário! * 3);
    expect(calculateCardDiscardReward('Lendário', 1, 2)).toBe(CARD_DISCARD_REWARDS.Lendário! * 2);
  });

  test("rounds to the nearest whole coin", () => {
    expect(calculateCardDiscardReward('Comum', 1, 1.15)).toBe(Math.round(CARD_DISCARD_REWARDS.Comum! * 1.15));
  });

  test("an unknown rarity name yields 0, not NaN or a throw", () => {
    expect(calculateCardDiscardReward('Inexistente', 5, 1)).toBe(0);
  });
});
