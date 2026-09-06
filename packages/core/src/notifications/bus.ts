/**
 * In-process pub/sub for notification events (STEP 7). No producers exist
 * yet — render-complete, publish-failed and credit-low events are STEP
 * 8/12/19's job to emit — so this is proven with a synthetic event in
 * __tests__/bus.test.ts rather than an end-to-end producer path.
 *
 * Deliberately in-memory, not durable: this bus lives inside a single
 * Node process. It's the right layer for "the API process persists a
 * notification row and can push it over an already-open connection," but
 * it is NOT a replacement for Kafka/BullMQ delivery between apps/worker
 * and apps/web — cross-process notification delivery is a later-step
 * concern (see the events package once it exists) that would need a
 * durable, at-least-once transport, unlike this.
 */

export type NotificationEventType =
  | "render_complete"
  | "publish_failed"
  | "credit_low"
  | "invitation_received";

export interface NotificationEvent {
  type: NotificationEventType;
  workspaceId: string;
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export type NotificationHandler = (event: NotificationEvent) => void | Promise<void>;

const typeHandlers = new Map<NotificationEventType, Set<NotificationHandler>>();
const wildcardHandlers = new Set<NotificationHandler>();

/** Fire-and-forget: a handler's rejection never blocks or breaks the publisher. */
export function publish(event: NotificationEvent): void {
  for (const handler of wildcardHandlers) {
    void handler(event);
  }
  for (const handler of typeHandlers.get(event.type) ?? []) {
    void handler(event);
  }
}

/** Returns an unsubscribe function. */
export function subscribe(eventType: NotificationEventType, handler: NotificationHandler): () => void {
  let handlers = typeHandlers.get(eventType);
  if (!handlers) {
    handlers = new Set();
    typeHandlers.set(eventType, handlers);
  }
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** Receives every event regardless of type — the persistence subscriber's hook (apps/web/server/notifications-bootstrap.ts). */
export function subscribeAll(handler: NotificationHandler): () => void {
  wildcardHandlers.add(handler);
  return () => wildcardHandlers.delete(handler);
}

/** Test-only: clears all subscriptions so tests don't leak handlers into each other via this module-level singleton. */
export function resetForTests(): void {
  typeHandlers.clear();
  wildcardHandlers.clear();
}
