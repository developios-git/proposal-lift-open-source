import { describe, expect, it } from "vitest";
import {
  buildGettingStartedSteps,
  hasAiKeyContent,
  hasKnowledgeBaseContent,
  hasPersonalUpworkCredentials,
  type GettingStartedInput,
} from "./getting-started-steps";

const BASE: GettingStartedInput = {
  hasAiKey: false,
  upworkConnected: false,
  hasPersonalUpworkCredentials: false,
  hasKnowledgeBase: false,
  filterCount: 0,
  personaCount: 0,
  projectCount: 0,
  templateCount: 0,
  hookCount: 0,
};

const steps = (input: Partial<GettingStartedInput>) =>
  buildGettingStartedSteps({ ...BASE, ...input });

const ids = (input: Partial<GettingStartedInput>) =>
  steps(input).map((s) => s.id);

const doneById = (input: Partial<GettingStartedInput>) =>
  Object.fromEntries(steps(input).map((s) => [s.id, s.done])) as Record<
    string,
    boolean
  >;

const stepById = (input: Partial<GettingStartedInput>, id: string) =>
  steps(input).find((s) => s.id === id)!;

const EXPECTED_ORDER = [
  "ai_key",
  "upwork_credentials",
  "upwork_connect",
  "filters",
  "personas",
  "knowledge_base",
  "portfolio",
  "templates",
  "hooks",
];

describe("buildGettingStartedSteps ordering", () => {
  it("returns nine steps in a single fixed order", () => {
    // No plan branch: there is no shared Upwork app to connect to before
    // registering your own, so only one order is possible.
    expect(ids({})).toEqual(EXPECTED_ORDER);
    expect(
      ids({ hasAiKey: true, upworkConnected: true, filterCount: 3 }),
    ).toEqual(EXPECTED_ORDER);
  });

  it("puts the AI key first, because nothing that calls a model works without it", () => {
    expect(ids({})[0]).toBe("ai_key");
  });

  it("puts credentials before connect", () => {
    // You cannot OAuth an Upwork account until your own developer app exists.
    const order = ids({});
    expect(order.indexOf("upwork_credentials")).toBeLessThan(
      order.indexOf("upwork_connect"),
    );
  });

  it("labels the steps distinctly", () => {
    const list = steps({});
    expect(list[0].label).toBe("Add your OpenAI API key");
    expect(list[1].label).toBe("Add Upwork API Client ID & Secret");
    expect(list[2].label).toBe("Connect Upwork");
  });
});

describe("buildGettingStartedSteps AI key step", () => {
  it("is incomplete with no key", () => {
    expect(doneById({}).ai_key).toBe(false);
  });

  it("completes from its own flag alone", () => {
    const done = doneById({ hasAiKey: true });
    expect(done.ai_key).toBe(true);
    expect(done.portfolio).toBe(false);
  });
});

describe("buildGettingStartedSteps portfolio gate", () => {
  it("marks portfolio blocked by the AI key while no key is saved", () => {
    // Creating a project requires the key, because the key is what generates
    // the embedding. The checklist points at that before the user tries.
    expect(stepById({}, "portfolio").blockedBy).toBe("ai_key");
  });

  it("still marks portfolio blocked when projects already exist", () => {
    const step = stepById({ projectCount: 4 }, "portfolio");
    expect(step.done).toBe(true);
    expect(step.blockedBy).toBe("ai_key");
  });

  it("clears the block once a key is saved", () => {
    expect(stepById({ hasAiKey: true }, "portfolio").blockedBy).toBeUndefined();
  });

  it("blocks nothing else", () => {
    for (const step of steps({})) {
      if (step.id !== "portfolio") expect(step.blockedBy).toBeUndefined();
    }
  });
});

describe("buildGettingStartedSteps Upwork predicates", () => {
  it("completes only the credentials step when credentials exist but nothing is linked", () => {
    const done = doneById({ hasPersonalUpworkCredentials: true });
    expect(done.upwork_credentials).toBe(true);
    expect(done.upwork_connect).toBe(false);
  });

  it("completes only the connect step when a token exists without credentials", () => {
    // Reachable after credentials are removed while a token survives; the
    // checklist must point at the missing half rather than call it finished.
    const done = doneById({ upworkConnected: true });
    expect(done.upwork_connect).toBe(true);
    expect(done.upwork_credentials).toBe(false);
  });

  it("completes both for a full connection", () => {
    const done = doneById({
      upworkConnected: true,
      hasPersonalUpworkCredentials: true,
    });
    expect(done.upwork_connect).toBe(true);
    expect(done.upwork_credentials).toBe(true);
  });
});

describe("buildGettingStartedSteps content steps", () => {
  it("leaves every content step incomplete at zero counts", () => {
    const done = doneById({});
    expect(done.filters).toBe(false);
    expect(done.personas).toBe(false);
    expect(done.knowledge_base).toBe(false);
    expect(done.portfolio).toBe(false);
    expect(done.templates).toBe(false);
    expect(done.hooks).toBe(false);
  });

  it("completes each content step from its own count", () => {
    const done = doneById({
      filterCount: 1,
      personaCount: 2,
      hasKnowledgeBase: true,
      projectCount: 3,
      templateCount: 4,
      hookCount: 5,
    });
    expect(done.filters).toBe(true);
    expect(done.personas).toBe(true);
    expect(done.knowledge_base).toBe(true);
    expect(done.portfolio).toBe(true);
    expect(done.templates).toBe(true);
    expect(done.hooks).toBe(true);
  });

  it("completes the knowledge base step from its own flag alone", () => {
    const done = doneById({ hasKnowledgeBase: true });
    expect(done.knowledge_base).toBe(true);
    expect(done.personas).toBe(false);
    expect(done.portfolio).toBe(false);
  });

  it("does not let one count complete another step", () => {
    const done = doneById({ filterCount: 3 });
    expect(done.filters).toBe(true);
    expect(done.personas).toBe(false);
    expect(done.knowledge_base).toBe(false);
    expect(done.portfolio).toBe(false);
    expect(done.templates).toBe(false);
    expect(done.hooks).toBe(false);
  });
});

describe("hasAiKeyContent", () => {
  it("treats unset values as incomplete", () => {
    expect(hasAiKeyContent(null)).toBe(false);
    expect(hasAiKeyContent(undefined)).toBe(false);
    expect(hasAiKeyContent("")).toBe(false);
  });

  it("treats whitespace-only values as incomplete", () => {
    // A column holding spaces is a key OpenAI will reject, not a key.
    expect(hasAiKeyContent("   ")).toBe(false);
    expect(hasAiKeyContent("\n")).toBe(false);
  });

  it("accepts a stored key", () => {
    expect(hasAiKeyContent("sk-test-123")).toBe(true);
  });
});

describe("hasKnowledgeBaseContent", () => {
  it("treats unset values as incomplete", () => {
    expect(hasKnowledgeBaseContent(null)).toBe(false);
    expect(hasKnowledgeBaseContent(undefined)).toBe(false);
    expect(hasKnowledgeBaseContent("")).toBe(false);
  });

  it("treats whitespace-only content as incomplete", () => {
    // Whitespace reaches the model as nothing usable, so it must not tick the
    // step and tell the user their setup is done.
    expect(hasKnowledgeBaseContent("   ")).toBe(false);
    expect(hasKnowledgeBaseContent("\n\n")).toBe(false);
    expect(hasKnowledgeBaseContent("\t")).toBe(false);
  });

  it("accepts any real content", () => {
    expect(hasKnowledgeBaseContent("a")).toBe(true);
    expect(hasKnowledgeBaseContent("## Who we are")).toBe(true);
  });
});

describe("hasPersonalUpworkCredentials", () => {
  it("requires both fields", () => {
    expect(hasPersonalUpworkCredentials("client-id", "encrypted")).toBe(true);
    expect(hasPersonalUpworkCredentials("client-id", null)).toBe(false);
    expect(hasPersonalUpworkCredentials(null, "encrypted")).toBe(false);
    expect(hasPersonalUpworkCredentials(null, null)).toBe(false);
    expect(hasPersonalUpworkCredentials(undefined, undefined)).toBe(false);
  });

  it("treats whitespace-only values as unset", () => {
    expect(hasPersonalUpworkCredentials("   ", "encrypted")).toBe(false);
    expect(hasPersonalUpworkCredentials("client-id", "  ")).toBe(false);
    expect(hasPersonalUpworkCredentials("", "")).toBe(false);
  });
});
