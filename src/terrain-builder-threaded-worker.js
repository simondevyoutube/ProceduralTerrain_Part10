import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.125/build/three.module.js';

import {noise} from './noise.js';
import {texture_splatter} from './texture-splatter.js' ;
import {math} from './math.js';


const _D = new THREE.Vector3();
const _D1 = new THREE.Vector3();
const _D2 = new THREE.Vector3();
const _P = new THREE.Vector3();
const _P1 = new THREE.Vector3();
const _P2 = new THREE.Vector3();
const _P3 = new THREE.Vector3();
const _H = new THREE.Vector3();
const _W = new THREE.Vector3();
const _S = new THREE.Vector3();
const _C = new THREE.Vector3();

const _N = new THREE.Vector3();
const _N1 = new THREE.Vector3();
const _N2 = new THREE.Vector3();
const _N3 = new THREE.Vector3();


class _TerrainBuilderThreadedWorker {
  constructor() {
  }

  Init(params) {
    this.cachedParams_ = {...params};
    this.params_ = params;
    this.params_.offset = new THREE.Vector3(...params.offset);
    this.params_.origin = new THREE.Vector3(...params.origin);
    this.params_.noise = new noise.Noise(params.noiseParams);
    this.params_.heightGenerators = [
        new texture_splatter.HeightGenerator(
            this.params_.noise, params.offset,
            params.heightGeneratorsParams.min, params.heightGeneratorsParams.max)
    ];

    this.params_.biomeGenerator = new noise.Noise(params.biomesParams);
    this.params_.colourNoise = new noise.Noise(params.colourNoiseParams);
    this.params_.colourGenerator = new texture_splatter.TextureSplatter(
        {
          biomeGenerator: this.params_.biomeGenerator,
          colourNoise: this.params_.colourNoise
        });
  }

  _GenerateHeight(v) {
    return this.params_.heightGenerators[0].Get(v.x, v.y, v.z)[0];
  }

  GenerateNormals_(positions, indices) {
    const normals = new Array(positions.length).fill(0.0);
    for (let i = 0, n = indices.length; i < n; i+= 3) {
      const i1 = indices[i] * 3;
      const i2 = indices[i+1] * 3;
      const i3 = indices[i+2] * 3;

      _N1.fromArray(positions, i1);
      _N2.fromArray(positions, i2);
      _N3.fromArray(positions, i3);

      _D1.subVectors(_N3, _N2);
      _D2.subVectors(_N1, _N2);
      _D1.cross(_D2);

      normals[i1] += _D1.x;
      normals[i2] += _D1.x;
      normals[i3] += _D1.x;

      normals[i1+1] += _D1.y;
      normals[i2+1] += _D1.y;
      normals[i3+1] += _D1.y;

      normals[i1+2] += _D1.z;
      normals[i2+2] += _D1.z;
      normals[i3+2] += _D1.z;
    }
    return normals;
  }

  GenerateIndices_() {
    const resolution = this.params_.resolution + 2;
    const indices = [];
    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        indices.push(
            i * (resolution + 1) + j,
            (i + 1) * (resolution + 1) + j + 1,
            i * (resolution + 1) + j + 1);
        indices.push(
            (i + 1) * (resolution + 1) + j,
            (i + 1) * (resolution + 1) + j + 1,
            i * (resolution + 1) + j);
      }
    }
    return indices;
  }

  _ComputeNormal_CentralDifference(xp, yp, stepSize) {
    const localToWorld = this.params_.worldMatrix;
    const radius = this.params_.radius;
    const offset = this.params_.offset;
    const width = this.params_.width;
    const half = width / 2;
    const resolution = this.params_.resolution + 2;
    const effectiveResolution = resolution - 2;

    // Compute position
    const _ComputeWSPosition = (xpos, ypos) => {
      const xp = width * xpos;
      const yp = width * ypos;
      _P.set(xp - half, yp - half, radius);
      _P.add(offset);
      _P.normalize();
      _D.copy(_P);
      _D.transformDirection(localToWorld);

      _P.multiplyScalar(radius);
      _P.z -= radius;
      _P.applyMatrix4(localToWorld);

      // Purturb height along z-vector
      const height = this._GenerateHeight(_P);
      _H.copy(_D);
      _H.multiplyScalar(height);
      _P.add(_H);

      return _P;
    };

    const _ComputeWSPositionFromWS = (pos) => {
      _P.copy(pos);
      _P.normalize();
      _D.copy(_P);
      _P.multiplyScalar(radius);

      // Purturb height along z-vector
      const height = this._GenerateHeight(_P);
      _H.copy(_D);
      _H.multiplyScalar(height);
      _P.add(_H);

      return _P;
    };

    const _SphericalToCartesian = (theta, phi) => {
      const x = (Math.sin(theta) * Math.cos(phi));
      const y = (Math.sin(theta) * Math.sin(phi));
      const z = (Math.cos(theta));
      _P.set(x, y, z);
      _P.multiplyScalar(radius);
      const height = this._GenerateHeight(_P);
      _P.set(x, y, z);
      _P.multiplyScalar(height + radius);
      return _P;
    };

    //
    _P3.copy(_ComputeWSPosition(xp, yp));
    _D.copy(_P3);
    _D.normalize();

    const phi = Math.atan2(_D.y, _D.x);
    const theta = Math.atan2((_D.x * _D.x + _D.y * _D.y) ** 0.5, _D.z);

    _P1.copy(_ComputeWSPosition(xp, yp));
    _P2.copy(_SphericalToCartesian(theta, phi));

    // Fixme - Fixed size right now, calculate an appropriate delta
    const delta = 0.001;

    _P1.copy(_SphericalToCartesian(theta - delta, phi));
    _P2.copy(_SphericalToCartesian(theta + delta, phi));
    _D1.subVectors(_P1, _P2);
    _D1.normalize();

    _P1.copy(_SphericalToCartesian(theta, phi - delta));
    _P2.copy(_SphericalToCartesian(theta, phi + delta));
    _D2.subVectors(_P1, _P2);
    _D2.normalize();

  
    _P1.copy(_D1);
    _P1.multiplyScalar(-0.5*width*stepSize/effectiveResolution);
    _P2.copy(_P1);
    _P2.multiplyScalar(-1)
    _P1.add(_P3);
    _P2.add(_P3);
    _P1.copy(_ComputeWSPositionFromWS(_P1));
    _P2.copy(_ComputeWSPositionFromWS(_P2));
    _D1.subVectors(_P1, _P2);
    _D1.normalize();

    _P1.copy(_D2);
    _P1.multiplyScalar(-0.5*width*stepSize/effectiveResolution);
    _P2.copy(_P1);
    _P2.multiplyScalar(-1)
    _P1.add(_P3);
    _P2.add(_P3);
    _P1.copy(_ComputeWSPositionFromWS(_P1));
    _P2.copy(_ComputeWSPositionFromWS(_P2));
    _D2.subVectors(_P1, _P2);
    _D2.normalize();

    _D1.cross(_D2);

    return _D1;
  }

  RebuildEdgeNormals_(normals) {
    const resolution = this.params_.resolution + 2;
    const effectiveResolution = resolution - 2;

    let x = 1;
    for (let z = 1; z <= resolution-1; z+=1) {
      const i = x * (resolution + 1) + z;
      _N.copy(this._ComputeNormal_CentralDifference((x-1) / effectiveResolution, (z-1) / effectiveResolution, 1))
      normals[i * 3 + 0] = _N.x;
      normals[i * 3 + 1] = _N.y;
      normals[i * 3 + 2] = _N.z;
    }

    let z = resolution - 1;
    for (let x = 1; x <= resolution-1; x+=1) {
      const i = (x) * (resolution + 1) + z;
      _N.copy(this._ComputeNormal_CentralDifference((x-1) / effectiveResolution, (z-1) / effectiveResolution, 1))
      normals[i * 3 + 0] = _N.x;
      normals[i * 3 + 1] = _N.y;
      normals[i * 3 + 2] = _N.z;
    }

    x = resolution - 1;
    for (let z = 1; z <= resolution-1; z+=1) {
      const i = x * (resolution + 1) + z;
      _N.copy(this._ComputeNormal_CentralDifference((x-1) / effectiveResolution, (z-1) / effectiveResolution, 1))
      normals[i * 3 + 0] = _N.x;
      normals[i * 3 + 1] = _N.y;
      normals[i * 3 + 2] = _N.z;
    }

    z = 1;
    for (let x = 1; x <= resolution-1; x+=1) {
      const i = (x) * (resolution + 1) + z;
      _N.copy(this._ComputeNormal_CentralDifference((x-1) / effectiveResolution, (z-1) / effectiveResolution, 1))
      normals[i * 3 + 0] = _N.x;
      normals[i * 3 + 1] = _N.y;
      normals[i * 3 + 2] = _N.z;
    }
  }

  FixEdgesToMatchNeighbours_(positions, normals, colours) {
    const resolution = this.params_.resolution + 2;
    const effectiveResolution = resolution - 2;

    if (this.params_.neighbours[0] > 1) {
      const x = 1;
      const stride = this.params_.neighbours[0];
      for (let z = 1; z <= resolution-1; z+=1) {
        const i = x * (resolution + 1) + z;
        // colours[i * 3 + 0] = 0;
        // colours[i * 3 + 1] = 0;
        // colours[i * 3 + 2] = 1;

        _N.copy(this._ComputeNormal_CentralDifference((x-1) / effectiveResolution, (z-1) / effectiveResolution, stride))
        normals[i * 3 + 0] = _N.x;
        normals[i * 3 + 1] = _N.y;
        normals[i * 3 + 2] = _N.z;
      }
      for (let z = 1; z <= resolution-1-stride; z+=stride) {
        const i1 = x * (resolution + 1) + z;
        const i2 = x * (resolution + 1) + (z + stride);

        for (let s = 1; s < stride; ++s) {
          const i = x * (resolution + 1) + z + s;
          const p = s / stride;
          for (let j = 0; j < 3; ++j) {
            positions[i * 3 + j] = math.lerp(p, positions[i1 * 3 + j], positions[i2 * 3 + j]);
            normals[i * 3 + j] = math.lerp(p, normals[i1 * 3 + j], normals[i2 * 3 + j]);
          }
          // colours[i * 3 + 0] = 0;
          // colours[i * 3 + 1] = 1;
          // colours[i * 3 + 2] = 0;
        }
      }
    }

    if (this.params_.neighbours[1] > 1) {
      const z = resolution - 1;
      const stride = this.params_.neighbours[1];
      for (let x = 1; x <= resolution-1; x+=1) {
        const i = (x) * (resolution + 1) + z;
        // colours[i * 3 + 0] = 0;
        // colours[i * 3 + 1] = 0;
        // colours[i * 3 + 2] = 1;

        _N.copy(this._ComputeNormal_CentralDifference((x-1) / effectiveResolution, (z-1) / effectiveResolution, stride))
        normals[i * 3 + 0] = _N.x;
        normals[i * 3 + 1] = _N.y;
        normals[i * 3 + 2] = _N.z;
      }
      for (let x = 1; x <= resolution-1-stride; x+=stride) {
        const i1 = (x) * (resolution + 1) + z;
        const i2 = (x + stride) * (resolution + 1) + z;

        for (let s = 1; s < stride; ++s) {
          const i = (x + s) * (resolution + 1) + z;
          const p = s / stride;
          for (let j = 0; j < 3; ++j) {
            positions[i * 3 + j] = math.lerp(p, positions[i1 * 3 + j], positions[i2 * 3 + j]);
            normals[i * 3 + j] = math.lerp(p, normals[i1 * 3 + j], normals[i2 * 3 + j]);
          }
          // colours[i * 3 + 0] = 1;
          // colours[i * 3 + 1] = 1;
          // colours[i * 3 + 2] = 0;
        }
      }
    }

    if (this.params_.neighbours[2] > 1) {
      const x = resolution - 1;
      const stride = this.params_.neighbours[2];
      for (let z = 1; z <= resolution-1; z+=1) {
        const i = x * (resolution + 1) + z;
        // colours[i * 3 + 0] = 0;
        // colours[i * 3 + 1] = 0;
        // colours[i * 3 + 2] = 1;

        _N.copy(this._ComputeNormal_CentralDifference((x-1) / effectiveResolution, (z-1) / effectiveResolution, stride))
        normals[i * 3 + 0] = _N.x;
        normals[i * 3 + 1] = _N.y;
        normals[i * 3 + 2] = _N.z;
      }
      for (let z = 1; z <= resolution-1-stride; z+=stride) {
        const i1 = x * (resolution + 1) + z;
        const i2 = x * (resolution + 1) + (z + stride);

        for (let s = 1; s < stride; ++s) {
          const i = x * (resolution + 1) + z + s;
          const p = s / stride;
          for (let j = 0; j < 3; ++j) {
            positions[i * 3 + j] = math.lerp(p, positions[i1 * 3 + j], positions[i2 * 3 + j]);
            normals[i * 3 + j] = math.lerp(p, normals[i1 * 3 + j], normals[i2 * 3 + j]);
          }
          // colours[i * 3 + 0] = 0;
          // colours[i * 3 + 1] = 1;
          // colours[i * 3 + 2] = 1;
        }
      }
    }

    if (this.params_.neighbours[3] > 1) {
      const z = 1;
      const stride = this.params_.neighbours[3];
      for (let x = 1; x <= resolution-1; x+=1) {
        const i = (x) * (resolution + 1) + z;
        // colours[i * 3 + 0] = 0;
        // colours[i * 3 + 1] = 0;
        // colours[i * 3 + 2] = 1;

        _N.copy(this._ComputeNormal_CentralDifference((x-1) / effectiveResolution, (z-1) / effectiveResolution, stride))
        normals[i * 3 + 0] = _N.x;
        normals[i * 3 + 1] = _N.y;
        normals[i * 3 + 2] = _N.z;
      }
      for (let x = 1; x <= resolution-1-stride; x+=stride) {
        const i1 = (x) * (resolution + 1) + z;
        const i2 = (x + stride) * (resolution + 1) + z;

        for (let s = 1; s < stride; ++s) {
          const i = (x + s) * (resolution + 1) + z;
          const p = s / stride;
          for (let j = 0; j < 3; ++j) {
            positions[i * 3 + j] = math.lerp(p, positions[i1 * 3 + j], positions[i2 * 3 + j]);
            normals[i * 3 + j] = math.lerp(p, normals[i1 * 3 + j], normals[i2 * 3 + j]);
          }
          // colours[i * 3 + 0] = 1;
          // colours[i * 3 + 1] = 0;
          // colours[i * 3 + 2] = 0;
        }
      }
    }
  }

  FixEdgeSkirt_(positions, up, normals) {
    const resolution = this.params_.resolution + 2;

    const _ApplyFix = (x, y, xp, yp) => {
      const skirtIndex = x * (resolution + 1) + y;
      const proxyIndex = xp * (resolution + 1) + yp;

      _P.fromArray(positions, proxyIndex * 3);
      _D.fromArray(up, proxyIndex * 3);
      _D.multiplyScalar(0);
      _P.add(_D);
      positions[skirtIndex * 3 + 0] = _P.x;
      positions[skirtIndex * 3 + 1] = _P.y;
      positions[skirtIndex * 3 + 2] = _P.z;

      // Normal will be fucked, copy it from proxy point
      normals[skirtIndex * 3 + 0] = normals[proxyIndex * 3 + 0];
      normals[skirtIndex * 3 + 1] = normals[proxyIndex * 3 + 1];
      normals[skirtIndex * 3 + 2] = normals[proxyIndex * 3 + 2];
    };

    for (let y = 0; y <= resolution; ++y) {
      _ApplyFix(0, y, 1, y);
    }
    for (let y = 0; y <= resolution; ++y) {
      _ApplyFix(resolution, y, resolution - 1, y);
    }
    for (let x = 0; x <= resolution; ++x) {
      _ApplyFix(x, 0, x, 1);
    }
    for (let x = 0; x <= resolution; ++x) {
      _ApplyFix(x, resolution, x, resolution - 1);
    }
  }

  NormalizeNormals_(normals) {
    for (let i = 0, n = normals.length; i < n; i+=3) {
      _N.fromArray(normals, i);
      _N.normalize();
      normals[i] = _N.x;
      normals[i+1] = _N.y;
      normals[i+2] = _N.z;
    }
  }

  RebuildEdgePositions_(positions) {
    const localToWorld = this.params_.worldMatrix;
    const resolution = this.params_.resolution + 2;
    const radius = this.params_.radius;
    const offset = this.params_.offset;
    const origin = this.params_.origin;
    const width = this.params_.width;
    const half = width / 2;
    const effectiveResolution = resolution - 2;

    const _ComputeOriginOffsetPosition = (xpos, ypos) => {
      const xp = width * xpos;
      const yp = width * ypos;
      _P.set(xp - half, yp - half, radius);
      _P.add(offset);
      _P.normalize();
      _D.copy(_P);
      _D.transformDirection(localToWorld);

      _P.multiplyScalar(radius);
      _P.z -= radius;
      _P.applyMatrix4(localToWorld);

      // Keep the absolute world space position to sample noise
      _W.copy(_P);

      // Move the position relative to the origin
      _P.sub(origin);

      // Purturb height along z-vector
      const height = this._GenerateHeight(_W);
      _H.copy(_D);
      _H.multiplyScalar(height);
      _P.add(_H);

      return _P;
    }

    let x = 1;
    for (let z = 1; z <= resolution-1; z++) {
      const i = x * (resolution + 1) + z;
      const p = _ComputeOriginOffsetPosition((x-1) / effectiveResolution, (z-1) / effectiveResolution);
      positions[i * 3 + 0] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }

    let z = resolution - 1;
    for (let x = 1; x <= resolution-1; x++) {
      const i = (x) * (resolution + 1) + z;
      const p = _ComputeOriginOffsetPosition((x-1) / effectiveResolution, (z-1) / effectiveResolution);
      positions[i * 3 + 0] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }

    x = resolution - 1;
    for (let z = 1; z <= resolution-1; z++) {
      const i = x * (resolution + 1) + z;
      const p = _ComputeOriginOffsetPosition((x-1) / effectiveResolution, (z-1) / effectiveResolution);
      positions[i * 3 + 0] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }

    z = 1;
    for (let x = 1; x <= resolution-1; x++) {
      const i = (x) * (resolution + 1) + z;
      const p = _ComputeOriginOffsetPosition((x-1) / effectiveResolution, (z-1) / effectiveResolution);
      positions[i * 3 + 0] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
  }

  Rebuild() {
    const positions = [];
    const up = [];
    const coords = [];

    const localToWorld = this.params_.worldMatrix;
    const resolution = this.params_.resolution + 2;
    const radius = this.params_.radius;
    const offset = this.params_.offset;
    const origin = this.params_.origin;
    const width = this.params_.width;
    const half = width / 2;
    const effectiveResolution = resolution - 2;

    for (let x = -1; x <= effectiveResolution + 1; x++) {
      const xp = width * x / effectiveResolution;
      for (let y = -1; y <= effectiveResolution + 1; y++) {
        const yp = width * y / effectiveResolution;

        // Compute position
        _P.set(xp - half, yp - half, radius);
        _P.add(offset);
        _P.normalize();
        _D.copy(_P);
        _D.transformDirection(localToWorld);

        _P.multiplyScalar(radius);
        _P.z -= radius;
        _P.applyMatrix4(localToWorld);

        // Keep the absolute world space position to sample noise
        _W.copy(_P);

        // Move the position relative to the origin
        _P.sub(origin);

        // Purturb height along z-vector
        const height = this._GenerateHeight(_W);
        _H.copy(_D);
        _H.multiplyScalar(height);
        _P.add(_H);

        positions.push(_P.x, _P.y, _P.z);

        _C.copy(_W);
        _C.add(_H);
        coords.push(_C.x, _C.y, _C.z);

        _S.set(_W.x, _W.y, height);

        up.push(_D.x, _D.y, _D.z);
      }
    }

    const colours = new Array(positions.length).fill(1.0);

    // Generate indices
    const indices = this.GenerateIndices_();
    const normals = this.GenerateNormals_(positions, indices);

    this.RebuildEdgePositions_(positions);
    this.RebuildEdgeNormals_(normals);
    this.FixEdgesToMatchNeighbours_(positions, normals, colours);
    this.FixEdgeSkirt_(positions, up, normals);
    this.NormalizeNormals_(normals);

    const bytesInFloat32 = 4;
    const bytesInInt32 = 4;
    const positionsArray = new Float32Array(
        new SharedArrayBuffer(bytesInFloat32 * positions.length));
    const coloursArray = new Float32Array(
        new SharedArrayBuffer(bytesInFloat32 * colours.length));
    const normalsArray = new Float32Array(
        new SharedArrayBuffer(bytesInFloat32 * normals.length));
    const coordsArray = new Float32Array(
        new SharedArrayBuffer(bytesInFloat32 * coords.length));
    const indicesArray = new Uint32Array(
        new SharedArrayBuffer(bytesInInt32 * indices.length));

    positionsArray.set(positions, 0);
    coloursArray.set(colours, 0);
    normalsArray.set(normals, 0);
    coordsArray.set(coords, 0);
    indicesArray.set(indices, 0);

    return {
      positions: positionsArray,
      colours: coloursArray,
      normals: normalsArray,
      coords: coordsArray,
      indices: indicesArray,
    };
  }

  QuickRebuild(mesh) {
    const positions = mesh.positions;
    const normals = mesh.normals;
    const colours = mesh.colours;
    const up = [];
    const indices = mesh.indices;

    const localToWorld = this.params_.worldMatrix;
    const resolution = this.params_.resolution + 2;
    const radius = this.params_.radius;
    const offset = this.params_.offset;
    const origin = this.params_.origin;
    const width = this.params_.width;
    const half = width / 2;
    const effectiveResolution = resolution - 2;

    colours.fill(1.0);

    this.RebuildEdgePositions_(positions);
    this.RebuildEdgeNormals_(normals);
    this.FixEdgesToMatchNeighbours_(positions, normals, colours);
    this.FixEdgeSkirt_(positions, up, normals);
    this.NormalizeNormals_(normals);

    return mesh;
  }
}

const _CHUNK = new _TerrainBuilderThreadedWorker();

self.onmessage = (msg) => {
  if (msg.data.subject == 'build_chunk') {
    _CHUNK.Init(msg.data.params);

    const rebuiltData = _CHUNK.Rebuild();
    self.postMessage({subject: 'build_chunk_result', data: rebuiltData});
  } else if (msg.data.subject == 'rebuild_chunk') {
    _CHUNK.Init(msg.data.params);

    const rebuiltData = _CHUNK.QuickRebuild(msg.data.mesh);
    self.postMessage({subject: 'quick_rebuild_chunk_result', data: rebuiltData});
  }
};