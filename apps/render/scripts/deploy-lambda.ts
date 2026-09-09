import path from "node:path";
import { fileURLToPath } from "node:url";
import { deployFunction, deploySite, getOrCreateBucket } from "@remotion/lambda";
import type { AwsRegion } from "@remotion/lambda";

/**
 * Post-STEP-22 audit remediation: a real deploy script for the Remotion
 * Lambda compositor (ADR 0002), using @remotion/lambda's own real,
 * documented SDK functions (not guessed CLI flags) — getOrCreateBucket,
 * deployFunction, deploySite are all real top-level exports of
 * @remotion/lambda 4.0.499 (confirmed against its own type declarations).
 *
 * NOT executed anywhere in this build — it needs real AWS credentials and
 * a funded account this sandbox doesn't have, the same category as every
 * other funded-cloud-infrastructure dependency across this codebase (STEP
 * 22's own Terraform, STEP 8's vendor adapters). Run it for real via:
 *
 *   REMOTION_AWS_REGION=us-east-1 \
 *   REMOTION_LAMBDA_ROLE_ARN=<infra/terraform's remotion_lambda_role_arn output> \
 *   pnpm --filter @velocity/render deploy:lambda
 *
 * Then set REMOTION_AWS_LAMBDA_FUNCTION_NAME/REMOTION_SITE_URL (this
 * script's own printed output) so apps/worker's compositor factory
 * (apps/worker/src/temporal/activities/context.ts) picks up
 * RemotionLambdaCompositor instead of the stub — see that file's
 * getCompositor().
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`deploy-lambda: ${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const region = requireEnv("REMOTION_AWS_REGION") as AwsRegion;
  const customRoleArn = process.env.REMOTION_LAMBDA_ROLE_ARN;

  const { bucketName } = await getOrCreateBucket({ region });

  const { functionName } = await deployFunction({
    createCloudWatchLogGroup: true,
    region,
    timeoutInSeconds: 120,
    memorySizeInMb: 2048,
    customRoleArn,
  });

  const { serveUrl } = await deploySite({
    entryPoint: path.join(__dirname, "../src/index.ts"),
    bucketName,
    region,
    siteName: "velocity-render",
  });

  console.log(JSON.stringify({ region, bucketName, functionName, serveUrl }, null, 2));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
