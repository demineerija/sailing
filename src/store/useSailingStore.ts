import { create } from 'zustand';
import {
  loadRoot,
  saveRoot,
  clearAll,
  saveAudio as saveAudioBlob,
  deleteAudio as deleteAudioBlob,
  clearAudio
} from '../db/persistence';
import type { GeoCoord } from '../math/sailing';
import type { LiveGps } from '../services/geolocation';

export type MarkKey = 'pin' | 'committee' | 'windward';

export type GeoPoint = GeoCoord & { ts: number; accuracy?: number };

export type WindReading = {
  ts: number;
  direction: number;
  speedMps?: number;
  source: 'manual' | 'heading' | 'slider' | 'internet' | 'auto';
};

/** Voice memo recorded by the coach. The audio Blob lives in a separate
 *  IndexedDB store keyed by `audioId` to keep the main state JSON small. */
export type VoiceNote = {
  id: string;
  audioId: string;
  ts: number;
  durationMs: number;
  mimeType: string;
  lat: number | null;
  lon: number | null;
  label?: string;
};

/** Result of a current-drift measurement: where the boat drifted while the
 *  engine was off, and how fast. setDirection is the direction the current
 *  is flowing TOWARD (0=N), opposite of TWD's "from" convention. */
export type CurrentVector = {
  setDirection: number;
  speedMps: number;
  distanceMeters: number;
  durationMs: number;
  samples: number;
  startCoord: GeoCoord;
  endCoord: GeoCoord;
  measuredAt: number;
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
  voiceNotes: VoiceNote[];
  current: CurrentVector | null;
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
  /** Auto-refresh wind from Open-Meteo every N minutes. 0 disables. */
  autoWindMinutes: 0 | 5 | 10 | 15 | 30;
  /** Default offset (in metres) for "Ping at Distance". Negative = behind. */
  pingAtDistanceMeters: number;
};

export type ViewMode = 'schema' | 'map';

export type DrawerKind =
  | 'setup'
  | 'history'
  | 'wind'
  | 'settings'
  | 'timer'
  | 'voice'
  | 'drift'
  | 'pingDist'
  | null;

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
  setWind: (direction: number, source: WindReading['source'], speedMps?: number) => void;
  setNotes: (notes: string) => void;
  setCourseName: (name: string) => void;
  // voice notes
  addVoiceNote: (
    blob: Blob,
    durationMs: number,
    coord: GeoCoord | null,
    label?: string
  ) => Promise<VoiceNote>;
  removeVoiceNote: (noteId: string) => Promise<void>;
  // current
  setCurrent: (vector: CurrentVector | null) => void;
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
  layLineDeg: 45,
  autoWindMinutes: 0,
  pingAtDistanceMeters: 5
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
    notes: '',
    voiceNotes: [],
    current: null
  };
}

function ensureCourseShape(c: Course): Course {
  // Migration helper for older persisted courses missing the new arrays.
  return {
    ...c,
    voiceNotes: Array.isArray(c.voiceNotes) ? c.voiceNotes : [],
    current: c.current ?? null
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
      const courses: Record<string, Course> = {};
      for (const [id, c] of Object.entries(data.courses)) {
        courses[id] = ensureCourseShape(c);
      }
      set({
        ...data,
        courses,
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
      c.current = prev.current;
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

  setWind: (direction, source, speedMps) => {
    const cur = get().ensureCurrentCourse();
    const reading: WindReading = {
      ts: Date.now(),
      direction,
      source,
      ...(speedMps !== undefined ? { speedMps } : {})
    };
    const updated: Course = {
      ...cur,
      windDirection: direction,
      windSetAt: reading.ts,
      windHistory: [...cur.windHistory.slice(-499), reading]
    };
    set({ courses: { ...get().courses, [cur.id]: updated } });
    scheduleSave(get);
  },

  addVoiceNote: async (blob, durationMs, coord, label) => {
    const cur = get().ensureCurrentCourse();
    const id = uid();
    const audioId = `audio_${id}`;
    await saveAudioBlob(audioId, blob);
    const note: VoiceNote = {
      id,
      audioId,
      ts: Date.now(),
      durationMs,
      mimeType: blob.type || 'audio/webm',
      lat: coord?.lat ?? null,
      lon: coord?.lon ?? null,
      ...(label ? { label } : {})
    };
    const updated: Course = {
      ...cur,
      voiceNotes: [...cur.voiceNotes, note]
    };
    set({ courses: { ...get().courses, [cur.id]: updated } });
    scheduleSave(get);
    return note;
  },

  removeVoiceNote: async (noteId) => {
    const s = get();
    const cur = s.currentCourseId ? s.courses[s.currentCourseId] : null;
    if (!cur) return;
    const note = cur.voiceNotes.find((n) => n.id === noteId);
    if (note) {
      await deleteAudioBlob(note.audioId);
    }
    const updated: Course = {
      ...cur,
      voiceNotes: cur.voiceNotes.filter((n) => n.id !== noteId)
    };
    set({ courses: { ...s.courses, [cur.id]: updated } });
    scheduleSave(get);
  },

  setCurrent: (vector) => {
    const cur = get().ensureCurrentCourse();
    set({
      courses: { ...get().courses, [cur.id]: { ...cur, current: vector } }
    });
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
    await clearAudio();
    set({ ...EMPTY, liveGps: null, drawerOpen: null });
  }
}));

/** Useful selector to get the current course or null. */
export function selectCurrentCourse(s: State): Course | null {
  if (!s.currentCourseId) return null;
  return s.courses[s.currentCourseId] ?? null;
}
