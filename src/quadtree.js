import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.125/build/three.module.js';


export const quadtree = (function() {

  class CubeQuadTree {
    constructor(params) {
      this._params = params;
      this.sides_ = [];

      const r = params.radius;
      let m;

      const transforms = [];

      // +Y 0
      m = new THREE.Matrix4();
      m.makeRotationX(-Math.PI / 2);
      m.premultiply(new THREE.Matrix4().makeTranslation(0, r, 0));
      transforms.push(m);

      // -Y 1
      m = new THREE.Matrix4();
      m.makeRotationX(Math.PI / 2);
      m.premultiply(new THREE.Matrix4().makeTranslation(0, -r, 0));
      transforms.push(m);

      // +X 2
      m = new THREE.Matrix4();
      m.makeRotationY(Math.PI / 2);
      m.premultiply(new THREE.Matrix4().makeTranslation(r, 0, 0));
      transforms.push(m);

      // -X 3
      m = new THREE.Matrix4();
      m.makeRotationY(-Math.PI / 2);
      m.premultiply(new THREE.Matrix4().makeTranslation(-r, 0, 0));
      transforms.push(m);

      // +Z 4
      m = new THREE.Matrix4();
      m.premultiply(new THREE.Matrix4().makeTranslation(0, 0, r));
      transforms.push(m);
      
      // -Z 5
      m = new THREE.Matrix4();
      m.makeRotationY(Math.PI);
      m.premultiply(new THREE.Matrix4().makeTranslation(0, 0, -r));
      transforms.push(m);

      for (let i = 0; i < transforms.length; ++i) {
        const t = transforms[i];
        this.sides_.push({
          transform: t.clone(),
          quadtree: new QuadTree({
            side: i,
            size: r,
            min_node_size: params.min_node_size,
            max_node_size: params.max_node_size,
            localToWorld: t,
            worldToLocal: t.clone().invert()
          }),
        });
      }

      this.BuildRootNeighbourInfo_();
    }

    BuildRootNeighbourInfo_() {
      const _FindClosestNeighbour = (edgeMidpoint, otherNodes) => {
        const neighbours = [...otherNodes].sort((a, b) => {
          return a.sphereCenter.distanceTo(edgeMidpoint) - b.sphereCenter.distanceTo(edgeMidpoint);
        });
        const test = [...otherNodes].map(c => {
          return c.sphereCenter.distanceTo(edgeMidpoint);
        }).sort((a, b) => a - b);
        return neighbours[0];
      };

      const nodes = this.sides_.map(s => s.quadtree.root_);

      for (let i = 0; i < 6; ++i) {
        const node = nodes[i];
        const edgeMidpoints = [
          node.GetLeftEdgeMidpoint(),
          node.GetTopEdgeMidpoint(),
          node.GetRightEdgeMidpoint(),
          node.GetBottomEdgeMidpoint(),
        ];
        const otherNodes = nodes.filter(n => n.side != node.side);

        const neighbours = edgeMidpoints.map(p => _FindClosestNeighbour(p, otherNodes));
        node.neighbours = neighbours.map(n => nodes[n.side]);
      }
    }

    GetChildren() {
      const children = [];

      for (let s of this.sides_) {
        const side = {
          transform: s.transform,
          children: s.quadtree.GetChildren(),
        }
        children.push(side);
      }
      return children;
    }

    Insert(pos) {
      for (let s of this.sides_) {
        s.quadtree.Insert(pos);
      }
    }

    BuildNeighbours() {
      let queue = [];
      for (let s of this.sides_) {
        queue.push(s.quadtree.root_);
      }

      while (queue.length > 0) {
        const node = queue.shift();

        this.sides_[node.side].quadtree.BuildNeighbours_Child_(node);

        for (let c of node.children) {
          queue.push(c);
        }
      }
    }
  }

  const LEFT = 0;
  const TOP = 1;
  const RIGHT = 2;
  const BOTTOM = 3;

  const TOP_LEFT = 2;
  const TOP_RIGHT = 3;
  const BOTTOM_LEFT = 0;
  const BOTTOM_RIGHT = 1;

  class Node {
    constructor(params) {
    }

    GetNeighbour(side) {
      return this.neighbours[side];
    }

    GetClosestChild(node) {
      const children = [...this.children].sort((a, b) => {
        return a.sphereCenter.distanceTo(node.sphereCenter) - b.sphereCenter.distanceTo(node.sphereCenter);
      });
      const test = [...this.children].map(c => {
        return c.sphereCenter.distanceTo(node.sphereCenter);
      }).sort((a, b) => a - b);
      return children[0];
    }

    GetChild(pos) {
      return this.children[pos];
    }

    GetClosestChildrenSharingEdge(edgePoint) {
      if (this.children.length == 0) {
        const edgePointLocal = edgePoint.clone().applyMatrix4(this.tree.worldToLocal);
        if (edgePointLocal.x == this.bounds.min.x || edgePointLocal.x == this.bounds.max.x ||
            edgePointLocal.y == this.bounds.min.y || edgePointLocal.y == this.bounds.max.y) {
          return [this];
        }
        return [];
      }

      const matches = [];
      for (let i = 0; i < this.children.length; ++i) {
        const child = this.children[i];

        matches.push(...child.GetClosestChildrenSharingEdge(edgePoint));
      }
      return matches;
    }

    GetLeftEdgeMidpoint() {
      const v = new THREE.Vector3(this.bounds.min.x, (this.bounds.max.y + this.bounds.min.y) * 0.5, 0);
      v.applyMatrix4(this.localToWorld);
      return v;
    }

    GetRightEdgeMidpoint() {
      const v = new THREE.Vector3(this.bounds.max.x, (this.bounds.max.y + this.bounds.min.y) * 0.5, 0);
      v.applyMatrix4(this.localToWorld);
      return v;
    }

    GetTopEdgeMidpoint() {
      const v = new THREE.Vector3((this.bounds.max.x + this.bounds.min.x) * 0.5, this.bounds.max.y, 0);
      v.applyMatrix4(this.localToWorld);
      return v;
    }

    GetBottomEdgeMidpoint() {
      const v = new THREE.Vector3((this.bounds.max.x + this.bounds.min.x) * 0.5, this.bounds.min.y, 0);
      v.applyMatrix4(this.localToWorld);
      return v;
    }
  };

  class QuadTree {
    constructor(params) {
      const s = params.size;
      const b = new THREE.Box3(
        new THREE.Vector3(-s, -s, 0),
        new THREE.Vector3(s, s, 0));
      this.root_ = new Node();
      this.root_.side = params.side;
      this.root_.bounds = b;
      this.root_.children = [];
      this.root_.parent = null;
      this.root_.tree = this;
      this.root_.center = b.getCenter(new THREE.Vector3());
      this.root_.sphereCenter = b.getCenter(new THREE.Vector3());
      this.root_.localToWorld = params.localToWorld;
      this.root_.size = b.getSize(new THREE.Vector3());
      this.root_.root = true;
      this.root_.neighbours = [null, null, null, null];

      this._params = params;
      this.worldToLocal = params.worldToLocal;
      this.root_.sphereCenter = this.root_.center.clone();
      this.root_.sphereCenter.applyMatrix4(this._params.localToWorld);
      this.root_.sphereCenter.normalize();
      this.root_.sphereCenter.multiplyScalar(this._params.size);
    }

    GetChildren() {
      const children = [];
      this._GetChildren(this.root_, children);
      return children;
    }

    _GetChildren(node, target) {
      if (node.children.length == 0) {
        target.push(node);
        return;
      }

      for (let c of node.children) {
        this._GetChildren(c, target);
      }
    }

    BuildNeighbours_Child_(node) {      
      const children = node.children;
      if (children.length == 0) {
        const hx = (node.bounds.max.x + node.bounds.min.x) * 0.5;
        const hy = (node.bounds.max.y + node.bounds.min.y) * 0.5;
        const nx = node.bounds.min.x;
        const ny = node.bounds.min.y;
        const px = node.bounds.max.x;
        const py = node.bounds.max.y;
        const b1 = new THREE.Vector3(nx, hy, 0);
        const b2 = new THREE.Vector3(hx, py, 0);
        const b3 = new THREE.Vector3(px, hy, 0);
        const b4 = new THREE.Vector3(hx, ny, 0);

        return;
      }

      if (node.center.x == 375000 && node.center.y == -125000 && node.side == 1 && node.size.x == 50000) {
        let a = 0;
      }
      if (node.root && node.side == 1) {
        let a = 0;
      }
      if (node.center.x == 200000 && node.center.y == -200000 && node.side == 1) {
        let a =0;
      }
       // Bottom left
      let leftNeighbour = node.GetNeighbour(LEFT);
      if (leftNeighbour.children.length > 0) {
        if (leftNeighbour.side != node.side) {
          leftNeighbour = leftNeighbour.GetClosestChild(children[0]);
        } else {
          leftNeighbour = leftNeighbour.GetChild(BOTTOM_RIGHT);
        }
      }

      let bottomNeighbour = node.GetNeighbour(BOTTOM);
      if (bottomNeighbour.children.length > 0) {
        if (bottomNeighbour.side != node.side) {
          bottomNeighbour = bottomNeighbour.GetClosestChild(children[0]);
        } else {
          bottomNeighbour = bottomNeighbour.GetChild(TOP_LEFT);
        }
      }
      children[0].neighbours = [leftNeighbour, children[TOP_LEFT], children[BOTTOM_RIGHT], bottomNeighbour];

      // Bottom right
      let rightNeighbour = node.GetNeighbour(RIGHT);
      if (rightNeighbour.children.length > 0) {
        if (rightNeighbour.side != node.side) {
          rightNeighbour = rightNeighbour.GetClosestChild(children[1]);
        } else {
          rightNeighbour = rightNeighbour.GetChild(BOTTOM_LEFT);
        }
      }

      bottomNeighbour = node.GetNeighbour(BOTTOM);
      if (bottomNeighbour.children.length > 0) {
        if (bottomNeighbour.side != node.side) {
          bottomNeighbour = bottomNeighbour.GetClosestChild(children[1]);
        } else {
          bottomNeighbour = bottomNeighbour.GetChild(TOP_RIGHT);
        }
      }
      children[1].neighbours = [children[BOTTOM_LEFT], children[TOP_RIGHT], rightNeighbour, bottomNeighbour];

      // Top left
      leftNeighbour = node.GetNeighbour(LEFT);
      if (leftNeighbour.children.length > 0) {
        if (leftNeighbour.side != node.side) {
          leftNeighbour = leftNeighbour.GetClosestChild(children[2]);
        } else {
          leftNeighbour = leftNeighbour.GetChild(TOP_RIGHT);
        }
      }

      let topNeighbour = node.GetNeighbour(TOP);
      if (topNeighbour.children.length > 0) {
        if (topNeighbour.side != node.side) {
          topNeighbour = topNeighbour.GetClosestChild(children[2]);
        } else {
          topNeighbour = topNeighbour.GetChild(BOTTOM_LEFT);
        }
      }
      children[2].neighbours = [leftNeighbour, topNeighbour, children[TOP_RIGHT], children[BOTTOM_LEFT]];

      // Top right
      topNeighbour = node.GetNeighbour(TOP);
      if (topNeighbour.children.length > 0) {
        if (topNeighbour.side != node.side) {
          topNeighbour = topNeighbour.GetClosestChild(children[3]);
        } else {
          topNeighbour = topNeighbour.GetChild(BOTTOM_RIGHT);
        }
      }

      rightNeighbour = node.GetNeighbour(RIGHT);
      if (rightNeighbour.children.length > 0) {
        if (rightNeighbour.side != node.side) {
          rightNeighbour = rightNeighbour.GetClosestChild(children[3]);
        } else {
          rightNeighbour = rightNeighbour.GetChild(TOP_LEFT);
        }
      }
      children[3].neighbours = [children[TOP_LEFT], topNeighbour, rightNeighbour, children[BOTTOM_RIGHT]];
    }

    Insert(pos) {
      this._Insert(this.root_, pos);
    }

    _Insert(child, pos) {
      // hack
      const distToChild = this._DistanceToChild(child, pos);

      if ((distToChild < child.size.x * 1.0 && child.size.x > this._params.min_node_size)) {
        child.children = this._CreateChildren(child);

        for (let c of child.children) {
          this._Insert(c, pos);
        }
      }
    }

    _DistanceToChild(child, pos) {
      return child.sphereCenter.distanceTo(pos);
    }

    _CreateChildren(child) {
      const midpoint = child.bounds.getCenter(new THREE.Vector3());

      // Bottom left
      const b1 = new THREE.Box3(child.bounds.min, midpoint);

      // Bottom right
      const b2 = new THREE.Box3(
        new THREE.Vector3(midpoint.x, child.bounds.min.y, 0),
        new THREE.Vector3(child.bounds.max.x, midpoint.y, 0));

      // Top left
      const b3 = new THREE.Box3(
        new THREE.Vector3(child.bounds.min.x, midpoint.y, 0),
        new THREE.Vector3(midpoint.x, child.bounds.max.y, 0));

      // Top right
      const b4 = new THREE.Box3(midpoint, child.bounds.max);

      const children = [b1, b2, b3, b4].map(
          b => {
            return {
              side: child.side,
              bounds: b,
              children: [],
              parent: child,
              center: b.getCenter(new THREE.Vector3()),
              size: b.getSize(new THREE.Vector3())
            };
          });

      const nodes = [];
      for (let c of children) {
        c.sphereCenter = c.center.clone();
        c.sphereCenter.applyMatrix4(this._params.localToWorld);
        c.sphereCenter.normalize()
        c.sphereCenter.multiplyScalar(this._params.size);

        const n = new Node();
        n.side = child.side;
        n.bounds = c.bounds;
        n.children = [];
        n.parent = child;
        n.tree = this;
        n.center = c.center;
        n.sphereCenter = c.sphereCenter;
        n.size = c.size;
        n.localToWorld = child.localToWorld;
        n.neighbours = [null, null, null, null];
        nodes.push(n);
      }

      return nodes;
    }
  }

  return {
    QuadTree: QuadTree,
    CubeQuadTree: CubeQuadTree,
  }
})();
