'use client'

// =============================================================================
// Dieline 3D viewer (DIELINE_MANAGEMENT_UX §8 / Pavel 2026-06-23).
//
// Renders the normalized die-line wrapped onto its 3D structure (box / cylinder /
// flat) with the substrate as the base colour. Drag to orbit, wheel to zoom, and
// — for box shapes — an Open ⇄ Close fold slider. The fold doubles as a parse-
// correctness check: a die-line whose geometry is wrong folds wrong here.
//
// All Three.js lives in an effect (never during render) so SSR of the client
// shell is safe. Manual orbit (no OrbitControls addon) keeps it self-contained.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

export type DielineShapeKind = 'BOX' | 'CYLINDER' | 'FLAT'

export function shapeKindForCategory(category?: string | null): DielineShapeKind {
  switch ((category ?? '').toUpperCase()) {
    // Rigid rectangular structures → box
    case 'BOX_PANEL':
    case 'STRAIGHT_TUCK_CARTON':
    case 'REVERSE_TUCK_CARTON':
    case 'SEAL_END_CARTON':
    case 'AUTO_BOTTOM_CARTON':
    case 'SNAP_LOCK_CARTON':
    case 'GABLE_TOP_CARTON':
    case 'FOLDING_TRAY':
    case 'CARTON_SLEEVE':
    case 'RIGID_BOX':
    case 'MAILER_BOX':
    case 'SHIPPER_CASE':
      return 'BOX'
    // Round bodies / wraps / sleeves → cylinder
    case 'BOTTLE_WRAP':
    case 'CAN_WRAP':
    case 'JAR_WRAP':
    case 'WRAP_AROUND_LABEL':
    case 'FRONT_BACK_LABEL':
    case 'SHRINK_SLEEVE':
    case 'NECK_LABEL':
    case 'TUB_LID':
    case 'LID_LABEL':
      return 'CYLINDER'
    // Everything flexible / flat (pouches, sachets, sticks, tags, cards) → flat
    default:
      return 'FLAT'
  }
}

export interface Dieline3DViewerProps {
  shape: DielineShapeKind
  widthMm: number
  heightMm: number
  depthMm?: number | null
  /** SVG string (normalized die-line or design) wrapped as the surface texture. */
  textureSvg?: string | null
  /** Raster image (data URL / URL) wrapped as the surface texture — e.g. a live
   *  design snapshot from the Fabric canvas. Takes precedence over textureSvg. */
  textureImageUrl?: string | null
  /** Substrate base colour (hex). */
  baseColor?: string
  className?: string
}

function rasterTexture(url: string): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function svgTexture(svg: string): THREE.Texture {
  return rasterTexture(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)
}

export function Dieline3DViewer({
  shape,
  widthMm,
  heightMm,
  depthMm,
  textureSvg,
  textureImageUrl,
  baseColor = '#f2efe7',
  className,
}: Dieline3DViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(0) // 0 = closed, 1 = open
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const w = Math.max(1, widthMm)
    const h = Math.max(1, heightMm)
    const d = Math.max(1, depthMm && depthMm > 0 ? depthMm : Math.min(w, h) * 0.5)
    const maxDim = Math.max(w, h, d)
    const s = 2 / maxDim // normalize so the largest side ≈ 2 units

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.set(0, 1.4, 5)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.cursor = 'grab'
    renderer.domElement.style.touchAction = 'none'

    scene.add(new THREE.AmbientLight(0xffffff, 0.75))
    const key = new THREE.DirectionalLight(0xffffff, 1.1)
    key.position.set(3, 5, 4)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.4)
    fill.position.set(-4, 2, -3)
    scene.add(fill)

    const tex = textureImageUrl ? rasterTexture(textureImageUrl) : textureSvg ? svgTexture(textureSvg) : null
    const base = new THREE.Color(baseColor)
    const substrateMat = () => new THREE.MeshStandardMaterial({ color: base, roughness: 0.85, metalness: 0.04 })
    const printedMat = () =>
      tex
        ? new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.7 })
        : substrateMat()

    const group = new THREE.Group()
    scene.add(group)

    // Lid group (box only) — hinged at the back-top edge so the slider folds it open.
    let lid: THREE.Group | null = null

    if (shape === 'BOX') {
      const geo = new THREE.BoxGeometry(w * s, h * s, d * s)
      // material order: +X,-X,+Y,-Y,+Z,-Z — print on the front (+Z).
      const mats = [substrateMat(), substrateMat(), substrateMat(), substrateMat(), printedMat(), substrateMat()]
      group.add(new THREE.Mesh(geo, mats))

      lid = new THREE.Group()
      lid.position.set(0, (h * s) / 2, -(d * s) / 2) // hinge at back-top edge
      const lidMesh = new THREE.Mesh(new THREE.PlaneGeometry(w * s, d * s), printedMat())
      lidMesh.rotation.x = -Math.PI / 2
      lidMesh.position.set(0, 0, (d * s) / 2) // extend forward from the hinge
      lid.add(lidMesh)
      group.add(lid)
    } else if (shape === 'CYLINDER') {
      const r = (w * s) / (2 * Math.PI) // wrap circumference = width
      const geo = new THREE.CylinderGeometry(Math.max(0.2, r), Math.max(0.2, r), h * s, 48, 1, true)
      group.add(new THREE.Mesh(geo, printedMat()))
      const capGeo = new THREE.CircleGeometry(Math.max(0.2, r), 48)
      const top = new THREE.Mesh(capGeo, substrateMat())
      top.rotation.x = -Math.PI / 2
      top.position.y = (h * s) / 2
      const bot = new THREE.Mesh(capGeo, substrateMat())
      bot.rotation.x = Math.PI / 2
      bot.position.y = -(h * s) / 2
      group.add(top, bot)
    } else {
      const geo = new THREE.PlaneGeometry(w * s, h * s)
      group.add(new THREE.Mesh(geo, printedMat()))
    }

    // ---- manual orbit ----
    let rotX = -0.35
    let rotY = 0.5
    let dragging = false
    let lastX = 0
    let lastY = 0
    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; renderer.domElement.style.cursor = 'grabbing' }
    const onUp = () => { dragging = false; renderer.domElement.style.cursor = 'grab' }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      rotY += (e.clientX - lastX) * 0.01
      rotX += (e.clientY - lastY) * 0.01
      rotX = Math.max(-1.3, Math.min(1.3, rotX))
      lastX = e.clientX
      lastY = e.clientY
    }
    const onWheel = (e: WheelEvent) => { e.preventDefault(); camera.position.z = Math.max(2.5, Math.min(9, camera.position.z + e.deltaY * 0.002)) }
    renderer.domElement.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

    const resize = () => {
      const rect = mount.getBoundingClientRect()
      const ww = Math.max(1, rect.width)
      const hh = Math.max(1, rect.height)
      renderer.setSize(ww, hh, false)
      camera.aspect = ww / hh
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    let raf = 0
    const loop = () => {
      group.rotation.x = rotX
      group.rotation.y = rotY
      if (lid) lid.rotation.x = -openRef.current * 2.1 // closed → open ~120°
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('wheel', onWheel)
      tex?.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [shape, widthMm, heightMm, depthMm, textureSvg, textureImageUrl, baseColor])

  return (
    <div className={className ?? 'flex h-full w-full flex-col'}>
      <div ref={mountRef} className="min-h-0 flex-1" />
      {shape === 'BOX' && (
        <label className="mt-2 flex shrink-0 items-center gap-2 text-[11px] text-ink-500">
          Close
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={open}
            onChange={(e) => setOpen(Number(e.target.value))}
            className="flex-1 accent-pink-500"
          />
          Open
        </label>
      )}
    </div>
  )
}
