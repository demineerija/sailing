import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useSailingStore, selectCurrentCourse } from '../store/useSailingStore';

export function WindChart() {
  const drawer = useSailingStore((s) => s.drawerOpen);
  const setDrawer = useSailingStore((s) => s.setDrawer);
  const course = useSailingStore(selectCurrentCourse);

  const data = useMemo(() => {
    if (!course) return [];
    return course.windHistory.map((r) => ({
      t: r.ts,
      label: new Date(r.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      twd: Math.round(r.direction)
    }));
  }, [course]);

  const median = useMemo(() => {
    if (data.length === 0) return null;
    const arr = [...data].sort((a, b) => a.twd - b.twd);
    return arr[Math.floor(arr.length / 2)].twd;
  }, [data]);

  if (drawer !== 'wind') return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end" onClick={() => setDrawer(null)}>
      <div
        className="w-full bg-navyDeep rounded-t-3xl p-4 max-h-[80vh] safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-bold">Сдвиги ветра</h2>
          <button className="min-w-[64px] min-h-[64px] text-3xl" onClick={() => setDrawer(null)}>
            ✕
          </button>
        </div>
        {data.length < 2 ? (
          <div className="text-white/60 p-4">
            Нужно как минимум 2 замера. Указывайте ветер чаще через кнопку «Указать ветер».
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid stroke="#FFFFFF22" />
                <XAxis dataKey="label" stroke="#9DB2C9" fontSize={12} />
                <YAxis stroke="#9DB2C9" domain={[0, 360]} ticks={[0, 90, 180, 270, 360]} fontSize={12} />
                {median !== null && (
                  <ReferenceLine y={median} stroke="#FBBF24" strokeDasharray="4 4" label={{ value: `медиана ${median}°`, fill: '#FBBF24', fontSize: 12 }} />
                )}
                <Tooltip contentStyle={{ background: '#06101C', border: '1px solid #fff2' }} />
                <Line type="monotone" dataKey="twd" stroke="#FBBF24" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
