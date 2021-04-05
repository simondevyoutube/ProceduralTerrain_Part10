import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.125/build/three.module.js';

import {noise} from './noise.js';
import {quadtree} from './quadtree.js';
import {terrain_shader} from './terrain-shader.js';
import {terrain_builder_threaded} from './terrain-builder-threaded.js';
import {terrain_constants} from './terrain-constants.js';
import {texture_splatter} from './texture-splatter.js';
import {textures} from './textures.js';
import {utils} from './utils.js';

export const terrain = (function() {

  class TerrainChunkManager {
    constructor(params) {
      this._Init(params);
    }

    _Init(params) {
      this.params_ = params;

      this.builder_ = new terrain_builder_threaded.TerrainChunkRebuilder_Threaded();
      // this.builder_ = new terrainbuilder_.TerrainChunkRebuilder();

      this.LoadTextures_();

      this.InitNoise_(params);
      this.InitBiomes_(params);
      this.InitTerrain_(params);
    }

    LoadTextures_() {
      const loader = new THREE.TextureLoader();

      const noiseTexture = loader.load('./resources/simplex-noise.png');
      noiseTexture.wrapS = THREE.RepeatWrapping;
      noiseTexture.wrapT = THREE.RepeatWrapping;

      this.material_ = new THREE.RawShaderMaterial({
        uniforms: {
          diffuseMap: {
          },
          normalMap: {
          },
          noiseMap: {
            value: noiseTexture
          },
          logDepthBufFC: {
            value: 2.0 / (Math.log(this.params_.camera.far + 1.0) / Math.LN2),
          }
        },
        vertexShader: terrain_shader.VS,
        fragmentShader: terrain_shader.PS,
        side: THREE.FrontSide
      });
    }

    InitNoise_(params) {
      params.guiParams.noise = {
        octaves: 13,
        persistence: 0.5,
        lacunarity: 1.6,
        exponentiation: 7.5,
        height: terrain_constants.NOISE_HEIGHT,
        scale: terrain_constants.NOISE_SCALE,
        seed: 1
      };

      const onNoiseChanged = () => {
        this.builder_.Rebuild(this.chunks_);
      };

      const noiseRollup = params.gui.addFolder('Terrain.Noise');
      noiseRollup.add(params.guiParams.noise, "scale", 32.0, 4096.0).onChange(
          onNoiseChanged);
      noiseRollup.add(params.guiParams.noise, "octaves", 1, 20, 1).onChange(
          onNoiseChanged);
      noiseRollup.add(params.guiParams.noise, "persistence", 0.25, 1.0).onChange(
          onNoiseChanged);
      noiseRollup.add(params.guiParams.noise, "lacunarity", 0.01, 4.0).onChange(
          onNoiseChanged);
      noiseRollup.add(params.guiParams.noise, "exponentiation", 0.1, 10.0).onChange(
          onNoiseChanged);
      noiseRollup.add(params.guiParams.noise, "height", 0, 20000).onChange(
          onNoiseChanged);

      this.noise_ = new noise.Noise(params.guiParams.noise);
      this.noiseParams_ = params.guiParams.noise;

      params.guiParams.heightmap = {
        height: 16,
      };

      const heightmapRollup = params.gui.addFolder('Terrain.Heightmap');
      heightmapRollup.add(params.guiParams.heightmap, "height", 0, 128).onChange(
          onNoiseChanged);
    }

    InitBiomes_(params) {
      params.guiParams.biomes = {
        octaves: 2,
        persistence: 0.5,
        lacunarity: 2.0,
        scale: 2048.0,
        noiseType: 'simplex',
        seed: 2,
        exponentiation: 1,
        height: 1.0
      };

      const onNoiseChanged = () => {
        this.builder_.Rebuild(this.chunks_);
      };

      const noiseRollup = params.gui.addFolder('Terrain.Biomes');
      noiseRollup.add(params.guiParams.biomes, "scale", 64.0, 4096.0).onChange(
          onNoiseChanged);
      noiseRollup.add(params.guiParams.biomes, "octaves", 1, 20, 1).onChange(
          onNoiseChanged);
      noiseRollup.add(params.guiParams.biomes, "persistence", 0.01, 1.0).onChange(
          onNoiseChanged);
      noiseRollup.add(params.guiParams.biomes, "lacunarity", 0.01, 4.0).onChange(
          onNoiseChanged);
      noiseRollup.add(params.guiParams.biomes, "exponentiation", 0.1, 10.0).onChange(
          onNoiseChanged);

      this.biomes_ = new noise.Noise(params.guiParams.biomes);
      this.biomesParams_ = params.guiParams.biomes;

      const colourParams = {
        octaves: 1,
        persistence: 0.5,
        lacunarity: 2.0,
        exponentiation: 1.0,
        scale: 256.0,
        noiseType: 'simplex',
        seed: 2,
        height: 1.0,
      };
      this.colourNoise_ = new noise.Noise(colourParams);
      this.colourNoiseParams_ = colourParams;
    }

    InitTerrain_(params) {
      params.guiParams.terrain = {
        wireframe: false,
        fixedCamera: false,
      };

      this.groups_ = [...new Array(6)].map(_ => new THREE.Group());
      params.scene.add(...this.groups_);

      const terrainRollup = params.gui.addFolder('Terrain');
      terrainRollup.add(params.guiParams.terrain, "wireframe").onChange(() => {
        for (let k in this.chunks_) {
          this.chunks_[k].chunk.SetWireframe(params.guiParams.terrain.wireframe);
        }
      });

      terrainRollup.add(params.guiParams.terrain, "fixedCamera");

      this.chunks_ = {};
      this.params_ = params;
    }

    _CreateTerrainChunk(group, groupTransform, offset, cameraPosition, width, neighbours, resolution) {
      const params = {
        group: group,
        transform: groupTransform,
        material: this.material_,
        width: width,
        offset: offset,
        origin: cameraPosition.clone(),
        radius: terrain_constants.PLANET_RADIUS,
        resolution: resolution,
        neighbours: neighbours,
        biomeGenerator: this.biomes_,
        colourGenerator: new texture_splatter.TextureSplatter(
            {biomeGenerator: this.biomes_, colourNoise: this.colourNoise_}),
        heightGenerators: [new texture_splatter.HeightGenerator(
            this.noise_, offset, 100000, 100000 + 1)],
        noiseParams: this.noiseParams_,
        colourNoiseParams: this.colourNoiseParams_,
        biomesParams: this.biomesParams_,
        colourGeneratorParams: {
          biomeGeneratorParams: this.biomesParams_,
          colourNoiseParams: this.colourNoiseParams_,
        },
        heightGeneratorsParams: {
          min: 100000,
          max: 100000 + 1,
        }
      };

      return this.builder_.AllocateChunk(params);
    }

    Update(_) {
      const cameraPosition = this.params_.camera.position.clone();
      if (this.params_.guiParams.terrain.fixedCamera) {
        cameraPosition.copy(this.cachedCamera_);
      } else {
        this.cachedCamera_ = cameraPosition.clone();
      }

      this.builder_.Update();
      if (!this.builder_.Busy) {
        for (let k in this.chunks_) {
          this.chunks_[k].chunk.Show();
        }
        this.UpdateVisibleChunks_Quadtree_(cameraPosition);
      }

      for (let k in this.chunks_) {
        this.chunks_[k].chunk.Update(this.params_.camera.position);
      }
      for (let c of this.builder_.old_) {
        c.chunk.Update(this.params_.camera.position);
      }

      this.params_.scattering.uniforms.planetRadius.value = terrain_constants.PLANET_RADIUS;
      this.params_.scattering.uniforms.atmosphereRadius.value = terrain_constants.PLANET_RADIUS * 1.01;
    }

    UpdateVisibleChunks_Quadtree_(cameraPosition) {
      function _Key(c) {
        return c.position[0] + '/' + c.position[1] + ' [' + c.size + ']' + ' [' + c.index + ']';
      }

      const q = new quadtree.CubeQuadTree({
        radius: terrain_constants.PLANET_RADIUS,
        min_node_size: terrain_constants.QT_MIN_CELL_SIZE,
        max_node_size: terrain_constants.QT_MAX_CELL_SIZE,
      });
      q.Insert(cameraPosition);
      q.BuildNeighbours();

      const sides = q.GetChildren();

      let newTerrainChunks = {};
      const center = new THREE.Vector3();
      const dimensions = new THREE.Vector3();

      const _Child = (c) => {
        c.bounds.getCenter(center);
        c.bounds.getSize(dimensions);

        const child = {
          index: c.side,
          group: this.groups_[c.side],
          transform: sides[c.side].transform,
          position: [center.x, center.y, center.z],
          bounds: c.bounds,
          size: dimensions.x,
          neighbours: c.neighbours.map(n => n.size.x / c.size.x),
          neighboursOriginal: c.neighbours,
        };
        return child;
      };

      for (let i = 0; i < sides.length; i++) {
        for (let c of sides[i].children) {
          const child = _Child(c);
          const k = _Key(child);

          const left = c.neighbours[0].GetClosestChildrenSharingEdge(c.GetLeftEdgeMidpoint());
          const top = c.neighbours[1].GetClosestChildrenSharingEdge(c.GetTopEdgeMidpoint());
          const right = c.neighbours[2].GetClosestChildrenSharingEdge(c.GetRightEdgeMidpoint());
          const bottom = c.neighbours[3].GetClosestChildrenSharingEdge(c.GetBottomEdgeMidpoint());

          child.neighbourKeys = [...left, ...top, ...right, ...bottom].map(n => _Key(_Child(n)));
          child.debug = [left, top, right, bottom];
  
          newTerrainChunks[k] = child;
        }
      }


      const allChunks = newTerrainChunks;
      const intersection = utils.DictIntersection(this.chunks_, newTerrainChunks);
      const difference = utils.DictDifference(newTerrainChunks, this.chunks_);
      const recycle = Object.values(utils.DictDifference(this.chunks_, newTerrainChunks));

      if (0) {
        const partialRebuilds = {};

        for (let k in difference) {
          for (let n of difference[k].neighbourKeys) {
            if (n in this.chunks_) {
              partialRebuilds[n] = newTerrainChunks[n];
            }
          }
        }
        for (let k in partialRebuilds) {
          if (k in intersection) {
            recycle.push(this.chunks_[k]);
            delete intersection[k];
            difference[k] = allChunks[k];
          }
        }
      }

      this.builder_.RetireChunks(recycle);

      newTerrainChunks = intersection;

      const partialRebuilds = {};

      for (let k in difference) {
        const [xp, yp, zp] = difference[k].position;

        const offset = new THREE.Vector3(xp, yp, zp);
        newTerrainChunks[k] = {
          position: [xp, zp],
          chunk: this._CreateTerrainChunk(
              difference[k].group, difference[k].transform,
              offset, cameraPosition, difference[k].size, difference[k].neighbours,
              terrain_constants.QT_MIN_CELL_RESOLUTION),
        };

        for (let n of difference[k].neighbourKeys) {
          if (n in this.chunks_) {
            partialRebuilds[n] = intersection[n];
            partialRebuilds[n].chunk.params_.neighbours = allChunks[n].neighbours;
          }
        }
      }

      this.builder_.QuickRebuild(partialRebuilds);

      this.chunks_ = newTerrainChunks;
    }
  }

  return {
    TerrainChunkManager: TerrainChunkManager
  }
})();
