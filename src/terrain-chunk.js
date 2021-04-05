import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.125/build/three.module.js';


export const terrain_chunk = (function() {

  class TerrainChunk {
    constructor(params) {
      this.params_ = params;
      this._Init(params);
    }
    
    Destroy() {
      this.params_.group.remove(this.mesh_);
    }

    Hide() {
      this.mesh_.visible = false;
    }

    Show() {
      this.mesh_.visible = true;
    }

    _Init(params) {
      this.geometry_ = new THREE.BufferGeometry();
      this.mesh_ = new THREE.Mesh(this.geometry_, params.material);
      this.mesh_.castShadow = false;
      this.mesh_.receiveShadow = true;
      this.mesh_.frustumCulled = false;
      this.params_.group.add(this.mesh_);
      this.Reinit(params);
    }

    Update(cameraPosition) {
      this.mesh_.position.copy(this.params_.origin);
      this.mesh_.position.sub(cameraPosition);
    }

    Reinit(params) {
      this.params_ = params;
      this.mesh_.position.set(0, 0, 0);
    }

    SetWireframe(b) {
      this.mesh_.material.wireframe = b;
    }

    RebuildMeshFromData(data) {
      this.geometry_.setAttribute(
          'position', new THREE.Float32BufferAttribute(data.positions, 3));
      this.geometry_.setAttribute(
          'color', new THREE.Float32BufferAttribute(data.colours, 3));
      this.geometry_.setAttribute(
          'normal', new THREE.Float32BufferAttribute(data.normals, 3));
      this.geometry_.setAttribute(
          'coords', new THREE.Float32BufferAttribute(data.coords, 3));
      this.geometry_.setIndex(
          new THREE.BufferAttribute(data.indices, 1));
      this.rebuildData_ = data;
      this.geometry_.attributes.position.needsUpdate = true;
      this.geometry_.attributes.normal.needsUpdate = true;
      this.geometry_.attributes.color.needsUpdate = true;
      this.geometry_.attributes.coords.needsUpdate = true;
    }

    QuickRebuildMeshFromData(data) {
      this.geometry_.attributes.position.array.set(data.positions, 0)
      this.geometry_.attributes.normal.array.set(data.normals, 0)
      this.geometry_.attributes.color.array.set(data.colours, 0)
      this.geometry_.attributes.position.needsUpdate = true;
      this.geometry_.attributes.normal.needsUpdate = true;
      this.geometry_.attributes.color.needsUpdate = true;
    }
  }

  return {
    TerrainChunk: TerrainChunk
  }
})();