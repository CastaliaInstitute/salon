'use client'

import { useEffect, useRef } from 'react'
import type { SalonRoomState } from '../lib/matrix-room-client'

export interface SalonPhaserCharacter {
  id: string
  name: string
  active?: boolean
  position?: { x: number; z: number; rotation?: number; animation_state?: 'idle' | 'walk' | 'gesture' | 'sit' | 'speak'; direction?: string; scale?: number; height?: number; weight?: number }
  palette: { coat: number; waistcoat: number; accent: number }
  bodyType?: 'feminine' | 'masculine'
  skin?: number
  hair?: number
  accessories?: string[]
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
          g.fillStyle(0x0c0b12, 1).fillRect(0, 0, w, h)
          // Isometric room shell: rear wall, side walls, dado, and parquet floor.
          g.fillStyle(0x28202b, 1).fillRect(w * .12, h * .08, w * .76, h * .30)
          g.fillStyle(0x3b2930, 1).fillPoints([{ x: w * .12, y: h * .08 }, { x: w * .08, y: h * .22 }, { x: w * .20, y: h * .87 }, { x: w * .25, y: h * .38 }].map(({ x, y }) => ({ x, y })) as any, true)
          g.fillStyle(0x33242e, 1).fillPoints([{ x: w * .88, y: h * .08 }, { x: w * .92, y: h * .22 }, { x: w * .80, y: h * .87 }, { x: w * .75, y: h * .38 }].map(({ x, y }) => ({ x, y })) as any, true)
          g.fillStyle(0x12111b, 1).fillRect(w * .38, h * .15, w * .24, h * .18)
          g.lineStyle(3, 0xb58b59, .6).strokeRect(w * .38, h * .15, w * .24, h * .18)
          g.fillStyle(0x172536, 1).fillRect(w * .405, h * .17, w * .19, h * .14)
          g.lineStyle(2, 0xb58b59, .35).lineBetween(w * .5, h * .17, w * .5, h * .31)
          g.fillStyle(0x1d1721, 1).fillRect(w * .44, h * .32, w * .12, h * .07)
          g.fillStyle(0x6c4036, 1).fillRect(w * .46, h * .34, w * .08, h * .05)
          g.fillStyle(0xffb04a, .9).fillTriangle(w * .5, h * .315, w * .475, h * .37, w * .525, h * .37)
          g.fillStyle(0xffe4a3, .95).fillTriangle(w * .5, h * .33, w * .488, h * .37, w * .512, h * .37)
          const floor: Array<{ x: number; y: number }> = [{ x: w * .08, y: h * .23 }, { x: w * .92, y: h * .23 }, { x: w * .80, y: h * .87 }, { x: w * .20, y: h * .87 }]
          g.fillStyle(0x3b2930, 1).fillPoints(floor as any, true)
          g.lineStyle(2, 0xb58b59, .55).strokePoints([...floor, floor[0]] as any, true)
          g.fillStyle(0x765044, 1).fillEllipse(w * .5, h * .55, w * .42, h * .19)
          g.lineStyle(2, 0xd1a86a, .45).strokeEllipse(w * .5, h * .55, w * .42, h * .19)
          g.fillStyle(0x232031, 1).fillRect(w * .36, h * .12, w * .28, h * .08)
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
            const state = character.position?.animation_state ?? 'idle'
            const seated = state === 'sit'
            const gesturing = state === 'gesture' || state === 'speak'
            const feminine = character.bodyType === 'feminine'
            const scale = character.position?.scale ?? 1
            const height = character.position?.height ?? 1
            const weight = character.position?.weight ?? 1
            const shadow = this.add.ellipse(0, seated ? 13 : 22, (seated ? 42 : 54) * weight, 16 * weight, 0x090812, .55)
            const hips = this.add.ellipse(0, seated ? 0 : 10, (feminine ? 36 : 30) * weight, seated ? 24 : 34, character.palette.coat, .95).setStrokeStyle(2, character.active ? 0xffdf9b : character.palette.accent)
            const torso = this.add.rectangle(0, seated ? -12 : -4, (feminine ? 25 : 24) * weight, 28 * height, character.palette.waistcoat, .98)
            const coat = this.add.rectangle(0, seated ? -7 : 2, (feminine ? 37 : 32) * weight, (seated ? 17 : 34) * height, character.palette.coat, .9).setStrokeStyle(1, character.palette.accent)
            const chest = feminine ? this.add.ellipse(0, seated ? -17 : -12, 24 * weight, 14 * height, character.palette.waistcoat, 1) : null
            const hair = this.add.ellipse(0, -30 * height, (feminine ? 19 : 18) * weight, (feminine ? 21 : 18) * height, character.hair ?? character.palette.accent, 1)
            const head = this.add.circle(0, -27 * height, 11 * weight, character.skin ?? (character.active ? 0xf0c5a0 : 0xc7a28f))
            const arm = gesturing ? this.add.rectangle((feminine ? 19 : 18) * weight, -7 * height, 29 * weight, 6 * height, character.palette.coat, .95).setAngle(-28) : null
            const accessory = character.accessories?.includes('cravat') ? this.add.rectangle(0, -15 * height, 4 * weight, 10 * height, character.palette.accent, 1) : null
            const label = this.add.text(0, 43, character.name, { color: '#f5e9dc', fontFamily: 'Georgia', fontSize: '12px', align: 'center', wordWrap: { width: 100 } }).setOrigin(.5)
            group.add([shadow, hips, coat, torso, ...(chest ? [chest] : []), hair, head, ...(arm ? [arm] : []), ...(accessory ? [accessory] : []), label])
            group.setScale(scale)
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
