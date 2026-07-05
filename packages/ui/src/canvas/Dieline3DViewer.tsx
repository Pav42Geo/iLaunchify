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
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { BoxFace } from '../lib/surface-face'
import { bindGltfMaterialsToSurfaces, type BindableSurface } from '../lib/gltf-surface-binding'
import { materialsForDesign } from '../lib/gltf-design-binding'

export type { BoxFace }

export type DielineShapeKind = 'BOX' | 'CYLINDER' | 'FLAT'

// Phase 3 — multi-panel box. Each face can carry its own die-line/surface texture, and a
// click reports which face was hit so the host can route to that surface's 2D editor.
// (BoxFace lives in ../lib/surface-face so the pure face-binding engine has no three dep.)
export interface FaceTexture {
  svg?: string | null
  imageUrl?: string | null
}
// three BoxGeometry material order is [+X,-X,+Y,-Y,+Z,-Z].
const MATERIAL_FACE_ORDER: BoxFace[] = ['right', 'left', 'top', 'bottom', 'front', 'back']

/** Where the design sits + how to frame it, inferred from the die-cut's ROLE.
 *  A lid/top sticker → design on the top cap, opened looking down at the lid.
 *  A wrap/body label → design on the body, opened front-on. */
export function previewIntentForCategory(category?: string | null): {
  designSurface: 'body' | 'top' | 'front'
  initialView: 'front' | 'top'
} {
  switch ((category ?? '').toUpperCase()) {
    // Lid / top-circle stickers → the design belongs on the lid; show the lid from above.
    case 'TUB_LID':
    case 'LID_LABEL':
      return { designSurface: 'top', initialView: 'top' }
    default:
      return { designSurface: 'body', initialView: 'front' }
  }
}

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

/**
 * G1.2/G1.3 — renderer-agnostic PBR surface parameters (a structural subset of
 * `@ilaunchify/packaging-3d`'s `PbrPreset`, so a resolved preset is assignable
 * directly). All optional; unset fields fall back to matte-substrate defaults.
 * The viewer stays free of a packaging-3d dependency — hosts resolve the preset
 * and pass it down.
 */
export interface PbrSurfaceParams {
  roughness?: number
  metalness?: number
  clearcoat?: number
  clearcoatRoughness?: number
  transmission?: number
  ior?: number
  thickness?: number
  sheen?: number
  sheenRoughness?: number
  envMapIntensity?: number
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
  /** Phase 3 — per-face textures for a BOX (front/back/left/right/top/bottom). When set,
   *  each face renders its own die-line/surface and clicks report the face. Ignored for
   *  non-box shapes and when neither svg nor imageUrl is given for a face. */
  faces?: Partial<Record<BoxFace, FaceTexture>>
  /** Substrate base colour (hex). */
  baseColor?: string
  /** G1.3 — PBR surface response (from `@ilaunchify/packaging-3d` presets). When set,
   *  the model renders with MeshPhysicalMaterial (clearcoat/transmission/sheen).
   *  Pass a reference-stable object (a resolved preset constant is already stable). */
  material?: PbrSurfaceParams
  /** G1.3 — image-based studio lighting (PMREM RoomEnvironment). Default on. */
  environment?: boolean
  /** G1.3 — soft contact shadow grounding the model. Default on. */
  contactShadow?: boolean
  /** G1.4 — imported glTF/glb URL. When set, renders the REAL model (parametric
   *  fallback on error) and applies the design texture (`textureImageUrl`/`textureSvg`)
   *  to its materials. When absent, behaviour is unchanged (parametric only). */
  modelUrl?: string | null
  /** Which surface carries the design: 'body' (wrap, default), 'top' (lid sticker). */
  designSurface?: 'body' | 'top' | 'front'
  /** G1.4 — the packaging type's authored surface map (PackagingType.defaultSurfaces).
   *  When present with an imported glTF, materials are bound to surfaces EXACTLY via
   *  `bindGltfMaterialsToSurfaces` (admin-defined), not raw material-name heuristics. */
  modelSurfaces?: BindableSurface[]
  /** Initial camera framing: 'front' (default) or 'top' (look down at the lid). */
  initialView?: 'front' | 'top'
  className?: string
  /** When provided, the viewer sets `.current` to a function that captures the current
   *  frame as a PNG data URL (for "download 3D image"). Requires preserveDrawingBuffer. */
  captureRef?: React.MutableRefObject<(() => string | null) | null>
  /** Click-to-edit (Studio 3D+2D Phase 2b/3): fired on a click (not a drag) on the printed
   *  surface with the hit's UV in 0..1 (u = left→right, v = top→bottom of the texture) and,
   *  for a multi-panel box, the `face` that was hit — so the host can select the matching
   *  element on the 2D canvas or route to that surface's editor. */
  onSurfaceClick?: (hit: { u: number; v: number; face?: BoxFace }) => void
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

/** A soft radial alpha gradient used as a fake contact shadow under the model —
 *  cheaper than shadow maps and the standard product-viewer grounding trick. */
function radialShadowTexture(): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(0,0,0,0.55)')
    g.addColorStop(0.7, 'rgba(0,0,0,0.18)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function Dieline3DViewer({
  shape,
  widthMm,
  heightMm,
  depthMm,
  textureSvg,
  textureImageUrl,
  faces,
  baseColor = '#f2efe7',
  material,
  environment = true,
  contactShadow = true,
  modelUrl,
  designSurface = 'body',
  initialView = 'front',
  modelSurfaces,
  className,
  captureRef,
  onSurfaceClick,
}: Dieline3DViewerProps) {
  const clickRef = useRef(onSurfaceClick)
  clickRef.current = onSurfaceClick
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(0) // 0 = closed, 1 = open
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let cancelled = false // guards the async glTF load against unmount
    const w = Math.max(1, widthMm)
    const h = Math.max(1, heightMm)
    const d = Math.max(1, depthMm && depthMm > 0 ? depthMm : Math.min(w, h) * 0.5)
    const maxDim = Math.max(w, h, d)
    const s = 1.6 / maxDim // normalize so the largest side ≈ 1.6 units (leaves fit margin)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    // Slight 3/4 elevation, then LOOK AT the model's centre (origin) so it sits centred and
    // fully framed — without lookAt the camera stared down -Z and the model hung low/clipped.
    camera.position.set(0, 0.6, 6)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    // Expose a frame-capture fn for "download 3D image". preserveDrawingBuffer keeps the
    // backbuffer readable so toDataURL returns the rendered frame (not a blank canvas).
    if (captureRef) captureRef.current = () => renderer.domElement.toDataURL('image/png')
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.cursor = 'grab'
    renderer.domElement.style.touchAction = 'none'

    // G1.3 — image-based studio lighting. PMREM-prefilter a procedural neutral
    // room so every physical material gets realistic ambient + reflections with
    // no vendored HDRI asset (CC0/no-CDN). Lights are dialed down when env is on
    // so we light, not blow out; artwork colour stays trustworthy (no tone-map).
    let envRT: THREE.WebGLRenderTarget | null = null
    if (environment) {
      const pmrem = new THREE.PMREMGenerator(renderer)
      envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
      scene.environment = envRT.texture
      pmrem.dispose()
    }
    scene.add(new THREE.AmbientLight(0xffffff, environment ? 0.25 : 0.75))
    const key = new THREE.DirectionalLight(0xffffff, environment ? 0.7 : 1.1)
    key.position.set(3, 5, 4)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, environment ? 0.25 : 0.4)
    fill.position.set(-4, 2, -3)
    scene.add(fill)

    // Track every texture we create so cleanup disposes them all (multi-panel makes several).
    const disposables: THREE.Texture[] = []
    const trackTex = (t: THREE.Texture | null): THREE.Texture | null => {
      if (t) disposables.push(t)
      return t
    }
    const tex = textureImageUrl ? trackTex(rasterTexture(textureImageUrl)) : textureSvg ? trackTex(svgTexture(textureSvg)) : null
    const base = new THREE.Color(baseColor)
    // G1.3 — MeshPhysicalMaterial keyed to the PBR preset (clearcoat/transmission/
    // sheen). `printed` = has artwork (default slightly smoother); `substrate` =
    // bare stock (matte default). Preset params override the per-role defaults.
    const m = material ?? {}
    const physicalMat = (opts: { map?: THREE.Texture | null; color: THREE.ColorRepresentation; printed: boolean }) =>
      new THREE.MeshPhysicalMaterial({
        map: opts.map ?? undefined,
        color: opts.color,
        roughness: m.roughness ?? (opts.printed ? 0.7 : 0.85),
        metalness: m.metalness ?? 0.05,
        clearcoat: m.clearcoat ?? 0,
        clearcoatRoughness: m.clearcoatRoughness ?? 0.3,
        transmission: m.transmission ?? 0,
        ior: m.ior ?? 1.45,
        thickness: m.thickness ?? 0,
        sheen: m.sheen ?? 0,
        sheenRoughness: m.sheenRoughness ?? 0.5,
        envMapIntensity: m.envMapIntensity ?? (environment ? 0.8 : 0),
      })
    const substrateMat = () => physicalMat({ color: base, printed: false })
    const printedMat = () => (tex ? physicalMat({ map: tex, color: 0xffffff, printed: true }) : substrateMat())
    // Per-face material for a multi-panel box (Phase 3). Textured if the face has svg/image.
    const faceMat = (ft?: FaceTexture) => {
      const t = ft?.imageUrl ? trackTex(rasterTexture(ft.imageUrl)) : ft?.svg ? trackTex(svgTexture(ft.svg)) : null
      return t ? physicalMat({ map: t, color: 0xffffff, printed: true }) : substrateMat()
    }

    const group = new THREE.Group()
    scene.add(group)

    // Lid group (box only) — hinged at the back-top edge so the slider folds it open.
    let lid: THREE.Group | null = null

    function addParametric() {
    if (shape === 'BOX') {
      const geo = new THREE.BoxGeometry(w * s, h * s, d * s)
      // material order: +X,-X,+Y,-Y,+Z,-Z. Multi-panel → per-face textures; else print on front.
      const mats = faces
        ? MATERIAL_FACE_ORDER.map((f) => faceMat(faces[f]))
        : [substrateMat(), substrateMat(), substrateMat(), substrateMat(), printedMat(), substrateMat()]
      group.add(new THREE.Mesh(geo, mats))

      lid = new THREE.Group()
      lid.position.set(0, (h * s) / 2, -(d * s) / 2) // hinge at back-top edge
      const lidMesh = new THREE.Mesh(new THREE.PlaneGeometry(w * s, d * s), printedMat())
      lidMesh.rotation.x = -Math.PI / 2
      lidMesh.position.set(0, 0, (d * s) / 2) // extend forward from the hinge
      lid.add(lidMesh)
      group.add(lid)
    } else if (shape === 'CYLINDER') {
      // Lid sticker → design on the TOP cap, body bare. Body wrap → design on the body.
      const onTop = designSurface === 'top'
      const r = (w * s) / (2 * Math.PI) // wrap circumference = width
      const geo = new THREE.CylinderGeometry(Math.max(0.2, r), Math.max(0.2, r), h * s, 48, 1, true)
      group.add(new THREE.Mesh(geo, onTop ? substrateMat() : printedMat()))
      const capGeo = new THREE.CircleGeometry(Math.max(0.2, r), 48)
      const top = new THREE.Mesh(capGeo, onTop ? printedMat() : substrateMat())
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

    // G1.3 — soft contact shadow under 3D volumes (skip flat stickers). Added to
    // the group so it stays glued to the model base as the orbit tilts it.
    if (contactShadow && shape !== 'FLAT') {
      const shadowTex = trackTex(radialShadowTexture())
      const foot = shape === 'CYLINDER' ? ((w * s) / (2 * Math.PI)) * 2 * 1.9 : Math.max(w, d) * s * 1.7
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(foot, foot),
        new THREE.MeshBasicMaterial({ map: shadowTex ?? undefined, transparent: true, depthWrite: false, opacity: 0.6 }),
      )
      shadow.rotation.x = -Math.PI / 2
      shadow.position.y = -(h * s) / 2 - 0.01
      group.add(shadow)
    }
    } // end addParametric

    // G1.4 — imported glTF: render the REAL model and apply the design texture to its
    // materials (first pass = all mesh materials; per-surface binding is a follow-up).
    // Parametric fallback on error / no URL, so existing callers are unaffected.
    if (modelUrl) {
      new GLTFLoader().load(
        modelUrl,
        (gltf: GLTF) => {
          if (cancelled) return
          const obj = gltf.scene ?? gltf.scenes?.[0]
          if (!obj) return addParametric()
          const bbox = new THREE.Box3().setFromObject(obj)
          const size = new THREE.Vector3()
          const center = new THREE.Vector3()
          bbox.getSize(size)
          bbox.getCenter(center)
          const scale = 1.6 / (Math.max(size.x, size.y, size.z) || 1)
          obj.scale.setScalar(scale)
          obj.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
          if (tex) {
            tex.flipY = false
            tex.colorSpace = THREE.SRGBColorSpace
            tex.needsUpdate = true
          }
          // Per-surface binding: collect the model's materials, then apply the design
          // only to the ones that match the target surface (label on the body / lid).
          const entries: { mat: THREE.MeshStandardMaterial; name: string }[] = []
          obj.traverse((o: THREE.Object3D) => {
            const mesh = o as THREE.Mesh
            const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
            for (const raw of mats) {
              const mm = raw as THREE.MeshStandardMaterial
              if (mm && typeof mm === 'object') entries.push({ mat: mm, name: mm.name || mesh.name || '' })
            }
          })
          // Decide which materials carry the design (pure: exact binding → heuristic → all).
          const names = entries.map((e) => e.name).filter(Boolean)
          const surfaces = modelSurfaces ?? []
          const binding = surfaces.length > 0 ? bindGltfMaterialsToSurfaces(names, surfaces) : {}
          const chosen = new Set(materialsForDesign(names, binding, surfaces, designSurface))
          const applyTo = new Set(entries.filter((e) => chosen.has(e.name)).map((e) => e.mat))
          for (const e of entries) {
            if (tex && applyTo.has(e.mat)) e.mat.map = tex
            if ('envMapIntensity' in e.mat) e.mat.envMapIntensity = environment ? 0.8 : 0
            e.mat.needsUpdate = true
          }
          group.add(obj)
        },
        undefined,
        () => {
          if (!cancelled) addParametric()
        },
      )
    } else {
      addParametric()
    }

    // ---- manual orbit ----
    // Lid stickers open looking down at the top; everything else opens front 3/4.
    let rotX = initialView === 'top' ? -1.3 : -0.35
    let rotY = initialView === 'top' ? 0 : 0.5
    let dragging = false
    let moved = false
    let lastX = 0
    let lastY = 0
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const onDown = (e: PointerEvent) => { dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY; renderer.domElement.style.cursor = 'grabbing' }
    const onUp = (e: PointerEvent) => {
      const wasDragging = dragging
      dragging = false
      renderer.domElement.style.cursor = 'grab'
      // A click (no meaningful drag) on the printed surface → report the hit UV.
      if (!wasDragging || moved || !clickRef.current) return
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObjects(group.children, true)
      const hit = hits.find((h) => h.uv)
      if (hit && hit.uv) {
        const mi = (hit.face as { materialIndex?: number } | undefined)?.materialIndex
        const face = typeof mi === 'number' ? MATERIAL_FACE_ORDER[mi] : undefined
        clickRef.current({ u: hit.uv.x, v: 1 - hit.uv.y, face })
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) > 2) moved = true
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
      cancelled = true
      if (captureRef) captureRef.current = null
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('wheel', onWheel)
      disposables.forEach((t) => t.dispose())
      scene.environment = null
      envRT?.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
    // `faces` and `material` should be memoized by the caller (a new object re-inits
    // the scene); resolved packaging-3d preset constants are already reference-stable.
  }, [shape, widthMm, heightMm, depthMm, textureSvg, textureImageUrl, baseColor, faces, material, environment, contactShadow, modelUrl, designSurface, initialView, modelSurfaces])

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
