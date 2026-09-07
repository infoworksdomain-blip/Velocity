import { Client, Connection, WorkflowIdReusePolicy } from "@temporalio/client";
import type { RenderResult, RenderWorkflowInput } from "@velocity/contracts";
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
