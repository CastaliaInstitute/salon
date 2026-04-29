'use client'

import { CastaliaSatelliteShell } from '@castalia/platform'

export default function CastaliaShell({
  children,
  isHomePage = false,
}: {
  children: React.ReactNode
  isHomePage?: boolean
}) {
  return (
    <CastaliaSatelliteShell siteId="salon" propertyTitle="Salon" isHomePage={isHomePage}>
      {children}
    </CastaliaSatelliteShell>
  )
}
