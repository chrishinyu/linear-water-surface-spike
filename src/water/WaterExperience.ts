import { Mesh, OrthographicCamera, PlaneGeometry, Raycaster, Scene, Vector2, WebGLRenderer } from 'three';
import { resolveConfig, type QualityTier, type WaterConfig } from '../config';
import { AdaptiveQuality } from '../performance/AdaptiveQuality';
import { FrameSampler } from '../performance/FrameSampler';
import { createRippleSlots, emitRipple, writeRippleUniforms } from '../math/ripple';
import { createWaterMaterial } from './createWaterMaterial';
import type { WaterMaterial, WaterUniforms } from './createWaterMaterial';
import { getQualitySettings } from './quality';

export class WaterExperience {
  readonly renderer: WebGLRenderer;
  readonly material: WaterMaterial;
  readonly uniforms: WaterUniforms;
  readonly rippleSlots = createRippleSlots(4);
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  private readonly pointerRaycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private readonly pointerTarget = new Vector2(-10, -10);
  private readonly pointerSmoothed = new Vector2(-10, -10);
  private readonly tapPosition = new Vector2();
  private readonly geometry = new PlaneGeometry(1, 1, 180, 220);
  private readonly mesh: Mesh;
  private readonly root: HTMLElement;
  private readonly config: WaterConfig;
  private readonly motionPreference: MediaQueryList;
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

  static mount(root: HTMLElement, config: WaterConfig, motionPreference: MediaQueryList): WaterExperience {
    const experience = new WaterExperience(root, config, motionPreference);
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

  private constructor(root: HTMLElement, config: WaterConfig, motionPreference: MediaQueryList) {
    this.root = root;
    this.config = { ...config };
    this.motionPreference = motionPreference;
    this.reducedMotion = motionPreference.matches;
    this.tier = config.quality;
    this.adaptiveQuality = new AdaptiveQuality(this.tier,
      window.matchMedia('(pointer: coarse)').matches);
    this.material = createWaterMaterial(config);
    this.uniforms = this.material.uniforms;
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
    this.renderer.setClearColor('#061015', 1);
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
      this.pointerTarget.set(-10, -10);
      this.pointerSmoothed.set(-10, -10);
      this.uniforms.uPointerStrength.value = 0;
      this.uniforms.uPointer.value.copy(this.pointerSmoothed);
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
    const hadHover = this.mouseHover;
    this.mouseHover = this.pointerUv(event.clientX, event.clientY, this.pointerTarget);
    if (this.mouseHover && !hadHover) this.pointerSmoothed.copy(this.pointerTarget);
  };

  private readonly onPointerLeave = (): void => {
    this.mouseHover = false;
    // Leaving the canvas permanently cancels this press, even if it returns.
    this.pointerDownId = null;
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
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
    const canvas = this.renderer.domElement;
    if (this.config.interactionEnabled && !this.reducedMotion && !this.disposed
      && !this.listenersAttached) {
      canvas.addEventListener('pointermove', this.onPointerMove, { passive: true });
      canvas.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
      canvas.addEventListener('pointerdown', this.onPointerDown, { passive: true });
      canvas.addEventListener('pointerup', this.onPointerUp, { passive: true });
      canvas.addEventListener('pointercancel', this.onPointerCancel, { passive: true });
      this.listenersAttached = true;
    } else if ((!this.config.interactionEnabled || this.reducedMotion || this.disposed)
      && this.listenersAttached) {
      canvas.removeEventListener('pointermove', this.onPointerMove);
      canvas.removeEventListener('pointerleave', this.onPointerLeave);
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
      const smoothing = 1 - Math.exp(-Math.min(delta, 0.05) * 8);
      this.pointerSmoothed.lerp(this.pointerTarget, smoothing);
      this.pointerEnvelope += ((this.mouseHover ? this.config.pointerStrength : 0)
        - this.pointerEnvelope) * smoothing;
    }
    this.lastFrameTime = timestamp;
    this.uniforms.uTime.value = this.elapsed;
    this.uniforms.uPointer.value.copy(this.pointerSmoothed);
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
    const dpr = Math.min(window.devicePixelRatio || 1, this.config.maxDpr) * quality.dprScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.renderer.getDrawingBufferSize(this.uniforms.uResolution.value);
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
    if (this.debugMetrics && window.__waterDebug === this.debugMetrics) delete window.__waterDebug;
    if (window.__waterExperience === this) delete window.__waterExperience;
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
