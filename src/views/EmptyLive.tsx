import { useSailingStore } from '../store/useSailingStore';

export function EmptyLive() {
  const setDrawer = useSailingStore((s) => s.setDrawer);
  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 gap-6 safe-top safe-bottom">
      <div className="text-8xl">⛵</div>
      <div className="text-3xl font-bold text-center">Курс не поставлен</div>
      <div className="text-lg text-white/70 text-center max-w-md">
        Подъезжайте к знакам и удерживайте кнопки PIN, СУДЬЯ и ВЕРХ. Затем укажите
        направление ветра, направив нос катера в ветер.
      </div>
      <button
        type="button"
        className="w-full max-w-md min-h-[88px] rounded-2xl bg-windwardBlue text-2xl font-extrabold active:opacity-80"
        onClick={() => setDrawer('setup')}
      >
        Поставить курс
      </button>
    </div>
  );
}
