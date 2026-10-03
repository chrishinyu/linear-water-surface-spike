import { Mesh, OrthographicCamera, PlaneGeometry, Scene, WebGLRenderer } from 'three';
import type { QualityTier, WaterConfig } from '../config';
import { createRippleSlots, writeRippleUniforms } from '../math/ripple';
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
  private readonly geometry = new PlaneGeometry(1, 1, 180, 220);
  private readonly mesh: Mesh;
  private readonly root: HTMLElement;
  private readonly config: WaterConfig;
  private tier: QualityTier;
  private running = false;
  private disposed = false;
  private lastFrameTime: number | null = null;
  private elapsed = 0;

  static mount(root: HTMLElement, config: WaterConfig): WaterExperience {
    const experience = new WaterExperience(root, config);
    try {
      experience.resize();
      // A synchronous, validated first frame keeps bootstrap errors inside its
      // failure boundary. The fallback is hidden by bootstrap only after this.
      experience.renderer.render(experience.scene, experience.camera);
      root.appendChild(experience.renderer.domElement);
      window.addEventListener('resize', experience.onResize);
      experience.start();
      return experience;
    } catch (error) {
      experience.dispose();
      throw error;
    }
  }

  private constructor(root: HTMLElement, config: WaterConfig) {
    this.root = root;
    this.config = { ...config };
    this.tier = config.quality;
    this.material = createWaterMaterial(config);
    this.uniforms = this.material.uniforms;
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
      throw new Error('Water shader failed to compile or link.');
    };
    this.renderer.setClearColor('#061015', 1);
    this.camera.position.set(0, -8, 6.7);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.mesh);
  }

  private readonly onResize = (): void => { this.resize(); };

  private readonly frame = (timestamp: number): void => {
    if (!this.running || this.disposed) return;
    if (this.lastFrameTime !== null) {
      this.elapsed += Math.min((timestamp - this.lastFrameTime) / 1000, 0.05);
    }
    this.lastFrameTime = timestamp;
    this.uniforms.uTime.value = this.elapsed;
    writeRippleUniforms(this.rippleSlots, this.elapsed, this.config.rippleDuration,
      this.uniforms.uRipplePositions.value, this.uniforms.uRippleStarts.value,
      this.uniforms.uRippleStrengths.value);
    this.renderer.render(this.scene, this.camera);
  };

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastFrameTime = null;
    this.renderer.setAnimationLoop(this.frame);
  }

  stop(): void {
    this.running = false;
    this.lastFrameTime = null;
    this.renderer.setAnimationLoop(null);
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
    this.tier = tier;
    const quality = getQualitySettings(tier);
    this.uniforms.uFineWaveWeight.value = quality.fineWaveWeight;
    this.uniforms.uLineDensity.value = Math.min(this.config.lineDensity, quality.lineSamples);
    this.uniforms.uRippleCount.value = Math.min(this.uniforms.uRippleCount.value, quality.maxRipples);
    this.resize();
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
