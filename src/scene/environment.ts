import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/** CC0 HDRI from Poly Haven; see public/hdri/SOURCES.md. */
export const HDRI_URL = `${import.meta.env.BASE_URL}hdri/studio_small_09_2k.hdr`;

/**
 * Image-based lighting. Starts with RoomEnvironment (instant, procedural)
 * and swaps to the HDRI once loaded; keeps RoomEnvironment if loading fails.
 * Patent mode always uses RoomEnvironment for neutral, even reflections.
 */
export class Environment {
  readonly room: THREE.Texture;
  hdri: THREE.Texture | null = null;
  private readonly pmrem: THREE.PMREMGenerator;
  status: "room" | "loading" | "hdri" | "failed" = "room";

  constructor(renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.room = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.room;
  }

  async loadHdri(url = HDRI_URL): Promise<void> {
    this.status = "loading";
    try {
      const tex = await new HDRLoader().loadAsync(url);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      this.hdri = this.pmrem.fromEquirectangular(tex).texture;
      tex.dispose();
      this.status = "hdri";
    } catch (err) {
      console.warn("[safelock] HDRI failed to load, using RoomEnvironment", err);
      this.status = "failed";
    }
  }

  apply(opts: { patent: boolean; background: boolean; backgroundColor: THREE.Color }): void {
    const env = opts.patent || !this.hdri ? this.room : this.hdri;
    this.scene.environment = env;
    this.scene.environmentIntensity = opts.patent ? 0.9 : 0.7;
    if (opts.background && !opts.patent && this.hdri) {
      this.scene.background = this.hdri;
      this.scene.backgroundBlurriness = 0.5;
    } else {
      this.scene.background = opts.backgroundColor;
      this.scene.backgroundBlurriness = 0;
    }
  }
}
