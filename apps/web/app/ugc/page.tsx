"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import { AppSidebar, Text, type SidebarItem } from "@velocity/ui";
import { useEffect, useState } from "react";
import styles from "./ugc.module.css";

type Persona = Awaited<ReturnType<typeof trpcClient.ugc.personas.list.query>>[number];
type BatchResult = Awaited<ReturnType<typeof trpcClient.ugc.batch.generate.mutate>>[number];

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <span aria-hidden>◆</span>, href: "/dashboard" },
  { id: "velocity", label: "Velocity", icon: <span aria-hidden>▲</span>, href: "/velocity" },
  { id: "calendar", label: "Calendar", icon: <span aria-hidden>■</span>, href: "/calendar" },
  { id: "accounts", label: "Accounts", icon: <span aria-hidden>●</span>, href: "/accounts" },
  { id: "analytics", label: "Analytics", icon: <span aria-hidden>▲</span>, href: "/analytics" },
  { id: "assistant", label: "Assistant", icon: <span aria-hidden>✦</span>, href: "/assistant" },
  { id: "ugc", label: "UGC Studio", icon: <span aria-hidden>★</span>, href: "/ugc", active: true },
  { id: "automations", label: "Automation", icon: <span aria-hidden>⚙</span>, href: "/automations" },
  { id: "agency", label: "Agency", icon: <span aria-hidden>◈</span>, href: "/agency" },
];

/**
 * STEP 15's UGC Studio: persona library + script-led batch generation.
 * A "functional, not maximally polished" surface, consistent with the
 * established precedent for less-central screens (accounts, calendar).
 * The real point of this page is that the policy gate is visible and
 * checkable BEFORE a script is submitted — every script gets a live
 * "Check policy" call against `ugc.policy.check`, the same pure function
 * the batch endpoint itself runs server-side before ever creating a
 * render.
 */
export default function UgcStudioPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personaName, setPersonaName] = useState("");
  const [modelsRealPerson, setModelsRealPerson] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [brandProfileId, setBrandProfileId] = useState("");
  const [scriptDraft, setScriptDraft] = useState("");
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    trpcClient.ugc.personas.list.query().then(setPersonas).catch(() => setPersonas([]));
  }, [currentWorkspaceId]);

  const handleCreatePersona = async () => {
    if (!personaName.trim()) return;
    setError(null);
    try {
      await trpcClient.ugc.personas.create.mutate({ name: personaName.trim(), modelsRealPerson });
      setPersonaName("");
      setModelsRealPerson(false);
      setPersonas(await trpcClient.ugc.personas.list.query());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create persona");
    }
  };

  const handleCheckPolicy = async () => {
    if (!selectedPersonaId || !scriptDraft.trim()) return;
    setPolicyMessage(null);
    try {
      const result = await trpcClient.ugc.policy.check.query({ personaId: selectedPersonaId, script: scriptDraft.trim() });
      setPolicyMessage(result.allowed ? "Allowed — this script can be submitted for generation." : `Blocked (${result.blockReason}): ${result.message}`);
    } catch (err) {
      setPolicyMessage(err instanceof Error ? err.message : "Policy check failed");
    }
  };

  const handleGenerate = async () => {
    if (!selectedPersonaId || !brandProfileId.trim() || !scriptDraft.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const batch = await trpcClient.ugc.batch.generate.mutate({
        brandProfileId: brandProfileId.trim(),
        personaId: selectedPersonaId,
        scripts: [scriptDraft.trim()],
        workspaceTier: "standard",
      });
      setResults((prev) => [...batch, ...prev]);
      setScriptDraft("");
      setPolicyMessage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <Text variant="heading" as="h1">
          UGC Studio
        </Text>
        <Text variant="body" as="p">
          Script-led AI UGC. Every persona modelling a real person requires a consent artefact on file; every script is checked against the persona policy gate — consent, then real named public figures (never reviewable), then regulated claims (reviewable) — before any render is triggered.
        </Text>

        {error && (
          <p role="alert">
            <Text variant="body" as="span">
              {error}
            </Text>
          </p>
        )}

        <section className={styles.panel}>
          <Text variant="heading" as="h2">
            Personas
          </Text>
          <ul className={styles.personaList}>
            {personas.map((persona) => (
              <li key={persona.id} className={selectedPersonaId === persona.id ? styles.personaItemActive : styles.personaItem} onClick={() => setSelectedPersonaId(persona.id)}>
                <Text variant="body" as="span">
                  {persona.name}
                </Text>
                {persona.modelsRealPerson && <span className={styles.realPersonBadge}>REAL PERSON{persona.consentArtefactId ? "" : " — NO CONSENT ON FILE"}</span>}
              </li>
            ))}
          </ul>

          <div className={styles.composer}>
            <input className={styles.input} placeholder="New persona name" value={personaName} onChange={(e) => setPersonaName(e.target.value)} />
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={modelsRealPerson} onChange={(e) => setModelsRealPerson(e.target.checked)} />
              Models a real person
            </label>
            <button type="button" className={styles.actionButton} onClick={() => void handleCreatePersona()}>
              Add persona
            </button>
          </div>
        </section>

        <section className={styles.panel}>
          <Text variant="heading" as="h2">
            Generate
          </Text>
          <input className={styles.input} placeholder="Brand profile id" value={brandProfileId} onChange={(e) => setBrandProfileId(e.target.value)} />
          <textarea className={styles.textarea} placeholder="UGC script (spoken to camera)" value={scriptDraft} onChange={(e) => setScriptDraft(e.target.value)} rows={4} />

          {policyMessage && (
            <Text variant="body" as="p">
              {policyMessage}
            </Text>
          )}

          <div className={styles.composer}>
            <button type="button" className={styles.actionButton} onClick={() => void handleCheckPolicy()} disabled={!selectedPersonaId || !scriptDraft.trim()}>
              Check policy
            </button>
            <button type="button" className={styles.generateButton} onClick={() => void handleGenerate()} disabled={busy || !selectedPersonaId || !brandProfileId.trim() || !scriptDraft.trim()}>
              {busy ? "Generating…" : "Generate"}
            </button>
          </div>
        </section>

        {results.length > 0 && (
          <section className={styles.panel}>
            <Text variant="heading" as="h2">
              Batch results
            </Text>
            <ul className={styles.resultList}>
              {results.map((result, i) => (
                <li key={i} className={result.allowed ? styles.resultAllowed : styles.resultBlocked}>
                  <Text variant="body" as="span">
                    {result.allowed ? `Queued render for content concept ${result.contentConceptId}` : `Blocked (${result.blockReason}): ${result.message}`}
                  </Text>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
