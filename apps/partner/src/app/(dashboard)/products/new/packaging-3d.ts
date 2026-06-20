/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// 3D Packaging Studio scene — framework-agnostic three.js controller.
// Faithful port of docs/prototypes/packaging-3d-studio-spike.html: render a
// parametric package (can / jar / carton), hover+click a decorable SURFACE, and
// animate the 3D ↔ flat die-line "fold". three.js is loaded from the CDN at
// RUNTIME (no npm dependency, nothing to install) and is intentionally `any`-typed
// here so the rest of the app typechecks without @types/three. Manual orbit+zoom
// (no OrbitControls) avoids the bare-specifier `import 'three'` that the addon
// needs an import-map for.
// =============================================================================

export type TopologyKey = 'can' | 'jar' | 'box'

export interface StudioSurfaceDef {
  key: string
  label: string
  role: string
  decorable: boolean
  surfaceRole: 'pdp' | 'info' | 'other'
  defaultBleedMm?: number
  group: number
  part?: 'body' | 'lid'
}

interface PackageDef {
  name: string
  meta: string
  dims: Record<string, number>
  surfaces: StudioSurfaceDef[]
}

// Pure data (no three) so React can import it for the surface list without
// pulling in the 3D bundle.
export const PACKAGING_DEFS: Record<TopologyKey, PackageDef> = {
  can: {
    name: 'Slim drink can — 12 oz',
    meta: 'SINGLE_CONTAINER · aluminium · Ø66 × 122 mm',
    dims: { r: 0.9, h: 2.4 },
    surfaces: [
      { key: 'wrap', label: 'Body wrap', role: 'CONTAINER', decorable: true, surfaceRole: 'pdp', defaultBleedMm: 3, group: 0 },
      { key: 'lid_top', label: 'Top end', role: 'CLOSURE', decorable: false, surfaceRole: 'other', group: 1 },
      { key: 'base', label: 'Base', role: 'CONTAINER', decorable: false, surfaceRole: 'other', group: 2 },
    ],
  },
  jar: {
    name: 'Wide-mouth jar — 16 oz',
    meta: 'CAPSULE_JAR · PET body + PP lid · Ø84 × 110 mm',
    dims: { bodyR: 1.0, bodyH: 1.8, lidR: 1.06, lidH: 0.5 },
    surfaces: [
      { key: 'body_wrap', label: 'Body wrap', role: 'CONTAINER', decorable: true, surfaceRole: 'pdp', defaultBleedMm: 3, group: 0, part: 'body' },
      { key: 'body_base', label: 'Base', role: 'CONTAINER', decorable: false, surfaceRole: 'other', group: 2, part: 'body' },
      { key: 'lid_top', label: 'Lid top', role: 'CLOSURE', decorable: true, surfaceRole: 'info', defaultBleedMm: 2, group: 1, part: 'lid' },
      { key: 'lid_side', label: 'Lid skirt', role: 'CLOSURE', decorable: true, surfaceRole: 'other', defaultBleedMm: 2, group: 0, part: 'lid' },
    ],
  },
  box: {
    name: 'Tuck-end carton',
    meta: 'MULTI_CONTAINER_BOX · SBS folding carton · 90 × 60 × 140 mm',
    dims: { w: 1.3, h: 2.0, d: 0.9 },
    surfaces: [
      { key: 'front', label: 'Front panel (PDP)', role: 'CARTON', decorable: true, surfaceRole: 'pdp', defaultBleedMm: 3, group: 4 },
      { key: 'back', label: 'Back panel', role: 'CARTON', decorable: true, surfaceRole: 'info', defaultBleedMm: 3, group: 5 },
      { key: 'right', label: 'Right side', role: 'CARTON', decorable: true, surfaceRole: 'info', defaultBleedMm: 3, group: 0 },
      { key: 'left', label: 'Left side', role: 'CARTON', decorable: true, surfaceRole: 'other', defaultBleedMm: 3, group: 1 },
      { key: 'top', label: 'Top tuck', role: 'CARTON', decorable: false, surfaceRole: 'other', group: 2 },
      { key: 'bottom', label: 'Bottom tuck', role: 'CARTON', decorable: false, surfaceRole: 'other', group: 3 },
    ],
  },
}

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'

// Evade the bundler's static analysis entirely — load the ESM build at runtime.
const cdnImport: (u: string) => Promise<any> = (u) =>
  (Function('u', 'return import(u)') as (u: string) => Promise<any>)(u)

const C = { pinkSoft: '#FBD2DE', inkSoft: '#D7D9DC' }

export interface PackagingSceneHandle {
  setTopology(t: TopologyKey): void
  setFold(solid: boolean): void
  /** Continuous fold: 0 = fully open/flat net, 1 = assembled/solid. */
  setFoldAmount(t: number): void
  /** Snap the camera to a preset orbit (azimuth θ, polar φ). Stops idle spin. */
  setCameraView(theta: number, phi: number): void
  /** Multiply the orbit radius (factor < 1 zooms in, > 1 zooms out). */
  zoomBy(factor: number): void
  select(key: string | null): void
  dispose(): void
}

/** Preset camera orbits (θ azimuth, φ polar) used by the bottom view bar. */
export const CAMERA_PRESETS = {
  front: { theta: 0, phi: 1.45 },
  frontLeft: { theta: -0.7, phi: 1.3 },
  frontRight: { theta: 0.7, phi: 1.3 },
  top: { theta: 0, phi: 0.34 },
  topLeft: { theta: -0.7, phi: 0.72 },
  topRight: { theta: 0.7, phi: 0.72 },
} as const
export type CameraPreset = keyof typeof CAMERA_PRESETS

export async function createPackagingScene(
  canvas: HTMLCanvasElement,
  opts: { topology: TopologyKey; onHover?: (key: string | null) => void; onSelect?: (key: string | null) => void },
): Promise<PackagingSceneHandle> {
  const THREE: any = await cdnImport(THREE_URL)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
  const target = new THREE.Vector3(0, 0.1, 0)

  // Manual orbit state (spherical around target).
  let radius = 6.2
  let theta = 0.7 // azimuth
  let phi = 1.15 // polar
  function applyCamera() {
    const sinPhi = Math.sin(phi)
    camera.position.set(
      target.x + radius * sinPhi * Math.sin(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * sinPhi * Math.cos(theta),
    )
    camera.lookAt(target)
  }

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbfc4c9, 1.05))
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4)
  keyLight.position.set(4, 6, 5)
  scene.add(keyLight)
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.5)
  fillLight.position.set(-5, 2, -3)
  scene.add(fillLight)

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(3.6, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.06 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -1.5
  scene.add(ground)

  let group: any = null
  let pickables: any[] = []
  let pkgUpdate: ((t: number) => void) | null = null
  let activeType: TopologyKey = opts.topology
  let hovered: any = null
  let selectedKey: string | null = null
  let currentT = 1
  let targetT = 1

  const makeMat = (decorable: boolean) =>
    new THREE.MeshStandardMaterial({
      color: decorable ? C.pinkSoft : C.inkSoft,
      metalness: decorable ? 0.05 : 0.3,
      roughness: 0.5,
      emissive: 0x000000,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    })
  const panel = (geometry: any, desc: StudioSurfaceDef | null | undefined) => {
    const m = new THREE.Mesh(geometry, [makeMat(!!(desc && desc.decorable))])
    m.userData.desc = desc || null
    return m
  }
  const cylSide = (r: number, h: number) => new THREE.CylinderGeometry(r, r, h, 64, 1, true)
  const disc = (r: number) => new THREE.CircleGeometry(r, 48)
  const flat = (w: number, h: number) => new THREE.PlaneGeometry(w, h)
  const setOp = (mesh: any, o: number) => {
    mesh.material[0].opacity = o
    mesh.visible = o > 0.04
  }
  const byKey = (def: PackageDef) => Object.fromEntries(def.surfaces.map((s) => [s.key, s])) as Record<string, StudioSurfaceDef>

  function buildCan(def: PackageDef) {
    const k = byKey(def)
    const { r, h } = def.dims as { r: number; h: number }
    const W = 2 * Math.PI * r
    const o = new THREE.Group()
    const body = panel(cylSide(r, h), k.wrap)
    const top = panel(disc(r), k.lid_top); top.rotation.x = -Math.PI / 2; top.position.y = h / 2
    const base = panel(disc(r), k.base); base.rotation.x = Math.PI / 2; base.position.y = -h / 2
    const wrapF = panel(flat(W, h), k.wrap)
    const topF = panel(disc(r), k.lid_top); topF.position.set(0, h / 2 + r + 0.12, 0)
    const baseF = panel(disc(r), k.base); baseF.position.set(0, -(h / 2 + r + 0.12), 0)
    const solid = [body, top, base]
    const net = [wrapF, topF, baseF]
    o.add(...solid, ...net)
    return { object: o, meshes: [...solid, ...net], update: (t: number) => { solid.forEach((m) => setOp(m, t)); net.forEach((m) => setOp(m, 1 - t)) } }
  }

  function buildJar(def: PackageDef) {
    const k = byKey(def)
    const { bodyR, bodyH, lidR, lidH } = def.dims as { bodyR: number; bodyH: number; lidR: number; lidH: number }
    const Wb = 2 * Math.PI * bodyR
    const Wl = 2 * Math.PI * lidR
    const topY = bodyH / 2
    const o = new THREE.Group()
    const body = panel(cylSide(bodyR, bodyH), k.body_wrap)
    const base = panel(disc(bodyR), k.body_base); base.rotation.x = Math.PI / 2; base.position.y = -bodyH / 2
    const lidS = panel(cylSide(lidR, lidH), k.lid_side); lidS.position.y = topY + lidH / 2
    const lidT = panel(disc(lidR), k.lid_top); lidT.rotation.x = -Math.PI / 2; lidT.position.y = topY + lidH
    const bodyF = panel(flat(Wb, bodyH), k.body_wrap)
    const baseF = panel(disc(bodyR), k.body_base); baseF.position.set(0, -(bodyH / 2 + bodyR + 0.12), 0)
    const sx = Wb / 2 + Wl / 2 + 0.5
    const lidSF = panel(flat(Wl, lidH), k.lid_side); lidSF.position.set(sx, 0, 0)
    const lidTF = panel(disc(lidR), k.lid_top); lidTF.position.set(sx, lidH / 2 + lidR + 0.12, 0)
    const solid = [body, base, lidS, lidT]
    const net = [bodyF, baseF, lidSF, lidTF]
    o.add(...solid, ...net)
    return { object: o, meshes: [...solid, ...net], update: (t: number) => { solid.forEach((m) => setOp(m, t)); net.forEach((m) => setOp(m, 1 - t)) } }
  }

  function buildBox(def: PackageDef) {
    const k = byKey(def)
    const { w, h, d } = def.dims as { w: number; h: number; d: number }
    const inner = new THREE.Group()
    const gFront = new THREE.Group(); inner.add(gFront)
    const front = panel(flat(w, h), k.front); front.position.set(w / 2, 0, 0); gFront.add(front)
    const gRight = new THREE.Group(); gRight.position.set(w, 0, 0); gFront.add(gRight)
    const right = panel(flat(d, h), k.right); right.position.set(d / 2, 0, 0); gRight.add(right)
    const gBack = new THREE.Group(); gBack.position.set(d, 0, 0); gRight.add(gBack)
    const back = panel(flat(w, h), k.back); back.position.set(w / 2, 0, 0); gBack.add(back)
    const gLeft = new THREE.Group(); gLeft.position.set(w, 0, 0); gBack.add(gLeft)
    const left = panel(flat(d, h), k.left); left.position.set(d / 2, 0, 0); gLeft.add(left)
    const gTop = new THREE.Group(); gTop.position.set(0, h / 2, 0); gFront.add(gTop)
    const top = panel(flat(w, d), k.top); top.position.set(w / 2, d / 2, 0); gTop.add(top)
    const gBot = new THREE.Group(); gBot.position.set(0, -h / 2, 0); gFront.add(gBot)
    const bottom = panel(flat(w, d), k.bottom); bottom.position.set(w / 2, -d / 2, 0); gBot.add(bottom)
    const o = new THREE.Group(); o.add(inner)
    const box3 = new THREE.Box3()
    const ctr = new THREE.Vector3()
    return {
      object: o,
      meshes: [front, right, back, left, top, bottom],
      update: (t: number) => {
        const a = (Math.PI / 2) * t
        gRight.rotation.y = -a; gBack.rotation.y = -a; gLeft.rotation.y = -a
        gTop.rotation.x = -a; gBot.rotation.x = a
        inner.position.set(0, 0, 0)
        box3.setFromObject(inner); box3.getCenter(ctr)
        inner.position.set(-ctr.x, -ctr.y, -ctr.z)
      },
    }
  }

  const BUILDERS: Record<TopologyKey, (def: PackageDef) => any> = { can: buildCan, jar: buildJar, box: buildBox }

  function buildPackage(type: TopologyKey) {
    if (group) { scene.remove(group); group = null }
    pickables = []; hovered = null; selectedKey = null
    const def = PACKAGING_DEFS[type]
    const built = BUILDERS[type](def)
    pkgUpdate = built.update
    pickables = built.meshes
    group = new THREE.Group(); group.add(built.object); scene.add(group)
    pkgUpdate!(currentT)
    opts.onSelect?.(null)
  }

  // --- picking ---------------------------------------------------------------
  const ray = new THREE.Raycaster()
  const ptr = new THREE.Vector2()
  const descOf = (mesh: any): StudioSurfaceDef | null => mesh.userData.desc

  function refreshHighlights() {
    pickables.forEach((mesh) => {
      const d = descOf(mesh)
      const mat = mesh.material[0]
      if (!d) { mat.emissive.setHex(0x000000); return }
      mat.emissive.setHex(d.key === selectedKey ? 0x7a0f30 : 0x000000)
    })
    if (hovered) {
      const d = descOf(hovered)
      if (d && d.decorable && d.key !== selectedKey) hovered.material[0].emissive.setHex(0x4d0a20)
    }
  }

  function pick(ev: PointerEvent): StudioSurfaceDef | null {
    const r = canvas.getBoundingClientRect()
    ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1
    ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1
    ray.setFromCamera(ptr, camera)
    const hits = ray.intersectObjects(pickables, false)
    for (const hit of hits) {
      if (hit.object.visible === false) continue
      const d = descOf(hit.object)
      hovered = hit.object
      canvas.style.cursor = d && d.decorable ? 'pointer' : 'grab'
      return d
    }
    hovered = null
    canvas.style.cursor = 'grab'
    return null
  }

  // --- pointer: orbit + zoom + hover/select ---------------------------------
  let dragging = false
  let moved = false
  let lastX = 0
  let lastY = 0
  let autoSpin = true
  function onDown(e: PointerEvent) { dragging = true; moved = false; autoSpin = false; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture?.(e.pointerId) }
  function onMove(e: PointerEvent) {
    if (dragging) {
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
      lastX = e.clientX; lastY = e.clientY
      theta -= dx * 0.006
      phi = Math.max(0.25, Math.min(Math.PI - 0.25, phi - dy * 0.006))
      return
    }
    const d = pick(e)
    opts.onHover?.(d ? d.key : null)
  }
  function onUp(e: PointerEvent) {
    if (dragging && !moved) {
      const d = pick(e)
      if (d && d.decorable) { selectedKey = d.key; opts.onSelect?.(d.key) }
    }
    dragging = false
    canvas.releasePointerCapture?.(e.pointerId)
  }
  function onLeave() { hovered = null; opts.onHover?.(null) }
  function onWheel(e: WheelEvent) { e.preventDefault(); radius = Math.max(2.8, Math.min(12, radius * (1 + e.deltaY * 0.0012))) }

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  function resize() {
    const parent = canvas.parentElement
    if (!parent) return
    const r = parent.getBoundingClientRect()
    renderer.setSize(r.width, r.height, false)
    camera.aspect = r.width / r.height
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  if (canvas.parentElement) ro.observe(canvas.parentElement)

  let raf = 0
  let disposed = false
  function loop() {
    if (disposed) return
    raf = requestAnimationFrame(loop)
    if (Math.abs(targetT - currentT) > 0.0005) currentT += (targetT - currentT) * 0.1
    else currentT = targetT
    if (pkgUpdate) pkgUpdate(currentT)
    if (group && autoSpin && !dragging) group.rotation.y += 0.0015 // gentle idle spin (until first interaction)
    applyCamera()
    refreshHighlights()
    renderer.render(scene, camera)
  }

  buildPackage(activeType)
  resize()
  loop()

  return {
    setTopology(t) { if (t !== activeType) { activeType = t; buildPackage(t) } },
    setFold(solid) { targetT = solid ? 1 : 0 },
    setFoldAmount(t) { targetT = Math.max(0, Math.min(1, t)) },
    setCameraView(t, p) { autoSpin = false; if (group) group.rotation.y = 0; theta = t; phi = p },
    zoomBy(f) { radius = Math.max(2.8, Math.min(12, radius * f)) },
    select(key) { selectedKey = key },
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('wheel', onWheel)
      renderer.dispose?.()
    },
  }
}
