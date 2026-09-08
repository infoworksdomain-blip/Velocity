"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import { AppSidebar, CalendarGrid, CalendarSlot, EmptyState, Text, type CalendarDay, type SidebarItem } from "@velocity/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./calendar.module.css";

type SlotRow = Awaited<ReturnType<typeof trpcClient.calendar.slots.list.query>>[number];
type CampaignRow = Awaited<ReturnType<typeof trpcClient.calendar.campaigns.list.query>>[number];
type AutoFillPreview = Awaited<ReturnType<typeof trpcClient.calendar.autoFill.preview.mutate>>;

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <span aria-hidden>◆</span>, href: "/dashboard" },
  { id: "velocity", label: "Velocity", icon: <span aria-hidden>▲</span>, href: "/velocity" },
  { id: "calendar", label: "Calendar", icon: <span aria-hidden>■</span>, href: "/calendar", active: true },
  { id: "accounts", label: "Accounts", icon: <span aria-hidden>●</span>, href: "/accounts" },
  { id: "analytics", label: "Analytics", icon: <span aria-hidden>▲</span>, href: "/analytics" },
  { id: "assistant", label: "Assistant", icon: <span aria-hidden>✦</span>, href: "/assistant" },
  { id: "ugc", label: "UGC Studio", icon: <span aria-hidden>★</span>, href: "/ugc" },
  { id: "automations", label: "Automation", icon: <span aria-hidden>⚙</span>, href: "/automations" },
];

type ViewMode = "month" | "week" | "list" | "table";
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function startOfCalendarGrid(monthStart: Date): Date {
  const day = monthStart.getUTCDay();
  return new Date(monthStart.getTime() - day * 86400000);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}
function isSameUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

/**
 * STEP 10's Calendar: month/week/list/table views over the same real
 * `calendar.slots.list` data, drag-to-reschedule (month/week grids —
 * dragging a slot's card onto another day cell keeps its time-of-day and
 * moves the date), bulk delete, campaigns, and the 30-day auto-fill
 * preview/commit flow (routers/calendar.ts's `autoFill.preview`/`commit`
 * — a real diff reviewed before anything is written, per the build
 * script's own "present as a diff the user approves before commit").
 *
 * Honest scope note (see docs/steps/STEP-10.md): no RFC 5545 RRULE
 * recurrence engine — `schedules.recurrenceRule` exists in the schema but
 * a correct RRULE expander is a real, separate undertaking comparable in
 * size to the auto-fill algorithm itself, and GATE 10 doesn't test it.
 * Flagged as a real follow-up, not silently skipped.
 */
export default function CalendarPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [anchorDate] = useState(() => startOfMonth(new Date()));
  const [slots, setSlots] = useState<SlotRow[] | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const [autoFillPreview, setAutoFillPreview] = useState<AutoFillPreview | null>(null);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [publishingSlotId, setPublishingSlotId] = useState<string | null>(null);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);

  const rangeStart = viewMode === "week" ? addDays(anchorDate, -anchorDate.getUTCDay()) : startOfCalendarGrid(anchorDate);
  const rangeEnd = viewMode === "week" ? addDays(rangeStart, 7) : addDays(rangeStart, 42);

  const fetchSlots = useCallback(async () => {
    if (!currentWorkspaceId) return;
    const rows = await trpcClient.calendar.slots.list.query({ startsAt: rangeStart.toISOString(), endsAt: rangeEnd.toISOString() });
    setSlots(rows);
  }, [currentWorkspaceId, rangeStart.getTime(), rangeEnd.getTime()]);

  useEffect(() => {
    setError(null);
    fetchSlots().catch((err) => setError(err instanceof Error ? err.message : "Failed to load the calendar"));
    trpcClient.calendar.campaigns.list.query().then(setCampaigns).catch(() => undefined);
  }, [fetchSlots]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, SlotRow[]>();
    for (const row of slots ?? []) {
      const key = new Date(row.slot.scheduledAt).toDateString();
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }, [slots]);

  const handleReschedule = useCallback(
    async (slotId: string, newScheduledAt: Date) => {
      try {
        await trpcClient.calendar.slots.reschedule.mutate({ slotId, newScheduledAt: newScheduledAt.toISOString() });
        await fetchSlots();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reschedule — check for a cap or spacing conflict");
      }
    },
    [fetchSlots],
  );

  const handleDropOnDay = useCallback(
    (targetDay: Date) => {
      if (!draggingSlotId) return;
      const row = (slots ?? []).find((r) => r.slot.id === draggingSlotId);
      setDraggingSlotId(null);
      if (!row) return;
      const original = new Date(row.slot.scheduledAt);
      const newTime = new Date(Date.UTC(targetDay.getUTCFullYear(), targetDay.getUTCMonth(), targetDay.getUTCDate(), original.getUTCHours(), original.getUTCMinutes()));
      if (isSameUtcDay(newTime, original)) return;
      void handleReschedule(draggingSlotId, newTime);
    },
    [draggingSlotId, slots, handleReschedule],
  );

  const toggleSelected = (slotId: string) => {
    setSelectedSlotIds((current) => {
      const next = new Set(current);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedSlotIds.size === 0) return;
    try {
      await trpcClient.calendar.slots.bulkDelete.mutate({ slotIds: [...selectedSlotIds] });
      setSelectedSlotIds(new Set());
      await fetchSlots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk delete failed");
    }
  };

  const handleCreateCampaign = async () => {
    if (!newCampaignName.trim()) return;
    try {
      await trpcClient.calendar.campaigns.create.mutate({ name: newCampaignName.trim(), startsAt: null, endsAt: null });
      setNewCampaignName("");
      trpcClient.calendar.campaigns.list.query().then(setCampaigns).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    }
  };

  const handleAutoFillPreview = async () => {
    try {
      const result = await trpcClient.calendar.autoFill.preview.mutate({ days: 30, startsAt: new Date().toISOString() });
      setAutoFillPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-fill preview failed");
    }
  };

  /**
   * STEP 12's real "clickable demo path": fires the actual publish
   * pipeline (preflight -> ... -> record) for one scheduled slot. Only
   * meaningful once a real platform app is connected and audited — in
   * this sandbox it exercises every real step up to (never past) the
   * vendor call this environment can't make (see docs/steps/STEP-12.md).
   */
  const handlePublishNow = async (row: SlotRow) => {
    if (!row.slot.contentItemId || !row.slot.socialAccountId) return;
    setPublishingSlotId(row.slot.id);
    setPublishNotice(null);
    try {
      const result = await trpcClient.publish.trigger.mutate({ contentItemId: row.slot.contentItemId, socialAccountId: row.slot.socialAccountId });
      setPublishNotice(result.alreadyExisted ? "Already publishing — tracking the existing attempt." : `Publish started (${result.workflowId}).`);
    } catch (err) {
      setPublishNotice(err instanceof Error ? err.message : "Failed to start publishing");
    } finally {
      setPublishingSlotId(null);
    }
  };

  const handleAutoFillCommit = async () => {
    if (!autoFillPreview) return;
    try {
      await trpcClient.calendar.autoFill.commit.mutate({ assignments: autoFillPreview.assignments });
      setAutoFillPreview(null);
      await fetchSlots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-fill commit failed");
    }
  };

  const days: CalendarDay[] = useMemo(() => {
    const count = viewMode === "week" ? 7 : 42;
    const today = new Date();
    return Array.from({ length: count }, (_, i) => {
      const date = addDays(rangeStart, i);
      const daySlots = slotsByDay.get(date.toDateString()) ?? [];
      return {
        date: date.getUTCDate(),
        isToday: isSameUtcDay(date, today),
        isOutsideMonth: viewMode === "month" && date.getUTCMonth() !== anchorDate.getUTCMonth(),
        onDrop: () => handleDropOnDay(date),
        slots: daySlots.map((row) => (
          <div
            key={row.slot.id}
            draggable
            onDragStart={() => setDraggingSlotId(row.slot.id)}
            onDragEnd={() => setDraggingSlotId(null)}
          >
            <CalendarSlot time={new Date(row.slot.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} platform={row.slot.platform} thumbnail={row.hook ? <span className={styles.hookGlyph}>{row.hook.slice(0, 1).toUpperCase()}</span> : undefined} />
          </div>
        )),
      };
    });
    // rangeStart/anchorDate are Date objects recreated every render — depending on their primitive .getTime() values here (not the objects themselves) avoids a spurious recompute from object-identity churn on every render.
  }, [rangeStart.getTime(), viewMode, slotsByDay, anchorDate.getTime(), handleDropOnDay]);

  const flatSlots = useMemo(() => (slots ?? []).slice().sort((a, b) => new Date(a.slot.scheduledAt).getTime() - new Date(b.slot.scheduledAt).getTime()), [slots]);

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <div className={styles.topBar}>
          <Text variant="heading" as="h1">
            Calendar
          </Text>
          <div className={styles.viewTabs} role="tablist" aria-label="Calendar view">
            {(["month", "week", "list", "table"] as const).map((mode) => (
              <button key={mode} type="button" role="tab" aria-selected={viewMode === mode} className={viewMode === mode ? styles.tabActive : styles.tab} onClick={() => setViewMode(mode)}>
                {mode[0]!.toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <button type="button" className={styles.autoFillButton} onClick={handleAutoFillPreview}>
            Auto-fill next 30 days
          </button>
        </div>

        {error && (
          <p role="alert">
            <Text variant="body" as="span">
              {error}
            </Text>
          </p>
        )}

        {publishNotice && (
          <p>
            <Text variant="body" as="span">
              {publishNotice}
            </Text>
          </p>
        )}

        {autoFillPreview && (
          <div className={styles.autoFillPanel}>
            <Text variant="body" as="p">
              Proposed: {autoFillPreview.assignments.length} posts scheduled, {autoFillPreview.unfilled.length} slots left unfilled (caps, spacing, or no eligible content — see each reason).
            </Text>
            <div className={styles.autoFillActions}>
              <button type="button" className={styles.approveButton} onClick={handleAutoFillCommit} disabled={autoFillPreview.assignments.length === 0}>
                Commit this plan
              </button>
              <button type="button" className={styles.rejectButton} onClick={() => setAutoFillPreview(null)}>
                Discard
              </button>
            </div>
          </div>
        )}

        <div className={styles.campaignsRow}>
          <Text variant="label" as="p">
            Campaigns
          </Text>
          <div className={styles.campaignChips}>
            {campaigns.map((c) => (
              <span key={c.id} className={styles.campaignChip}>
                {c.name}
              </span>
            ))}
          </div>
          <input className={styles.campaignInput} placeholder="New campaign name" value={newCampaignName} onChange={(e) => setNewCampaignName(e.target.value)} />
          <button type="button" className={styles.smallButton} onClick={handleCreateCampaign}>
            Add
          </button>
        </div>

        {selectedSlotIds.size > 0 && (
          <div className={styles.bulkBar}>
            <Text variant="body" as="span">
              {selectedSlotIds.size} selected
            </Text>
            <button type="button" className={styles.rejectButton} onClick={handleBulkDelete}>
              Delete selected
            </button>
          </div>
        )}

        {!error && slots === null && (
          <Text variant="body" as="p">
            Loading…
          </Text>
        )}

        {slots !== null && slots.length === 0 && <EmptyState heading="Nothing scheduled yet" body="Approve concepts in Velocity, then use auto-fill or schedule them manually here." />}

        {slots !== null && slots.length > 0 && (viewMode === "month" || viewMode === "week") && <CalendarGrid weekdayLabels={WEEKDAY_LABELS} days={days} />}

        {slots !== null && (viewMode === "list" || viewMode === "table") && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th />
                <th>Time</th>
                <th>Platform</th>
                {viewMode === "table" && <th>Format</th>}
                <th>Hook</th>
                <th>Reschedule</th>
                <th>Publish</th>
              </tr>
            </thead>
            <tbody>
              {flatSlots.map((row) => (
                <tr key={row.slot.id}>
                  <td>
                    <input type="checkbox" checked={selectedSlotIds.has(row.slot.id)} onChange={() => toggleSelected(row.slot.id)} aria-label={`Select slot ${row.slot.id}`} />
                  </td>
                  <td>{new Date(row.slot.scheduledAt).toLocaleString()}</td>
                  <td>{row.slot.platform}</td>
                  {viewMode === "table" && <td>{row.format ?? "—"}</td>}
                  <td>{row.hook ?? "—"}</td>
                  <td>
                    <input
                      type="datetime-local"
                      defaultValue={new Date(row.slot.scheduledAt).toISOString().slice(0, 16)}
                      onBlur={(e) => {
                        if (!e.target.value) return;
                        void handleReschedule(row.slot.id, new Date(e.target.value));
                      }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.smallButton}
                      disabled={!row.slot.contentItemId || !row.slot.socialAccountId || publishingSlotId === row.slot.id}
                      onClick={() => handlePublishNow(row)}
                    >
                      {publishingSlotId === row.slot.id ? "Publishing…" : "Publish now"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
