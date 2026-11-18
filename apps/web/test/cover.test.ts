import { describe, expect, it } from "vitest";
import { coverBackground } from "../src/Cover";

describe("coverBackground", () => {
  it("degradê conhecido vira CSS; desconhecido vira nada", () => {
    expect(coverBackground("grad:ocean")).toContain("linear-gradient");
    expect(coverBackground("grad:neon")).toBeNull();
  });
  it("imagem http(s) vira url(), com aspas escapadas", () => {
    expect(coverBackground("https://x.dev/a.png")).toContain('url("https://x.dev/a.png")');
    expect(coverBackground('https://x.dev/a".png')).toContain("%22");
  });
  it("outros esquemas e vazio não viram nada", () => {
    expect(coverBackground("javascript:alert(1)")).toBeNull();
    expect(coverBackground("data:image/png;base64,AAAA")).toBeNull();
    expect(coverBackground(null)).toBeNull();
  });
});
