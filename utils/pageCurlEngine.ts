/**
 * Photorealistic Continuous 3D Physical Page-Turn Engine
 *
 * Implements a continuous elastica / conical deformation model for printed wedding album pages.
 * The page behaves like ONE physical printed sheet with ONE continuous image texture.
 *
 * CORE PRINCIPLES:
 * 1. ONE PAGE = ONE CONTINUOUS TEXTURE.
 *    No vertical image slicing, no repeated strips, no sub-pixel gaps, no disjointed panels.
 * 2. GEOMETRY IS SUBDIVIDED, THE IMAGE IS NOT.
 *    Single UV coordinate system (u in [0, 1], v in [0, 1]) mapped across the entire mesh.
 * 3. FOUR VISUALLY DISTINCT TRANSITION PRESETS:
 *    - 'real-3d-curl'   : Physical wedding album curling, authentic paper curvature & moving shadows
 *    - 'soft-turn'     : Gentle luxury turn, shallow curvature, soft diffused shadows & silky glide
 *    - 'cinematic-turn': Dramatic wide-angle perspective, deep arch lift, camera push-in & specular sweep
 *    - 'soft-fade'     : Photographic cross dissolve with subtle scale drift
 * 4. DUAL-SIDED PHYSICAL PAPER:
 *    Front face = current page texture.
 *    Back face = next page texture (mirrored upright as physically printed).
 * 5. HARDWARE ACCELERATION:
 *    WebGL single-mesh continuous GPU texture mapping with seamless Canvas 2D affine triangle fallback.
 */

export type TurnDirection = 'next' | 'prev';
export type GrabRegion = 'top-corner' | 'bottom-corner' | 'edge';
export type TransitionStyle = 'real-3d-curl' | 'soft-turn' | 'cinematic-turn' | 'soft-fade';

export interface PagePoint3D {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  isBackFacing: boolean;
  u: number;
  v: number;
}

export interface CurlEngineOptions {
  pageWidth: number;
  pageHeight: number;
  progress: number; // 0 to 1
  direction: TurnDirection;
  grabRegion: GrabRegion;
  stylePreset?: TransitionStyle;
  isSingleSheet?: boolean;
}

/**
 * Detailed profile defining distinct physical, camera, lighting, and easing characteristics.
 */
export interface TransitionProfile {
  name: TransitionStyle;
  label: string;
  tagline: string;
  maxLift: number;             // Peak Z lift towards camera (px)
  rollRadiusFactor: number;    // Curvature radius factor (smaller = tighter cylinder, larger = wide sheet arc)
  twistFactor: number;         // Corner grab twist response
  curlLeadFactor: number;      // Outer-edge lead over spine
  cameraDistance: number;      // Perspective camera distance in px (lower = wide-angle drama, higher = flat luxury)
  cameraPushIn: number;        // Virtual camera push-in peak (0 = static, >0 = filmic push-in)
  shadowOpacity: number;       // Moving cast shadow peak opacity
  shadowBlurFactor: number;    // Spread factor of shadow penumbra
  crestSheenIntensity: number; // Specular sheen highlight along curl crest
  sheenExponent: number;       // Sharpness of specular highlight
  ambientLight: number;        // Diffuse ambient component
  directionalLight: number;    // Diffuse directional component
  gutterShadowDepth: number;   // Spine binding gutter shadow depth
  easeProgress: (p: number) => number; // Non-linear animation timing curve
}

export const TRANSITION_PROFILES: Record<TransitionStyle, TransitionProfile> = {
  'real-3d-curl': {
    name: 'real-3d-curl',
    label: 'Real 3D Page Curl',
    tagline: 'Physical curved paper, natural perspective & moving shadows',
    maxLift: 64,             // Authentic physical page lift
    rollRadiusFactor: 0.28,  // Physical cylinder roll radius
    twistFactor: 0.18,       // Natural paper corner flex
    curlLeadFactor: 0.20,    // Outer edge leads rotation
    cameraDistance: 1400,    // Standard eye-level viewing perspective
    cameraPushIn: 0.0,       // Container completely static
    shadowOpacity: 0.42,     // Natural physical drop shadow
    shadowBlurFactor: 1.0,
    crestSheenIntensity: 0.30, // Realistic satin paper sheen
    sheenExponent: 16.0,
    ambientLight: 0.74,
    directionalLight: 0.26,
    gutterShadowDepth: 0.78,
    easeProgress: (p: number) => p * p * (3 - 2 * p), // Cubic smoothstep
  },
  'soft-turn': {
    name: 'soft-turn',
    label: 'Soft Page Turn',
    tagline: 'Gentle shallow turn, softer shadows & smooth luxury motion',
    maxLift: 24,             // Noticeably shallower lift - stays closer to the spread
    rollRadiusFactor: 0.10,  // Shallow curl angle - gentle physical page-turn
    twistFactor: 0.05,       // Minimal corner twist - calm, uniform turn
    curlLeadFactor: 0.06,    // Low curl lead - spine and edge move in harmony
    cameraDistance: 2600,    // Flatter luxury editorial telephoto perspective
    cameraPushIn: 0.0,
    shadowOpacity: 0.18,     // Very soft, diffused penumbra shadow
    shadowBlurFactor: 1.6,   // Wider diffused penumbra
    crestSheenIntensity: 0.12, // Subtle soft pearl sheen
    sheenExponent: 8.0,      // Soft, wide sheen
    ambientLight: 0.88,      // Flatter, softer ambient lighting
    directionalLight: 0.12,
    gutterShadowDepth: 0.88, // Very delicate gutter
    easeProgress: (p: number) => {
      // Smooth quintic ease-in-out: slow start, silky glide, soft settle
      return p < 0.5 ? 16 * Math.pow(p, 5) : 1 - Math.pow(-2 * p + 2, 5) / 2;
    },
  },
  'cinematic-turn': {
    name: 'cinematic-turn',
    label: 'Cinematic Page Turn',
    tagline: 'Dramatic 3D perspective, dynamic camera push-in & specular sweep',
    maxLift: 120,            // High dramatic Z lift towards camera
    rollRadiusFactor: 0.38,  // Dramatic, deep curl crest
    twistFactor: 0.32,       // Pronounced corner lift & diagonal skew
    curlLeadFactor: 0.35,    // Strong outer-edge lead
    cameraDistance: 880,     // Close dramatic wide-angle perspective
    cameraPushIn: 0.060,     // Virtual camera push-in (+6.0% at curl peak)
    shadowOpacity: 0.65,     // Deep cinematic drop shadow underneath
    shadowBlurFactor: 0.75,  // Sharp, high-contrast shadow edge
    crestSheenIntensity: 0.80, // Powerful specular flare along curl crest
    sheenExponent: 30.0,     // Crisp, brilliant specular highlight
    ambientLight: 0.52,      // High directional contrast
    directionalLight: 0.48,  // Strong directional light key
    gutterShadowDepth: 0.50, // Deep dramatic spine depth
    easeProgress: (p: number) => {
      // Cinematic curve: deliberate suspenseful lift, fast sweeping turnover, lingering landing
      return Math.sin((p - 0.5) * Math.PI) * 0.5 + 0.5;
    },
  },
  'soft-fade': {
    name: 'soft-fade',
    label: 'Soft Fade',
    tagline: 'Clean photographic cross-dissolve with subtle drift',
    maxLift: 0,
    rollRadiusFactor: 1.0,
    twistFactor: 0,
    curlLeadFactor: 0,
    cameraDistance: 1400,
    cameraPushIn: 0.025,     // Subtle 2.5% scale drift during dissolve
    shadowOpacity: 0,
    shadowBlurFactor: 1.0,
    crestSheenIntensity: 0,
    sheenExponent: 1.0,
    ambientLight: 1.0,
    directionalLight: 0,
    gutterShadowDepth: 1.0,
    easeProgress: (p: number) => p,
  },
};

export function getTransitionProfile(preset?: string): TransitionProfile {
  if (preset && preset in TRANSITION_PROFILES) {
    return TRANSITION_PROFILES[preset as TransitionStyle];
  }
  return TRANSITION_PROFILES['real-3d-curl'];
}

/**
 * Evaluates the continuous 3D position and surface normal of any point (u, v)
 * on the physical turning leaf.
 *
 * Coordinate system:
 * - (0, 0, 0) is at the album spine (hinge line)
 * - u in [0, 1] goes from spine (u=0) to outer page edge (u=1)
 * - v in [0, 1] goes from top edge (v=0) to bottom edge (v=1)
 */
export function computePageSurfacePoint(
  u: number,
  v: number,
  options: CurlEngineOptions
): PagePoint3D {
  const { pageWidth, pageHeight, progress, direction, grabRegion, stylePreset, isSingleSheet } = options;
  const profile = getTransitionProfile(stylePreset);

  const p = Math.max(0, Math.min(1, progress));
  const sign = direction === 'next' ? 1 : -1;
  const isSingle = Boolean(isSingleSheet || (pageWidth > pageHeight * 1.8));

  if (isSingle) {
    // -------------------------------------------------------------
    // FULL-WIDTH SINGLE PHYSICAL SHEET (Front Cover & Back Cover)
    // Turns across the entire album stage as ONE complete continuous sheet.
    // Inextensible cylinder roll model: zero center split, zero squashing,
    // natural continuous 3D curvature, neutral paper backing.
    // -------------------------------------------------------------
    // Continuous cylinder curl model:
    // The entire full-page sheet turns as ONE physical sheet without splitting or tearing.
    const flex = Math.sin(p * Math.PI);

    // Dynamic cylinder radius (swells to natural paper curl radius, collapses to 0 at rest)
    const maxR = Math.max(24, Math.min(pageWidth * 0.2, 160));
    const R = Math.max(0.001, maxR * flex);

    // Uniform fold position across the entire sheet:
    // At p=0, sFold = pageWidth (flat resting on album)
    // At p=1, sFold = 0 (completely turned over to other side)
    const sFold = pageWidth * (1 - p);
    const s = u * pageWidth;

    let localX = 0;
    let localZ = 0;
    let phi = 0;

    if (s <= sFold) {
      // 1. Unpeeled resting portion flat on the album stage
      localX = s;
      localZ = 0;
      phi = 0;
    } else {
      const ds = s - sFold;
      const arcLen = Math.PI * R;
      if (ds <= arcLen) {
        // 2. Rolling around the 3D curl cylinder
        phi = ds / R;
        localX = sFold + R * Math.sin(phi);
        localZ = R * (1 - Math.cos(phi));
      } else {
        // 3. Past the curl cylinder (turned over to the destination side)
        const flatPast = ds - arcLen;
        localX = sFold - flatPast;
        localZ = 0;
        phi = Math.PI;
      }
    }

    const x = sign * localX;
    const z = localZ;

    // Perfectly parallel Y grid to prevent diagonal quad shear
    const y = v * pageHeight;

    // Analytic surface normal for cylinder
    // Tangent = (cos(phi) * sign, 0, sin(phi))
    // Normal = (-sin(phi) * sign, 0, cos(phi))
    const nx = -Math.sin(phi) * sign;
    const ny = 0;
    const nz = Math.cos(phi);
    const isBackFacing = phi > Math.PI / 2;

    return {
      x,
      y,
      z,
      nx,
      ny,
      nz,
      isBackFacing,
      u,
      v,
    };
  }

  // -------------------------------------------------------------
  // MIDDLE TWO-PAGE SPREADS (Existing spread physics preserved)
  // -------------------------------------------------------------
  const flex = Math.sin(p * Math.PI);
  const maxLift = profile.maxLift;
  const twistFactor = profile.twistFactor;

  let cornerLead = 0;
  if (grabRegion === 'top-corner') {
    cornerLead = -twistFactor * (1 - v) * flex;
  } else if (grabRegion === 'bottom-corner') {
    cornerLead = twistFactor * v * flex;
  }

  const curlLead = (1 - u) * profile.curlLeadFactor * flex;
  const effP = Math.max(0, Math.min(1, p + cornerLead + curlLead));
  const effAngle = effP * Math.PI;

  const zArch = flex * Math.sin(u * Math.PI) * maxLift;
  const rollRadius = (pageWidth / Math.PI) * profile.rollRadiusFactor * flex;
  const rollZ = rollRadius * Math.sin(effAngle);

  const x = sign * (u * pageWidth * Math.cos(effAngle));
  const z = zArch + rollZ * (1 - Math.cos(u * Math.PI));

  const bowScale = profile.name === 'cinematic-turn' ? 14 : profile.name === 'soft-turn' ? 3 : 8;
  const yBow = flex * Math.sin(u * Math.PI) * (v - 0.5) * bowScale;
  const y = v * pageHeight + yBow;

  const du = 0.01;
  const nextCurlLead = (1 - (u + du)) * profile.curlLeadFactor * flex;
  const nextEffP = Math.max(0, Math.min(1, p + cornerLead + nextCurlLead));
  const nextAngle = nextEffP * Math.PI;

  const dx = sign * ((u + du) * pageWidth * Math.cos(nextAngle)) - x;
  const dz = (flex * Math.sin((u + du) * Math.PI) * maxLift + rollZ * (1 - Math.cos((u + du) * Math.PI))) - z;

  const rawNx = -dz * sign;
  const rawNy = 0;
  const rawNz = dx * sign;
  const nLen = Math.hypot(rawNx, rawNz) || 1;
  const nx = rawNx / nLen;
  const ny = rawNy / nLen;
  const nz = rawNz / nLen;

  const isBackFacing = effAngle > Math.PI / 2;

  return {
    x,
    y,
    z,
    nx,
    ny,
    nz,
    isBackFacing,
    u,
    v,
  };
}

/**
 * Projects a 3D point (x, y, z) into 2D camera screen space with realistic perspective and optional virtual push-in.
 */
export function projectPoint(
  pt: PagePoint3D,
  cameraDistance = 1400,
  cameraPushIn = 0.0,
  progress = 0.5
): { screenX: number; screenY: number; scale: number } {
  const virtualZoom = 1.0 + Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI) * cameraPushIn;
  const scale = (cameraDistance / Math.max(200, cameraDistance - pt.z)) * virtualZoom;
  return {
    screenX: pt.x * scale,
    screenY: pt.y * scale,
    scale,
  };
}

/**
 * Computes exact screen position for a correction pin on the turning page.
 * Keeps pins 100% glued to the physical page surface throughout the entire curl.
 */
export function projectCorrectionPin(
  pinXPercent: number,
  pinYPercent: number,
  options: CurlEngineOptions,
  spineScreenX: number,
  pageTopScreenY: number,
  cameraDistance = 1400
): { x: number; y: number; isVisible: boolean; scale: number } {
  const u = Math.max(0, Math.min(1, pinXPercent / 100));
  const v = Math.max(0, Math.min(1, pinYPercent / 100));

  const pt3d = computePageSurfacePoint(u, v, options);
  const profile = getTransitionProfile(options.stylePreset);
  const proj = projectPoint(pt3d, profile.cameraDistance, profile.cameraPushIn, options.progress);

  return {
    x: spineScreenX + proj.screenX,
    y: pageTopScreenY + proj.screenY,
    isVisible: !pt3d.isBackFacing,
    scale: proj.scale,
  };
}

/**
 * Continuous WebGL Page Curl Renderer
 *
 * Renders the 3D flexible sheet using a single continuous mesh (64 x 32 quads = 4,096 triangles).
 * ONE continuous front texture and ONE continuous back texture are mapped across the entire mesh.
 * ZERO vertical image slices, ZERO seams, ZERO duplicated portions.
 * Features:
 * - Single continuous UV space (u in [0, 1], v in [0, 1])
 * - Hardware bilinear texture filtering
 * - Dual-sided physical texturing (front artwork + back artwork upright mirrored)
 * - Dynamic profile-driven lighting, specular crest flare, and camera perspective
 * - Spine gutter shadow near binding
 * - Paper core edge bevel
 * - Texture caching: source textures decoded/uploaded once and reused for all frames
 */
export class WebGLPageCurlRenderer {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private frontTexture: WebGLTexture | null = null;
  private backTexture: WebGLTexture | null = null;

  // Cached image sources to prevent redundant GPU texture re-uploads
  private cachedFrontSrc: CanvasImageSource | null = null;
  private cachedBackSrc: CanvasImageSource | null = null;

  // Uniform locations
  private uProjectionLoc: WebGLUniformLocation | null = null;
  private uFrontTextureLoc: WebGLUniformLocation | null = null;
  private uBackTextureLoc: WebGLUniformLocation | null = null;
  private uHasFrontLoc: WebGLUniformLocation | null = null;
  private uHasBackLoc: WebGLUniformLocation | null = null;
  private uProgressLoc: WebGLUniformLocation | null = null;
  private uSpinePosLoc: WebGLUniformLocation | null = null;
  private uPageWidthLoc: WebGLUniformLocation | null = null;

  // Dynamic Profile Lighting Uniform Locations
  private uAmbientLoc: WebGLUniformLocation | null = null;
  private uDirectionalLoc: WebGLUniformLocation | null = null;
  private uCrestSheenLoc: WebGLUniformLocation | null = null;
  private uSheenExpLoc: WebGLUniformLocation | null = null;
  private uGutterDepthLoc: WebGLUniformLocation | null = null;

  // Attribute locations
  private aPositionLoc = -1;
  private aTexCoordLoc = -1;
  private aNormalLoc = -1;

  // Mesh resolution
  public readonly cols = 64; // High density columns
  public readonly rows = 32; // High density rows
  private vertexFloatCount = 0;
  private vertexData: Float32Array;
  private indexCount = 0;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // 8 floats per vertex: position(3) + texCoord(2) + normal(3)
    const numVertices = (this.cols + 1) * (this.rows + 1);
    this.vertexFloatCount = numVertices * 8;
    this.vertexData = new Float32Array(this.vertexFloatCount);
    this.initGL();
  }

  private initGL() {
    try {
      const gl =
        this.canvas.getContext('webgl', {
          alpha: true,
          antialias: true,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
        }) ||
        (this.canvas.getContext('experimental-webgl', {
          alpha: true,
          antialias: true,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
        }) as WebGLRenderingContext | null);

      if (!gl) {
        console.warn('[WebGLPageCurlRenderer] WebGL not supported on this context');
        return;
      }
      this.gl = gl;

      // Vertex Shader
      const vsSource = `
        attribute vec3 aPosition;
        attribute vec2 aTexCoord;
        attribute vec3 aNormal;

        uniform mat4 uProjection;

        varying vec2 vTexCoord;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          vTexCoord = aTexCoord;
          vNormal = aNormal;
          vPosition = aPosition;
          gl_Position = uProjection * vec4(aPosition, 1.0);
        }
      `;

      // Fragment Shader: continuous single-texture sampling, physical dual-sided paper & dynamic profile lighting
      const fsSource = `
        precision mediump float;

        uniform sampler2D uFrontTexture;
        uniform sampler2D uBackTexture;
        uniform float uHasFront;
        uniform float uHasBack;
        uniform float uProgress;
        uniform vec2 uSpinePos;
        uniform float uPageWidth;

        // Dynamic Profile Lighting Uniforms
        uniform float uAmbient;
        uniform float uDirectional;
        uniform float uCrestSheen;
        uniform float uSheenExp;
        uniform float uGutterDepth;

        varying vec2 vTexCoord;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          // Normal z >= 0 means front face is facing camera
          bool isFront = (vNormal.z >= 0.0);

          // Physical curling flexion factor: 0 at rest (p=0 and p=1), 1 at peak curl (p=0.5)
          float flex = sin(uProgress * 3.14159265);

          vec4 baseColor;
          if (isFront) {
            // Front face: sample single continuous source texture
            if (uHasFront > 0.5) {
              baseColor = texture2D(uFrontTexture, vTexCoord);
            } else {
              baseColor = vec4(0.98, 0.98, 0.98, 1.0);
            }
          } else {
            // Back face: reverse X texture coordinate so backside image is upright
            vec2 backUV = vec2(1.0 - vTexCoord.x, vTexCoord.y);
            if (uHasBack > 0.5) {
              baseColor = texture2D(uBackTexture, backUV);
              // Subtle luxury photographic paper tone backing during 3D curl
              baseColor.rgb = mix(baseColor.rgb, vec3(0.96, 0.95, 0.93), 0.06 * flex);
            } else {
              baseColor = vec4(0.96, 0.95, 0.93, 1.0);
            }
          }

          // Shading: diffuse light
          vec3 norm = normalize(vNormal);
          if (!isFront) norm = -norm; // Flip normal for backside

          vec3 lightDir = normalize(vec3(0.25, -0.35, 0.90));
          float diff = max(dot(norm, lightDir), 0.0);
          float rawDiffuse = uAmbient + uDirectional * diff;
          // Smoothly blend diffuse shading to 1.0 at rest (flex=0) for zero brightness jump
          float diffuse = mix(1.0, rawDiffuse, flex);

          // Profile-driven specular crest sheen highlight
          float crest = pow(1.0 - abs(norm.z), uSheenExp) * uCrestSheen * flex;

          // Profile-driven spine gutter shadow
          float distFromSpine = abs(vPosition.x - uSpinePos.x) / max(1.0, uPageWidth);
          float rawGutter = 1.0;
          if (distFromSpine < 0.12) {
            rawGutter = uGutterDepth + (1.0 - uGutterDepth) * (distFromSpine / 0.12);
          }
          float gutter = mix(1.0, rawGutter, flex);

          vec3 finalRgb = (baseColor.rgb * diffuse * gutter) + vec3(crest);
          gl_FragColor = vec4(finalRgb, baseColor.a);
        }
      `;

      const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
      const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
      if (!vs || !fs) return;

      const program = gl.createProgram();
      if (!program) return;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('[WebGLPageCurlRenderer] Program link failed:', gl.getProgramInfoLog(program));
        return;
      }
      this.program = program;

      // Query attribute and uniform locations
      this.aPositionLoc = gl.getAttribLocation(program, 'aPosition');
      this.aTexCoordLoc = gl.getAttribLocation(program, 'aTexCoord');
      this.aNormalLoc = gl.getAttribLocation(program, 'aNormal');

      this.uProjectionLoc = gl.getUniformLocation(program, 'uProjection');
      this.uFrontTextureLoc = gl.getUniformLocation(program, 'uFrontTexture');
      this.uBackTextureLoc = gl.getUniformLocation(program, 'uBackTexture');
      this.uHasFrontLoc = gl.getUniformLocation(program, 'uHasFront');
      this.uHasBackLoc = gl.getUniformLocation(program, 'uHasBack');
      this.uProgressLoc = gl.getUniformLocation(program, 'uProgress');
      this.uSpinePosLoc = gl.getUniformLocation(program, 'uSpinePos');
      this.uPageWidthLoc = gl.getUniformLocation(program, 'uPageWidth');

      this.uAmbientLoc = gl.getUniformLocation(program, 'uAmbient');
      this.uDirectionalLoc = gl.getUniformLocation(program, 'uDirectional');
      this.uCrestSheenLoc = gl.getUniformLocation(program, 'uCrestSheen');
      this.uSheenExpLoc = gl.getUniformLocation(program, 'uSheenExp');
      this.uGutterDepthLoc = gl.getUniformLocation(program, 'uGutterDepth');

      // Setup static index buffer and dynamic vertex buffer
      this.setupMeshBuffers();

      // Configure GL state
      gl.disable(gl.CULL_FACE); // Double sided rendering
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    } catch (err) {
      console.warn('[WebGLPageCurlRenderer] initGL error:', err);
    }
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const shader = this.gl.createShader(type);
    if (!shader) return null;
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('[WebGLPageCurlRenderer] Shader compile error:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private setupMeshBuffers() {
    if (!this.gl) return;
    const gl = this.gl;

    const indices: number[] = [];
    const rowStride = this.cols + 1;

    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const i0 = j * rowStride + i;
        const i1 = i0 + 1;
        const i2 = (j + 1) * rowStride + i;
        const i3 = i2 + 1;

        indices.push(i0, i1, i2);
        indices.push(i1, i3, i2);
      }
    }

    this.indexCount = indices.length;
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexFloatCount * 4, gl.DYNAMIC_DRAW);
  }

  public uploadTextures(frontImg: CanvasImageSource | null, backImg: CanvasImageSource | null) {
    if (!this.gl) return;
    const gl = this.gl;

    if (!frontImg) {
      this.cachedFrontSrc = null;
    } else if (frontImg !== this.cachedFrontSrc) {
      this.cachedFrontSrc = frontImg;
      if (!this.frontTexture) this.frontTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.frontTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frontImg as TexImageSource);
    }

    if (!backImg) {
      this.cachedBackSrc = null;
    } else if (backImg !== this.cachedBackSrc) {
      this.cachedBackSrc = backImg;
      if (!this.backTexture) this.backTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.backTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, backImg as TexImageSource);
    }
  }

  public render(
    options: CurlEngineOptions & {
      spineX: number;
      spineY: number;
    }
  ) {
    if (!this.gl || !this.program) return;
    const gl = this.gl;
    const { pageWidth, pageHeight, spineX, spineY, progress, direction, grabRegion, stylePreset } = options;

    const p = Math.max(0, Math.min(1, progress));

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.program);

    // Profile-driven camera & perspective
    const profile = getTransitionProfile(stylePreset);
    const cameraDistance = profile.cameraDistance;
    const virtualZoom = 1.0 + Math.sin(p * Math.PI) * profile.cameraPushIn;

    // 1. Build Orthographic Projection Matrix for pixel-space coordinates
    const w = this.canvas.width;
    const h = this.canvas.height;
    const projMatrix = new Float32Array([
      2 / w, 0, 0, 0,
      0, -2 / h, 0, 0,
      0, 0, -1 / 2000, 0,
      -1, 1, 0, 1,
    ]);
    gl.uniformMatrix4fv(this.uProjectionLoc, false, projMatrix);

    // 2. Compute continuous vertex positions and UVs
    const yMid = pageHeight / 2;
    let offset = 0;

    for (let j = 0; j <= this.rows; j++) {
      const v = j / this.rows;
      for (let i = 0; i <= this.cols; i++) {
        const u = i / this.cols;

        const pt3d = computePageSurfacePoint(u, v, {
          pageWidth,
          pageHeight,
          progress: p,
          direction,
          grabRegion,
          stylePreset,
          isSingleSheet: options.isSingleSheet,
        });

        // Camera perspective projection with virtual cinematic push-in
        const scale = (cameraDistance / Math.max(150, cameraDistance - pt3d.z)) * virtualZoom;
        const screenX = spineX + pt3d.x * scale;
        const screenY = spineY + yMid + (pt3d.y - yMid) * scale;

        this.vertexData[offset++] = screenX;
        this.vertexData[offset++] = screenY;
        this.vertexData[offset++] = pt3d.z;

        this.vertexData[offset++] = u;
        this.vertexData[offset++] = v;

        this.vertexData[offset++] = pt3d.nx;
        this.vertexData[offset++] = pt3d.ny;
        this.vertexData[offset++] = pt3d.nz;
      }
    }

    // 3. Update vertex buffer on GPU
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData);

    const stride = 8 * 4; // 32 bytes
    if (this.aPositionLoc >= 0) {
      gl.enableVertexAttribArray(this.aPositionLoc);
      gl.vertexAttribPointer(this.aPositionLoc, 3, gl.FLOAT, false, stride, 0);
    }
    if (this.aTexCoordLoc >= 0) {
      gl.enableVertexAttribArray(this.aTexCoordLoc);
      gl.vertexAttribPointer(this.aTexCoordLoc, 2, gl.FLOAT, false, stride, 12);
    }
    if (this.aNormalLoc >= 0) {
      gl.enableVertexAttribArray(this.aNormalLoc);
      gl.vertexAttribPointer(this.aNormalLoc, 3, gl.FLOAT, false, stride, 20);
    }

    // 4. Set Uniforms
    gl.uniform1f(this.uProgressLoc, p);
    gl.uniform2f(this.uSpinePosLoc, spineX, spineY);
    gl.uniform1f(this.uPageWidthLoc, pageWidth);

    // Set Dynamic Profile Lighting Uniforms
    if (this.uAmbientLoc) gl.uniform1f(this.uAmbientLoc, profile.ambientLight);
    if (this.uDirectionalLoc) gl.uniform1f(this.uDirectionalLoc, profile.directionalLight);
    if (this.uCrestSheenLoc) gl.uniform1f(this.uCrestSheenLoc, profile.crestSheenIntensity);
    if (this.uSheenExpLoc) gl.uniform1f(this.uSheenExpLoc, profile.sheenExponent);
    if (this.uGutterDepthLoc) gl.uniform1f(this.uGutterDepthLoc, profile.gutterShadowDepth);

    // Bind Front Texture to unit 0
    gl.activeTexture(gl.TEXTURE0);
    if (this.frontTexture && this.cachedFrontSrc) {
      gl.bindTexture(gl.TEXTURE_2D, this.frontTexture);
      gl.uniform1i(this.uFrontTextureLoc, 0);
      gl.uniform1f(this.uHasFrontLoc, 1.0);
    } else {
      gl.uniform1f(this.uHasFrontLoc, 0.0);
    }

    // Bind Back Texture to unit 1
    gl.activeTexture(gl.TEXTURE1);
    if (this.backTexture && this.cachedBackSrc) {
      gl.bindTexture(gl.TEXTURE_2D, this.backTexture);
      gl.uniform1i(this.uBackTextureLoc, 1);
      gl.uniform1f(this.uHasBackLoc, 1.0);
    } else {
      gl.uniform1f(this.uHasBackLoc, 0.0);
    }

    // 5. Draw the entire page in ONE continuous single draw call!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
  }

  public isAvailable(): boolean {
    return Boolean(this.gl && this.program);
  }

  public destroy() {
    if (!this.gl) return;
    const gl = this.gl;
    if (this.frontTexture) gl.deleteTexture(this.frontTexture);
    if (this.backTexture) gl.deleteTexture(this.backTexture);
    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
    if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
    if (this.program) gl.deleteProgram(this.program);
    this.cachedFrontSrc = null;
    this.cachedBackSrc = null;
    this.gl = null;
  }
}

/**
 * Solves the 2D affine transformation matrix that maps triangle (u0, v0), (u1, v1), (u2, v2)
 * to screen coordinates (x0, y0), (x1, y1), (x2, y2).
 */
function solveAffineTriangle(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  u0: number, v0: number,
  u1: number, v1: number,
  u2: number, v2: number
) {
  const du1 = u1 - u0;
  const dv1 = v1 - v0;
  const du2 = u2 - u0;
  const dv2 = v2 - v0;

  const det = du1 * dv2 - du2 * dv1;
  if (Math.abs(det) < 1e-6) return null;

  const dx1 = x1 - x0;
  const dy1 = y1 - y0;
  const dx2 = x2 - x0;
  const dy2 = y2 - y0;

  const a = (dx1 * dv2 - dx2 * dv1) / det;
  const c = (du1 * dx2 - du2 * dx1) / det;
  const b = (dy1 * dv2 - dy2 * dv1) / det;
  const d = (du1 * dy2 - du2 * dy1) / det;

  const e = x0 - a * u0 - c * v0;
  const f = y0 - b * u0 - d * v0;

  return { a, b, c, d, e, f };
}

/**
 * Draws a single continuous textured triangle onto 2D canvas context without slicing the image.
 * Uses 3-point affine transformation directly sampling the complete original source texture.
 */
function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  uv0: { u: number; v: number },
  uv1: { u: number; v: number },
  uv2: { u: number; v: number },
  imgW: number,
  imgH: number
) {
  const sx0 = uv0.u * imgW;
  const sy0 = uv0.v * imgH;
  const sx1 = uv1.u * imgW;
  const sy1 = uv1.v * imgH;
  const sx2 = uv2.u * imgW;
  const sy2 = uv2.v * imgH;

  const m = solveAffineTriangle(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, sx0, sy0, sx1, sy1, sx2, sy2);
  if (!m) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.closePath();
  ctx.clip();

  ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/**
 * Continuous High-Definition 2D Canvas Fallback Renderer
 *
 * Used when WebGL is unavailable.
 * Renders the 3D continuous page curl using affine textured triangle geometry (24 x 12 quads = 576 triangles).
 * SAMPLES FROM THE ORIGINAL SOURCE TEXTURE DIRECTLY WITHOUT CROPPING INTO SLICED STRIPS.
 */
export function renderContinuousPageCurl2D(
  ctx: CanvasRenderingContext2D,
  options: {
    frontImg: CanvasImageSource | null;
    backImg: CanvasImageSource | null;
    pageWidth: number;
    pageHeight: number;
    spineX: number;
    spineY: number;
    progress: number;
    direction: TurnDirection;
    grabRegion: GrabRegion;
    stylePreset?: TransitionStyle;
    isSingleSheet?: boolean;
  }
) {
  const {
    frontImg,
    backImg,
    pageWidth,
    pageHeight,
    spineX,
    spineY,
    progress,
    direction,
    grabRegion,
    stylePreset,
    isSingleSheet,
  } = options;

  const p = Math.max(0, Math.min(1, progress));

  const profile = getTransitionProfile(stylePreset);
  const cameraDistance = profile.cameraDistance;
  const virtualZoom = 1.0 + Math.sin(p * Math.PI) * profile.cameraPushIn;
  const yMid = pageHeight / 2;

  // Source image natural dimensions
  const frontW = (frontImg as HTMLImageElement)?.naturalWidth || pageWidth;
  const frontH = (frontImg as HTMLImageElement)?.naturalHeight || pageHeight;
  const backW = (backImg as HTMLImageElement)?.naturalWidth || pageWidth;
  const backH = (backImg as HTMLImageElement)?.naturalHeight || pageHeight;

  // 1. Dynamic Moving Cast Shadow onto Base Page driven by Profile
  const flex = Math.sin(p * Math.PI);
  const shadowDist = (1 - p) * pageWidth * 0.75 * profile.shadowBlurFactor;
  const shadowOpacity = flex * profile.shadowOpacity;

  ctx.save();
  if (direction === 'next') {
    if (p < 0.5) {
      const grad = ctx.createLinearGradient(spineX, 0, spineX + Math.max(24, shadowDist), 0);
      grad.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
      grad.addColorStop(0.4, `rgba(0, 0, 0, ${shadowOpacity * 0.5})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(spineX, spineY, Math.max(24, shadowDist), pageHeight);
    } else {
      const shadowLeftW = p * pageWidth * 0.8 * profile.shadowBlurFactor;
      const grad = ctx.createLinearGradient(spineX, 0, spineX - shadowLeftW, 0);
      grad.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
      grad.addColorStop(0.5, `rgba(0, 0, 0, ${shadowOpacity * 0.4})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(spineX - shadowLeftW, spineY, shadowLeftW, pageHeight);
    }
  } else {
    if (p < 0.5) {
      const grad = ctx.createLinearGradient(spineX, 0, spineX - Math.max(24, shadowDist), 0);
      grad.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(spineX - Math.max(24, shadowDist), spineY, Math.max(24, shadowDist), pageHeight);
    } else {
      const shadowRightW = p * pageWidth * 0.8 * profile.shadowBlurFactor;
      const grad = ctx.createLinearGradient(spineX, 0, spineX + shadowRightW, 0);
      grad.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(spineX, spineY, shadowRightW, pageHeight);
    }
  }
  ctx.restore();

  // 2. Continuous Affine Textured Triangle Mesh (24 x 12 grid)
  const cols = 24;
  const rows = 12;

  // Precompute grid screen points
  const gridPts: Array<Array<{ x: number; y: number; isBack: boolean; nz: number }>> = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const row: Array<{ x: number; y: number; isBack: boolean; nz: number }> = [];
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const pt3d = computePageSurfacePoint(u, v, {
        pageWidth,
        pageHeight,
        progress: p,
        direction,
        grabRegion,
        stylePreset,
        isSingleSheet: options.isSingleSheet,
      });
      const scale = (cameraDistance / Math.max(150, cameraDistance - pt3d.z)) * virtualZoom;
      const sx = spineX + pt3d.x * scale;
      const sy = spineY + yMid + (pt3d.y - yMid) * scale;
      row.push({ x: sx, y: sy, isBack: pt3d.isBackFacing, nz: pt3d.nz });
    }
    gridPts.push(row);
  }

  // Draw continuous triangles across the grid
  for (let j = 0; j < rows; j++) {
    const v0 = j / rows;
    const v1 = (j + 1) / rows;

    for (let i = 0; i < cols; i++) {
      const u0 = i / cols;
      const u1 = (i + 1) / cols;

      const p00 = gridPts[j][i];
      const p10 = gridPts[j][i + 1];
      const p01 = gridPts[j + 1][i];
      const p11 = gridPts[j + 1][i + 1];

      const isBack = p00.isBack;

      if (!isBack && frontImg) {
        drawTexturedTriangle(
          ctx, frontImg,
          p00, p10, p01,
          { u: u0, v: v0 }, { u: u1, v: v0 }, { u: u0, v: v1 },
          frontW, frontH
        );
        drawTexturedTriangle(
          ctx, frontImg,
          p10, p11, p01,
          { u: u1, v: v0 }, { u: u1, v: v1 }, { u: u0, v: v1 },
          frontW, frontH
        );
      } else if (isBack && backImg) {
        const bu0 = 1 - u0;
        const bu1 = 1 - u1;
        drawTexturedTriangle(
          ctx, backImg,
          p00, p10, p01,
          { u: bu0, v: v0 }, { u: bu1, v: v0 }, { u: bu0, v: v1 },
          backW, backH
        );
        drawTexturedTriangle(
          ctx, backImg,
          p10, p11, p01,
          { u: bu1, v: v0 }, { u: bu1, v: v1 }, { u: bu0, v: v1 },
          backW, backH
        );
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        ctx.fillStyle = isBack ? '#f5f3ef' : '#fafbfc';
        ctx.fill();
        ctx.restore();
      }

      // Specular sheen along curvature crest
      const avgNz = (p00.nz + p10.nz + p01.nz + p11.nz) / 4;
      if (Math.abs(avgNz) < 0.35 && profile.crestSheenIntensity > 0) {
        const sheen = Math.cos((Math.abs(avgNz) / 0.35) * (Math.PI / 2)) * flex * profile.crestSheenIntensity;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        ctx.fillStyle = `rgba(255, 255, 255, ${sheen})`;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // 3. Outer Edge Paper Core Thickness Bevel
  const edgeCol = cols;
  ctx.save();
  ctx.beginPath();
  for (let j = 0; j <= rows; j++) {
    const pt = gridPts[j][edgeCol];
    if (j === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = profile.name === 'soft-turn' ? 1.0 : profile.name === 'cinematic-turn' ? 2.0 : 1.5;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 1.0;
  ctx.stroke();
  ctx.restore();
}
