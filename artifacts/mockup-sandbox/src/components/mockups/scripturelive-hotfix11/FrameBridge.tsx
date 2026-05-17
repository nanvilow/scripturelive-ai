export function FrameBridge() {
  function Row({ label, cells, accent }: { label: string; cells: { t: string; kind: 'frame' | 'gap' | 'bridge' | 'flip' }[]; accent: string }) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-44 text-[12px] text-zinc-300 text-right pr-2 font-mono">{label}</div>
        <div className="flex gap-[3px]">
          {cells.map((c, i) => {
            const bg = c.kind === 'frame' ? accent
              : c.kind === 'gap' ? '#1f1f23'
              : c.kind === 'bridge' ? '#0891b2'
              : '#f59e0b';
            const fg = c.kind === 'gap' ? '#52525b' : '#000';
            const border = c.kind === 'gap' ? '1px dashed #3f3f46' : 'none';
            return (
              <div key={i} style={{
                width: 36, height: 30, background: bg, color: fg, border,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, fontFamily: 'ui-monospace'
              }}>{c.t}</div>
            );
          })}
        </div>
      </div>
    );
  }

  const fs = (n: number, kind: 'frame' | 'gap' | 'bridge' | 'flip' = 'frame') =>
    Array.from({ length: n }, () => ({ t: kind === 'frame' ? '▌' : kind === 'gap' ? '·' : kind === 'bridge' ? '▒' : '⚡', kind }));

  const before = [
    ...fs(6, 'frame'),
    ...fs(1, 'flip'),
    ...fs(8, 'gap'),
    ...fs(6, 'frame'),
  ];

  const after = [
    ...fs(6, 'frame'),
    ...fs(1, 'flip'),
    ...fs(8, 'bridge'),
    ...fs(6, 'frame'),
  ];

  return (
    <div className="min-h-screen bg-zinc-950 p-6" style={{ fontFamily: 'system-ui' }}>
      <div className="max-w-[1240px] mx-auto">
        <div className="mb-4">
          <div className="text-zinc-100 text-lg font-semibold">NDI Frame Bridge — Item 3</div>
          <div className="text-zinc-400 text-[12px] mt-1 max-w-[1100px]">
            Root cause: When you flip Full↔LT, Electron tears down the offscreen capture <code className="text-amber-300">BrowserWindow</code> and rebuilds it (~200–1000ms).
            The NDI sender stays alive (hotfix.9 GR-C) but no frames flow during that gap → Wirecast / vMix / OBS see "no signal"
            and drop the source. <span className="text-emerald-300">Fix:</span> cache <code className="text-emerald-300">lastFrame</code> in
            <code className="text-emerald-300"> ndi-service.ts</code>; during the rebuild window, pump it at the configured FPS so the
            receiver sees a frozen frame instead of silence.
          </div>
        </div>

        <div className="space-y-6 mt-6">
          <div>
            <div className="text-amber-300 text-[12px] font-bold mb-2 ml-44 pl-2">BEFORE — silent gap → Wirecast drops</div>
            <div className="space-y-2">
              <Row label="capture window" cells={before} accent="#10b981" />
              <Row label="NDI frames out  " cells={before} accent="#10b981" />
              <Row label="Wirecast status " cells={[
                ...fs(6).map(c => ({ ...c, t: '●' })),
                { t: '⚡', kind: 'flip' as const },
                ...fs(8).map(c => ({ ...c, t: '✕', kind: 'gap' as const })),
                ...fs(6).map(c => ({ ...c, t: '⟳' })),
              ]} accent="#10b981" />
            </div>
            <div className="ml-44 pl-2 text-[11px] text-zinc-500 mt-1">⚡ flip · · · gap (~200–1000ms) · · · ✕ DISCONNECTED · ⟳ operator must re-add source</div>
          </div>

          <div>
            <div className="text-emerald-300 text-[12px] font-bold mb-2 ml-44 pl-2">AFTER — frame bridge keeps signal alive</div>
            <div className="space-y-2">
              <Row label="capture window" cells={before} accent="#10b981" />
              <Row label="NDI frames out  " cells={after} accent="#10b981" />
              <Row label="Wirecast status " cells={[
                ...fs(6).map(c => ({ ...c, t: '●' })),
                { t: '⚡', kind: 'flip' as const },
                ...fs(8).map(c => ({ ...c, t: '◐', kind: 'bridge' as const })),
                ...fs(6).map(c => ({ ...c, t: '●' })),
              ]} accent="#10b981" />
            </div>
            <div className="ml-44 pl-2 text-[11px] text-zinc-500 mt-1">⚡ flip · ▒ bridge frames (last cached) · ● live again — source stays bound</div>
          </div>
        </div>

        <div className="mt-8 p-4 bg-zinc-900/60 border border-zinc-800 rounded text-[12px] text-zinc-300 max-w-[1100px]">
          <div className="font-semibold text-zinc-100 mb-2">Implementation scope (~20 lines)</div>
          <div className="space-y-1 font-mono text-[11px] text-zinc-400">
            <div><span className="text-cyan-300">ndi-service.ts</span> — cache <span className="text-emerald-300">lastFrame: Buffer</span> on every send; expose <span className="text-emerald-300">startBridge(fps)</span> / <span className="text-emerald-300">stopBridge()</span>.</div>
            <div><span className="text-cyan-300">main.ts L2302</span> — before destroying capture window, call <span className="text-emerald-300">ndi.startBridge(fps)</span>; after new window's first frame lands, <span className="text-emerald-300">stopBridge()</span>.</div>
            <div><span className="text-cyan-300">No renderer changes</span> — purely native bridge.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
