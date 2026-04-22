import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { join } from "path";
import { getOpenClawHome } from "@/lib/paths";

export const CALENDAR_PROVIDERS = ["local", "google", "apple", "zoho"] as const;

export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];
export type ExternalCalendarProvider = Exclude<CalendarProvider, "local">;
export type CalendarEventSource = "local" | "imported";
export type CalendarSyncStatus = "idle" | "success" | "error";
export type CalendarConflictPolicy = "local-copy" | "write-back";
export type CalendarAccountConnection = "gog" | "oauth" | "caldav" | "api" | "manual";

export type CalendarProviderSettings = {
  provider: CalendarProvider;
  enabled: boolean;
  importEvents: boolean;
  importReminders: boolean;
  writeBack: boolean;
  readOnlyByDefault: boolean;
  connectorStatus: "ready" | "planned" | "local";
};

export type CalendarAccountRecord = {
  id: string;
  provider: ExternalCalendarProvider;
  label: string;
  providerAccountId: string;
  connection: CalendarAccountConnection;
  enabled: boolean;
  readOnly: boolean;
  importEvents: boolean;
  importReminders: boolean;
  writeBack: boolean;
  lastSyncedAt: number | null;
  lastSyncStatus: CalendarSyncStatus;
  lastSyncError: string | null;
  createdAt: number;
  updatedAt: number;
};

export type CalendarEventSyncMeta = {
  importedAt: number | null;
  lastSeenAt: number | null;
  lastSyncedAt: number | null;
  checksum: string | null;
  writeBackEligible: boolean;
  conflictPolicy: CalendarConflictPolicy;
};

export type CalendarEventRecord = {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
  source: CalendarEventSource;
  provider: CalendarProvider;
  externalId: string | null;
  accountId: string | null;
  calendarName: string;
  location: string | null;
  notes: string | null;
  readOnly: boolean;
  createdAt: number;
  updatedAt: number;
  sync: CalendarEventSyncMeta;
};

export type CalendarStoreFile = {
  version: 1;
  updatedAt: number;
  providerSettings: Record<CalendarProvider, CalendarProviderSettings>;
  accounts: CalendarAccountRecord[];
  events: CalendarEventRecord[];
};

export type CalendarSummary = {
  totalEvents: number;
  importedEvents: number;
  localEvents: number;
  accountCount: number;
  activeAccountCount: number;
  providerCount: number;
  nextSevenDaysCount: number;
};

export type ImportedCalendarEventInput = {
  title: string;
  externalId: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
  calendarName?: string;
  location?: string;
  notes?: string;
};

export function isCalendarProvider(value: string): value is CalendarProvider {
  return CALENDAR_PROVIDERS.includes(value as CalendarProvider);
}

export function isExternalCalendarProvider(value: string): value is ExternalCalendarProvider {
  return value === "google" || value === "apple" || value === "zoho";
}

export function getCalendarProviderLabel(provider: CalendarProvider): string {
  switch (provider) {
    case "local":
      return "Mission Control";
    case "google":
      return "Google";
    case "apple":
      return "Apple";
    case "zoho":
      return "Zoho";
    default:
      return provider;
  }
}

function getDefaultProviderSettings(
  provider: CalendarProvider
): CalendarProviderSettings {
  if (provider === "local") {
    return {
      provider,
      enabled: true,
      importEvents: true,
      importReminders: true,
      writeBack: false,
      readOnlyByDefault: false,
      connectorStatus: "local",
    };
  }

  return {
    provider,
    enabled: provider === "google",
    importEvents: true,
    importReminders: false,
    writeBack: false,
    readOnlyByDefault: true,
    connectorStatus: provider === "google" ? "ready" : "planned",
  };
}

function createDefaultProviderSettings(): Record<CalendarProvider, CalendarProviderSettings> {
  return {
    local: getDefaultProviderSettings("local"),
    google: getDefaultProviderSettings("google"),
    apple: getDefaultProviderSettings("apple"),
    zoho: getDefaultProviderSettings("zoho"),
  };
}

export function createDefaultCalendarStore(): CalendarStoreFile {
  return {
    version: 1,
    updatedAt: Date.now(),
    providerSettings: createDefaultProviderSettings(),
    accounts: [],
    events: [],
  };
}

function calendarStorePath(): string {
  return join(getOpenClawHome(), "ui", "calendar-events.json");
}

async function ensureCalendarDir(): Promise<void> {
  await mkdir(join(getOpenClawHome(), "ui"), { recursive: true });
}

function sanitizeProviderSettings(
  providerSettings: Partial<Record<CalendarProvider, Partial<CalendarProviderSettings>>> | undefined
): Record<CalendarProvider, CalendarProviderSettings> {
  const defaults = createDefaultProviderSettings();
  return {
    local: { ...defaults.local, ...(providerSettings?.local || {}) },
    google: { ...defaults.google, ...(providerSettings?.google || {}) },
    apple: { ...defaults.apple, ...(providerSettings?.apple || {}) },
    zoho: { ...defaults.zoho, ...(providerSettings?.zoho || {}) },
  };
}

function sanitizeAccount(record: unknown): CalendarAccountRecord | null {
  if (!record || typeof record !== "object") return null;
  const value = record as Partial<CalendarAccountRecord>;
  const provider = String(value.provider || "");
  if (!isExternalCalendarProvider(provider)) return null;
  const providerAccountId = String(value.providerAccountId || "").trim();
  const label = String(value.label || "").trim();
  if (!providerAccountId || !label) return null;
  const now = Date.now();
  return {
    id: String(value.id || randomUUID()),
    provider,
    label,
    providerAccountId,
    connection: (value.connection || "manual") as CalendarAccountConnection,
    enabled: value.enabled !== false,
    readOnly: value.readOnly !== false,
    importEvents: value.importEvents !== false,
    importReminders: Boolean(value.importReminders),
    writeBack: Boolean(value.writeBack),
    lastSyncedAt: typeof value.lastSyncedAt === "number" ? value.lastSyncedAt : null,
    lastSyncStatus:
      value.lastSyncStatus === "success" || value.lastSyncStatus === "error"
        ? value.lastSyncStatus
        : "idle",
    lastSyncError: typeof value.lastSyncError === "string" ? value.lastSyncError : null,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : now,
  };
}

function sanitizeEvent(record: unknown): CalendarEventRecord | null {
  if (!record || typeof record !== "object") return null;
  const value = record as Partial<CalendarEventRecord>;
  const provider = String(value.provider || "");
  if (!isCalendarProvider(provider)) return null;
  if (value.source !== "local" && value.source !== "imported") return null;
  if (typeof value.title !== "string" || !value.title.trim()) return null;
  if (typeof value.startMs !== "number" || typeof value.endMs !== "number") return null;
  const now = Date.now();
  return {
    id: String(value.id || randomUUID()),
    title: value.title.trim(),
    startMs: value.startMs,
    endMs: value.endMs >= value.startMs ? value.endMs : value.startMs,
    allDay: Boolean(value.allDay),
    source: value.source,
    provider,
    externalId: typeof value.externalId === "string" ? value.externalId : null,
    accountId: typeof value.accountId === "string" ? value.accountId : null,
    calendarName: String(value.calendarName || getCalendarProviderLabel(provider)),
    location: typeof value.location === "string" ? value.location : null,
    notes: typeof value.notes === "string" ? value.notes : null,
    readOnly: Boolean(value.readOnly),
    createdAt: typeof value.createdAt === "number" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : now,
    sync: {
      importedAt:
        typeof value.sync?.importedAt === "number" ? value.sync.importedAt : null,
      lastSeenAt:
        typeof value.sync?.lastSeenAt === "number" ? value.sync.lastSeenAt : null,
      lastSyncedAt:
        typeof value.sync?.lastSyncedAt === "number" ? value.sync.lastSyncedAt : null,
      checksum: typeof value.sync?.checksum === "string" ? value.sync.checksum : null,
      writeBackEligible: Boolean(value.sync?.writeBackEligible),
      conflictPolicy:
        value.sync?.conflictPolicy === "write-back" ? "write-back" : "local-copy",
    },
  };
}

function normalizeStore(store: Partial<CalendarStoreFile> | null | undefined): CalendarStoreFile {
  const fallback = createDefaultCalendarStore();
  const accounts = Array.isArray(store?.accounts)
    ? store.accounts.map((account) => sanitizeAccount(account)).filter((account): account is CalendarAccountRecord => account !== null)
    : [];
  const events = Array.isArray(store?.events)
    ? store.events.map((event) => sanitizeEvent(event)).filter((event): event is CalendarEventRecord => event !== null)
    : [];

  return {
    version: 1,
    updatedAt: typeof store?.updatedAt === "number" ? store.updatedAt : fallback.updatedAt,
    providerSettings: sanitizeProviderSettings(store?.providerSettings),
    accounts,
    events: events.sort((a, b) => a.startMs - b.startMs),
  };
}

export async function readCalendarStore(): Promise<CalendarStoreFile> {
  try {
    const raw = await readFile(calendarStorePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<CalendarStoreFile>;
    return normalizeStore(parsed);
  } catch {
    return createDefaultCalendarStore();
  }
}

export async function saveCalendarStore(store: CalendarStoreFile): Promise<void> {
  const normalized = normalizeStore({
    ...store,
    updatedAt: Date.now(),
  });
  await ensureCalendarDir();
  const path = calendarStorePath();
  const tmpPath = `${path}.tmp.${randomUUID().slice(0, 8)}`;
  await writeFile(tmpPath, JSON.stringify(normalized, null, 2), "utf-8");
  await rename(tmpPath, path);
}

export async function updateCalendarProviderSettings(
  provider: CalendarProvider,
  patch: Partial<Pick<CalendarProviderSettings, "enabled" | "importEvents" | "importReminders" | "writeBack" | "readOnlyByDefault">>
): Promise<CalendarStoreFile> {
  const store = await readCalendarStore();
  store.providerSettings[provider] = {
    ...store.providerSettings[provider],
    ...patch,
    provider,
  };
  store.updatedAt = Date.now();
  await saveCalendarStore(store);
  return store;
}

export async function upsertCalendarAccount(input: {
  id?: string;
  provider: ExternalCalendarProvider;
  label: string;
  providerAccountId: string;
  connection?: CalendarAccountConnection;
  enabled?: boolean;
  readOnly?: boolean;
  importEvents?: boolean;
  importReminders?: boolean;
  writeBack?: boolean;
}): Promise<CalendarStoreFile> {
  const label = input.label.trim();
  const providerAccountId = input.providerAccountId.trim();
  if (!label || !providerAccountId) {
    throw new Error("Account label and provider account id are required");
  }

  const store = await readCalendarStore();
  const providerSettings = store.providerSettings[input.provider];
  const now = Date.now();
  const idx = store.accounts.findIndex(
    (account) =>
      account.id === input.id ||
      (account.provider === input.provider &&
        account.providerAccountId === providerAccountId)
  );

  const next: CalendarAccountRecord = idx >= 0
    ? {
        ...store.accounts[idx],
        label,
        providerAccountId,
        connection: input.connection || store.accounts[idx].connection,
        enabled: input.enabled ?? store.accounts[idx].enabled,
        readOnly: input.readOnly ?? store.accounts[idx].readOnly,
        importEvents: input.importEvents ?? store.accounts[idx].importEvents,
        importReminders: input.importReminders ?? store.accounts[idx].importReminders,
        writeBack: input.writeBack ?? store.accounts[idx].writeBack,
        updatedAt: now,
      }
    : {
        id: input.id || randomUUID(),
        provider: input.provider,
        label,
        providerAccountId,
        connection: input.connection || (input.provider === "google" ? "gog" : "manual"),
        enabled: input.enabled ?? true,
        readOnly: input.readOnly ?? providerSettings.readOnlyByDefault,
        importEvents: input.importEvents ?? providerSettings.importEvents,
        importReminders: input.importReminders ?? providerSettings.importReminders,
        writeBack: input.writeBack ?? providerSettings.writeBack,
        lastSyncedAt: null,
        lastSyncStatus: "idle",
        lastSyncError: null,
        createdAt: now,
        updatedAt: now,
      };

  if (idx >= 0) {
    store.accounts[idx] = next;
  } else {
    store.accounts.push(next);
  }
  store.updatedAt = now;
  await saveCalendarStore(store);
  return store;
}

export async function removeCalendarAccount(accountId: string): Promise<CalendarStoreFile> {
  const store = await readCalendarStore();
  store.accounts = store.accounts.filter((account) => account.id !== accountId);
  store.events = store.events.filter((event) => event.accountId !== accountId);
  store.updatedAt = Date.now();
  await saveCalendarStore(store);
  return store;
}

export function summarizeCalendarStore(store: CalendarStoreFile): CalendarSummary {
  const now = Date.now();
  const sevenDaysOut = now + 7 * 24 * 60 * 60 * 1000;
  const importedEvents = store.events.filter((event) => event.source === "imported").length;
  const localEvents = store.events.filter((event) => event.source === "local").length;
  return {
    totalEvents: store.events.length,
    importedEvents,
    localEvents,
    accountCount: store.accounts.length,
    activeAccountCount: store.accounts.filter((account) => account.enabled).length,
    providerCount: new Set(store.events.map((event) => event.provider)).size,
    nextSevenDaysCount: store.events.filter(
      (event) => event.endMs >= now && event.startMs <= sevenDaysOut
    ).length,
  };
}

export function listCalendarEvents(
  store: CalendarStoreFile,
  params?: { startMs?: number; endMs?: number; limit?: number }
): CalendarEventRecord[] {
  const startMs = params?.startMs ?? Date.now() - 24 * 60 * 60 * 1000;
  const endMs = params?.endMs ?? Date.now() + 14 * 24 * 60 * 60 * 1000;
  const limit = params?.limit ?? 300;
  return store.events
    .filter((event) => event.endMs >= startMs && event.startMs <= endMs)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, limit);
}

function buildImportedEventId(
  provider: ExternalCalendarProvider,
  accountId: string,
  externalId: string
): string {
  return `import:${provider}:${accountId}:${externalId}`;
}

function buildChecksum(event: ImportedCalendarEventInput): string {
  return JSON.stringify([
    event.title,
    event.startMs,
    event.endMs,
    event.allDay,
    event.calendarName || "",
    event.location || "",
    event.notes || "",
  ]);
}

export function replaceImportedEventsForAccount(
  store: CalendarStoreFile,
  params: {
    provider: ExternalCalendarProvider;
    accountId: string;
    importedEvents: ImportedCalendarEventInput[];
    syncedAt?: number;
  }
): CalendarStoreFile {
  const syncedAt = params.syncedAt ?? Date.now();
  const account = store.accounts.find((candidate) => candidate.id === params.accountId);
  if (!account) {
    throw new Error(`Calendar account not found: ${params.accountId}`);
  }

  const preserved = new Map(
    store.events
      .filter(
        (event) =>
          event.source === "imported" &&
          event.provider === params.provider &&
          event.accountId === params.accountId &&
          event.externalId
      )
      .map((event) => [event.externalId as string, event])
  );

  const nextImportedEvents: CalendarEventRecord[] = params.importedEvents
    .filter((event) => event.externalId.trim().length > 0)
    .map((event) => {
      const previous = preserved.get(event.externalId);
      return {
        id: buildImportedEventId(params.provider, params.accountId, event.externalId),
        title: event.title.trim() || "(Untitled)",
        startMs: event.startMs,
        endMs: event.endMs >= event.startMs ? event.endMs : event.startMs,
        allDay: event.allDay,
        source: "imported" as const,
        provider: params.provider,
        externalId: event.externalId,
        accountId: params.accountId,
        calendarName:
          event.calendarName?.trim() || `${getCalendarProviderLabel(params.provider)} Calendar`,
        location: event.location?.trim() || null,
        notes: event.notes?.trim() || null,
        readOnly: !account.writeBack,
        createdAt: previous?.createdAt ?? syncedAt,
        updatedAt: syncedAt,
        sync: {
          importedAt: previous?.sync.importedAt ?? syncedAt,
          lastSeenAt: syncedAt,
          lastSyncedAt: syncedAt,
          checksum: buildChecksum(event),
          writeBackEligible: account.writeBack,
          conflictPolicy: account.writeBack ? "write-back" : "local-copy",
        },
      };
    });

  const retainedEvents = store.events.filter(
    (event) =>
      !(
        event.source === "imported" &&
        event.provider === params.provider &&
        event.accountId === params.accountId
      )
  );

  return normalizeStore({
    ...store,
    updatedAt: syncedAt,
    events: [...retainedEvents, ...nextImportedEvents],
  });
}
