import { defaultCollectorUnavailable, resolveBillingCredential, saveProviderCollectorStatus, type CollectorResult } from "@/lib/provider-billing/shared";

/**
 * Google AI (Gemini) billing collector.
 *
 * Google AI Studio does not expose a public REST API for programmatic billing
 * or usage retrieval. Usage data is only available through the Google Cloud
 * Console or the Cloud Billing API (which requires a GCP project with Vertex
 * AI, a service account, and complex OAuth setup — not practical for a local
 * dashboard).
 *
 * This collector therefore serves as a "credential presence" check:
 *   - If a GOOGLE_API_KEY / GEMINI_API_KEY is configured, we mark the provider
 *     as "available" but note that billing relies on local telemetry estimates.
 *   - If no key is present, we mark it as unavailable so the UI can guide
 *     the user.
 *
 * If Google ever ships a simple billing API, we can extend this collector
 * without touching anything else.
 */
export async function collectGoogleBilling(): Promise<CollectorResult> {
  const credential = await resolveBillingCredential(["GOOGLE_API_KEY", "GEMINI_API_KEY"]);
  if (!credential.value) {
    const unavailable = defaultCollectorUnavailable("google", credential.requiredCredential);
    await saveProviderCollectorStatus(unavailable);
    return unavailable;
  }

  // No billing API — report estimate-only status.
  const result: CollectorResult = {
    provider: "google",
    available: true,
    reason: "Google AI Studio has no billing API — costs are estimated from local token telemetry.",
    fetchedAtMs: Date.now(),
    bucketCount: 0,
  };
  await saveProviderCollectorStatus(result);
  return result;
}
