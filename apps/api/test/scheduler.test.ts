import { describe, expect, it } from "vitest";
import { ConflictException, CreateScheduleCommand, DeleteScheduleCommand, ListSchedulesCommand } from "@aws-sdk/client-scheduler";
import { upcomingFireTimes, zonedToUtcMs } from "../src/push/fire-times.js";
import { AwsFireScheduler, atExpression, diffSchedules, scheduleName } from "../src/push/scheduler.js";
import { createTestApp } from "./helpers.js";

const T = Date.UTC(2026, 10, 24, 22, 5); // terça 19:05 em São Paulo

describe("nomes e diferenças", () => {
  it("nomeia e expressa o minuto em UTC", () => {
    expect(scheduleName(T)).toBe("fire-202611242205");
    expect(atExpression(T)).toBe("at(2026-11-24T22:05:00)");
  });
  it("cria o que falta e apaga o que sobra, sem mexer em nome alheio", () => {
    const keep = T;
    const add = T + 60_000;
    const diff = diffSchedules([scheduleName(keep), "fire-202601010000", "outro"], [keep, add]);
    expect(diff).toEqual({ create: [add], remove: ["fire-202601010000"] });
  });
});

describe("fuso", () => {
  it("converte a hora de parede de São Paulo para UTC", () => {
    expect(zonedToUtcMs("2026-11-24", "19:05", "America/Sao_Paulo")).toBe(T);
    expect(zonedToUtcMs("2026-11-24", "00:30", "America/Sao_Paulo")).toBe(Date.UTC(2026, 10, 24, 3, 30));
    expect(zonedToUtcMs("2026-11-24", "12:00", "Europe/Lisbon")).toBe(Date.UTC(2026, 10, 24, 12, 0));
  });
});

describe("disparos exatos", () => {
  it("lista tarefas com hora, check-ins próprios e da rotina, fora do silêncio e do passado", async () => {
    const app = await createTestApp();
    const cookies = await app.owner();
    const now = app.clock.ms; // 18/11/2026 12:00 UTC = quarta 09:00 em São Paulo
    const task = (title: string, date: string, time: string) => app.call("POST", "/tasks", { cookies, body: { title, date, time } });
    await task("Já passou", "2026-11-18", "08:00");
    await task("Hoje 14h", "2026-11-18", "14:00");
    await task("Amanhã 08h", "2026-11-19", "08:00");
    await task("Silêncio", "2026-11-18", "23:00");
    const done = ((await task("Feita", "2026-11-18", "15:00")).body as { task: { id: string } }).task.id;
    await app.call("POST", `/tasks/${done}/done`, { cookies, body: { done: true, date: "2026-11-18" } });
    await app.call("PATCH", "/settings", { cookies, body: { customCheckins: [{ id: "a", title: "Água", time: "16:00", days: [3], enabled: true }] } });

    const { PgSettingsStore } = await import("../src/settings/store.js");
    const { PgTaskStore } = await import("../src/tasks/store.js");
    const times = await upcomingFireTimes({ settings: new PgSettingsStore(app.sql, () => now), tasks: new PgTaskStore(app.sql, () => now), now: () => now });
    const local = times.map((ms) => new Date(ms - 3 * 3_600_000).toISOString().slice(5, 16));
    expect(local).toContain("11-18T14:00");
    expect(local).toContain("11-18T16:00");
    expect(local).toContain("11-19T08:30");
    expect(local).toContain("11-19T08:00");
    expect(local).not.toContain("11-18T08:00");
    expect(local).not.toContain("11-18T15:00");
    expect(local).not.toContain("11-18T23:00");
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length);
  });
});

describe("AwsFireScheduler", () => {
  it("lista, cria os minutos novos e apaga os velhos, aceitando conflito", async () => {
    const sent: unknown[] = [];
    const client = {
      send: async (command: unknown) => {
        sent.push(command);
        if (command instanceof ListSchedulesCommand) return { Schedules: [{ Name: scheduleName(T) }, { Name: "fire-202001010000" }] };
        if (command instanceof CreateScheduleCommand) throw new ConflictException({ Message: "x", message: "x", $metadata: {} });
        return {};
      },
    };
    const scheduler = new AwsFireScheduler(client as never, { group: "g", roleArn: "arn:role", targetArn: () => "arn:fn" });
    const result = await scheduler.reconcile([T, T + 60_000]);
    expect(result).toEqual({ created: 0, deleted: 1 });
    const create = sent.find((c) => c instanceof CreateScheduleCommand) as CreateScheduleCommand;
    expect(create.input).toMatchObject({ Name: scheduleName(T + 60_000), GroupName: "g", ScheduleExpression: atExpression(T + 60_000), ActionAfterCompletion: "DELETE", Target: { Arn: "arn:fn", RoleArn: "arn:role", Input: '{"job":"push"}' } });
    const del = sent.find((c) => c instanceof DeleteScheduleCommand) as DeleteScheduleCommand;
    expect(del.input).toEqual({ Name: "fire-202001010000", GroupName: "g" });
  });
});
