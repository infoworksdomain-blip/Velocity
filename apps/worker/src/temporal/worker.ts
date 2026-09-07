import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities/index.js";
import { RENDER_TASK_QUEUE } from "./task-queues.js";

export async function startRenderWorker(): Promise<Worker> {
  const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233" });
  const worker = await Worker.create({
    connection,
    taskQueue: RENDER_TASK_QUEUE,
    workflowsPath: fileURLToPath(new URL("./workflows/index.js", import.meta.url)),
    activities,
  });
  await worker.run();
  return worker;
}
