import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.125/build/three.module.js';
import {WEBGL} from 'https://cdn.jsdelivr.net/npm/three@0.125/examples/jsm/WebGL.js';
import {graphics} from './graphics.js';


export const game = (function() {
  return {
    Game: class {
      constructor() {
        this._Initialize();
      }

      _Initialize() {
        this.graphics_ = new graphics.Graphics(this);
        if (!this.graphics_.Initialize()) {
          this._DisplayError('WebGL2 is not available.');
          return;
        }

        this._previousRAF = null;
        this._minFrameTime = 1.0 / 10.0;
        this._entities = {};

        this._OnInitialize();
        this._RAF();
      }

      _DisplayError(errorText) {
        const error = document.getElementById('error');
        error.innerText = errorText;
      }

      _RAF() {
        requestAnimationFrame((t) => {
          if (this._previousRAF === null) {
            this._previousRAF = t;
          }
          this._Render(t - this._previousRAF);
          this._previousRAF = t;
        });
      }

      _AddEntity(name, entity, priority) {
        this._entities[name] = {entity: entity, priority: priority};
      }

      _StepEntities(timeInSeconds) {
        const sortedEntities = Object.values(this._entities);

        sortedEntities.sort((a, b) => {
          return a.priority - b.priority;
        })

        for (let s of sortedEntities) {
          s.entity.Update(timeInSeconds);
        }
      }

      _Render(timeInMS) {
        const timeInSeconds = Math.min(timeInMS * 0.001, this._minFrameTime);

        this._OnStep(timeInSeconds);
        this._StepEntities(timeInSeconds);
        this.graphics_.Render(timeInSeconds);

        this._RAF();
      }
    }
  };
})();
