import { create } from 'zustand';
import { loadRoot, saveRoot, clearAll } from '../db/persistence';
import type { GeoCoord } from '../math/sailing';
import type { LiveGps } from '../services/geolocation';

export type MarkKey = 'pin' | 'committee' | 'windward';

export type GeoPoint = GeoCoord & { ts: number; accuracy?: number };

export type WindReading = {
  ts: number;
  direction: number;
  source: 'manual' | 'heading' | 'slider';
};

export type Course = {
  id: string;
  name: string;
  pin: GeoPoint | null;
  committee: GeoPoint | null;
  windward: GeoPoint | null;
  windDirection: number | null;
  windSetAt: number | null;
  windHistory: WindReading[];
  notes: string;
};

export type Regatta = {
  id: string;
  name: string;
  date: number; // epoch
  courseIds: string[];
};

export type HeadingMode = 'true' | 'magnetic';

export type Settings = {
  headingMode: HeadingMode;
  holdMs: 1500 | 2500 | 4000;
  sound: boolean;
  layLineDeg: number; // 40..50
};

export type ViewMode = 'schema' | 'map';

export type DrawerKind = 'setup' | 'history' | 'wind' | 'settings' | 'timer' | null;

export type PersistedRoot = {
  regattas: Record<string, Regatta>;
  courses: Record<string, Course>;
  currentCourseId: string | null;
  currentRegattaId: string | null;
  settings: Settings;
  viewMode: ViewMode;
  hasOnboarded: boolean;
};

type State = PersistedRoot & {
  liveGps: LiveGps | null;
  drawerOpen: DrawerKind;
};

type Actions = {
  // bootstrap
  hydrate: () => Promise<void>;
  setOnboarded: (v: boolean) => void;
  // course / regatta
  ensureRegatta: () => Regatta;
  ensureCurrentCourse: () => Course;
  newRace: () => void;
  pingMark: (mark: MarkKey, coord: GeoCoord, accuracy?: number) => void;
  setWind: (direction: number, source: WindReading['source']) => void;
  setNotes: (notes: string) => void;
  setCourseName: (name: string) => void;
  // live
  updateLiveGps: (g: LiveGps | null) => void;
  // ui
  setDrawer: (d: DrawerKind) => void;
  setViewMode: (m: ViewMode) => void;
  // settings
  setSettings: (patch: Partial<Settings>) => void;
  // reset
  resetAll: () => Promise<void>;
};

const DEFAULT_SETTINGS: Settings = {
  headingMode: 'true',
  holdMs: 2500,
  sound: true,
  layLineDeg: 45
};

const EMPTY: PersistedRoot = {
  regattas: {},
  courses: {},
  currentCourseId: null,
  currentRegattaId: null,
  settings: DEFAULT_SETTINGS,
  viewMode: 'schema',
  hasOnboarded: false
};

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function newRegatta(): Regatta {
  const today = new Date();
  const name = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
  return { id: uid(), name, date: Date.now(), courseIds: [] };
}

function newCourse(name = 'Гонка 1'): Course {
  return {
    id: uid(),
    name,
    pin: null,
    committee: null,
    windward: null,
    windDirection: null,
    windSetAt: null,
    windHistory: [],
    notes: ''
  };
}

let saveTimer: number | null = null;
function scheduleSave(get: () => State) {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const s = get();
    const persist: PersistedRoot = {
      regattas: s.regattas,
      courses: s.courses,
      currentCourseId: s.currentCourseId,
      currentRegattaId: s.currentRegattaId,
      settings: s.settings,
      viewMode: s.viewMode,
      hasOnboarded: s.hasOnboarded
    };
    void saveRoot(persist);
  }, 500);
}

export const useSailingStore = create<State & Actions>((set, get) => ({
  ...EMPTY,
  liveGps: null,
  drawerOpen: null,

  hydrate: async () => {
    const data = await loadRoot();
    if (data) {
      set({
        ...data,
        settings: { ...DEFAULT_SETTINGS, ...data.settings }
      });
    }
  },

  setOnboarded: (v) => {
    set({ hasOnboarded: v });
    scheduleSave(get);
  },

  ensureRegatta: () => {
    const s = get();
    if (s.currentRegattaId && s.regattas[s.currentRegattaId]) {
      return s.regattas[s.currentRegattaId];
    }
    const r = newRegatta();
    set({
      regattas: { ...s.regattas, [r.id]: r },
      currentRegattaId: r.id
    });
    scheduleSave(get);
    return r;
  },

  ensureCurrentCourse: () => {
    const s = get();
    if (s.currentCourseId && s.courses[s.currentCourseId]) {
      return s.courses[s.currentCourseId];
    }
    const regatta = get().ensureRegatta();
    const c = newCourse(`Гонка ${regatta.courseIds.length + 1}`);
    set({
      courses: { ...get().courses, [c.id]: c },
      currentCourseId: c.id,
      regattas: {
        ...get().regattas,
        [regatta.id]: { ...regatta, courseIds: [...regatta.courseIds, c.id] }
      }
    });
    scheduleSave(get);
    return c;
  },

  newRace: () => {
    const s = get();
    const prev = s.currentCourseId ? s.courses[s.currentCourseId] : null;
    const regatta = get().ensureRegatta();
    const c = newCourse(`Гонка ${regatta.courseIds.length + 1}`);
    if (prev) {
      c.pin = prev.pin;
      c.committee = prev.committee;
      c.windward = prev.windward;
      c.windDirection = prev.windDirection;
      c.windSetAt = prev.windSetAt;
    }
    set({
      courses: { ...s.courses, [c.id]: c },
      currentCourseId: c.id,
      regattas: {
        ...s.regattas,
        [regatta.id]: { ...regatta, courseIds: [...regatta.courseIds, c.id] }
      }
    });
    scheduleSave(get);
  },

  pingMark: (mark, coord, accuracy) => {
    const s = get();
    const cur = get().ensureCurrentCourse();
    const point: GeoPoint = { ...coord, ts: Date.now(), accuracy };
    const updated: Course = { ...cur, [mark]: point };
    set({ courses: { ...s.courses, [cur.id]: updated }, currentCourseId: cur.id });
    scheduleSave(get);
  },

  setWind: (direction, source) => {
    const cur = get().ensureCurrentCourse();
    const reading: WindReading = { ts: Date.now(), direction, source };
    const updated: Course = {
      ...cur,
      windDirection: direction,
      windSetAt: reading.ts,
      windHistory: [...cur.windHistory.slice(-499), reading]
    };
    set({ courses: { ...get().courses, [cur.id]: updated } });
    scheduleSave(get);
  },

  setNotes: (notes) => {
    const cur = get().ensureCurrentCourse();
    set({ courses: { ...get().courses, [cur.id]: { ...cur, notes } } });
    scheduleSave(get);
  },

  setCourseName: (name) => {
    const cur = get().ensureCurrentCourse();
    set({ courses: { ...get().courses, [cur.id]: { ...cur, name } } });
    scheduleSave(get);
  },

  updateLiveGps: (g) => set({ liveGps: g }),

  setDrawer: (d) => set({ drawerOpen: d }),

  setViewMode: (m) => {
    set({ viewMode: m });
    scheduleSave(get);
  },

  setSettings: (patch) => {
    set({ settings: { ...get().settings, ...patch } });
    scheduleSave(get);
  },

  resetAll: async () => {
    await clearAll();
    set({ ...EMPTY, liveGps: null, drawerOpen: null });
  }
}));

/** Useful selector to get the current course or null. */
export function selectCurrentCourse(s: State): Course | null {
  if (!s.currentCourseId) return null;
  return s.courses[s.currentCourseId] ?? null;
}
