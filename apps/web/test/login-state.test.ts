import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  initialLogin,
  loginMessage,
  reduceLogin,
  type LoginState,
} from "../src/login-state";

const loading: LoginState = reduceLogin(initialLogin, { type: "submit" });

describe("reduceLogin", () => {
  it("vai para carregando ao enviar e ignora envio duplo", () => {
    expect(loading.status).toBe("carregando");
    expect(reduceLogin(loading, { type: "submit" })).toBe(loading);
  });

  it("mostra erro e guarda as tentativas restantes", () => {
    const state = reduceLogin(loading, { type: "result", result: { kind: "invalid", remaining: 4 } });
    expect(state).toEqual({ status: "erro", remaining: 4, lockSeconds: 0 });
    expect(loginMessage(state)).toBe("Senha incorreta. Restam 4 tentativas.");
  });

  it("não inventa tentativas quando a API não informa", () => {
    const state = reduceLogin(loading, { type: "result", result: { kind: "invalid" } });
    expect(loginMessage(state)).toBe("Senha incorreta.");
  });

  it("usa singular na última tentativa", () => {
    const state = reduceLogin(loading, { type: "result", result: { kind: "invalid", remaining: 1 } });
    expect(loginMessage(state)).toBe("Senha incorreta. Resta 1 tentativa.");
  });

  it("bloqueia, conta o tempo e libera ao zerar", () => {
    let state = reduceLogin(loading, { type: "result", result: { kind: "locked", retryAfterSeconds: 2 } });
    expect(state.status).toBe("bloqueado");
    expect(loginMessage(state)).toBe("Muitas tentativas. Tente de novo em 0:02.");
    expect(reduceLogin(state, { type: "submit" })).toBe(state);
    state = reduceLogin(state, { type: "tick" });
    expect(state.lockSeconds).toBe(1);
    expect(reduceLogin(state, { type: "tick" })).toEqual(initialLogin);
  });

  it("arredonda o bloqueio para cima e garante ao menos 1 s", () => {
    const state = reduceLogin(loading, { type: "result", result: { kind: "locked", retryAfterSeconds: 0.2 } });
    expect(state.lockSeconds).toBe(1);
  });

  it("registra offline e sucesso", () => {
    expect(reduceLogin(loading, { type: "result", result: { kind: "offline" } }).status).toBe("offline");
    expect(reduceLogin(loading, { type: "result", result: { kind: "ok" } }).status).toBe("ok");
  });

  it("ignora resultado que chega fora de uma requisição", () => {
    expect(reduceLogin(initialLogin, { type: "result", result: { kind: "ok" } })).toBe(initialLogin);
  });

  it("permite tentar de novo depois de erro ou offline", () => {
    const erro = reduceLogin(loading, { type: "result", result: { kind: "invalid" } });
    expect(reduceLogin(erro, { type: "submit" }).status).toBe("carregando");
    const off = reduceLogin(loading, { type: "result", result: { kind: "offline" } });
    expect(reduceLogin(off, { type: "submit" }).status).toBe("carregando");
  });
});

describe("formatCountdown", () => {
  it("formata minutos e segundos", () => {
    expect(formatCountdown(298)).toBe("4:58");
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(5)).toBe("0:05");
    expect(formatCountdown(-3)).toBe("0:00");
  });
});
