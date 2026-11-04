import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api, ApiError } from "./api.js";

export const PASSWORD_MIN_LENGTH = 12;

export const passkeysSupported = () => browserSupportsWebAuthn();

export async function registerFirstPasskey(bootstrapToken: string, name: string): Promise<void> {
  const optionsJSON = (await api.registerOptions(bootstrapToken)) as Parameters<typeof startRegistration>[0]["optionsJSON"];
  const response = await startRegistration({ optionsJSON });
  await api.registerVerify(name, response);
}

export async function loginWithPasskey(): Promise<void> {
  const optionsJSON = (await api.loginOptions()) as Parameters<typeof startAuthentication>[0]["optionsJSON"];
  const response = await startAuthentication({ optionsJSON });
  await api.loginVerify(response);
}

export type AuthContext = "bootstrap" | "login" | "change";

function minutes(err: ApiError): number {
  const seconds = (err.body as { retryAfterSeconds?: number } | null)?.retryAfterSeconds ?? 900;
  return Math.max(1, Math.ceil(seconds / 60));
}

export function describeAuthError(err: unknown, context: AuthContext): string {
  const name = (err as { name?: string } | null)?.name;
  if (name === "NotAllowedError") return "A operação foi cancelada ou expirou.";
  if (name === "InvalidStateError") return "Esta passkey já está cadastrada.";
  if (!(err instanceof ApiError)) return "Algo deu errado. Tente de novo.";
  switch (err.code) {
    case "locked":
      return `Muitas tentativas erradas. Tente de novo em ${minutes(err)} min.`;
    case "invalid_password":
      return `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
    case "wrong_password":
      return "Senha atual incorreta.";
    case "bootstrap_closed":
      return "O primeiro acesso já foi feito. Entre com a sua senha ou passkey.";
    case "verification_failed":
      return "Não foi possível verificar a passkey.";
    case "unauthorized":
      return context === "bootstrap" ? "Token de bootstrap inválido." : "Senha incorreta.";
    default:
      return "Algo deu errado. Tente de novo.";
  }
}
