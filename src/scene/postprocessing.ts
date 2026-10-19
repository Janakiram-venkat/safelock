import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";

/** Objects on this layer (the LEDs and the buzzer grille) are the only ones that bloom. */
export const BLOOM_LAYER = 1;

const MIX_SHADER = {
  uniforms: { baseTexture: { value: null }, bloomTexture: { value: null }, bloomStrength: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    uniform float bloomStrength;
    varying vec2 vUv;
    void main() { gl_FragColor = texture2D(baseTexture, vUv) + bloomStrength * texture2D(bloomTexture, vUv); }`,
};

/**
 * Optional post chain (always off in patent mode):
 *   base:  Render → GTAO (contact shadows in seams) → mix(bloom) → Output (tone map, sRGB) → SMAA
 *   bloom: the same scene with every non-bloom-layer object drawn black, so
 *          only the LEDs glow (selective bloom; specular highlights never bloom).
 */
export class PostProcessing {
  readonly composer: EffectComposer;
  private readonly bloomComposer: EffectComposer;
  readonly ao: GTAOPass;
  readonly bloom: UnrealBloomPass;
  private readonly mix: ShaderPass;
  private readonly smaa: SMAAPass;
  private readonly dark = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private readonly darkLine = new THREE.LineBasicMaterial({ color: 0x000000 });
  private readonly saved = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
  private readonly layer = new THREE.Layers();
  aoEnabled = true;
  bloomEnabled = true;

  constructor(renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene, camera: THREE.Camera, w: number, h: number) {
    this.layer.set(BLOOM_LAYER);

    this.bloomComposer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType }));
    this.bloomComposer.renderToScreen = false;
    this.bloomComposer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.35, 0);
    this.bloomComposer.addPass(this.bloom);

    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType }));
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new GTAOPass(scene, camera, w, h);
    this.ao.updateGtaoMaterial({ radius: 0.03, distanceExponent: 1.5, thickness: 0.5, scale: 1, samples: 16 });
    this.ao.blendIntensity = 0.8;
    this.composer.addPass(this.ao);
    this.mix = new ShaderPass(new THREE.ShaderMaterial({ ...MIX_SHADER, uniforms: THREE.UniformsUtils.clone(MIX_SHADER.uniforms) }), "baseTexture");
    this.mix.needsSwap = true;
    this.composer.addPass(this.mix);
    this.composer.addPass(new OutputPass());
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
  }

  render(): void {
    this.ao.enabled = this.aoEnabled;
    if (this.bloomEnabled) {
      const bg = this.scene.background;
      this.scene.background = null;
      this.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.material || this.layer.test(o.layers)) return;
        this.saved.set(o, m.material);
        m.material = (o as THREE.Line).isLine ? this.darkLine : this.dark;
      });
      this.bloomComposer.render();
      for (const [o, mat] of this.saved) (o as THREE.Mesh).material = mat;
      this.saved.clear();
      this.scene.background = bg;
      this.mix.uniforms.bloomTexture.value = this.bloomComposer.renderTarget2.texture;
      this.mix.uniforms.bloomStrength.value = 1;
    } else {
      this.mix.uniforms.bloomStrength.value = 0;
    }
    this.composer.render();
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    for (const c of [this.composer, this.bloomComposer]) {
      c.setPixelRatio(pixelRatio);
      c.setSize(w, h);
    }
  }

  dispose(): void {
    this.composer.dispose();
    this.bloomComposer.dispose();
    this.ao.dispose();
    this.bloom.dispose();
    this.smaa.dispose();
    this.dark.dispose();
    this.darkLine.dispose();
  }
}
