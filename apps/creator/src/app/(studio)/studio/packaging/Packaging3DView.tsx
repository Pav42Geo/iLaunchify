'use client'

// =============================================================================
// Packaging Studio — 3D surface view (ADMIN_PACKAGING_STUDIO.md P2 Slice B).
//
// A self-contained three.js viewer for the admin surface-authoring page. Renders a
// parametric package for the model's topology (can / jar / box / pouch / tube …) at
// the die-line's REAL proportions (buildParametricModel), overlays a clickable MARKER
// per surface (projected 3D→screen), and — in "place" mode — raycasts a click on the
// mesh to set the selected surface's 3D anchor.
//
// G1.3d migration (2026-07-03): moved off the r128 CDN to npm three@0.184 (the same
// build Dieline3DViewer uses) → real @types/three (no more `any`), PMREM RoomEnvironment
// image-based lighting + contact shadow + MeshPhysicalMaterial (clearcoat/transmission/
// sheen), and the examples/jsm GLTFLoader. This is the realism jump for the admin studio
// and unblocks the G1.4 glTF texture swap. Needs browser QA.
// =============================================================================

import * as React from 'react'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { PackagingSurface } from '@ilaunchify/ui'
import { buildParametricModel, type PackagingTopology } from '@ilaunchify/packaging-3d'

type Vec3 = { x: number; y: number; z: number }

/** Renderer-agnostic PBR surface params (subset of the packaging-3d preset). */
interface MaterialParams {
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

interface Props {
  topology: string
  surfaces: PackagingSurface[]
  selectedKey: string | null
  onSelect: (key: string) => void
  /** Place mode: clicking the model sets the selected surface's anchor. */
  placeMode?: boolean
  onPlaceAnchor?: (key: string, anchor: Vec3) => void
  /** Signed URL to an imported glTF/glb. When set, renders the real mesh (parametric fallback on error). */
  modelUrl?: string | null
  /** PBR surface response from the PackagingType's material/finish (packaging-3d preset). */
  material?: MaterialParams | null
  /** G3.1 — real dimensions (mm) from the die-line. When present, the parametric mesh
   *  is built at the package's TRUE proportions via buildParametricModel. */
  dims?: { widthMm: number; heightMm: number; depthMm?: number } | null
}

type Dims = { r: number; h: number; d: number; kind: 'cyl' | 'box'; lid: boolean }

interface SceneState {
  renderer?: THREE.WebGLRenderer
  el?: HTMLCanvasElement
  onDown?: (e: PointerEvent) => void
  onMove?: (e: PointerEvent) => void
  onUp?: (e: PointerEvent) => void
  onWheel?: (e: WheelEvent) => void
  envRT?: THREE.WebGLRenderTarget | null
}

/** Rough half-extents for the parametric mesh by topology (three.js units). */
function dimsFor(topology: string): Dims {
  switch (topology) {
    case 'CAPSULE_JAR':
      return { r: 1, h: 1.8, d: 1, kind: 'cyl', lid: true }
    case 'TUBE':
      return { r: 0.5, h: 2.2, d: 0.5, kind: 'cyl', lid: true }
    case 'SINGLE_CONTAINER':
      return { r: 0.9, h: 2.2, d: 0.9, kind: 'cyl', lid: false }
    case 'POUCH_STAND_UP':
    case 'POUCH_FLAT':
      return { r: 1, h: 2.2, d: 0.45, kind: 'box', lid: false }
    case 'STICK_PACK':
    case 'SACHET':
      return { r: 0.35, h: 2.4, d: 0.18, kind: 'box', lid: false }
    case 'MULTI_CONTAINER_BOX':
    case 'CASE':
      return { r: 1.4, h: 2.0, d: 0.95, kind: 'box', lid: false }
    default:
      return { r: 1, h: 2, d: 1, kind: 'box', lid: false }
  }
}

// Real-mm bounds → normalized {r,h,d,kind,lid} (largest side ≈ 2.2 units, aspect kept).
function dimsFromRealMm(topology: string, dims: { widthMm: number; heightMm: number; depthMm?: number }): Dims {
  const model = buildParametricModel(topology as PackagingTopology, dims)
  const { widthMm, heightMm, depthMm } = model.dims
  const scale = 2.2 / Math.max(widthMm, heightMm, depthMm, 1)
  return {
    r: (widthMm * scale) / 2,
    h: heightMm * scale,
    d: depthMm * scale,
    kind: model.primitive === 'CYLINDER' ? 'cyl' : 'box',
    lid: model.hasLid,
  }
}

/** Default anchor for a surface with no stored hotspot — infer from part/role. */
function defaultAnchor(s: PackagingSurface, d: Dims, i: number): Vec3 {
  const top = s.part === 'lid' || s.role === 'CLOSURE'
  const base = s.role === 'OTHER' && /base/i.test(s.label)
  if (top) return { x: 0, y: d.h / 2 + 0.05, z: 0 }
  if (base) return { x: 0, y: -d.h / 2 - 0.05, z: 0 }
  // Spread body surfaces around the front/sides so markers don't overlap.
  const ang = ((i * 0.7) % (Math.PI * 1.2)) - 0.6
  const rad = d.kind === 'cyl' ? d.r + 0.04 : d.d / 2 + 0.04
  return { x: Math.sin(ang) * (d.kind === 'cyl' ? d.r + 0.04 : d.r * 0.7), y: 0, z: Math.cos(ang) * rad }
}

/** Soft radial contact-shadow texture (fake grounding — cheaper than shadow maps). */
function radialShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(0,0,0,0.5)')
    g.addColorStop(0.7, 'rgba(0,0,0,0.16)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function bodyMaterial(m: MaterialParams | null | undefined, color: THREE.ColorRepresentation): THREE.MeshPhysicalMaterial {
  const p = m ?? {}
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: p.roughness ?? 0.55,
    metalness: p.metalness ?? 0.08,
    clearcoat: p.clearcoat ?? 0,
    clearcoatRoughness: p.clearcoatRoughness ?? 0.3,
    transmission: p.transmission ?? 0,
    ior: p.ior ?? 1.45,
    thickness: p.thickness ?? 0,
    sheen: p.sheen ?? 0,
    sheenRoughness: p.sheenRoughness ?? 0.5,
    envMapIntensity: p.envMapIntensity ?? 0.9,
  })
}

export function Packaging3DView({ topology, surfaces, selectedKey, onSelect, placeMode, onPlaceAnchor, modelUrl, material, dims }: Props) {
  const mountRef = React.useRef<HTMLDivElement>(null)
  const [markers, setMarkers] = React.useState<{ key: string; label: string; x: number; y: number; front: boolean }[]>([])
  const [err, setErr] = React.useState<string | null>(null)
  const stateRef = React.useRef<SceneState>({})
  // Keep the latest props available to the render loop without re-initializing the scene.
  const propsRef = React.useRef({ surfaces, selectedKey, placeMode, onPlaceAnchor, onSelect, topology, modelUrl, material, dims })
  propsRef.current = { surfaces, selectedKey, placeMode, onPlaceAnchor, onSelect, topology, modelUrl, material, dims }

  React.useEffect(() => {
    let disposed = false
    let raf = 0
    const mount = mountRef.current
    if (!mount) return

    try {
      const W = mount.clientWidth || 360
      const H = mount.clientHeight || 360
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0xf4f4f5)
      const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100)
      // Frame the model high + centred: sit back and aim BELOW the model centre.
      camera.position.set(0, 1.1, 7.5)
      camera.lookAt(0, -1.3, 0)
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(W, H)
      mount.appendChild(renderer.domElement)

      // Image-based studio lighting (PMREM RoomEnvironment — no vendored HDRI asset).
      let envRT: THREE.WebGLRenderTarget | null = null
      try {
        const pmrem = new THREE.PMREMGenerator(renderer)
        envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
        scene.environment = envRT.texture
        pmrem.dispose()
      } catch {
        /* env is optional — lights below still illuminate */
      }
      scene.add(new THREE.AmbientLight(0xffffff, 0.3))
      const key = new THREE.DirectionalLight(0xffffff, 0.7)
      key.position.set(3, 5, 4)
      scene.add(key)
      const fill = new THREE.DirectionalLight(0xffffff, 0.25)
      fill.position.set(-4, 2, -3)
      scene.add(fill)

      // Real-size proportions from the die-line when available (G3.1); else the guess.
      const realDims = propsRef.current.dims
      const d = realDims && realDims.widthMm > 0 && realDims.heightMm > 0 ? dimsFromRealMm(topology, realDims) : dimsFor(topology)
      const group = new THREE.Group()
      const mat = bodyMaterial(propsRef.current.material, 0xd8d8dc)

      // Parametric placeholder mesh (also the fallback if a GLB fails to load).
      function addParametric() {
        const body =
          d.kind === 'cyl'
            ? new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r, d.h, 48), mat)
            : new THREE.Mesh(new THREE.BoxGeometry(d.r * 2, d.h, d.d, 1, 1, 1), mat)
        body.name = 'body'
        group.add(body)
        if (d.lid) {
          const lid = new THREE.Mesh(
            new THREE.CylinderGeometry(d.r * 1.04, d.r * 1.04, d.h * 0.18, 48),
            bodyMaterial({ roughness: 0.4, metalness: 0.1 }, 0xb9b9c0),
          )
          lid.position.y = d.h / 2 - d.h * 0.05
          lid.name = 'lid'
          group.add(lid)
        }
      }
      scene.add(group)

      // Soft contact shadow grounding the model (glued under the base so it tilts with orbit).
      {
        const shadowTex = radialShadowTexture()
        const foot = d.kind === 'cyl' ? d.r * 2 * 1.9 : Math.max(d.r * 2, d.d) * 1.7
        const shadow = new THREE.Mesh(
          new THREE.PlaneGeometry(foot, foot),
          new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.6 }),
        )
        shadow.rotation.x = -Math.PI / 2
        shadow.position.y = -d.h / 2 - 0.02
        group.add(shadow)
      }

      const initialModelUrl = propsRef.current.modelUrl
      if (initialModelUrl) {
        // Import the real glTF/glb; normalize to ~2.4 units and center it. Parametric fallback on failure.
        const loader = new GLTFLoader()
        loader.load(
          initialModelUrl,
          (gltf: GLTF) => {
            if (disposed) return
            const obj = gltf.scene ?? gltf.scenes?.[0]
            if (!obj) {
              addParametric()
              return
            }
            const bbox = new THREE.Box3().setFromObject(obj)
            const size = new THREE.Vector3()
            const center = new THREE.Vector3()
            bbox.getSize(size)
            bbox.getCenter(center)
            const maxDim = Math.max(size.x, size.y, size.z) || 1
            const scale = 2.4 / maxDim
            obj.scale.setScalar(scale)
            obj.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
            // Let imported materials catch the studio environment.
            obj.traverse((o: THREE.Object3D) => {
              const mesh = o as THREE.Mesh
              const mm = mesh.material as THREE.MeshStandardMaterial | undefined
              if (mm && 'envMapIntensity' in mm) mm.envMapIntensity = 0.9
            })
            group.add(obj)
          },
          undefined,
          () => {
            if (disposed) return
            addParametric()
            setErr('Could not load the imported 3D model — showing a placeholder.')
          },
        )
      } else {
        addParametric()
      }

      // Manual orbit + zoom (avoids the OrbitControls addon import-map).
      let rotX = -0.15
      let rotY = 0.5
      let dragging = false
      let lastX = 0
      let lastY = 0
      let moved = false
      const raycaster = new THREE.Raycaster()
      const ndc = new THREE.Vector2()

      const onDown = (e: PointerEvent) => {
        dragging = true
        moved = false
        lastX = e.clientX
        lastY = e.clientY
      }
      const onMove = (e: PointerEvent) => {
        if (!dragging) return
        const dx = e.clientX - lastX
        const dy = e.clientY - lastY
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
        rotY += dx * 0.01
        rotX = Math.max(-1.2, Math.min(1.2, rotX + dy * 0.01))
        lastX = e.clientX
        lastY = e.clientY
      }
      const onUp = (e: PointerEvent) => {
        dragging = false
        if (moved) return
        // A click (no drag): in place mode, raycast to set the selected surface's anchor.
        const p = propsRef.current
        if (!p.placeMode || !p.selectedKey || !p.onPlaceAnchor) return
        const rect = renderer.domElement.getBoundingClientRect()
        ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(ndc, camera)
        const hits = raycaster.intersectObjects(group.children, true)
        const hit = hits[0]
        if (hit) {
          const local = group.worldToLocal(hit.point.clone())
          p.onPlaceAnchor(p.selectedKey, { x: local.x, y: local.y, z: local.z })
        }
      }
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        camera.position.z = Math.max(3, Math.min(10, camera.position.z + e.deltaY * 0.002))
      }
      const el = renderer.domElement
      el.style.touchAction = 'none'
      el.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      el.addEventListener('wheel', onWheel, { passive: false })

      stateRef.current = { renderer, el, onDown, onMove, onUp, onWheel, envRT }

      const project = new THREE.Vector3()
      const camDir = new THREE.Vector3()
      let acc = 0
      const tick = () => {
        if (disposed) return
        raf = requestAnimationFrame(tick)
        group.rotation.x = rotX
        group.rotation.y = rotY
        renderer.render(scene, camera)

        acc += 1
        if (acc % 2 !== 0) return // throttle marker DOM updates
        const p = propsRef.current
        const rect = el.getBoundingClientRect()
        camera.getWorldDirection(camDir)
        const next = p.surfaces.map((s, i) => {
          const a = s.hotspot?.anchor ?? defaultAnchor(s, d, i)
          project.set(a.x, a.y, a.z)
          group.localToWorld(project)
          const front = project.clone().sub(camera.position).dot(camDir) > 0
          project.project(camera)
          return {
            key: s.key,
            label: s.label,
            x: (project.x * 0.5 + 0.5) * rect.width,
            y: (-project.y * 0.5 + 0.5) * rect.height,
            front,
          }
        })
        setMarkers(next)
      }
      tick()
    } catch {
      setErr('Could not load the 3D engine.')
    }

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      const st = stateRef.current
      if (st.el) {
        if (st.onDown) st.el.removeEventListener('pointerdown', st.onDown)
        if (st.onMove) window.removeEventListener('pointermove', st.onMove)
        if (st.onUp) window.removeEventListener('pointerup', st.onUp)
        if (st.onWheel) st.el.removeEventListener('wheel', st.onWheel)
        st.envRT?.dispose()
        st.renderer?.dispose()
        if (mount && st.el.parentNode === mount) mount.removeChild(st.el)
      }
    }
    // Re-init when topology or real dims change (surfaces/selection ride via propsRef).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topology, dims?.widthMm, dims?.heightMm, dims?.depthMm])

  return (
    <div className="relative overflow-hidden rounded-xl bg-ink-50" style={{ aspectRatio: '1 / 1' }}>
      <div ref={mountRef} className="absolute inset-0" />
      {err && <div className="absolute inset-0 flex items-center justify-center text-[12px] text-warning-700">{err}</div>}
      {/* Surface markers */}
      {markers.map((m) => {
        const active = m.key === selectedKey
        return (
          <button
            key={m.key}
            onClick={() => onSelect(m.key)}
            style={{ left: m.x, top: m.y, opacity: m.front ? 1 : 0.35, transform: 'translate(-50%,-50%)' }}
            className={`absolute z-10 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold shadow-sm transition ${active ? 'border-pink-500 bg-pink-600 text-white' : 'border-ink-200 bg-white/95 text-ink-700 hover:border-pink-400'}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : 'bg-pink-500'}`} />
            {m.label}
          </button>
        )
      })}
      {placeMode && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-pink-600/90 px-3 py-1 text-center text-[11px] font-semibold text-white">
          Click the model to place “{surfaces.find((s) => s.key === selectedKey)?.label ?? 'the surface'}”
        </div>
      )}
    </div>
  )
}
