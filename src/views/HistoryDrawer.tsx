import { useSailingStore } from '../store/useSailingStore';

export function HistoryDrawer() {
  const drawer = useSailingStore((s) => s.drawerOpen);
  const setDrawer = useSailingStore((s) => s.setDrawer);
  const regattas = useSailingStore((s) => s.regattas);
  const courses = useSailingStore((s) => s.courses);
  const currentCourseId = useSailingStore((s) => s.currentCourseId);
  const currentRegattaId = useSailingStore((s) => s.currentRegattaId);
  const setNotes = useSailingStore((s) => s.setNotes);

  if (drawer !== 'history') return null;

  const regattaList = Object.values(regattas).sort((a, b) => b.date - a.date);
  const currentCourse = currentCourseId ? courses[currentCourseId] : null;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex justify-end" onClick={() => setDrawer(null)}>
      <div
        className="w-full sm:w-96 h-full bg-navyDeep p-4 overflow-y-auto safe-top safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-bold">История</h2>
          <button className="min-w-[64px] min-h-[64px] text-3xl" onClick={() => setDrawer(null)}>
            ✕
          </button>
        </div>

        {currentCourse && (
          <div className="mb-4 p-3 bg-navy rounded-2xl">
            <div className="text-sm text-white/60">Заметки текущей гонки</div>
            <textarea
              value={currentCourse.notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full mt-2 bg-navyDeep border border-white/10 rounded-xl p-2 text-base"
              placeholder="Спортсмены, погода, выводы..."
            />
          </div>
        )}

        <div className="space-y-3">
          {regattaList.length === 0 && <div className="text-white/60">Пока нет регат</div>}
          {regattaList.map((r) => (
            <div key={r.id} className={`p-3 rounded-2xl ${r.id === currentRegattaId ? 'bg-windwardBlue/20 border border-windwardBlue/50' : 'bg-navy'}`}>
              <div className="font-bold text-lg">{r.name}</div>
              <div className="text-sm text-white/60">{new Date(r.date).toLocaleDateString('ru-RU')}</div>
              <div className="mt-2 space-y-1">
                {r.courseIds.map((cid) => {
                  const c = courses[cid];
                  if (!c) return null;
                  return (
                    <div
                      key={cid}
                      className={`text-base flex items-center justify-between p-2 rounded-xl ${cid === currentCourseId ? 'bg-windwardBlue/30' : 'bg-navyDeep'}`}
                    >
                      <span>{c.name}</span>
                      <span className="text-sm text-white/60">
                        {c.pin && c.committee ? '✓ линия' : ''}
                        {c.windward ? ' ✓ верх' : ''}
                        {c.windDirection !== null ? ` ${Math.round(c.windDirection)}°` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
