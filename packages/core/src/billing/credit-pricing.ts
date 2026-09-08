/**
 * STEP 19's market-anchored credit pricing (build script's own literal
 * numbers: "4 credits per image, 10 credits per second of video -- a 20s
 * video is 200 credits... price text generation separately and near-free;
 * it is the cheapest thing in the system and metering it punitively kills
 * the hook A/B loop that differentiates you").
 *
 * This REPLACES metering/usage-recorder.ts's provisional `usdToCredits`
 * (1 credit = $0.01 of underlying provider cost) for video/image/tts/
 * transcription: those job kinds are now priced by OUTPUT UNIT, not by
 * whichever vendor happened to fulfil the request -- the standard SaaS
 * margin model, and the reason two different video providers with
 * different real costs must charge the customer the same credits for the
 * same output. Text stays priced near-free per job (a flat, small credit
 * cost) specifically so STEP 9's swipe-queue economics (many cheap
 * LLM-only concept cards per one expensive render) aren't punished by
 * per-token or per-call metering that would make heavy swiping expensive.
 */
export const CREDITS_PER_IMAGE = 4;
export const CREDITS_PER_VIDEO_SECOND = 10;
export const CREDITS_PER_TEXT_CALL = 1;
export const CREDITS_PER_TTS_CALL = 2;
export const CREDITS_PER_TRANSCRIPTION_CALL = 1;

export type BillableJobKind = "video" | "image" | "text" | "tts" | "transcription";

export interface CreditsForUsageInput {
  jobKind: BillableJobKind;
  /** For "video": duration in seconds. Ignored for every other job kind (image/text/tts/transcription are priced per call, not per unit). */
  durationSec?: number;
}

/**
 * The single authoritative credits-per-job function. `units` from
 * usage_events (STEP 8's C5 metering) is the provider's own reporting
 * unit (seconds, characters, etc.) and is NOT what this function prices
 * against for anything except video, deliberately -- see the module doc
 * comment on why image/text/tts/transcription are flat per-call charges.
 */
export function creditsForUsage(input: CreditsForUsageInput): number {
  switch (input.jobKind) {
    case "video": {
      const durationSec = input.durationSec ?? 0;
      if (durationSec <= 0) throw new Error("creditsForUsage: video requires a positive durationSec");
      return Math.ceil(durationSec * CREDITS_PER_VIDEO_SECOND);
    }
    case "image":
      return CREDITS_PER_IMAGE;
    case "text":
      return CREDITS_PER_TEXT_CALL;
    case "tts":
      return CREDITS_PER_TTS_CALL;
    case "transcription":
      return CREDITS_PER_TRANSCRIPTION_CALL;
  }
}
