import { useSailingStore } from '../store/useSailingStore';

export function HistoryDrawer() {
  const drawer = useSailingStore((s) => s.drawerOpen);
  const setDrawer = useSailingStore((s) => s.setDrawer);
  const regattas = useSailingStore((s) => s.regattas);
  const courses = useSailingStore((s) => s.courses);
  const currentCourseId = useSailingStore((s) => s.currentCourseId);
  const currentRegattaId = useSailingStore((s) => s.currentRegattaId);
  const setNotes = useSailingStore((s) => s.setNotes);
  const openCourse = useSailingStore((s) => s.openCourse);
  const closeCurrentCourse = useSailingStore((s) => s.closeCurrentCourse);

  if (drawer !== 'history') return null;

  const regattaList = Object.values(regattas).sort((a, b) => b.date - a.date);
  const currentCourse = currentCourseId ? courses[currentCourseId] : null;

  return (
    <div className="fixed inset-0 drawer-overlay bg-black/40 flex justify-end" onClick={() => setDrawer(null)}>
      <div
        className="w-full sm:w-96 h-full bg-navyDeep flex flex-col safe-top safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-2 shrink-0">
          <h2 className="text-2xl font-bold">История</h2>
          <button className="min-w-[48px] min-h-[48px] text-2xl" onClick={() => setDrawer(null)}>
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 pb-3 min-h-0">
          {currentCourse && (
            <div className="mb-4 p-3 bg-navy rounded-2xl">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-white/60">
                  Заметки: <b className="text-white/90">{currentCourse.name}</b>
                </div>
                <button
                  type="button"
                  onClick={() => closeCurrentCourse()}
                  className="text-xs text-white/60 underline"
                  title="Освободить экран от текущей гонки"
                >
                  закрыть
                </button>
              </div>
              <textarea
                value={currentCourse.notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full mt-2 bg-navyDeep border border-white/10 rounded-xl p-2 text-base"
                placeholder="Спортсмены, погода, выводы..."
              />
            </div>
          )}

          <div className="space-y-3">
            {regattaList.length === 0 && (
              <div className="text-white/60 text-center py-6">Пока нет регат</div>
            )}
            {regattaList.map((r) => (
              <div
                key={r.id}
                className={`p-3 rounded-2xl ${
                  r.id === currentRegattaId
                    ? 'bg-windwardBlue/20 border border-windwardBlue/50'
                    : 'bg-navy'
                }`}
              >
                <div className="font-bold text-lg">{r.name}</div>
                <div className="text-sm text-white/60">
                  {new Date(r.date).toLocaleDateString('ru-RU')}
                </div>
                <div className="mt-2 space-y-1">
                  {r.courseIds.length === 0 && (
                    <div className="text-sm text-white/50 italic">нет гонок</div>
                  )}
                  {r.courseIds.map((cid) => {
                    const c = courses[cid];
                    if (!c) return null;
                    const active = cid === currentCourseId;
                    return (
                      <button
                        key={cid}
                        type="button"
                        onClick={() => openCourse(cid)}
                        className={`w-full text-left text-base flex items-center justify-between gap-2 p-3 rounded-xl active:opacity-80 ${
                          active
                            ? 'bg-windwardBlue/30 border border-windwardBlue/50'
                            : 'bg-navyDeep'
                        }`}
                      >
                        <span className="flex-1 truncate">
                          {c.name}
                          {active ? (
                            <span className="text-xs text-windwardBlue ml-2">
                              (открыта)
                            </span>
                          ) : null}
                        </span>
                        <span className="text-sm text-white/60 shrink-0">
                          {c.pin && c.committee ? '✓ ' : ''}
                          {c.windward ? '🔺 ' : ''}
                          {c.windDirection !== null ? `${Math.round(c.windDirection)}°` : ''}
                          {c.voiceNotes && c.voiceNotes.length > 0
                            ? ` 🎤${c.voiceNotes.length}`
                            : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
