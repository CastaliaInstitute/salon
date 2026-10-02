'use client'

import { useEffect, useRef } from 'react'
import type { SalonRoomState } from '../lib/matrix-room-client'

export interface SalonPhaserCharacter {
  id: string
  name: string
  active?: boolean
  position?: { x: number; z: number; rotation?: number }
}

interface Props {
  characters: SalonPhaserCharacter[]
  furniture?: SalonRoomState['furniture']
  onSelect?: (id: string) => void
}

const ANCHORS = [
  [0.25, 0.55], [0.43, 0.34], [0.61, 0.53], [0.78, 0.36], [0.52, 0.73],
] as const

/** A deliberately small 2.5D stage: the room is drawn in Phaser, while chat remains React. */
export function SalonPhaserView({ characters, furniture, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    let game: import('phaser').Game | undefined
    let cancelled = false
    void import('phaser').then(({ default: Phaser }) => {
      if (cancelled || !hostRef.current) return
      class RoomScene extends Phaser.Scene {
        constructor() { super('salon-room') }
        create() {
          this.drawRoom()
          this.drawFurniture()
          this.drawCharacters()
        }
        drawRoom() {
          const { width: w, height: h } = this.scale
          const g = this.add.graphics()
          g.fillStyle(0x151421, 1).fillRect(0, 0, w, h)
          const floor: Array<{ x: number; y: number }> = [{ x: w * .08, y: h * .23 }, { x: w * .92, y: h * .23 }, { x: w * .80, y: h * .87 }, { x: w * .20, y: h * .87 }]
          g.fillStyle(0x3b2930, 1).fillPoints(floor as any, true)
          g.lineStyle(2, 0xb58b59, .55).strokePoints([...floor, floor[0]] as any, true)
          g.fillStyle(0x765044, 1).fillEllipse(w * .5, h * .55, w * .42, h * .19)
          g.lineStyle(2, 0xd1a86a, .45).strokeEllipse(w * .5, h * .55, w * .42, h * .19)
          g.fillStyle(0x232031, 1).fillRect(w * .36, h * .12, w * .28, h * .08)
          this.add.text(w * .5, h * .15, 'VILLA DIODATI', { color: '#d9b77c', fontFamily: 'Georgia', fontSize: '12px' }).setOrigin(.5)
          this.add.text(w * .5, h * .94, 'June 1816  ·  Geneva solar time', { color: '#ad9a9a', fontSize: '11px' }).setOrigin(.5)
        }
        project(x: number, z: number) {
          const { width: w, height: h } = this.scale
          return { x: w * (.5 + x / 12), y: h * (.54 + z / 15 - x / 32) }
        }
        drawFurniture() {
          const props = furniture ?? {
            'carved-settee': { kind: 'sofa' as const, x: -3.38, z: 0.15, rotation: 0 },
            'byron-chair': { kind: 'armchair' as const, x: 2.55, z: -0.60, rotation: -Math.PI / 2 },
            'reading-chair': { kind: 'armchair' as const, x: 4.12, z: 0.96, rotation: -Math.PI / 2 },
            'window-chair': { kind: 'armchair' as const, x: 0, z: 2.42, rotation: Math.PI },
          }
          Object.values(props).forEach((prop) => {
            const point = this.project(prop.x, prop.z)
            const width = prop.kind === 'sofa' ? 112 : 48
            const height = prop.kind === 'sofa' ? 26 : 36
            const item = this.add.container(point.x, point.y)
            item.rotation = prop.rotation ?? 0
            item.add(this.add.ellipse(0, 15, width + 8, 12, 0x090812, .35))
            item.add(this.add.rectangle(0, 0, width, height, prop.kind === 'sofa' ? 0x633e42 : 0x5a4350, .95).setStrokeStyle(2, 0xb58b59, .8))
            item.add(this.add.rectangle(0, -height / 2 + 3, width - 8, 8, 0x895b53, .95))
          })
        }
        drawCharacters() {
          const { width: w, height: h } = this.scale
          characters.slice(0, ANCHORS.length).forEach((character, index) => {
            const [defaultX, defaultZ] = ANCHORS[index]
            const world = character.position ?? { x: (defaultX - .5) * 12, z: (defaultZ - .54) * 15 }
            const projected = this.project(world.x, world.z)
            const x = projected.x; const y = projected.y
            const group = this.add.container(x, y).setSize(94, 70).setInteractive({ useHandCursor: true })
            const shadow = this.add.ellipse(0, 22, 54, 16, 0x090812, .55)
            const body = this.add.rectangle(0, 3, 34, 38, character.active ? 0xd6a65e : 0x84708b, .95).setStrokeStyle(2, character.active ? 0xffdf9b : 0xc0aaba)
            const head = this.add.circle(0, -24, 13, character.active ? 0xf0c5a0 : 0xc7a28f)
            const label = this.add.text(0, 43, character.name, { color: '#f5e9dc', fontFamily: 'Georgia', fontSize: '12px', align: 'center', wordWrap: { width: 100 } }).setOrigin(.5)
            group.add([shadow, body, head, label])
            group.on('pointerdown', () => onSelectRef.current?.(character.id))
          })
        }
      }
      game = new Phaser.Game({ type: Phaser.AUTO, parent: hostRef.current, width: 760, height: 500, backgroundColor: '#151421', scene: RoomScene, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true } })
    })
    return () => { cancelled = true; game?.destroy(true) }
  }, [characters])

  return <div ref={hostRef} className="salon-phaser-stage" aria-label="Isometric Villa Diodati room" />
}
