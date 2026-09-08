import { analytics as analyticsCore } from "@velocity/core";
import { apiErrorResponse, authenticateApiRequest, jsonResponse } from "@/server/api-v1-helpers";
import { fetchMetricSamples, getWorkspaceTimezone } from "@/server/routers/analytics";

const GROUP_BY_VALUES = ["format", "angle", "persona", "platform", "hookPattern", "cohort"] as const;

/** `/v1/analytics/summary` — a thin REST facade over the exact same real aggregation the internal `analytics.summary` tRPC procedure calls. */
export async function GET(req: Request): Promise<Response> {
  try {
    const key = await authenticateApiRequest(req, "analytics:read");
    const groupByParam = new URL(req.url).searchParams.get("groupBy") ?? "platform";
    if (!GROUP_BY_VALUES.includes(groupByParam as (typeof GROUP_BY_VALUES)[number])) {
      return apiErrorResponse(new Error(`groupBy must be one of: ${GROUP_BY_VALUES.join(", ")}`));
    }

    const timezone = await getWorkspaceTimezone(key.workspaceId);
    const samples = await fetchMetricSamples(key.workspaceId, timezone);
    const groupBy = groupByParam as (typeof GROUP_BY_VALUES)[number];
    const summary =
      groupBy === "format" ? analyticsCore.aggregateByFormat(samples)
      : groupBy === "angle" ? analyticsCore.aggregateByAngle(samples)
      : groupBy === "persona" ? analyticsCore.aggregateByPersona(samples)
      : groupBy === "platform" ? analyticsCore.aggregateByPlatform(samples)
      : groupBy === "hookPattern" ? analyticsCore.aggregateByHookPattern(samples)
      : analyticsCore.aggregateByPublishCohort(samples);

    return jsonResponse({ data: summary });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
