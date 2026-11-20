import { DEFAULT_MODEL, TURN_BUDGET_MS, createBudgetedModel, withBudget, type Effort, type FetchLike, type ModelFn } from "./anthropic.js";
import { createBedrockModel, sdkInvoke, sdkStream, type AiConfig, type BedrockInvoke, type BedrockStream } from "./bedrock.js";
import type { PgSecretStore } from "../secrets/store.js";

export const KEY_NAME = "anthropic";

export interface AiProvider {
  name: "anthropic" | "bedrock";
  /** Modelo em uso, para mostrar na tela. */
  model: string;
  /** Só na API da Anthropic: quanto o modelo pensa (output_config.effort). Sem valor, vale o padrão do modelo. */
  effort?: Effort;
  /** Modelo do turno, ou null se ainda falta configurar (Anthropic sem chave). Cada turno tem seu próprio orçamento de tempo. */
  forTurn(): Promise<ModelFn | null>;
}

interface Deps {
  config: AiConfig;
  secrets: PgSecretStore;
  fetchImpl: FetchLike;
  /** Só para o Bedrock: troca o SDK nos testes. */
  bedrockInvoke?: BedrockInvoke;
  /** Só para o Bedrock: troca o fluxo nos testes. */
  bedrockStream?: BedrockStream;
}

export function createProvider({ config, secrets, fetchImpl, bedrockInvoke, bedrockStream }: Deps): AiProvider {
  if (config.provider === "bedrock") {
    const invoke = bedrockInvoke ?? sdkInvoke(config.region);
    const stream = bedrockStream ?? (bedrockInvoke ? undefined : sdkStream(config.region));
    return {
      name: "bedrock",
      model: config.modelId,
      // Credenciais vêm do papel IAM da Lambda: não há chave para guardar.
      forTurn: async () => withBudget((timeoutMs) => createBedrockModel(config.modelId, invoke, timeoutMs, stream), TURN_BUDGET_MS),
    };
  }
  const model = config.model || DEFAULT_MODEL;
  const effort = config.effort;
  return {
    name: "anthropic",
    model,
    effort,
    forTurn: async () => {
      const key = await secrets.get(KEY_NAME);
      return key ? createBudgetedModel(key, model, fetchImpl, TURN_BUDGET_MS, Date.now, effort) : null;
    },
  };
}

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** Lê a configuração do provedor das variáveis de ambiente. */
export function aiConfigFromEnv(env: Record<string, string | undefined>): AiConfig {
  if (env.AI_PROVIDER !== "bedrock") {
    const model = env.ANTHROPIC_MODEL?.trim();
    const effort = env.ANTHROPIC_EFFORT?.trim();
    if (effort && !EFFORTS.includes(effort as Effort)) throw new Error(`ANTHROPIC_EFFORT must be one of ${EFFORTS.join(", ")}`);
    return { provider: "anthropic", ...(model ? { model } : {}), ...(effort ? { effort: effort as Effort } : {}) };
  }
  const modelId = env.BEDROCK_MODEL_ID?.trim();
  if (!modelId) throw new Error("BEDROCK_MODEL_ID is required when AI_PROVIDER=bedrock");
  const region = (env.BEDROCK_REGION || env.AWS_REGION || "").trim();
  if (!region) throw new Error("BEDROCK_REGION (or AWS_REGION) is required when AI_PROVIDER=bedrock");
  return { provider: "bedrock", modelId, region };
}
