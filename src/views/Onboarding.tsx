import { useState } from 'react';
import { requestPermission, start as startGps } from '../services/geolocation';
import { useSailingStore } from '../store/useSailingStore';

export function Onboarding() {
  const setOnboarded = useSailingStore((s) => s.setOnboarded);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  async function onAllow() {
    setBusy(true);
    const r = await requestPermission();
    if (r === 'granted') {
      startGps();
      setOnboarded(true);
    } else if (r === 'denied') {
      setDenied(true);
    } else {
      setOnboarded(true);
    }
    setBusy(false);
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 safe-top safe-bottom gap-6 text-center">
      <div className="text-7xl">⛵</div>
      <h1 className="text-5xl font-extrabold tracking-tight">Старт</h1>
      <p className="text-xl text-white/80 max-w-md">
        Программа использует GPS, чтобы запоминать положение знаков стартовой
        линии и верхнего буя. Без доступа к геолокации основные функции работать
        не будут.
      </p>
      {denied && (
        <p className="text-pinRed">
          Доступ запрещён. Откройте Настройки → Safari → Геолокация и разрешите
          для этого сайта, затем перезапустите.
        </p>
      )}
      <button
        type="button"
        className="min-h-[88px] min-w-[200px] px-8 rounded-2xl bg-windwardBlue text-2xl font-bold disabled:opacity-50"
        onClick={onAllow}
        disabled={busy}
      >
        {busy ? '...' : 'Разрешить'}
      </button>
      <button
        type="button"
        className="text-white/70 underline text-base"
        onClick={() => setOnboarded(true)}
      >
        Пропустить
      </button>
      <div className="text-sm text-white/50 max-w-md">
        Зачем: тренер на катере подъезжает к знаку и удерживает кнопку — приложение
        фиксирует координату со средним значением GPS, чтобы мгновенно видеть, какой
        конец линии выгоднее и куда смещён верхний буй.
      </div>
    </div>
  );
}
