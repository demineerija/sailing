import { useEffect, useRef } from 'react';
import { selectCurrentCourse, useSailingStore } from './store/useSailingStore';
import * as geolocation from './services/geolocation';
import { startAutoWind, type AutoWindHandle } from './services/windAuto';
import { Onboarding } from './views/Onboarding';
import { EmptyLive } from './views/EmptyLive';
import { LiveDashboard } from './views/LiveDashboard';
import { SetupSheet } from './views/SetupSheet';
import { HistoryDrawer } from './views/HistoryDrawer';
import { SettingsView } from './views/SettingsView';
import { WindChart } from './views/WindChart';
import { TimerFullscreen } from './views/TimerView';
import { VoiceNotesDrawer } from './views/VoiceNotesDrawer';
import { DriftDrawer } from './views/DriftDrawer';
import { WindDrawer } from './views/WindDrawer';

export function App() {
  const hasOnboarded = useSailingStore((s) => s.hasOnboarded);
  const hydrate = useSailingStore((s) => s.hydrate);
  const updateLiveGps = useSailingStore((s) => s.updateLiveGps);
  const course = useSailingStore(selectCurrentCourse);
  const autoWindMin = useSailingStore((s) => s.settings.autoWindMinutes);
  const setWind = useSailingStore((s) => s.setWind);

  const autoWindRef = useRef<AutoWindHandle | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hasOnboarded) return;
    geolocation.start();
    const off = geolocation.subscribe((g) => updateLiveGps(g));
    return () => {
      off();
      geolocation.stop();
    };
  }, [hasOnboarded, updateLiveGps]);

  useEffect(() => {
    if (!hasOnboarded) return;
    if (autoWindRef.current) {
      autoWindRef.current.stop();
      autoWindRef.current = null;
    }
    if (autoWindMin > 0) {
      autoWindRef.current = startAutoWind({
        getCoord: () => {
          const s = useSailingStore.getState();
          const live = s.liveGps?.coord ?? null;
          if (live) return live;
          const c = s.currentCourseId ? s.courses[s.currentCourseId] : null;
          return c?.pin ?? c?.committee ?? c?.windward ?? null;
        },
        getIntervalMinutes: () => useSailingStore.getState().settings.autoWindMinutes,
        setWind: (direction, source, speedMps) => setWind(direction, source, speedMps)
      });
    }
    return () => {
      if (autoWindRef.current) {
        autoWindRef.current.stop();
        autoWindRef.current = null;
      }
    };
  }, [hasOnboarded, autoWindMin, setWind]);

  if (!hasOnboarded) {
    return <Onboarding />;
  }

  const hasAnyMark = !!course?.pin || !!course?.committee || !!course?.windward;

  return (
    <div className="app-root w-screen overflow-hidden">
      {hasAnyMark ? <LiveDashboard /> : <EmptyLive />}
      <SetupSheet />
      <HistoryDrawer />
      <SettingsView />
      <WindChart />
      <TimerFullscreen />
      <VoiceNotesDrawer />
      <DriftDrawer />
      <WindDrawer />
    </div>
  );
}
