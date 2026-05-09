import { useSailingStore } from '../store/useSailingStore';

export function SettingsView() {
  const drawer = useSailingStore((s) => s.drawerOpen);
  const setDrawer = useSailingStore((s) => s.setDrawer);
  const settings = useSailingStore((s) => s.settings);
  const setSettings = useSailingStore((s) => s.setSettings);
  const resetAll = useSailingStore((s) => s.resetAll);

  if (drawer !== 'settings') return null;

  return (
    <div className="fixed inset-0 drawer-overlay bg-black/40" onClick={() => setDrawer(null)}>
      <div
        className="absolute left-0 top-0 bottom-0 w-full sm:w-96 bg-navyDeep p-4 overflow-y-auto safe-top safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-bold">Настройки</h2>
          <button className="min-w-[64px] min-h-[64px] text-3xl" onClick={() => setDrawer(null)}>
            ✕
          </button>
        </div>

        <Section title="Курс">
          <Row label="Heading">
            <select
              className="bg-navy border border-white/10 rounded-xl p-2 text-lg"
              value={settings.headingMode}
              onChange={(e) => setSettings({ headingMode: e.target.value as 'true' | 'magnetic' })}
            >
              <option value="true">Истинный (рекомендуется)</option>
              <option value="magnetic">Магнитный</option>
            </select>
          </Row>
          <Row label="GPS hold">
            <select
              className="bg-navy border border-white/10 rounded-xl p-2 text-lg"
              value={settings.holdMs}
              onChange={(e) => setSettings({ holdMs: parseInt(e.target.value, 10) as 1500 | 2500 | 4000 })}
            >
              <option value={1500}>1.5 с</option>
              <option value={2500}>2.5 с</option>
              <option value={4000}>4 с</option>
            </select>
          </Row>
          <Row label="Lay-line угол (°)">
            <input
              type="number"
              min={38}
              max={55}
              step={1}
              value={settings.layLineDeg}
              onChange={(e) =>
                setSettings({
                  layLineDeg: Math.min(55, Math.max(38, parseInt(e.target.value, 10) || 46))
                })
              }
              className="bg-navy border border-white/10 rounded-xl p-2 text-lg w-[4.25rem]"
            />
          </Row>
          <div className="text-xs text-white/50 px-1 -mt-2 mb-2">
            На карте и схеме. По умолчанию 46° (типичный угол галса к истинному ветру).
          </div>
          <Row label="Компас ветра +180°">
            <input
              type="checkbox"
              className="w-7 h-7"
              checked={settings.windCompassFlip180}
              onChange={(e) => setSettings({ windCompassFlip180: e.target.checked })}
            />
          </Row>
          <div className="text-xs text-white/50 px-1 -mt-2 mb-1">
            Включите, если ветер с компаса «перевёрнут». Иначе оставьте выкл.
          </div>
        </Section>

        <Section title="Постановка точек">
          <div className="bg-navy rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-base">Смещение по носу</div>
              <div className="tabular-nums text-windYellow font-bold w-16 text-right">
                {settings.pingAtDistanceMeters > 0 ? '+' : ''}
                {settings.pingAtDistanceMeters}м
              </div>
            </div>
            <input
              type="range"
              min={-30}
              max={30}
              step={1}
              value={settings.pingAtDistanceMeters}
              onChange={(e) =>
                setSettings({
                  pingAtDistanceMeters: parseInt(e.target.value, 10) || 0
                })
              }
              className="w-full"
            />
            <div className="text-xs text-white/60 mt-2 leading-snug">
              Когда ты ставишь PIN/СУДЬЯ/ВЕРХ, программа берёт твоё GPS и
              сместит точку на это расстояние ВПЕРЁД по направлению, куда
              смотрит нос катера. Удобно, чтобы не подходить вплотную к
              бую и не мешать гонщикам. Поставь 0, чтобы ставить ровно по
              своей позиции.
            </div>
          </div>
        </Section>

        <Section title="Ветер из интернета">
          <Row label="Авто-обновление">
            <select
              className="bg-navy border border-white/10 rounded-xl p-2 text-lg"
              value={settings.autoWindMinutes}
              onChange={(e) =>
                setSettings({
                  autoWindMinutes: parseInt(e.target.value, 10) as 0 | 5 | 10 | 15 | 30
                })
              }
            >
              <option value={0}>Выключено</option>
              <option value={5}>Каждые 5 мин</option>
              <option value={10}>Каждые 10 мин</option>
              <option value={15}>Каждые 15 мин</option>
              <option value={30}>Каждые 30 мин</option>
            </select>
          </Row>
          <div className="text-xs text-white/50 px-1">
            Источник — Open-Meteo (бесплатно, без ключа). Каждое обновление
            пишется в график сдвигов как «авто».
          </div>
        </Section>

        <Section title="Звук">
          <Row label="Сигналы таймера">
            <input
              type="checkbox"
              className="w-7 h-7"
              checked={settings.sound}
              onChange={(e) => setSettings({ sound: e.target.checked })}
            />
          </Row>
        </Section>

        <Section title="Данные">
          <button
            className="w-full min-h-[72px] rounded-2xl bg-pinRed text-xl font-bold"
            onClick={async () => {
              if (confirm('Удалить все регаты, гонки и настройки?')) {
                await resetAll();
                setDrawer(null);
              }
            }}
          >
            Сбросить все данные
          </button>
        </Section>

        <div className="text-sm text-white/50 mt-6">
          Sailing v1 · PWA для тренера парусного спорта.
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-sm uppercase tracking-wider text-white/50 mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-navy rounded-xl p-3">
      <div className="text-lg">{label}</div>
      <div>{children}</div>
    </div>
  );
}
