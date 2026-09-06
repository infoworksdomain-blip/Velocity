import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publish, resetForTests, subscribe, subscribeAll, type NotificationEvent } from "../bus";

function makeEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    type: "render_complete",
    workspaceId: randomUUID(),
    userId: randomUUID(),
    title: "Your video is ready",
    body: "Render finished successfully.",
    ...overrides,
  };
}

describe("notifications bus (STEP 7 — no real producers yet, proven with a synthetic event)", () => {
  afterEach(() => resetForTests());

  it("delivers an event to a handler subscribed to its exact type", () => {
    const handler = vi.fn();
    subscribe("render_complete", handler);

    const event = makeEvent();
    publish(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("does not deliver an event to a handler subscribed to a different type", () => {
    const handler = vi.fn();
    subscribe("publish_failed", handler);

    publish(makeEvent({ type: "render_complete" }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("delivers every event to a wildcard subscriber regardless of type", () => {
    const handler = vi.fn();
    subscribeAll(handler);

    publish(makeEvent({ type: "render_complete" }));
    publish(makeEvent({ type: "credit_low" }));

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("stops delivering to a handler once unsubscribed", () => {
    const handler = vi.fn();
    const unsubscribe = subscribe("render_complete", handler);
    unsubscribe();

    publish(makeEvent());

    expect(handler).not.toHaveBeenCalled();
  });
});
