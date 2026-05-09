import { useSailingStore, type Course } from '../store/useSailingStore';

export function EmptyLive() {
  const setDrawer = useSailingStore((s) => s.setDrawer);
  const openCourse = useSailingStore((s) => s.openCourse);
  const regattas = useSailingStore((s) => s.regattas);
  const courses = useSailingStore((s) => s.courses);

  // Last 3 races across all regattas, newest first.
  const recentCourses = Object.values(courses)
    .filter((c) => !!c.pin || !!c.committee || !!c.windward || c.windHistory.length > 0)
    .sort((a, b) => latestActivity(b) - latestActivity(a))
    .slice(0, 3);

  const totalVoiceNotes = Object.values(courses).reduce(
    (n, c) => n + (c.voiceNotes?.length ?? 0),
    0
  );
  const hasAnyCurrent = Object.values(courses).some((c) => !!c.current);

  return (
    <div className="h-full flex flex-col safe-top safe-bottom overflow-y-auto">
      <div className="flex-1 flex flex-col items-center px-4 py-6 gap-5 max-w-md w-full mx-auto">
        <div className="text-6xl mt-2">⛵</div>
        <div className="text-2xl font-bold text-center">Sailing</div>
        <div className="text-sm text-white/60 text-center -mt-2">
          Тренер парусного спорта
        </div>

        <button
          type="button"
          className="w-full min-h-[88px] rounded-2xl bg-windwardBlue text-2xl font-extrabold active:opacity-80"
          onClick={() => setDrawer('setup')}
        >
          Поставить курс
        </button>

        <div className="grid grid-cols-2 gap-3 w-full">
          <BigButton icon="📚" label="История" onClick={() => setDrawer('history')} />
          <BigButton icon="⚙" label="Настройки" onClick={() => setDrawer('settings')} />
          <BigButton
            icon="🎤"
            label={`Голосовые${totalVoiceNotes > 0 ? ` (${totalVoiceNotes})` : ''}`}
            onClick={() => setDrawer('voice')}
          />
          <BigButton
            icon="⛵"
            label={hasAnyCurrent ? 'Течение ✓' : 'Замер течения'}
            onClick={() => setDrawer('drift')}
          />
        </div>

        {recentCourses.length > 0 && (
          <div className="w-full mt-2">
            <div className="text-xs uppercase tracking-wider text-white/50 mb-2">
              Последние гонки
            </div>
            <div className="space-y-2">
              {recentCourses.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openCourse(c.id)}
                  className="w-full flex items-center justify-between gap-2 p-3 rounded-2xl bg-white/5 active:bg-white/10 text-left"
                >
                  <span className="flex-1 truncate">
                    <span className="font-bold">{c.name}</span>
                    <span className="block text-xs text-white/50">
                      {new Date(latestActivity(c)).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </span>
                  <span className="text-xs text-white/60 shrink-0 text-right">
                    {c.pin && c.committee ? '✓ линия' : ''}
                    {c.windward ? ' 🔺' : ''}
                    {c.windDirection !== null
                      ? ` ${Math.round(c.windDirection)}°`
                      : ''}
                    {c.voiceNotes && c.voiceNotes.length > 0
                      ? ` 🎤${c.voiceNotes.length}`
                      : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {recentCourses.length === 0 && Object.keys(regattas).length === 0 && (
          <div className="text-xs text-white/40 text-center mt-2">
            Чтобы начать — поставьте курс или нажмите одну из кнопок выше.
          </div>
        )}
      </div>
    </div>
  );
}

function BigButton({
  icon,
  label,
  onClick
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[80px] rounded-2xl bg-white/10 active:bg-white/20 flex flex-col items-center justify-center gap-1"
    >
      <div className="text-2xl">{icon}</div>
      <div className="text-sm font-bold">{label}</div>
    </button>
  );
}

function latestActivity(c: Course): number {
  let t = 0;
  if (c.pin?.ts) t = Math.max(t, c.pin.ts);
  if (c.committee?.ts) t = Math.max(t, c.committee.ts);
  if (c.windward?.ts) t = Math.max(t, c.windward.ts);
  if (c.windSetAt) t = Math.max(t, c.windSetAt);
  for (const v of c.voiceNotes ?? []) t = Math.max(t, v.ts);
  if (c.current?.measuredAt) t = Math.max(t, c.current.measuredAt);
  return t;
}
