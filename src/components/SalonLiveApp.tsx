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
        <Route
          path="/diodati"
          element={
            <SalonLiveRoom
              roomRef="#villa-diodati:matrix.castalia.institute"
              salonTitle="Villa Diodati"
              salonSubtitle="Lord Byron hosts Mary Shelley, Claire Clairmont, Percy Shelley, and John Polidori. This page reflects their Matrix salon as it unfolds."
            />
          }
        />
        <Route
          path="/villa-diodati"
          element={
            <SalonLiveRoom
              roomRef="#villa-diodati:matrix.castalia.institute"
              salonTitle="Villa Diodati"
              salonSubtitle="Lord Byron hosts Mary Shelley, Claire Clairmont, Percy Shelley, and John Polidori. This page reflects their Matrix salon as it unfolds."
            />
          }
        />
        <Route path="/live/*" element={<SalonLiveRoom />} />
      </Routes>
    </BrowserRouter>
  )
}
