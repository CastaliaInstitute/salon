'use client'

import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { SalonLiveRoom } from './SalonLiveRoom'

/**
 * Client-side routes under /live/* — paired with dist/404.html on GitHub Pages
 * so deep links load this bundle.
 */
export default function SalonLiveApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/live/*" element={<SalonLiveRoom />} />
      </Routes>
    </BrowserRouter>
  )
}
