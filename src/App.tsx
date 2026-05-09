import { useEffect } from 'react';
import { selectCurrentCourse, useSailingStore } from './store/useSailingStore';
import * as geolocation from './services/geolocation';
import { Onboarding } from './views/Onboarding';
import { EmptyLive } from './views/EmptyLive';
import { LiveDashboard } from './views/LiveDashboard';
import { SetupSheet } from './views/SetupSheet';
import { HistoryDrawer } from './views/HistoryDrawer';
import { SettingsView } from './views/SettingsView';
import { WindChart } from './views/WindChart';
import { TimerFullscreen } from './views/TimerView';

export function App() {
  const hasOnboarded = useSailingStore((s) => s.hasOnboarded);
  const hydrate = useSailingStore((s) => s.hydrate);
  const updateLiveGps = useSailingStore((s) => s.updateLiveGps);
  const course = useSailingStore(selectCurrentCourse);

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

  if (!hasOnboarded) {
    return <Onboarding />;
  }

  const hasAnyMark = !!course?.pin || !!course?.committee || !!course?.windward;

  return (
    <div className="h-screen w-screen overflow-hidden">
      {hasAnyMark ? <LiveDashboard /> : <EmptyLive />}
      <SetupSheet />
      <HistoryDrawer />
      <SettingsView />
      <WindChart />
      <TimerFullscreen />
    </div>
  );
}
