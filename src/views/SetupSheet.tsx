import { useState } from 'react';
import { useSailingStore, selectCurrentCourse } from '../store/useSailingStore';
import { PingButton } from './PingButton';
import * as orientation from '../services/orientation';

export function SetupSheet() {
  const drawer = useSailingStore((s) => s.drawerOpen);
  const setDrawer = useSailingStore((s) => s.setDrawer);
  const course = useSailingStore(selectCurrentCourse);
  const pingMark = useSailingStore((s) => s.pingMark);
  const setWind = useSailingStore((s) => s.setWind);
  const settings = useSailingStore((s) => s.settings);
  const liveGps = useSailingStore((s) => s.liveGps);
  const newRace = useSailingStore((s) => s.newRace);
  const setCourseName = useSailingStore((s) => s.setCourseName);
  const [windAdjust, setWindAdjust] = useState(0);
  const [headingNow, setHeadingNow] = useState<number | null>(null);
  const [permState, setPermState] = useState<string | null>(null);

  if (drawer !== 'setup') return null;

  async function onSetWind() {
    const r = await orientation.requestPermission();
    setPermState(r);
    if (r !== 'granted') return;
    const off = orientation.subscribe((h) => {
      setHeadingNow(h);
      const corrected = (h + windAdjust + 360) % 360;
      setWind(corrected, 'heading');
      off();
    });
  }

  function onManualWind(direction: number) {
    setWind((direction + 360) % 360, 'manual');
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setDrawer(null)}>
      <div
        className="w-full sm:max-w-2xl bg-navyDeep rounded-t-3xl sm:rounded-3xl p-4 max-h-[92vh] overflow-y-auto safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Постановка курса</h2>
          <button className="min-w-[64px] min-h-[64px] text-3xl" onClick={() => setDrawer(null)}>
            ✕
          </button>
        </div>

        <input
          type="text"
          value={course?.name ?? ''}
          onChange={(e) => setCourseName(e.target.value)}
          placeholder="Название гонки"
          className="w-full bg-navy border border-white/10 rounded-xl p-3 mb-4 text-lg"
        />

        <div className="grid grid-cols-1 gap-3">
          <PingButton
            label="PIN"
            emoji="📍"
            color="bg-pinRed"
            holdMs={settings.holdMs}
            pingedAt={course?.pin?.ts ?? null}
            accuracyHint={liveGps?.accuracy ?? null}
            onPing={(coord, accuracy) => pingMark('pin', coord, accuracy)}
          />
          <PingButton
            label="СУДЬЯ"
            emoji="🚩"
            color="bg-committeeGreen"
            holdMs={settings.holdMs}
            pingedAt={course?.committee?.ts ?? null}
            accuracyHint={liveGps?.accuracy ?? null}
            onPing={(coord, accuracy) => pingMark('committee', coord, accuracy)}
          />
          <PingButton
            label="ВЕРХ"
            emoji="🔺"
            color="bg-windwardBlue"
            holdMs={settings.holdMs}
            pingedAt={course?.windward?.ts ?? null}
            accuracyHint={liveGps?.accuracy ?? null}
            onPing={(coord, accuracy) => pingMark('windward', coord, accuracy)}
          />
        </div>

        <div className="mt-6 p-3 bg-navy rounded-2xl">
          <div className="text-lg font-semibold mb-2">Ветер</div>
          <button
            className="w-full min-h-[72px] rounded-2xl bg-windYellow text-navy text-xl font-bold active:opacity-80 mb-2"
            onClick={onSetWind}
          >
            Указать ветер: направить нос в ветер и нажать
          </button>
          {permState === 'denied' && (
            <div className="text-pinRed text-sm mb-2">
              Доступ к компасу запрещён. Включите его в Настройках Safari или
              введите направление вручную.
            </div>
          )}
          {permState === 'unsupported' && (
            <div className="text-yellow-400 text-sm mb-2">
              Этот браузер не поддерживает компас. Введите направление вручную.
            </div>
          )}
          {headingNow !== null && (
            <div className="text-sm text-white/70">
              Зафиксировано: {Math.round(headingNow)}°
            </div>
          )}
          <div className="flex items-center gap-3 mt-3">
            <label className="text-sm text-white/70 w-24">Коррекция</label>
            <input
              type="range"
              min={-20}
              max={20}
              step={1}
              value={windAdjust}
              onChange={(e) => setWindAdjust(parseInt(e.target.value, 10))}
              className="flex-1"
            />
            <span className="w-12 text-right tabular-nums">{windAdjust}°</span>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <label className="text-sm text-white/70 w-24">Вручную</label>
            <input
              type="number"
              min={0}
              max={359}
              defaultValue={course?.windDirection ?? 0}
              onBlur={(e) => onManualWind(parseInt(e.target.value, 10) || 0)}
              className="flex-1 bg-navyDeep border border-white/10 rounded-xl p-2 text-lg"
            />
            <span className="w-12 text-right">°TWD</span>
          </div>
          {course?.windDirection !== null && course?.windDirection !== undefined ? (
            <div className="mt-2 text-lg">
              Текущий ветер: <b>{Math.round(course.windDirection)}°</b>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            className="min-h-[72px] rounded-2xl bg-white/10 text-xl font-bold"
            onClick={() => {
              newRace();
            }}
          >
            + Новая гонка
          </button>
          <button
            className="min-h-[72px] rounded-2xl bg-windwardBlue text-xl font-bold"
            onClick={() => setDrawer(null)}
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
