export interface Toast {
  text: string;
  action?: { label: string; run: () => void };
}
