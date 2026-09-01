'use client'

export default function CastaliaShell({
  children,
  isHomePage: _isHomePage = false,
}: {
  children: React.ReactNode
  isHomePage?: boolean
}) {
  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-slate-700 bg-slate-950/95 text-slate-100 backdrop-blur-sm" aria-label="Primary">
        <div className="container-wide flex h-16 items-center justify-between gap-4">
          <a href="/" className="flex items-baseline gap-2 text-slate-100 hover:text-amber-300">
            <span className="text-lg font-semibold">Castalia Institute</span>
            <span className="text-sm text-slate-300">Salon</span>
          </a>
          <div className="flex items-center gap-3 text-sm">
            <a href="/diodati" className="text-slate-200 hover:text-amber-300">Villa Diodati</a>
            <a href="https://castalia.institute/membership" className="rounded-full bg-amber-500 px-4 py-2 font-semibold text-white hover:bg-amber-400 hover:text-white">Join</a>
            <a href="https://castalia.institute/support" className="rounded-full border border-amber-400/70 px-4 py-2 font-semibold text-amber-100 hover:bg-white/10 hover:text-white">Support</a>
          </div>
        </div>
      </nav>
      {children}
    </>
  )
}
