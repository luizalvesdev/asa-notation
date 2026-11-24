import { ConflictException, CreateScheduleCommand, DeleteScheduleCommand, ListSchedulesCommand, ResourceNotFoundException, type SchedulerClient } from "@aws-sdk/client-scheduler";

/** Agenda disparos exatos do trabalho de push, para o aviso chegar na hora e não só a cada meia hora. */
export interface FireScheduler {
  /** Deixa agendados exatamente estes instantes (UTC, em ms, minutos cheios): cria os que faltam e apaga os que sobraram. */
  reconcile(times: number[]): Promise<{ created: number; deleted: number }>;
}

const PREFIX = "fire-";
/** Teto de segurança: um erro não pode encher a conta de agendamentos. */
const MAX_SCHEDULES = 60;

const pad = (n: number, size = 2) => String(n).padStart(size, "0");

/** Nome do agendamento de um minuto: `fire-AAAAMMDDHHMM` em UTC. */
export function scheduleName(ms: number): string {
  const d = new Date(ms);
  return `${PREFIX}${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

/** Expressão `at(...)` do EventBridge Scheduler (UTC, sem fração). */
export function atExpression(ms: number): string {
  return `at(${new Date(ms).toISOString().slice(0, 19)})`;
}

/** O que criar e o que apagar para os agendamentos existentes ficarem iguais aos desejados. */
export function diffSchedules(existing: string[], desired: number[]): { create: number[]; remove: string[] } {
  const wanted = new Map(desired.slice(0, MAX_SCHEDULES).map((ms) => [scheduleName(ms), ms]));
  const have = new Set(existing);
  return {
    create: [...wanted].filter(([name]) => !have.has(name)).map(([, ms]) => ms),
    remove: existing.filter((name) => name.startsWith(PREFIX) && !wanted.has(name)),
  };
}

export interface AwsFireConfig {
  group: string;
  roleArn: string;
  /** ARN da função que o agendador invoca (a própria API). */
  targetArn: () => string;
}

export class AwsFireScheduler implements FireScheduler {
  constructor(
    private readonly client: Pick<SchedulerClient, "send">,
    private readonly config: AwsFireConfig,
  ) {}

  private async existing(): Promise<string[]> {
    const names: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(new ListSchedulesCommand({ GroupName: this.config.group, NamePrefix: PREFIX, ...(token ? { NextToken: token } : {}) }));
      for (const s of page.Schedules ?? []) if (s.Name) names.push(s.Name);
      token = page.NextToken;
    } while (token);
    return names;
  }

  async reconcile(times: number[]): Promise<{ created: number; deleted: number }> {
    const { create, remove } = diffSchedules(await this.existing(), times);
    let created = 0;
    let deleted = 0;
    for (const ms of create) {
      try {
        await this.client.send(
          new CreateScheduleCommand({
            Name: scheduleName(ms),
            GroupName: this.config.group,
            ScheduleExpression: atExpression(ms),
            ScheduleExpressionTimezone: "UTC",
            FlexibleTimeWindow: { Mode: "OFF" },
            // O agendamento de uma vez só some sozinho depois de rodar.
            ActionAfterCompletion: "DELETE",
            Target: { Arn: this.config.targetArn(), RoleArn: this.config.roleArn, Input: JSON.stringify({ job: "push" }) },
          }),
        );
        created++;
      } catch (err) {
        // Outra execução criou o mesmo minuto ao mesmo tempo: serve.
        if (!(err instanceof ConflictException)) throw err;
      }
    }
    for (const name of remove) {
      try {
        await this.client.send(new DeleteScheduleCommand({ Name: name, GroupName: this.config.group }));
        deleted++;
      } catch (err) {
        if (!(err instanceof ResourceNotFoundException)) throw err;
      }
    }
    return { created, deleted };
  }
}
