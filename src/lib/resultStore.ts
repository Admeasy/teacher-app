export interface ResultView {
  title: string;
  data: any[];
}

type Listener = () => void;
let state: ResultView | null = null;
const listeners = new Set<Listener>();

export const resultStore = {
  get: () => state,
  set: (v: ResultView | null) => { state = v; listeners.forEach(l => l()); },
  subscribe: (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; },
};
