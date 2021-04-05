import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.125/build/three.module.js';

import {spline} from './spline.js';


export const camera_track = (function() {

  class _CameraTrack {
    constructor(params) {
      this._params = params;
      this._currentTime = 0.0;
      
      const lerp = (t, p1, p2) => {
        const p = new THREE.Vector3().lerpVectors(p1.pos, p2.pos, t);
        const q = p1.rot.clone().slerp(p2.rot, t);

        return {pos: p, rot: q};
      };
      this._spline = new spline.LinearSpline(lerp);

      for (let p of params.points) {
        this._spline.AddPoint(p.time, p.data);
      }
    }

    Update(timeInSeconds) {
      this._currentTime += timeInSeconds;

      const r = this._spline.Get(this._currentTime);

      this._params.camera.position.copy(r.pos);
      this._params.camera.quaternion.copy(r.rot);
    }
  };

  return {
    CameraTrack: _CameraTrack,
  };
})();
