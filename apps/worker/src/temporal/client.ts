import { Client, Connection, WorkflowIdReusePolicy } from "@temporalio/client";
import type { PublishResult, PublishWorkflowInput, RenderResult, RenderWorkflowInput } from "@velocity/contracts";
import { RENDER_TASK_QUEUE } from "./task-queues.js";

let client: Client | undefined;

export async function getTemporalClient(): Promise<Client> {
  if (client) return client;
  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233" });
  client = new Client({ connection });
  return client;
}

/**
 * Workflow id is `render:${renderId}` with REJECT_DUPLICATE — the
 * outermost dedupe layer (STEP 8.4): two API calls attempting to start a
 * render for the same renderId can't spin up two workflow executions, on
 * top of (not instead of) the render_steps ledger's own per-step
 * idempotency.
 */
export async function startRenderWorkflow(input: RenderWorkflowInput): Promise<{ workflowId: string }> {
  const temporalClient = await getTemporalClient();
  const workflowId = `render:${input.renderId}`;
  const handle = await temporalClient.workflow.start("renderWorkflow", {
    taskQueue: RENDER_TASK_QUEUE,
    workflowId,
    args: [input],
    workflowIdReusePolicy: WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE,
  });
  return { workflowId: handle.workflowId };
}

export async function getRenderWorkflowResult(renderId: string): Promise<RenderResult> {
  const temporalClient = await getTemporalClient();
  const handle = temporalClient.workflow.getHandle(`render:${renderId}`);
  return handle.result();
}

/**
 * Workflow id is `publish:${publicationId}` with REJECT_DUPLICATE — same
 * outermost dedupe layer as `startRenderWorkflow`, on top of (not instead
 * of) the publication_steps ledger's own per-step idempotency. Shares
 * RENDER_TASK_QUEUE rather than a separate queue: one worker process
 * (this deployable) genuinely serves both workflow types today, and a
 * second queue would only be real value once render and publish need
 * independent scaling — not yet the case, see docs/steps/STEP-12.md.
 */
export async function startPublishWorkflow(input: PublishWorkflowInput): Promise<{ workflowId: string }> {
  const temporalClient = await getTemporalClient();
  const workflowId = `publish:${input.publicationId}`;
  const handle = await temporalClient.workflow.start("publishWorkflow", {
    taskQueue: RENDER_TASK_QUEUE,
    workflowId,
    args: [input],
    workflowIdReusePolicy: WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE,
  });
  return { workflowId: handle.workflowId };
}

export async function getPublishWorkflowResult(publicationId: string): Promise<PublishResult> {
  const temporalClient = await getTemporalClient();
  const handle = temporalClient.workflow.getHandle(`publish:${publicationId}`);
  return handle.result();
}
