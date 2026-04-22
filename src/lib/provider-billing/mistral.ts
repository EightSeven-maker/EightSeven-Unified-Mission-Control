import { defaultCollectorUnavailable, resolveBillingCredential, saveProviderCollectorStatus, upsertProviderBillingBuckets, utcDayRange, type CollectorResult, type NormalizedProviderBillingBucket } from "@/lib/provider-billing/shared";

/**
 * Mistral billing collector.
 *
 * Mistral exposes a usage endpoint at:
 *   GET https://api.mistral.ai/v1/usage
 *     ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 *
 * Response shape (observed):
 *   { "data": [{ "date": "2025-01-15", "model": "mistral-large-latest",
 *                "requests": 42, "input_tokens": 10000, "output_tokens": 5000,
 *                "total_tokens": 15000, "cost": 0.12 }] }
 *
 * Authentication: Bearer token (standard MISTRAL_API_KEY).
 */
type MistralUsageRow = {
  date?: string;
  model?: string;
  requests?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost?: number;
};

type MistralUsageResponse = {
  data?: MistralUsageRow[];
};

export async function collectMistralBilling(): Promise<CollectorResult> {
  const credential = await resolveBillingCredential(["MISTRAL_API_KEY"]);
  if (!credential.value) {
    const unavailable = defaultCollectorUnavailable("mistral", credential.requiredCredential);
    await saveProviderCollectorStatus(unavailable);
    return unavailable;
  }

  try {
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const url = new URL("https://api.mistral.ai/v1/usage");
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${credential.value}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // If the endpoint returns 404 or 403, Mistral may not support this
      // on the user's plan — fall back to estimate-only gracefully.
      if (res.status === 404 || res.status === 403) {
        const result: CollectorResult = {
          provider: "mistral",
          available: true,
          reason: `Mistral usage API returned ${res.status} — costs are estimated from local telemetry.`,
          fetchedAtMs: Date.now(),
          bucketCount: 0,
        };
        await saveProviderCollectorStatus(result);
        return result;
      }
      throw new Error(`Mistral usage returned ${res.status}: ${body.slice(0, 200)}`);
    }

    const payload = (await res.json()) as MistralUsageResponse;
    const data = Array.isArray(payload.data) ? payload.data : [];
    const fetchedAtMs = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);

    const rows: NormalizedProviderBillingBucket[] = data.map((row) => {
      const { bucketStartMs, bucketEndMs } = utcDayRange(row.date || Date.now());
      return {
        provider: "mistral",
        accountScope: "default",
        fullModel: row.model || null,
        bucketStartMs,
        bucketEndMs,
        bucketGranularity: "day",
        currency: "USD",
        requests: Number.isFinite(row.requests) ? Number(row.requests) : null,
        inputTokens: Number.isFinite(row.input_tokens) ? Number(row.input_tokens) : null,
        outputTokens: Number.isFinite(row.output_tokens) ? Number(row.output_tokens) : null,
        reasoningTokens: null,
        spendUsd: Number.isFinite(row.cost) ? Number(row.cost) : null,
        providerReference: null,
        payload: row,
        dataLatencyNote:
          row.date === todayStr
            ? "Current-day usage may lag provider reporting."
            : null,
        isFinal: row.date !== todayStr,
      };
    });

    await upsertProviderBillingBuckets(rows, fetchedAtMs);
    const result: CollectorResult = {
      provider: "mistral",
      available: true,
      fetchedAtMs,
      bucketCount: rows.length,
    };
    await saveProviderCollectorStatus(result);
    return result;
  } catch (err) {
    const result: CollectorResult = {
      provider: "mistral",
      available: false,
      reason: err instanceof Error ? err.message : String(err),
      requiredCredential: credential.requiredCredential,
    };
    await saveProviderCollectorStatus(result);
    return result;
  }
}
