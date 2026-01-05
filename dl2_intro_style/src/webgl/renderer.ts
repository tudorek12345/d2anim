import * as THREE from 'three'

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

const fragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec3 uIntensity;
  uniform float uGlitch;
  uniform float uFlash;
  uniform float uAberration;
  uniform float uNoiseSeed;

  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amp * noise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return value;
  }

  vec3 baseGradient(vec2 uv) {
    vec3 deep = vec3(0.02, 0.03, 0.04);
    vec3 mid = vec3(0.05, 0.07, 0.09);
    return mix(deep, mid, smoothstep(0.0, 1.0, uv.y));
  }

  void main() {
    vec2 uv = vUv;
    vec2 centered = uv - 0.5;
    float t = uTime * 0.05;

    float fogLayer = fbm(uv * 3.0 + vec2(t, t * 0.6) + uNoiseSeed);
    float fogLayer2 = fbm(uv * 7.5 - vec2(t * 1.6, t * 1.2));
    float haze = mix(fogLayer, fogLayer2, 0.5);

    vec3 color = baseGradient(uv);
    color += haze * vec3(0.08, 0.1, 0.12) * uIntensity.x;

    float leak = smoothstep(0.6, 1.0, fbm(uv * 1.2 + vec2(t * 0.6, -t * 0.4)));
    color += leak * vec3(0.08, 0.05, 0.03);

    float glitchBand = smoothstep(0.4, 0.5, sin((uv.y + uTime * 0.6) * 24.0));
    float glitchOffset = (hash(vec2(floor(uv.y * 120.0), uTime)) - 0.5) * 0.03 * uGlitch;
    uv.x += glitchOffset * glitchBand;

    vec2 aberr = uAberration * 0.003 * vec2(1.0, -1.0);
    vec3 colR = baseGradient(uv + aberr);
    vec3 colG = baseGradient(uv);
    vec3 colB = baseGradient(uv - aberr);
    color = mix(color, vec3(colR.r, colG.g, colB.b), uAberration);

    float vignette = smoothstep(0.9, 0.25, length(centered));
    color *= vignette;

    float scan = sin(uv.y * uResolution.y * 1.3) * 0.02 * uIntensity.z;
    color -= scan;

    float grain = (hash(uv * uResolution + uTime * 120.0) - 0.5) * 0.08 * uIntensity.y;
    color += grain;

    if (uFlash > 0.0) {
      float flash = uFlash * 0.6;
      float lum = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(color, vec3(lum), flash);
      color += flash;
    }

    gl_FragColor = vec4(color, 1.0);
  }
`

type IntensityOptions = {
  fog?: number
  grain?: number
  scanlines?: number
}

type Burst = {
  start: number
  duration: number
  strength: number
}

export class WebGLBackground {
  private canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private mesh: THREE.Mesh
  private uniforms: Record<string, { value: unknown }>
  private running = false
  private rafId = 0
  private glitchBurst: Burst | null = null
  private flashBurst: Burst | null = null
  private aberrationBurst: Burst | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    this.uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uIntensity: { value: new THREE.Vector3(1.0, 0.7, 0.5) },
      uGlitch: { value: 0 },
      uFlash: { value: 0 },
      uAberration: { value: 0 },
      uNoiseSeed: { value: Math.random() * 10 },
    }

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
    })

    const geometry = new THREE.PlaneGeometry(2, 2)
    this.mesh = new THREE.Mesh(geometry, material)
    this.scene.add(this.mesh)

    this.handleResize = this.handleResize.bind(this)
    window.addEventListener('resize', this.handleResize)
    this.handleResize()
  }

  start() {
    if (this.running) {
      return
    }
    this.running = true
    this.loop()
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  renderAt(timeMs: number) {
    this.uniforms.uTime.value = timeMs * 0.001
    this.uniforms.uGlitch.value = 0
    this.uniforms.uFlash.value = 0
    this.uniforms.uAberration.value = 0
    this.renderer.render(this.scene, this.camera)
  }

  setIntensity(options: IntensityOptions) {
    const value = this.uniforms.uIntensity.value as THREE.Vector3
    if (options.fog !== undefined) {
      value.x = options.fog
    }
    if (options.grain !== undefined) {
      value.y = options.grain
    }
    if (options.scanlines !== undefined) {
      value.z = options.scanlines
    }
  }

  burstGlitch(strength: number, durationMs: number) {
    this.glitchBurst = {
      start: performance.now(),
      duration: durationMs,
      strength,
    }
  }

  burstFlash(strength: number, durationMs: number) {
    this.flashBurst = {
      start: performance.now(),
      duration: durationMs,
      strength,
    }
  }

  burstAberration(strength: number, durationMs: number) {
    this.aberrationBurst = {
      start: performance.now(),
      duration: durationMs,
      strength,
    }
  }

  dispose() {
    this.stop()
    window.removeEventListener('resize', this.handleResize)
    this.mesh.geometry.dispose()
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach((mat) => mat.dispose())
    } else {
      this.mesh.material.dispose()
    }
    this.renderer.dispose()
  }

  private handleResize() {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(width, height, false)
    const res = this.uniforms.uResolution.value as THREE.Vector2
    res.set(width * dpr, height * dpr)
  }

  private updateBursts(now: number) {
    const glitch = this.glitchBurst
    if (glitch) {
      const progress = (now - glitch.start) / glitch.duration
      if (progress >= 1) {
        this.uniforms.uGlitch.value = 0
        this.glitchBurst = null
      } else {
        this.uniforms.uGlitch.value = glitch.strength * (1 - progress)
      }
    }

    const flash = this.flashBurst
    if (flash) {
      const progress = (now - flash.start) / flash.duration
      if (progress >= 1) {
        this.uniforms.uFlash.value = 0
        this.flashBurst = null
      } else {
        this.uniforms.uFlash.value = flash.strength * (1 - progress)
      }
    }

    const aberr = this.aberrationBurst
    if (aberr) {
      const progress = (now - aberr.start) / aberr.duration
      if (progress >= 1) {
        this.uniforms.uAberration.value = 0
        this.aberrationBurst = null
      } else {
        this.uniforms.uAberration.value = aberr.strength * (1 - progress)
      }
    }
  }

  private loop = () => {
    if (!this.running) {
      return
    }
    this.rafId = requestAnimationFrame((now) => {
      this.uniforms.uTime.value = now * 0.001
      this.updateBursts(now)
      this.renderer.render(this.scene, this.camera)
      this.loop()
    })
  }
}
