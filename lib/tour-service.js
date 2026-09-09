import { tourPrompt, validateTour } from "./tour.js";

export function createTourService(store, runner, cwd) {
  const active = new Set();
  async function get(key) {
    const state = await store.read(key);
    if (state.status === "running" && !active.has(key)) {
      return store.update(key, (current) => ({ ...current, status: "error", error: "Tour generation was interrupted. Retry to continue." }));
    }
    return state;
  }
  async function generate(key, input, retry) {
    let started = false;
    const state = await store.update(key, (current) => {
      if (current.status === "ready" || active.has(key) || (current.status === "error" && !retry)) {
        return current;
      }
      started = true;
      active.add(key);
      return { status: "running", tour: null, error: null, model: "gpt-5.6-luna", version: input.version, revision: input.revision, baseSha: input.baseSha, startedAt: new Date().toISOString(), activity: "Mapping the change and planning the review route…" };
    }).catch((error) => {
      if (started) {
        active.delete(key);
      }
      throw error;
    });
    if (!started) {
      return state;
    }
    async function run() {
      try {
        const contextPath = await store.context(key, input);
        const messages = [];
        await runner({ sessionId: null, cwd, prompt: tourPrompt(input, contextPath), onEvent: async (event) => {
          if (event.type === "thread.started") {
            await store.update(key, (current) => ({ ...current, sessionId: event.thread_id }));
          }
          if (event.type === "item.started" && event.item?.type === "command_execution") {
            await store.update(key, (current) => ({ ...current, activity: "Reading code and tracing review checkpoints…" }));
          }
          if (event.type === "item.completed" && event.item?.type === "agent_message") {
            messages.push(event.item.text);
          }
        } });
        // Commentary events may precede the final structured response.
        const tour = validateTour(messages.at(-1) ?? "", input);
        await store.update(key, (current) => ({ ...current, status: "ready", tour, generatedAt: new Date().toISOString(), activity: null }));
      } catch (error) {
        await store.update(key, (current) => ({ ...current, status: "error", activity: null, error: error instanceof SyntaxError ? "Luna returned an incomplete tour. Please retry generation." : error.message }));
      } finally {
        active.delete(key);
      }
    }
    void run().catch(() => { active.delete(key); });
    return state;
  }
  async function markReviewed(key, section, reviewed) {
    if (typeof reviewed !== "boolean" || typeof section !== "string") {
      throw new Error("A tour section and reviewed flag are required");
    }
    return store.update(key, (current) => {
      if (current.status !== "ready") {
        throw new Error("Generate the tour before marking sections reviewed");
      }
      const sections = ["overview", ...current.tour.steps.map((step) => `step-${step.id}`), ...(current.tour.mechanical?.length ? ["mechanical"] : []), "tests"];
      if (!sections.includes(section)) {
        throw new Error("Unknown tour section");
      }
      const reviewedSections = { ...current.reviewedSections };
      if (reviewed) {
        reviewedSections[section] ??= new Date().toISOString();
      } else {
        delete reviewedSections[section];
      }
      return { ...current, reviewedSections };
    });
  }
  return { get, generate, markReviewed };
}
