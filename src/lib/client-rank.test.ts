import { describe, expect, it } from "vitest";

import {
  CLIENT_RANK_CONFIDENCE_FLOOR,
  computeClientRankScore,
  type JobClientData,
} from "./client-rank";

/** A payment-verified client with every optional signal absent. */
function client(overrides: Partial<JobClientData> = {}): JobClientData {
  return {
    client_payment_verified: true,
    client_total_spent: null,
    client_total_hires: null,
    client_total_posted_jobs: null,
    client_total_reviews: null,
    client_avg_rating: null,
    has_financial_privacy: null,
    ...overrides,
  };
}

function factor(
  result: ReturnType<typeof computeClientRankScore>,
  key: string,
) {
  const found = result.factors.find((f) => f.key === key);
  if (!found) throw new Error(`no factor ${key}`);
  return found;
}

describe("computeClientRankScore", () => {
  describe("the payment gate", () => {
    it("returns Risky when payment is unverified, however strong the rest is", () => {
      const result = computeClientRankScore(
        client({
          client_payment_verified: false,
          client_total_spent: 250_000,
          client_total_hires: 80,
          client_total_posted_jobs: 90,
          client_total_reviews: 60,
          client_avg_rating: 5,
        }),
      );
      expect(result.status).toBe("Risky");
      expect(result.score).toBe(1);
    });

    it("fires before the confidence floor, so a blank unverified client is Risky not Unknown", () => {
      const result = computeClientRankScore(
        client({ client_payment_verified: false }),
      );
      expect(result.status).toBe("Risky");
      expect(result.score).toBe(1);
    });

    it("treats a null verification status as unverified", () => {
      const result = computeClientRankScore(
        client({ client_payment_verified: null, client_total_spent: 50_000 }),
      );
      expect(result.status).toBe("Risky");
    });
  });

  describe("the regression this rewrite exists for", () => {
    it("does not call a $0 / 0-hire / 12-post client with one review Excellent", () => {
      const result = computeClientRankScore(
        client({
          client_total_spent: 0,
          client_total_hires: 0,
          client_total_posted_jobs: 12,
          client_total_reviews: 1,
          client_avg_rating: 5,
        }),
      );
      expect(result.status).toBe("Risky");
      expect(result.score).toBe(1);
    });
  });

  describe("spend", () => {
    it.each([
      [0, 0],
      [500, 0.35],
      [999, 0.35],
      [1_000, 0.7],
      [9_999, 0.7],
      [10_000, 1],
      [250_000, 1],
    ])("bands $%d to %f", (spent, expected) => {
      const result = computeClientRankScore(
        client({ client_total_spent: spent }),
      );
      expect(factor(result, "spend").subscore).toBe(expected);
    });

    it("is unknown when the client hides financials, rather than scoring zero", () => {
      const result = computeClientRankScore(
        client({ client_total_spent: null, has_financial_privacy: true }),
      );
      expect(factor(result, "spend").subscore).toBeNull();
      expect(factor(result, "spend").detail).toMatch(/hidden/i);
    });

    it("distinguishes a known zero from an absent value", () => {
      expect(
        factor(
          computeClientRankScore(client({ client_total_spent: 0 })),
          "spend",
        ).subscore,
      ).toBe(0);
      expect(
        factor(
          computeClientRankScore(client({ client_total_spent: null })),
          "spend",
        ).subscore,
      ).toBeNull();
    });
  });

  describe("hire rate", () => {
    it("is unknown below the 3-post minimum, so 1-of-1 is not a perfect record", () => {
      const result = computeClientRankScore(
        client({ client_total_hires: 1, client_total_posted_jobs: 1 }),
      );
      expect(factor(result, "hire_rate").subscore).toBeNull();
    });

    it("is still unknown at 2 posted jobs", () => {
      const result = computeClientRankScore(
        client({ client_total_hires: 2, client_total_posted_jobs: 2 }),
      );
      expect(factor(result, "hire_rate").subscore).toBeNull();
    });

    it("resolves at 3 posted jobs", () => {
      const result = computeClientRankScore(
        client({ client_total_hires: 3, client_total_posted_jobs: 3 }),
      );
      expect(factor(result, "hire_rate").subscore).toBe(1);
    });

    it.each([
      [1, 10, 0],
      [2, 10, 0.4],
      [4, 10, 0.4],
      [5, 10, 0.75],
      [7, 10, 0.75],
      [8, 10, 1],
      [10, 10, 1],
    ])("bands %d hires of %d posts to %f", (hires, posts, expected) => {
      const result = computeClientRankScore(
        client({
          client_total_hires: hires,
          client_total_posted_jobs: posts,
        }),
      );
      expect(factor(result, "hire_rate").subscore).toBe(expected);
    });
  });

  describe("hire volume", () => {
    it.each([
      [0, 0],
      [1, 0.5],
      [4, 0.5],
      [5, 0.8],
      [19, 0.8],
      [20, 1],
    ])("bands %d hires to %f", (hires, expected) => {
      const result = computeClientRankScore(
        client({ client_total_hires: hires }),
      );
      expect(factor(result, "hire_volume").subscore).toBe(expected);
    });

    it("is unknown when the field is absent", () => {
      const result = computeClientRankScore(client({ client_total_hires: null }));
      expect(factor(result, "hire_volume").subscore).toBeNull();
    });
  });

  describe("the rating confidence curve", () => {
    it("barely moves on a single five-star review", () => {
      const result = computeClientRankScore(
        client({ client_total_reviews: 1, client_avg_rating: 5 }),
      );
      expect(factor(result, "rating").subscore).toBeCloseTo(0.55, 5);
    });

    it("lets a mediocre average across many reviews drag the score down", () => {
      const result = computeClientRankScore(
        client({ client_total_reviews: 15, client_avg_rating: 3.6 }),
      );
      expect(factor(result, "rating").subscore).toBeCloseTo(0.3, 5);
    });

    it("caps confidence at 10 reviews", () => {
      const ten = computeClientRankScore(
        client({ client_total_reviews: 10, client_avg_rating: 4.5 }),
      );
      const fifty = computeClientRankScore(
        client({ client_total_reviews: 50, client_avg_rating: 4.5 }),
      );
      expect(factor(ten, "rating").subscore).toBe(
        factor(fifty, "rating").subscore,
      );
    });

    it("floors at 3.0 stars rather than going negative", () => {
      const result = computeClientRankScore(
        client({ client_total_reviews: 20, client_avg_rating: 1.2 }),
      );
      expect(factor(result, "rating").subscore).toBe(0);
    });

    it("is unknown with zero reviews", () => {
      const result = computeClientRankScore(
        client({ client_total_reviews: 0, client_avg_rating: null }),
      );
      expect(factor(result, "rating").subscore).toBeNull();
    });
  });

  describe("the confidence floor", () => {
    it("returns Unknown when only hire volume resolves", () => {
      const result = computeClientRankScore(
        client({
          has_financial_privacy: true,
          client_total_hires: 1,
          client_total_posted_jobs: 2,
          client_total_reviews: 0,
        }),
      );
      expect(result.confidence).toBeCloseTo(0.15, 5);
      expect(result.status).toBe("Unknown");
      expect(result.score).toBeNull();
    });

    it("returns Unknown when only the rating resolves", () => {
      const result = computeClientRankScore(
        client({
          has_financial_privacy: true,
          client_total_reviews: 12,
          client_avg_rating: 4.8,
        }),
      );
      expect(result.confidence).toBeCloseTo(0.2, 5);
      expect(result.status).toBe("Unknown");
    });

    it("scores at exactly the floor", () => {
      const result = computeClientRankScore(
        client({
          has_financial_privacy: true,
          client_total_hires: 2,
          client_total_posted_jobs: 2,
          client_total_reviews: 12,
          client_avg_rating: 4.8,
        }),
      );
      expect(result.confidence).toBeCloseTo(CLIENT_RANK_CONFIDENCE_FLOOR, 5);
      expect(result.status).not.toBe("Unknown");
    });

    it("scores a brand-new verified client as Risky, not Unknown", () => {
      const result = computeClientRankScore(
        client({
          client_total_spent: 0,
          client_total_hires: 0,
          client_total_posted_jobs: 0,
          client_total_reviews: 0,
        }),
      );
      expect(result.confidence).toBeCloseTo(0.55, 5);
      expect(result.status).toBe("Risky");
    });
  });

  describe("normalization over resolved factors", () => {
    it("does not cap a financial-privacy client whose other signals are strong", () => {
      const result = computeClientRankScore(
        client({
          has_financial_privacy: true,
          client_total_hires: 15,
          client_total_posted_jobs: 20,
          client_total_reviews: 12,
          client_avg_rating: 4.8,
        }),
      );
      expect(result.confidence).toBeCloseTo(0.6, 5);
      expect(result.status).toBe("Excellent");
      expect(result.score).toBe(5);
    });
  });

  describe("banding", () => {
    it("returns Excellent for a strong full-history client", () => {
      const result = computeClientRankScore(
        client({
          client_total_spent: 50_000,
          client_total_hires: 16,
          client_total_posted_jobs: 20,
          client_total_reviews: 25,
          client_avg_rating: 4.9,
        }),
      );
      expect(result.status).toBe("Excellent");
      expect(result.score).toBe(5);
      expect(result.confidence).toBe(1);
    });

    it("returns Medium for a middling client", () => {
      const result = computeClientRankScore(
        client({
          client_total_spent: 5_000,
          client_total_hires: 3,
          client_total_posted_jobs: 10,
          client_total_reviews: 3,
          client_avg_rating: 4.5,
        }),
      );
      expect(result.status).toBe("Medium");
      expect(result.score).toBe(3);
    });
  });

  describe("the evidence it returns", () => {
    it("orders factors by contribution so the popover can render them directly", () => {
      const result = computeClientRankScore(
        client({
          client_total_spent: 50_000,
          client_total_hires: 16,
          client_total_posted_jobs: 20,
          client_total_reviews: 25,
          client_avg_rating: 4.9,
        }),
      );
      const contributions = result.factors.map((f) => f.contribution);
      expect(contributions).toEqual([...contributions].sort((a, b) => b - a));
    });

    it("reports every factor even when unresolved, so the popover can say what is missing", () => {
      const result = computeClientRankScore(client());
      expect(result.factors.map((f) => f.key).sort()).toEqual([
        "hire_rate",
        "hire_volume",
        "rating",
        "spend",
      ]);
      expect(result.factors.every((f) => f.subscore === null)).toBe(true);
    });

    it("gives an unresolved factor a zero contribution so ordering stays stable", () => {
      const result = computeClientRankScore(client());
      expect(result.factors.every((f) => f.contribution === 0)).toBe(true);
    });
  });
});
