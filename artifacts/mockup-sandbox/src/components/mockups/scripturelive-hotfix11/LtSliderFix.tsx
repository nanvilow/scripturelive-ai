export function LtSliderFix() {
  const verse = "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.";
  const reference = "John 3:16 (KJV)";

  function Bar({ hPct, label, sub, broken }: { hPct: number; label: string; sub: string; broken?: boolean }) {
    return (
      <div className="relative bg-black text-white" style={{ width: 760, height: 428, fontFamily: 'system-ui' }}>
        <div className="absolute inset-0 flex items-center justify-center text-zinc-700 text-sm">[ camera / program feed ]</div>
        <div
          className="absolute left-0 right-0 bottom-0 px-8 py-4 border-t border-white/10"
          style={{
            height: `${hPct}%`,
            background: 'linear-gradient(180deg, rgba(8,12,20,0.78) 0%, rgba(8,12,20,0.92) 100%)',
            display: 'flex', flexDirection: 'column', justifyContent: 'center'
          }}
        >
          <div style={{ fontSize: broken ? 14 : 17, lineHeight: 1.25, fontWeight: 500, color: '#f4f4f5' }}>{verse}</div>
          <div style={{ fontSize: broken ? 13 : 13, marginTop: 6, color: '#cbd5e1', fontStyle: 'italic' }}>{reference}</div>
        </div>
        <div className="absolute top-2 left-2 bg-amber-400/95 text-black text-[11px] font-bold px-2 py-1 rounded">{label}</div>
        <div className="absolute top-2 right-2 bg-zinc-900/85 text-white text-[10px] px-2 py-1 rounded">{sub}</div>
      </div>
    );
  }

  function Col({ title, scale, before, after }: { title: string; scale: string; before: number; after: number }) {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-zinc-100 text-[13px] font-semibold tracking-wide">{title}</div>
        <div className="text-zinc-500 text-[11px] -mt-2">LT Height slider = {scale}</div>
        <div className="flex flex-col gap-2">
          <Bar hPct={before} label="BEFORE" sub={`${before}% bar (ignores slider)`} broken />
          <Bar hPct={after} label="AFTER" sub={`${after}% bar (slider works)`} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-6" style={{ fontFamily: 'system-ui' }}>
      <div className="max-w-[1240px] mx-auto">
        <div className="mb-4">
          <div className="text-zinc-100 text-lg font-semibold">NDI Lower-Third Height Slider — Item 1</div>
          <div className="text-zinc-400 text-[12px] mt-1">
            Root cause: <code className="text-amber-300">route.ts L1625</code> sets
            <code className="text-amber-300"> var hPctScaled = hPct</code> — the slider value is read but never multiplied.
            Fix: <code className="text-emerald-300">hPctScaled = Math.min(85, hPct * ndiLtScale)</code>.
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 scale-[0.78] origin-top-left" style={{ width: 'fit-content' }}>
          <Col title="Slider at 1.00×" scale="1.00× (default)" before={28} after={28} />
          <Col title="Slider at 1.50×" scale="1.50×" before={28} after={42} />
          <Col title="Slider at 2.00×" scale="2.00× (max)" before={28} after={56} />
        </div>

        <div className="mt-3 text-zinc-500 text-[11px] max-w-[900px]">
          Hard cap at 85% prevents the LT bar from eating the whole frame. Above 1.00× the bar grows downward → upward; verse text stays anchored to vertical center of bar (autofit maxK=1.00 unchanged from hotfix.9).
        </div>
      </div>
    </div>
  );
}
