export function LtReferenceCap() {
  const verse = "Trust in the Lord with all thine heart; and lean not unto thine own understanding.";
  const reference = "Proverbs 3:5 (ASV)";

  function Bar({ refSize, bodySize, label, sub, broken }: { refSize: number; bodySize: number; label: string; sub: string; broken?: boolean }) {
    return (
      <div className="relative bg-black text-white" style={{ width: 920, height: 320, fontFamily: 'system-ui' }}>
        <div className="absolute inset-0 flex items-center justify-center text-zinc-700 text-sm">[ camera / program feed ]</div>
        <div
          className="absolute left-0 right-0 bottom-0 px-10 py-5 border-t border-white/10"
          style={{
            height: '38%',
            background: 'linear-gradient(180deg, rgba(8,12,20,0.78) 0%, rgba(8,12,20,0.94) 100%)',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden'
          }}
        >
          <div style={{ fontSize: bodySize, lineHeight: 1.2, fontWeight: 500, color: '#f4f4f5', whiteSpace: broken ? 'nowrap' : 'normal', overflow: 'hidden', textOverflow: broken ? 'clip' : 'ellipsis' }}>
            {broken ? "Trust in the Lord with all thine heart;" : verse}
          </div>
          <div style={{ fontSize: refSize, marginTop: 6, color: '#fbbf24', fontStyle: 'italic', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {broken ? "COMP OVE / ASV" : reference}
          </div>
        </div>
        <div className="absolute top-2 left-2 bg-amber-400/95 text-black text-[11px] font-bold px-2 py-1 rounded">{label}</div>
        <div className="absolute top-2 right-2 bg-zinc-900/85 text-white text-[10px] px-2 py-1 rounded">{sub}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-6" style={{ fontFamily: 'system-ui' }}>
      <div className="max-w-[1240px] mx-auto">
        <div className="mb-4">
          <div className="text-zinc-100 text-lg font-semibold">NDI LT Reference Garbling — Item 2</div>
          <div className="text-zinc-400 text-[12px] mt-1">
            Root cause: <code className="text-amber-300">route.ts L884</code> reference autofit
            <code className="text-amber-300"> rHi=2.0</code> while body autofit is capped at
            <code className="text-amber-300"> maxK=1.00</code> (hotfix.9). The reference grows up to 2× and
            collides with the body text on the same line → fragments like
            <span className="text-amber-300"> "COMP OVE / ASV"</span> from your screenshot.
            Fix: <code className="text-emerald-300">rHi=1.10</code> — reference grows only slightly,
            never overruns the body.
          </div>
        </div>

        <div className="flex flex-col gap-4 scale-[0.85] origin-top-left" style={{ width: 'fit-content' }}>
          <Bar refSize={36} bodySize={20} label="BEFORE" sub="reference 2.0× — eats the box" broken />
          <Bar refSize={18} bodySize={26} label="AFTER" sub="reference 1.10× — clean" />
        </div>

        <div className="mt-3 text-zinc-500 text-[11px] max-w-[900px]">
          The 1.10× cap matches operator's existing Text Size slider as the upper bound (same contract as
          hotfix.9 guard-rail A). Reference still shrinks when needed; it just won't auto-balloon.
        </div>
      </div>
    </div>
  );
}
