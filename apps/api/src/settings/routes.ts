import { badRequest, isRecord, json, type Route } from "../routing.js";
import { isTime } from "../tasks/recurrence.js";
import type { Settings } from "./model.js";
import type { PgSettingsStore } from "./store.js";

export function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !/^[A-Za-z0-9_+\-/]{1,64}$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Aplica só os campos enviados sobre o que já existe e valida tudo. Devolve o erro ou as configurações novas. */
export function mergeSettings(current: Settings, body: Record<string, unknown>): Settings | string {
  const next: Settings = { ...current, checkins: { ...current.checkins }, checkinsEnabled: { ...current.checkinsEnabled }, quiet: { ...current.quiet } };
  if (body.timezone !== undefined) {
    if (!validTimeZone(body.timezone)) return "invalid_timezone";
    next.timezone = body.timezone;
  }
  if (body.weekStart !== undefined) {
    if (body.weekStart !== 0 && body.weekStart !== 1) return "invalid_week_start";
    next.weekStart = body.weekStart;
  }
  if (body.checkins !== undefined) {
    if (!isRecord(body.checkins)) return "invalid_checkins";
    for (const key of ["plan", "thursday", "saturday"] as const) {
      const value = body.checkins[key];
      if (value === undefined) continue;
      if (!isTime(value)) return "invalid_checkins";
      next.checkins[key] = value;
    }
  }
  if (body.checkinsEnabled !== undefined) {
    if (!isRecord(body.checkinsEnabled)) return "invalid_checkins_enabled";
    for (const key of ["plan", "thursday", "saturday"] as const) {
      const value = body.checkinsEnabled[key];
      if (value === undefined) continue;
      if (typeof value !== "boolean") return "invalid_checkins_enabled";
      next.checkinsEnabled[key] = value;
    }
  }
  if (body.quiet !== undefined) {
    if (!isRecord(body.quiet)) return "invalid_quiet";
    for (const key of ["start", "end"] as const) {
      const value = body.quiet[key];
      if (value === undefined) continue;
      if (!isTime(value)) return "invalid_quiet";
      next.quiet[key] = value;
    }
  }
  if (body.aiAutoApply !== undefined) {
    if (typeof body.aiAutoApply !== "boolean") return "invalid_ai_auto_apply";
    next.aiAutoApply = body.aiAutoApply;
  }
  return next;
}

export function settingsRoutes(store: PgSettingsStore): Route[] {
  return [
    {
      method: "GET",
      pattern: /^\/settings$/,
      access: "session",
      handle: async () => json(200, { settings: await store.get() }),
    },
    {
      method: "PATCH",
      pattern: /^\/settings$/,
      access: "owner",
      handle: async ({ req }) => {
        const body = isRecord(req.body) ? req.body : {};
        if (Object.keys(body).length === 0) return badRequest("empty_patch");
        const merged = mergeSettings(await store.get(), body);
        if (typeof merged === "string") return badRequest(merged);
        return json(200, { settings: await store.put(merged) });
      },
    },
  ];
}
