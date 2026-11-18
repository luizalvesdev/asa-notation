export type LoginStatus = "pronto" | "erro" | "carregando" | "ok" | "bloqueado" | "offline";

export type LoginResult =
  | { kind: "ok" }
  | { kind: "invalid"; remaining?: number }
  | { kind: "locked"; retryAfterSeconds: number }
  | { kind: "offline" };

export interface LoginState {
  status: LoginStatus;
  remaining: number | null;
  lockSeconds: number;
}

export type LoginAction =
  | { type: "submit" }
  | { type: "result"; result: LoginResult }
  | { type: "tick" }
  | { type: "reset" };

export const initialLogin: LoginState = { status: "pronto", remaining: null, lockSeconds: 0 };

export function reduceLogin(state: LoginState, action: LoginAction): LoginState {
  switch (action.type) {
    case "submit":
      if (state.status === "carregando" || state.status === "bloqueado") return state;
      return { status: "carregando", remaining: null, lockSeconds: 0 };
    case "result": {
      if (state.status !== "carregando") return state;
      const { result } = action;
      if (result.kind === "ok") return { status: "ok", remaining: null, lockSeconds: 0 };
      if (result.kind === "invalid") return { status: "erro", remaining: result.remaining ?? null, lockSeconds: 0 };
      if (result.kind === "locked") {
        return { status: "bloqueado", remaining: null, lockSeconds: Math.max(1, Math.ceil(result.retryAfterSeconds)) };
      }
      return { status: "offline", remaining: null, lockSeconds: 0 };
    }
    case "tick": {
      if (state.status !== "bloqueado") return state;
      const left = state.lockSeconds - 1;
      return left > 0 ? { ...state, lockSeconds: left } : initialLogin;
    }
    case "reset":
      return initialLogin;
  }
}

export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function loginMessage(state: LoginState): string {
  switch (state.status) {
    case "pronto":
      return "Use a senha definida na instalação.";
    case "erro":
      if (state.remaining === null) return "Senha incorreta.";
      return `Senha incorreta. ${state.remaining === 1 ? "Resta 1 tentativa" : `Restam ${state.remaining} tentativas`}.`;
    case "carregando":
      return "Verificando…";
    case "ok":
      return "Tudo certo.";
    case "bloqueado":
      return `Muitas tentativas. Tente de novo em ${formatCountdown(state.lockSeconds)}.`;
    case "offline":
      return "Sem conexão. Você entra assim que a rede voltar.";
  }
}

export function isFieldInvalid(status: LoginStatus): boolean {
  return status === "erro" || status === "bloqueado";
}
