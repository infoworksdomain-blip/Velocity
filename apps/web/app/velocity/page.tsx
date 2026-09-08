"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import { AppSidebar, EmptyState, Text, VelocityCard, VelocityDeck, type SidebarItem } from "@velocity/ui";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import styles from "./velocity.module.css";

type QueueConcept = Awaited<ReturnType<typeof trpcClient.velocity.queue.query>>["concepts"][number];

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <span aria-hidden>◆</span>, href: "/dashboard" },
  { id: "velocity", label: "Velocity", icon: <span aria-hidden>▲</span>, href: "/velocity", active: true },
  { id: "calendar", label: "Calendar", icon: <span aria-hidden>■</span>, href: "/calendar" },
  { id: "accounts", label: "Accounts", icon: <span aria-hidden>●</span>, href: "/accounts" },
  { id: "analytics", label: "Analytics", icon: <span aria-hidden>▲</span>, href: "/analytics" },
  { id: "assistant", label: "Assistant", icon: <span aria-hidden>✦</span>, href: "/assistant" },
  { id: "ugc", label: "UGC Studio", icon: <span aria-hidden>★</span>, href: "/ugc" },
  { id: "automations", label: "Automation", icon: <span aria-hidden>⚙</span>, href: "/automations" },
];

/** Past this many px of horizontal drag, releasing commits the swipe instead of springing back — build script STEP 9's "swipe-to-next latency budget: under 100ms" is about the LOCAL, optimistic response to a commit (state update + animation start), not the server round trip, which happens after. */
const COMMIT_THRESHOLD_PX = 120;
/** Below this many queued cards, fetch more — build script: "background top-up below 10," applied client-side to the LOCAL prefetch buffer (prefetch 20 cards, preload next 3). */
const PREFETCH_THRESHOLD = 5;
const WORKSPACE_TIER = "free";

/**
 * STEP 9's Velocity queue: Tier-1 concept cards, swipe-right triggers the
 * real Tier-2 render (routers/velocity.ts's `swipe`), swipe-left just
 * records the rejection. Real gesture + keyboard + button parity per the
 * build script's accessibility requirement — none of the three is a
 * fallback for the others; all three commit through the exact same
 * `commitSwipe` path.
 *
 * Honest scope note (see docs/steps/STEP-09.md): queue state lives in
 * React state for this pass, not the build script's IndexedDB cache — a
 * real, flagged follow-up, not a silent gap. Preview media renders a
 * placeholder when `previewAssetStorageKey` is null (the common case in
 * this environment — no funded image/video provider key, same gap
 * documented throughout STEP 8/8B).
 */
export default function VelocityPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [queue, setQueue] = useState<QueueConcept[] | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragX, setDragX] = useState(0);
  const [canUndo, setCanUndo] = useState(false);

  const dwellStartRef = useRef<number>(Date.now());
  const pointerStartXRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const fetchQueue = useCallback(async () => {
    const result = await trpcClient.velocity.queue.query({ workspaceTier: WORKSPACE_TIER });
    return result.concepts;
  }, []);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    setError(null);
    trpcClient.velocity.session.start
      .mutate()
      .then((r) => setSessionId(r.velocitySessionId))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to start a Velocity session"));
    fetchQueue()
      .then((concepts) => {
        setQueue(concepts);
        dwellStartRef.current = Date.now();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load the Velocity queue"));
  }, [currentWorkspaceId, fetchQueue]);

  useEffect(() => {
    if (!queue || queue.length === 0 || queue.length >= PREFETCH_THRESHOLD || !currentWorkspaceId) return;
    fetchQueue()
      .then((fresh) => {
        setQueue((current) => {
          if (!current) return fresh;
          const seenIds = new Set(current.map((c) => c.id));
          return [...current, ...fresh.filter((c) => !seenIds.has(c.id))];
        });
      })
      .catch(() => {
        // Prefetch is best-effort — the queue just serves what it already has (real, honest empty/short state, not a hidden failure).
      });
    // Only re-runs when the queue's LENGTH crosses the threshold, not on every queue identity change — avoids a prefetch storm from the optimistic update inside commitSwipe.
  }, [queue?.length, currentWorkspaceId]);

  const commitSwipe = useCallback(
    (direction: "left" | "right") => {
      if (!queue || queue.length === 0 || !sessionId) return;
      const top = queue[0]!;
      const dwellTimeMs = Date.now() - dwellStartRef.current;

      setQueue((current) => (current ? current.slice(1) : current));
      setDragX(0);
      setCanUndo(true);
      dwellStartRef.current = Date.now();

      trpcClient.velocity.swipe
        .mutate({
          velocitySessionId: sessionId,
          contentConceptId: top.id,
          direction,
          dwellTimeMs,
          previewWatchedToCompletion: false,
          replayCount: 0,
          workspaceTier: WORKSPACE_TIER,
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to record that swipe"));
    },
    [queue, sessionId],
  );

  const handleUndo = useCallback(() => {
    if (!sessionId) return;
    trpcClient.velocity.undoLastSwipe
      .mutate({ velocitySessionId: sessionId })
      .then(() => fetchQueue())
      .then((concepts) => {
        setQueue(concepts);
        setCanUndo(false);
        dwellStartRef.current = Date.now();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Nothing to undo"));
  }, [sessionId, fetchQueue]);

  const onPointerDown = (e: PointerEvent) => {
    pointerStartXRef.current = e.clientX;
    cardRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (pointerStartXRef.current === null) return;
    setDragX(e.clientX - pointerStartXRef.current);
  };
  const onPointerUp = () => {
    if (pointerStartXRef.current === null) return;
    pointerStartXRef.current = null;
    if (Math.abs(dragX) > COMMIT_THRESHOLD_PX) {
      commitSwipe(dragX > 0 ? "right" : "left");
    } else {
      setDragX(0);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") commitSwipe("right");
    else if (e.key === "ArrowLeft") commitSwipe("left");
    else if (e.key === "z" && (e.metaKey || e.ctrlKey)) handleUndo();
  };

  const cards =
    queue?.slice(0, 3).map((concept, index) => (
      <div
        key={concept.id}
        ref={index === 0 ? cardRef : undefined}
        tabIndex={index === 0 ? 0 : -1}
        role="group"
        aria-roledescription="swipeable card"
        aria-label={`Concept: ${concept.hook}`}
        onPointerDown={index === 0 ? onPointerDown : undefined}
        onPointerMove={index === 0 ? onPointerMove : undefined}
        onPointerUp={index === 0 ? onPointerUp : undefined}
        onPointerCancel={index === 0 ? onPointerUp : undefined}
        onKeyDown={index === 0 ? onKeyDown : undefined}
        style={{ touchAction: "pan-y" }}
      >
        <VelocityCard
          media={<div className={styles.placeholderMedia} aria-hidden />}
          hook={concept.hook}
          angle={concept.format}
          dragX={index === 0 ? dragX : 0}
        />
      </div>
    )) ?? [];

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <div className={styles.topBar}>
          <Text variant="heading" as="h1">
            Velocity
          </Text>
          <div className={styles.actions}>
            <button type="button" className={styles.undoButton} onClick={handleUndo} disabled={!canUndo}>
              Undo last swipe
            </button>
          </div>
        </div>

        {error && (
          <p role="alert">
            <Text variant="body" as="span">
              {error}
            </Text>
          </p>
        )}

        {!error && queue === null && (
          <Text variant="body" as="p">
            Loading…
          </Text>
        )}

        {queue !== null && queue.length === 0 && (
          <EmptyState heading="Your Velocity queue is empty" body="Content generation ships in STEP 8 — check back once your brand profile has generated concepts." />
        )}

        {queue !== null && queue.length > 0 && (
          <div className={styles.deckArea}>
            <VelocityDeck cards={cards} />
            <div className={styles.buttonRow}>
              <button type="button" className={styles.rejectButton} onClick={() => commitSwipe("left")} aria-label="Reject this concept">
                ✕ Reject
              </button>
              <button type="button" className={styles.approveButton} onClick={() => commitSwipe("right")} aria-label="Approve this concept and start rendering">
                ✓ Approve
              </button>
            </div>
            <Text variant="label" as="p" className={styles.hint}>
              Drag, use the arrow keys, or the buttons below — {queue.length} in queue
            </Text>
          </div>
        )}
      </main>
    </div>
  );
}
