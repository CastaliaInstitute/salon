# Villa Diodati — saloon prototype

`saloon.glb` is a self-contained glTF 2.0 prototype for a ThirdRoom world and
an interactive browser preview. It is designed as a small conversation space,
not as a measured architectural reconstruction.

## Scene

- Blue-grey panelled salon, oak boards, hearth, portrait frames, writing desk,
  reading matter, candles and a storm-dark lake outlook.
- A covered three-sided gallery with Tuscan-style columns follows the public
  heritage description of the villa.
- Five articulated marble statues stage the circle in the composition of the
  supplied reference still from the 2017 film *Mary Shelley*: Byron standing
  at the hearth; Mary and Claire seated together; Percy and Polidori opposite
  them. Visible spherical pivots make the figures read as articulated statues.
- Open the interactive browser view at `/worlds/villa-diodati/`. Drag to orbit
  and scroll to zoom; the conversation panel is visible alongside the world.
  The browser overview hides the lake-facing wall and ceiling to expose the
  statues; the downloadable GLB retains the complete room shell.
- `saloon-chat.js` adds a side-mounted, multi-speaker transcript panel using
  ThirdRoom's WebSG `UICanvas` / `UIText` API. It is an authored sample dialogue,
  not connected to Matrix yet.
- A camera is embedded at the lake-gallery threshold. `+Z` faces the lake.
- Warm point lights at the fire and table plus cool lake light use
  `KHR_lights_punctual`.

## Provenance and interpretation

Public descriptions date the original pavilion to about 1710–11 and describe a
terrace and balcony toward the lake. The house was enlarged around 1780–83,
probably gaining a lake-side bay, an additional storey, and a gallery on three
sides. The public 1816/1832 exterior views support the lake-facing terrace and
colonnaded approach.

No original room plan has been located. The interior partitioning, furniture,
marble treatment and staging are interpretive design choices informed by the
film still. The statues represent the historical circle, not likenesses of the
people or actors.

## Rebuild

From the repository root:

```sh
node scripts/build-diodati-saloon.mjs
```

The generator uses only Node built-ins and writes this standalone GLB.
The interactive browser view is a lightweight static preview of the same GLB;
it is not a running ThirdRoom client.
ThirdRoom accepts the WebSG JavaScript file separately: upload
`saloon-chat.js` in the world's Script settings (or open the in-world editor
and paste its contents).
