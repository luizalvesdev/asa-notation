import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api } from "./api.js";

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

export function describeAuthError(err: unknown): string {
  const name = (err as { name?: string } | null)?.name;
  if (name === "NotAllowedError") return "A operação foi cancelada ou expirou.";
  if (name === "InvalidStateError") return "Esta passkey já está cadastrada.";
  const code = (err as { code?: string } | null)?.code;
  if (code === "unauthorized") return "Token de bootstrap inválido.";
  if (code === "bootstrap_closed") return "O cadastro inicial já foi feito. Entre com a passkey.";
  if (code === "verification_failed") return "Não foi possível verificar a passkey.";
  return "Algo deu errado. Tente de novo.";
}
