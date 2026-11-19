import { clozeSegments } from "./study-logic";
import type { Grade } from "./study-types";

/**
 * Responder o card digitando: confere a resposta (tolerando acento, maiúscula e erro pequeno)
 * e sugere a nota pelo tempo que levou para lembrar (até a primeira tecla, só com o Asa em foco).
 */

/** Começou a digitar em menos que isso: lembrou de cara. */
export const FAST_MS = 3_000;
/** Demorou mais que isso para começar: lembrou com esforço. */
export const SLOW_MS = 15_000;
/** Parado mais que isso (sem digitar, com o Asa em foco): o tempo não vale como medida. */
export const IDLE_MS = 60_000;

const KEY = "asa-typed-answers";

/** Por aparelho. Padrão: ligado com mouse e teclado; desligado em tela de toque (digitar lá é mais lento e distorce o tempo). */
export function loadTypedAnswers(): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "on") return true;
    if (saved === "off") return false;
  } catch {
    // sem armazenamento: usa o padrão
  }
  return !(typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches);
}

export function saveTypedAnswers(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // vale só nesta visita
  }
}

export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

/** Erros de digitação aceitos para uma resposta deste tamanho. */
function allowedTypos(length: number): number {
  if (length <= 4) return 0;
  if (length <= 10) return 1;
  return Math.floor(length * 0.15);
}

const STOP = new Set(["de", "da", "do", "das", "dos", "the", "and", "para", "com", "por", "que", "uma", "um", "em", "no", "na", "os", "as", "of", "to", "in"]);

/** O que conta como resposta: o verso (básico) ou as lacunas, em ordem (lacuna). */
export function expectedAnswer(card: { kind: "basic" | "cloze"; front: string; back: string }): string {
  if (card.kind === "basic") return card.back;
  return clozeSegments(card.front)
    .filter((s) => s.blank)
    .map((s) => s.text)
    .join(" ");
}

export function checkAnswer(typed: string, expected: string): boolean {
  const a = normalizeAnswer(typed);
  const b = normalizeAnswer(expected);
  if (!a || !b) return false;
  if (a === b || levenshtein(a, b) <= allowedTypos(b.length)) return true;
  // Respostas longas: vale ter as palavras importantes, em qualquer ordem e com erro pequeno em cada uma.
  const want = b.split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
  if (want.length < 3) return false;
  const got = a.split(" ");
  const hit = want.filter((w) => got.some((g) => g === w || levenshtein(g, w) <= allowedTypos(w.length))).length;
  return hit / want.length >= 0.7;
}

export interface Thresholds {
  fast: number;
  slow: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { fast: FAST_MS, slow: SLOW_MS };
/** Quantas respostas medidas antes de trocar os limites fixos pelos seus. */
export const MIN_SAMPLES = 50;
const MAX_SAMPLES = 200;
const SAMPLES_KEY = "asa-recall-times";

function percentile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
}

/** Seus limites: os 25% mais rápidos viram Fácil e os 25% mais lentos, Difícil. Antes de 50 respostas, os fixos. */
export function thresholdsFrom(samples: readonly number[]): Thresholds {
  if (samples.length < MIN_SAMPLES) return DEFAULT_THRESHOLDS;
  const sorted = [...samples].sort((a, b) => a - b);
  const fast = Math.max(1_000, percentile(sorted, 0.25));
  const slow = Math.min(IDLE_MS, Math.max(fast + 1_000, percentile(sorted, 0.75)));
  return { fast, slow };
}

export function loadSamples(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SAMPLES_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === "number" && n >= 0) : [];
  } catch {
    return [];
  }
}

/** Guarda o tempo de uma resposta certa de primeira, medida (por aparelho; as últimas 200). */
export function recordSample(latencyMs: number): void {
  try {
    localStorage.setItem(SAMPLES_KEY, JSON.stringify([...loadSamples(), Math.round(latencyMs)].slice(-MAX_SAMPLES)));
  } catch {
    // sem armazenamento
  }
}

/**
 * Nota sugerida. `errors`: quantas vezes errou este card antes (refazendo).
 * null: tempo não medido (ficou parado), a nota fica com quem revisa.
 */
export function suggestGrade(correct: boolean, latencyMs: number | null, errors = 0, limits: Thresholds = DEFAULT_THRESHOLDS): Grade | null {
  if (!correct || errors >= 2) return 1;
  if (errors === 1) return 2;
  if (latencyMs === null) return null;
  if (latencyMs > limits.slow) return 2;
  if (latencyMs < limits.fast) return 4;
  return 3;
}

export function formatSeconds(ms: number): string {
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1).replace(".", ",")} s` : `${Math.round(s)} s`;
}

/**
 * Cronômetro que só anda com o Asa visível e em foco.
 * `latency`: tempo ativo até a primeira tecla. `idle`: algum trecho parado (sem tecla) passou de IDLE_MS.
 */
export class ActiveClock {
  private total = 0;
  private since: number | null = null;
  private lastKey = 0;
  firstKey: number | null = null;
  idle = false;

  constructor(private now: () => number = () => performance.now()) {}

  start(): void {
    if (this.since === null) this.since = this.now();
  }

  pause(): void {
    if (this.since !== null) {
      this.total += this.now() - this.since;
      this.since = null;
    }
  }

  elapsed(): number {
    return this.total + (this.since === null ? 0 : this.now() - this.since);
  }

  key(): void {
    const t = this.elapsed();
    if (t - this.lastKey > IDLE_MS) this.idle = true;
    if (this.firstKey === null) this.firstKey = t;
    this.lastKey = t;
  }

  /** Tempo até lembrar, ou null se não vale como medida. */
  latency(): number | null {
    if (this.elapsed() - this.lastKey > IDLE_MS) this.idle = true;
    if (this.idle) return null;
    return this.firstKey ?? this.elapsed();
  }
}
