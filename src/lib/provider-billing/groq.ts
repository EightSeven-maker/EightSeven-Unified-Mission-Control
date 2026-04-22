import { defaultCollectorUnavailable, resolveBillingCredential, saveProviderCollectorStatus, type CollectorResult } from "@/lib/provider-billing/shared";

/**
 * Groq billing collector.
 *
 * Groq does not currently expose a public REST API for billing or usage
 * retrieval. Usage data is only visible in the Groq Console dashboard.
 *
 * This collector checks for API key presence so the UI can indicate whether
 * the provider is configured. Spending estimates rely entirely on local
 * telemetry and static pricing data.
 *
 * If Groq ships a usage/billing API in the future, extend this collector.
 */
export async function collectGroqBilling(): Promise<CollectorResult> {
  const credential = await resolveBillingCredential(["GROQ_API_KEY"]);
  if (!credential.value) {
    const unavailable = defaultCollectorUnavailable("groq", credential.requiredCredential);
    await saveProviderCollectorStatus(unavailable);
    return unavailable;
  }

  const result: CollectorResult = {
    provider: "groq",
    available: true,
    reason: "Groq has no billing API — costs are estimated from local token telemetry.",
    fetchedAtMs: Date.now(),
    bucketCount: 0,
  };
  await saveProviderCollectorStatus(result);
  return result;
}
