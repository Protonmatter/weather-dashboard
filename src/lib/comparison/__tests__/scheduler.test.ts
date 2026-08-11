import { describe, expect, it, vi } from "vitest";
import { createComparisonScheduler } from "../scheduler";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("comparison scheduler", () => {
  it("never runs more than two tasks at once", async () => {
    const scheduler = createComparisonScheduler(2);
    let active = 0;
    let maximum = 0;
    const gates = Array.from({ length: 6 }, deferred);
    const tasks = gates.map((gate) => scheduler.schedule(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await gate.promise;
      active -= 1;
    }));

    await vi.waitFor(() => expect(maximum).toBe(2));
    gates.forEach((gate) => gate.resolve());
    await Promise.all(tasks);

    expect(maximum).toBe(2);
  });

  it("rejects an aborted queued task without starting it", async () => {
    const scheduler = createComparisonScheduler(1);
    const gate = deferred();
    const running = scheduler.schedule(async () => { await gate.promise; });
    const queuedWork = vi.fn(async () => undefined);
    const controller = new AbortController();
    const queued = scheduler.schedule(queuedWork, controller.signal);

    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    gate.resolve();
    await running;

    expect(queuedWork).not.toHaveBeenCalled();
  });

  it("releases a slot after a task fails", async () => {
    const scheduler = createComparisonScheduler(1);
    await expect(scheduler.schedule(async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    await expect(scheduler.schedule(async () => "next")).resolves.toBe("next");
  });

  it("rejects invalid concurrency limits", () => {
    expect(() => createComparisonScheduler(0)).toThrow(/limit/i);
    expect(() => createComparisonScheduler(1.5)).toThrow(/limit/i);
  });
});
