import { useSailingStore } from '../store/useSailingStore';

export function EmptyLive() {
  const setDrawer = useSailingStore((s) => s.setDrawer);
  const regattas = useSailingStore((s) => s.regattas);
  const courses = useSailingStore((s) => s.courses);
  const hasHistory =
    Object.keys(regattas).length > 0 || Object.keys(courses).length > 0;

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 gap-5 safe-top safe-bottom">
      <div className="text-7xl">⛵</div>
      <div className="text-2xl font-bold text-center">Курс не поставлен</div>
      <div className="text-base text-white/70 text-center max-w-md">
        Подъезжайте к знакам и удерживайте кнопки PIN, СУДЬЯ и ВЕРХ, или
        откройте старую гонку из истории, чтобы её посмотреть.
      </div>

      <button
        type="button"
        className="w-full max-w-md min-h-[72px] rounded-2xl bg-windwardBlue text-xl font-extrabold active:opacity-80"
        onClick={() => setDrawer('setup')}
      >
        Поставить курс
      </button>

      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        <button
          type="button"
          className="min-h-[56px] rounded-2xl bg-white/10 text-base font-bold disabled:opacity-50"
          onClick={() => setDrawer('history')}
          disabled={!hasHistory}
        >
          📚 История
        </button>
        <button
          type="button"
          className="min-h-[56px] rounded-2xl bg-white/10 text-base font-bold"
          onClick={() => setDrawer('settings')}
        >
          ⚙ Настройки
        </button>
      </div>

      {!hasHistory && (
        <div className="text-xs text-white/40 text-center max-w-md">
          История станет доступна, как только сохраните хотя бы одну гонку.
        </div>
      )}
    </div>
  );
}
