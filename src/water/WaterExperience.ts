import { DataTexture, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Raycaster, RedFormat,
  Scene, UnsignedByteType, Vector2, WebGLRenderer } from 'three';
import { MOBILE_MAX_DPR, resolveConfig, type QualityTier, type WaterConfig } from '../config';
import { THEME_MS, THEME_PALETTES, easeOutExpo, type Theme, type ThemePalette } from '../theme';
import { AdaptiveQuality } from '../performance/AdaptiveQuality';
import { FrameSampler } from '../performance/FrameSampler';
import { createRippleSlots, emitRipple, writeRippleUniforms } from '../math/ripple';
import { createWaterMaterial } from './createWaterMaterial';
import type { WaterMaterial, WaterUniforms } from './createWaterMaterial';
import { getQualitySettings } from './quality';
import { WindField } from './WindField';

/** Ellipse in CSS px relative to the canvas's top-left corner. */
export interface CalmZone { x: number; y: number; radiusX: number; radiusY: number }

export interface WaterMountOptions {
  /**
   * Where pointer wind is read. 'canvas' (default) only sees the pointer while
   * it is directly over the canvas; 'window' keeps the wind working when page
   * content sits on top of the water. Clicks on content never ripple.
   */
  pointerTarget?: 'canvas' | 'window';
}

// Presses that start on content (text, links, controls) are not taps on water.
const CONTENT_SELECTOR = 'a, button, input, textarea, select, label, p, h1, h2, h3, h4, li, '
  + 'figure, nav, [data-no-ripple]';

export class WaterExperience {
  readonly renderer: WebGLRenderer;
  readonly material: WaterMaterial;
  readonly uniforms: WaterUniforms;
  readonly rippleSlots = createRippleSlots(4);
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  private readonly pointerRaycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private readonly tapPosition = new Vector2();
  // Wind: the pointer deposits energy on the water (screen space, y up); the
  // field holds, drifts and decays it. See WindField.ts.
  private readonly windField = new WindField();
  private readonly windTexture = new DataTexture(this.windField.bytes,
    this.windField.width, this.windField.height, RedFormat, UnsignedByteType);
  private readonly windPointer = new Vector2();
  private readonly windPrevious = new Vector2();
  private readonly windDir = new Vector2(1, 0);
  private readonly windScratch = new Vector2();
  private windUploaded = false;
  private readonly themeFrom = clonePalette(THEME_PALETTES.dark);
  private readonly themeTo = clonePalette(THEME_PALETTES.dark);
  private themeAnimating = false;
  private themeStart: number | null = null;
  private readonly geometry = new PlaneGeometry(1, 1, 180, 220);
  private readonly mesh: Mesh;
  private readonly root: HTMLElement;
  private readonly config: WaterConfig;
  private readonly motionPreference: MediaQueryList;
  private readonly onUnavailable: () => void;
  private reducedMotion: boolean;
  private tier: QualityTier;
  private running = false;
  private disposed = false;
  private shaderFailed = false;
  private lastFrameTime: number | null = null;
  private elapsed = 0;
  private pointerEnvelope = 0;
  private mouseHover = false;
  private pointerDownId: number | null = null;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerDownTime = 0;
  private pointerMaxTravel = 0;
  private listenersAttached = false;
  private readonly frameSampler = new FrameSampler();
  private adaptiveQuality: AdaptiveQuality;
  private wantedRunning = false;
  private intersecting = true;
  private intersectionObserver?: IntersectionObserver;
  private readonly debugMetrics?: WaterDebugMetrics;

  private readonly windowPointer: boolean;
  private calmZone: CalmZone | null = null;

  static mount(root: HTMLElement, config: WaterConfig, motionPreference: MediaQueryList,
    onUnavailable: () => void, theme: Theme = 'dark',
    options: WaterMountOptions = {}): WaterExperience {
    const experience = new WaterExperience(root, config, motionPreference, onUnavailable, theme,
      options);
    try {
      experience.resize();
      // A synchronous, validated first frame keeps bootstrap errors inside its
      // failure boundary. The fallback is hidden by bootstrap only after this.
      experience.renderer.render(experience.scene, experience.camera);
      if (experience.shaderFailed) {
        throw new Error('Water shader failed to compile or link.');
      }
      experience.renderer.domElement.setAttribute('aria-hidden', 'true');
      root.appendChild(experience.renderer.domElement);
      experience.renderer.domElement.addEventListener('webglcontextlost', experience.onContextLost);
      window.addEventListener('resize', experience.onResize);
      document.addEventListener('visibilitychange', experience.onVisibilityChange);
      motionPreference.addEventListener('change', experience.onMotionPreferenceChange);
      if (typeof IntersectionObserver !== 'undefined') {
        experience.intersectionObserver = new IntersectionObserver(experience.onIntersection);
        experience.intersectionObserver.observe(root);
      }
      experience.syncInteractionListeners();
      if (import.meta.env.DEV) window.__waterExperience = experience;
      experience.start();
      return experience;
    } catch (error) {
      experience.dispose();
      throw error;
    }
  }

  private constructor(root: HTMLElement, config: WaterConfig, motionPreference: MediaQueryList,
    onUnavailable: () => void, theme: Theme, options: WaterMountOptions) {
    this.root = root;
    this.windowPointer = options.pointerTarget === 'window';
    this.config = { ...config };
    this.motionPreference = motionPreference;
    this.onUnavailable = onUnavailable;
    this.reducedMotion = motionPreference.matches;
    this.tier = config.quality;
    this.adaptiveQuality = new AdaptiveQuality(this.tier,
      window.matchMedia('(pointer: coarse)').matches);
    this.material = createWaterMaterial(config, THEME_PALETTES[theme]);
    this.windTexture.minFilter = LinearFilter;
    this.windTexture.magFilter = LinearFilter;
    this.windTexture.needsUpdate = true;
    this.uniforms = this.material.uniforms;
    this.uniforms.uWindMap.value = this.windTexture;
    if (this.reducedMotion) this.uniforms.uWaveSpeed.value = 0;
    this.mesh = new Mesh(this.geometry, this.material);
    try {
      this.renderer = new WebGLRenderer({
        antialias: false, alpha: false, powerPreference: 'high-performance',
      });
    } catch (error) {
      this.material.dispose();
      this.geometry.dispose();
      throw error;
    }
    this.renderer.debug.onShaderError = () => {
      // Three must finish its shader cleanup before mount handles failure.
      this.shaderFailed = true;
    };
    this.renderer.setClearColor(THEME_PALETTES[theme].clear, 1);
    this.camera.position.set(0, -8, 6.7);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.mesh);
    if (import.meta.env.DEV) {
      this.debugMetrics = {
        activeRipples: 0,
        quality: this.tier,
        running: false,
        averageFps: 0,
        reducedMotion: this.reducedMotion,
      };
      window.__waterDebug = this.debugMetrics;
    }
  }

  private readonly onResize = (): void => {
    this.resize();
    this.renderStillFrame();
  };
  private readonly onContextLost = (event: Event): void => {
    // This renderer is terminal after loss. Prevent the browser's default
    // handling, then dispose; the application keeps its static preview.
    event.preventDefault();
    if (this.disposed) return;
    this.dispose();
    this.onUnavailable();
  };
  private readonly onVisibilityChange = (): void => { this.syncRendering(); };
  private readonly onMotionPreferenceChange = (): void => {
    if (this.disposed) return;
    this.reducedMotion = this.motionPreference.matches;
    if (this.debugMetrics) this.debugMetrics.reducedMotion = this.reducedMotion;
    this.uniforms.uWaveSpeed.value = this.reducedMotion ? 0 : this.config.waveSpeed;
    if (this.reducedMotion) {
      this.syncRendering();
      this.pointerDownId = null;
      this.mouseHover = false;
      this.pointerEnvelope = 0;
      this.uniforms.uPointerStrength.value = 0;
      this.windField.clear();
      this.windTexture.needsUpdate = true;
      this.windUploaded = false;
      for (const ripple of this.rippleSlots) ripple.active = false;
      this.uniforms.uRippleStrengths.value.fill(0);
      if (this.debugMetrics) this.debugMetrics.activeRipples = 0;
    }
    this.syncInteractionListeners();
    if (this.reducedMotion) this.renderStillFrame();
    else this.syncRendering();
  };
  private readonly onIntersection: IntersectionObserverCallback = (entries): void => {
    for (const entry of entries) {
      if (entry.target !== this.root) continue;
      this.intersecting = entry.isIntersecting && entry.intersectionRatio > 0;
      this.syncRendering();
    }
  };

  private syncRendering(): void {
    if (this.disposed) return;
    const shouldRun = this.wantedRunning && !this.reducedMotion
      && !document.hidden && this.intersecting;
    if (shouldRun === this.running) return;
    // Nobody sees a theme change finish while paused; land it immediately.
    if (!shouldRun && this.themeAnimating) this.finishTheme();
    this.running = shouldRun;
    if (this.debugMetrics) this.debugMetrics.running = shouldRun;
    this.lastFrameTime = null;
    this.frameSampler.reset();
    this.adaptiveQuality.resetPressure();
    this.renderer.setAnimationLoop(shouldRun ? this.frame : null);
  }

  private pointerUv(clientX: number, clientY: number, output: Vector2): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((clientY - rect.top) / rect.height) * 2,
    );
    this.pointerRaycaster.setFromCamera(this.pointerNdc, this.camera);
    const { origin, direction } = this.pointerRaycaster.ray;
    if (Math.abs(direction.z) < 0.0001) return false;
    const distance = -origin.z / direction.z;
    if (distance < 0) return false;
    output.set(
      (origin.x + distance * direction.x) / this.mesh.scale.x + 0.5,
      (origin.y + distance * direction.y) / this.mesh.scale.y + 0.5,
    );
    return output.x >= 0 && output.x <= 1 && output.y >= 0 && output.y <= 1;
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerDownId) {
      this.pointerMaxTravel = Math.max(this.pointerMaxTravel,
        Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY));
    }
    if (event.pointerType !== 'mouse') return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const hadHover = this.mouseHover;
    this.windPointer.set((event.clientX - rect.left) / rect.width,
      1 - (event.clientY - rect.top) / rect.height);
    this.mouseHover = this.windPointer.x >= 0 && this.windPointer.x <= 1
      && this.windPointer.y >= 0 && this.windPointer.y <= 1;
    // Entering the water starts a fresh path: no gust across the jump.
    if (this.mouseHover && !hadHover) this.windPrevious.copy(this.windPointer);
  };

  private readonly onPointerLeave = (): void => {
    this.mouseHover = false;
    // Leaving the canvas permanently cancels this press, even if it returns.
    this.pointerDownId = null;
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (this.windowPointer && event.target instanceof Element
      && event.target.closest(CONTENT_SELECTOR)) return;
    this.pointerDownId = event.pointerId;
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.pointerDownTime = event.timeStamp;
    this.pointerMaxTravel = 0;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.reducedMotion) return;
    if (event.pointerId !== this.pointerDownId) return;
    this.pointerDownId = null;
    const travel = Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY);
    if (Math.max(travel, this.pointerMaxTravel) >= 10
      || event.timeStamp - this.pointerDownTime >= 500) return;
    if (!this.pointerUv(event.clientX, event.clientY, this.tapPosition)) return;
    emitRipple(this.rippleSlots, this.tapPosition, this.elapsed,
      this.config.rippleStrength, getQualitySettings(this.tier).maxRipples);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerDownId) this.pointerDownId = null;
  };

  private syncInteractionListeners(): void {
    // Window and elements share the pointer event map; one type keeps the
    // listener signatures checked.
    const canvas = (this.windowPointer ? window : this.renderer.domElement) as HTMLElement;
    const leave = this.windowPointer ? document.documentElement : this.renderer.domElement;
    if (this.config.interactionEnabled && !this.reducedMotion && !this.disposed
      && !this.listenersAttached) {
      canvas.addEventListener('pointermove', this.onPointerMove, { passive: true });
      leave.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
      canvas.addEventListener('pointerdown', this.onPointerDown, { passive: true });
      canvas.addEventListener('pointerup', this.onPointerUp, { passive: true });
      canvas.addEventListener('pointercancel', this.onPointerCancel, { passive: true });
      this.listenersAttached = true;
    } else if ((!this.config.interactionEnabled || this.reducedMotion || this.disposed)
      && this.listenersAttached) {
      canvas.removeEventListener('pointermove', this.onPointerMove);
      leave.removeEventListener('pointerleave', this.onPointerLeave);
      canvas.removeEventListener('pointerdown', this.onPointerDown);
      canvas.removeEventListener('pointerup', this.onPointerUp);
      canvas.removeEventListener('pointercancel', this.onPointerCancel);
      this.listenersAttached = false;
      this.pointerDownId = null;
      this.mouseHover = false;
    }
  }

  private readonly frame = (timestamp: number): void => {
    if (!this.running || this.disposed) return;
    if (this.lastFrameTime !== null) {
      const deltaMs = Math.max(0, timestamp - this.lastFrameTime);
      const delta = deltaMs / 1000;
      // Keep shader/ripple time in real seconds. Only the pointer easing step
      // is bounded, so a slow frame cannot stretch a three-second ripple.
      this.elapsed += delta;
      this.frameSampler.push(deltaMs);
      if (this.debugMetrics) this.debugMetrics.averageFps = Math.round(this.frameSampler.averageFps);
      const nextTier = this.adaptiveQuality.sample(1000 / deltaMs, deltaMs);
      if (nextTier) this.setQuality(nextTier);
      this.stepWind(Math.min(delta, 0.05));
    }
    this.lastFrameTime = timestamp;
    if (this.themeAnimating) {
      if (this.themeStart === null) this.themeStart = timestamp;
      const progress = Math.min(1, (timestamp - this.themeStart) / THEME_MS);
      this.applyThemeProgress(easeOutExpo(progress));
      if (progress >= 1) this.themeAnimating = false;
    }
    this.uniforms.uTime.value = this.elapsed;
    this.uniforms.uPointerStrength.value = this.pointerEnvelope;
    writeRippleUniforms(this.rippleSlots, this.elapsed, this.config.rippleDuration,
      this.uniforms.uRipplePositions.value, this.uniforms.uRippleStarts.value,
      this.uniforms.uRippleStrengths.value);
    const maxRipples = getQualitySettings(this.tier).maxRipples;
    this.uniforms.uRippleCount.value = maxRipples;
    if (this.debugMetrics) {
      let active = 0;
      for (let index = 0; index < maxRipples; index += 1) {
        if (this.uniforms.uRippleStrengths.value[index] > 0) active += 1;
      }
      this.debugMetrics.activeRipples = active;
      this.debugMetrics.quality = this.tier;
    }
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Pointer as wind. The cursor never carries an effect with it: each frame it
   * deposits wind energy along the path it just travelled, scaled by speed
   * (a parked cursor deposits nothing). The field keeps that energy where it
   * landed, drifts it slightly downwind and lets it decay (~1.1 s lifetime),
   * and the shader turns it into rougher water: taller short waves and fresh
   * capillaries, so lines bend and glints flicker through the wave physics.
   */
  private stepWind(dt: number): void {
    let amount = 0;
    if (this.mouseHover) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const aspect = rect.width > 0 ? rect.height / rect.width : 1;
      const dx = this.windPointer.x - this.windPrevious.x;
      const dy = (this.windPointer.y - this.windPrevious.y) * aspect;
      const distance = Math.hypot(dx, dy);
      if (distance > 0.0005) {
        // Screen widths per second; a brisk sweep (~1.1 widths/s) is a full
        // gust. Breath, not a blast: deposits are scaled per second of travel.
        const speed = distance / Math.max(dt, 1 / 240);
        const gain = this.config.pointerStrength / 0.06;
        amount = Math.min(1, speed / 1.1) * gain;
        this.windField.deposit(this.windPrevious.x, this.windPrevious.y,
          this.windPointer.x, this.windPointer.y, amount * Math.min(1, dt * 10));
        // Heading follows travel, eased, and is held while the gust fades so
        // the ripples never flip direction as the pointer slows.
        this.windScratch.set(dx, dy).multiplyScalar(1 / distance);
        this.windDir.lerp(this.windScratch, 1 - Math.exp(-dt * 8)).normalize();
      }
      this.windPrevious.copy(this.windPointer);
    }
    this.windField.step(dt, this.windDir.x, this.windDir.y, 1.1);
    // Upload while there is energy, plus one final cleared frame.
    if (this.windField.active || this.windUploaded) {
      this.windTexture.needsUpdate = true;
      this.windUploaded = this.windField.active;
    }
    // Screen heading to plane space: depth is compressed vertically on screen.
    this.uniforms.uWindDir.value.set(this.windDir.x, this.windDir.y * 1.6).normalize();
    // Strength envelope for debugging/tests: rises fast, settles slowly.
    const rate = amount > this.pointerEnvelope ? 14 : 2.2;
    this.pointerEnvelope += (amount - this.pointerEnvelope) * (1 - Math.exp(-dt * rate));
  }

  /**
   * Still water behind content: inside the ellipse the short waves, wind,
   * lines and glints die down toward a smooth swell, feathered over
   * `softness` (fraction of the radius) at the edge. null removes it.
   */
  setCalmZone(zone: CalmZone | null, strength = 0.85, softness = 0.5): void {
    if (this.disposed) return;
    this.calmZone = zone;
    this.uniforms.uCalmStrength.value = zone ? strength : 0;
    this.uniforms.uCalmSoftness.value = softness;
    this.writeCalmZone();
    this.renderStillFrame();
  }

  /** Whole-surface calm, 0 (as designed) to 1 (wind dropped). */
  setSettle(amount: number): void {
    if (this.disposed) return;
    this.uniforms.uSettle.value = Math.min(1, Math.max(0, amount));
    this.renderStillFrame();
  }

  private writeCalmZone(): void {
    const zone = this.calmZone;
    if (!zone) return;
    const ratio = this.uniforms.uPixelRatio.value;
    const height = Math.max(1, this.root.clientHeight);
    this.uniforms.uCalmZone.value.set(zone.x * ratio, (height - zone.y) * ratio,
      zone.radiusX * ratio, zone.radiusY * ratio);
  }

  /** Cross-fades the shader palette; CSS transitions the page in step. */
  setTheme(theme: Theme, animate = true): void {
    if (this.disposed) return;
    const target = THEME_PALETTES[theme];
    const uniforms = this.uniforms;
    this.themeFrom.base.copy(uniforms.uBaseColor.value);
    this.themeFrom.mid.copy(uniforms.uMidColor.value);
    this.themeFrom.light.copy(uniforms.uLightColor.value);
    this.themeFrom.line.copy(uniforms.uLineColor.value);
    this.themeFrom.lineStrength = uniforms.uLineStrength.value;
    this.themeFrom.glintStrength = uniforms.uGlintStrength.value;
    this.themeFrom.nearShade = uniforms.uNearShade.value;
    this.themeFrom.grain = uniforms.uGrain.value;
    copyPalette(target, this.themeTo);
    this.renderer.setClearColor(target.clear, 1);
    this.themeStart = null;
    this.themeAnimating = true;
    if (!animate || this.reducedMotion || !this.running) {
      this.finishTheme();
      this.renderStillFrame();
    }
  }

  private finishTheme(): void {
    this.applyThemeProgress(1);
    this.themeAnimating = false;
  }

  private applyThemeProgress(t: number): void {
    const uniforms = this.uniforms;
    const from = this.themeFrom;
    const to = this.themeTo;
    uniforms.uBaseColor.value.copy(from.base).lerp(to.base, t);
    uniforms.uMidColor.value.copy(from.mid).lerp(to.mid, t);
    uniforms.uLightColor.value.copy(from.light).lerp(to.light, t);
    uniforms.uLineColor.value.copy(from.line).lerp(to.line, t);
    uniforms.uLineStrength.value = from.lineStrength + (to.lineStrength - from.lineStrength) * t;
    uniforms.uGlintStrength.value = from.glintStrength + (to.glintStrength - from.glintStrength) * t;
    uniforms.uNearShade.value = from.nearShade + (to.nearShade - from.nearShade) * t;
    uniforms.uGrain.value = from.grain + (to.grain - from.grain) * t;
  }

  private renderStillFrame(): void {
    if (this.disposed || !this.reducedMotion || !this.renderer.domElement.isConnected) return;
    this.renderer.render(this.scene, this.camera);
  }

  start(): void {
    if (this.disposed) return;
    this.wantedRunning = true;
    this.syncRendering();
  }

  stop(): void {
    this.wantedRunning = false;
    this.syncRendering();
  }

  resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.root.clientWidth);
    const height = Math.max(1, this.root.clientHeight);
    const aspect = width / height;
    const quality = getQualitySettings(this.tier);
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const maxDpr = coarse ? Math.min(this.config.maxDpr, MOBILE_MAX_DPR) : this.config.maxDpr;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr) * quality.dprScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.renderer.getDrawingBufferSize(this.uniforms.uResolution.value);
    this.uniforms.uPixelRatio.value = dpr;
    this.writeCalmZone();
    this.camera.left = -aspect;
    this.camera.right = aspect;
    this.camera.updateProjectionMatrix();
    // Overscan includes vertex displacement; there are no exposed plane edges.
    this.mesh.scale.set(aspect * 2.5, 4.2, 1);
  }

  setQuality(tier: QualityTier): void {
    if (this.disposed) return;
    if (tier === this.tier) return;
    this.tier = tier;
    this.config.quality = tier;
    this.adaptiveQuality = new AdaptiveQuality(tier,
      window.matchMedia('(pointer: coarse)').matches);
    const quality = getQualitySettings(tier);
    this.uniforms.uFineWaveWeight.value = quality.fineWaveWeight;
    this.uniforms.uLineDensity.value = Math.min(this.config.lineDensity, quality.lineSamples);
    this.uniforms.uHighlightDetail.value = quality.highlightSamples;
    this.uniforms.uRippleCount.value = quality.maxRipples;
    for (let index = quality.maxRipples; index < this.rippleSlots.length; index += 1) {
      this.rippleSlots[index].active = false;
    }
    this.resize();
    this.renderStillFrame();
  }

  updateConfig(patch: Partial<WaterConfig>): void {
    if (this.disposed) return;
    const previousQuality = this.tier;
    const previousDpr = this.config.maxDpr;
    Object.assign(this.config, resolveConfig(patch.mode ?? this.config.mode, {
      ...this.config, ...patch,
    }));
    const uniforms = this.uniforms;
    uniforms.uWaveAmplitude.value = this.config.waveAmplitude;
    uniforms.uWaveSpeed.value = this.reducedMotion ? 0 : this.config.waveSpeed;
    uniforms.uLineDensity.value = Math.min(this.config.lineDensity,
      getQualitySettings(this.config.quality).lineSamples);
    uniforms.uReflectionCenter.value = this.config.reflectionCenter;
    uniforms.uReflectionWidth.value = this.config.reflectionWidth;
    uniforms.uReflectionIntensity.value = this.config.reflectionIntensity;
    uniforms.uRippleDuration.value = this.config.rippleDuration;
    // Pointer/ripple strengths are input envelopes. Keep the inactive pointer
    // at zero and let interaction handlers consume the updated config.
    if (!this.reducedMotion && uniforms.uPointerStrength.value > 0) {
      uniforms.uPointerStrength.value = this.config.pointerStrength;
    }
    const qualityChanged = this.config.quality !== previousQuality;
    if (qualityChanged) this.setQuality(this.config.quality);
    else if (this.config.maxDpr !== previousDpr) this.resize();
    this.syncInteractionListeners();
    if (!qualityChanged) this.renderStillFrame();
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.intersectionObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.motionPreference.removeEventListener('change', this.onMotionPreferenceChange);
    this.config.interactionEnabled = false;
    this.syncInteractionListeners();
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    if (this.debugMetrics && window.__waterDebug === this.debugMetrics) delete window.__waterDebug;
    if (window.__waterExperience === this) delete window.__waterExperience;
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.windTexture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function clonePalette(source: Readonly<ThemePalette>): ThemePalette {
  return {
    base: source.base.clone(),
    mid: source.mid.clone(),
    light: source.light.clone(),
    line: source.line.clone(),
    clear: source.clear.clone(),
    lineStrength: source.lineStrength,
    glintStrength: source.glintStrength,
    nearShade: source.nearShade,
    grain: source.grain,
  };
}

function copyPalette(source: Readonly<ThemePalette>, target: ThemePalette): void {
  target.base.copy(source.base);
  target.mid.copy(source.mid);
  target.light.copy(source.light);
  target.line.copy(source.line);
  target.clear.copy(source.clear);
  target.lineStrength = source.lineStrength;
  target.glintStrength = source.glintStrength;
  target.nearShade = source.nearShade;
  target.grain = source.grain;
}
