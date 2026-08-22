// Randomly generated grid-based maze, per GAME_SPEC.md section 3.3.
// Recursive backtracking carves a perfect maze (guaranteed connected, no
// loops), then a room-opening pass removes a good number of extra
// interior walls for a more open layout than a dense perfect maze (per
// user direction: more open space than Tank Trouble, not less). The outer
// boundary is never touched by either pass, so it always fully encloses
// the grid.
//
// Walls are stored as axis-aligned rectangles (not zero-width lines) so
// collision geometry matches the drawn wall thickness exactly — required
// so tank parts can never visually overlap a wall.
class Maze {
  constructor(cols, rows, cellSize) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
    this.width = cols * cellSize;
    this.height = rows * cellSize;
    this.wallThickness = 6; // px, matches Tank's barrel width (see tank.js barrelHalfHeight)

    this.cells = this._buildEmptyGrid();
    this._carve();
    this._openRooms(0.35);
    this.wallRects = this._buildWallRects();
  }

  _buildEmptyGrid() {
    const cells = [];
    for (let row = 0; row < this.rows; row++) {
      const rowCells = [];
      for (let col = 0; col < this.cols; col++) {
        rowCells.push({ top: true, right: true, bottom: true, left: true, visited: false });
      }
      cells.push(rowCells);
    }
    return cells;
  }

  _carve() {
    const startRow = Math.floor(Math.random() * this.rows);
    const startCol = Math.floor(Math.random() * this.cols);
    const stack = [[startRow, startCol]];
    this.cells[startRow][startCol].visited = true;

    while (stack.length > 0) {
      const [row, col] = stack[stack.length - 1];
      const neighbors = this._unvisitedNeighbors(row, col);

      if (neighbors.length === 0) {
        stack.pop();
        continue;
      }

      const [nRow, nCol, dir] = neighbors[Math.floor(Math.random() * neighbors.length)];
      this._removeWallBetween(row, col, nRow, nCol, dir);
      this.cells[nRow][nCol].visited = true;
      stack.push([nRow, nCol]);
    }
  }

  _unvisitedNeighbors(row, col) {
    const candidates = [
      [row - 1, col, 'top'],
      [row, col + 1, 'right'],
      [row + 1, col, 'bottom'],
      [row, col - 1, 'left']
    ];
    return candidates.filter(
      ([r, c]) => r >= 0 && r < this.rows && c >= 0 && c < this.cols && !this.cells[r][c].visited
    );
  }

  _removeWallBetween(row, col, nRow, nCol, dir) {
    const opposite = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' };
    this.cells[row][col][dir] = false;
    this.cells[nRow][nCol][opposite[dir]] = false;
  }

  // Knocks down extra interior walls on top of the perfect maze, for a
  // much more open layout. Never touches the outer boundary (col/row
  // bounds below always stay within the grid).
  _openRooms(chance) {
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        if (col < this.cols - 1 && this.cells[row][col].right && Math.random() < chance) {
          this._removeWallBetween(row, col, row, col + 1, 'right');
        }
        if (row < this.rows - 1 && this.cells[row][col].bottom && Math.random() < chance) {
          this._removeWallBetween(row, col, row + 1, col, 'bottom');
        }
      }
    }
  }

  // Each interior wall is shared by two cells; emit it once via the
  // "top"/"left" side so it isn't drawn/collided with twice. Boundary
  // "right"/"bottom" walls have no neighbor to claim them, so those are
  // emitted directly from the edge cells. Every rect is extended by half
  // the wall thickness on all sides so adjacent perpendicular walls meet
  // cleanly at corners with no gap.
  _buildWallRects() {
    const half = this.wallThickness / 2;
    const rects = [];
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cell = this.cells[row][col];
        const x = col * this.cellSize;
        const y = row * this.cellSize;

        if (cell.top) {
          rects.push({ left: x - half, top: y - half, right: x + this.cellSize + half, bottom: y + half });
        }
        if (cell.left) {
          rects.push({ left: x - half, top: y - half, right: x + half, bottom: y + this.cellSize + half });
        }
        if (col === this.cols - 1 && cell.right) {
          const wx = x + this.cellSize;
          rects.push({ left: wx - half, top: y - half, right: wx + half, bottom: y + this.cellSize + half });
        }
        if (row === this.rows - 1 && cell.bottom) {
          const wy = y + this.cellSize;
          rects.push({ left: x - half, top: wy - half, right: x + this.cellSize + half, bottom: wy + half });
        }
      }
    }
    return rects;
  }

  static _wallShape(wall) {
    return {
      cx: (wall.left + wall.right) / 2,
      cy: (wall.top + wall.bottom) / 2,
      halfW: (wall.right - wall.left) / 2,
      halfH: (wall.bottom - wall.top) / 2,
      angle: 0
    };
  }

  static _rectCorners(rect) {
    const cos = Math.cos(rect.angle);
    const sin = Math.sin(rect.angle);
    const local = [
      [-rect.halfW, -rect.halfH],
      [rect.halfW, -rect.halfH],
      [rect.halfW, rect.halfH],
      [-rect.halfW, rect.halfH]
    ];
    return local.map(([lx, ly]) => ({
      x: rect.cx + lx * cos - ly * sin,
      y: rect.cy + lx * sin + ly * cos
    }));
  }

  static _rectAxes(rect) {
    return [
      { x: Math.cos(rect.angle), y: Math.sin(rect.angle) },
      { x: -Math.sin(rect.angle), y: Math.cos(rect.angle) }
    ];
  }

  static _project(corners, axis) {
    let min = Infinity;
    let max = -Infinity;
    for (const corner of corners) {
      const p = corner.x * axis.x + corner.y * axis.y;
      if (p < min) min = p;
      if (p > max) max = p;
    }
    return { min, max };
  }

  // Separating Axis Theorem for two (possibly rotated) rectangles. Returns
  // the minimum-translation-vector to push rectA out of rectB, or null if
  // they don't overlap.
  static _satOverlap(rectA, rectB) {
    const cornersA = Maze._rectCorners(rectA);
    const cornersB = Maze._rectCorners(rectB);
    const axes = [...Maze._rectAxes(rectA), ...Maze._rectAxes(rectB)];

    let minOverlap = Infinity;
    let mtvAxis = null;

    for (const axis of axes) {
      const projA = Maze._project(cornersA, axis);
      const projB = Maze._project(cornersB, axis);
      const overlap = Math.min(projA.max, projB.max) - Math.max(projA.min, projB.min);
      if (overlap <= 0) return null;
      if (overlap < minOverlap) {
        minOverlap = overlap;
        mtvAxis = axis;
      }
    }

    const dx = rectA.cx - rectB.cx;
    const dy = rectA.cy - rectB.cy;
    const sign = dx * mtvAxis.x + dy * mtvAxis.y < 0 ? -1 : 1;
    return { x: mtvAxis.x * minOverlap * sign, y: mtvAxis.y * minOverlap * sign };
  }

  // Pushes the tank's body AND barrel shapes out of every wall they
  // overlap, so no part of the tank can ever end up inside a wall.
  // Mutates tank.x / tank.y directly (each shape reads the tank's live
  // position, so a push from one shape/wall is immediately reflected for
  // the next check in the same pass).
  resolveTankCollision(tank) {
    for (let pass = 0; pass < 3; pass++) {
      for (const wall of this.wallRects) {
        const wallShape = Maze._wallShape(wall);
        this._pushShapeOut(tank, tank.getBodyShape(), wallShape);
        this._pushShapeOut(tank, tank.getBarrelShape(), wallShape);
      }
    }
  }

  _pushShapeOut(tank, shape, wallShape) {
    const mtv = Maze._satOverlap(shape, wallShape);
    if (mtv) {
      tank.x += mtv.x;
      tank.y += mtv.y;
    }
  }

  // True if the tank's barrel is touching (or inside) a wall in the
  // direction it's facing — used to block firing so a bullet can never
  // spawn past a wall the tank is leaning against. Uses a slightly
  // inflated barrel shape as a "sensor," since after resolveTankCollision
  // has already pushed the tank clear, the true barrel shape sits at
  // ~zero distance from the wall rather than overlapping it.
  isBarrelBlocked(tank) {
    const sensorMargin = 2; // px
    const barrel = tank.getBarrelShape();
    const sensor = { ...barrel, halfW: barrel.halfW + sensorMargin, halfH: barrel.halfH + sensorMargin };

    for (const wall of this.wallRects) {
      if (Maze._satOverlap(sensor, Maze._wallShape(wall))) return true;
    }
    return false;
  }

  // Moves a bullet by (dx, dy) in small substeps rather than one big jump,
  // so a fast bullet can't skip clean over a thin wall between frames (an
  // endpoint-only check can miss walls thinner than one frame's travel
  // distance). 8 substeps keeps each substep's travel comfortably under a
  // wall's collision margin at the bullet's fixed speed. Stops and
  // reflects at the first substep that hits a wall.
  moveWithBounce(bullet, dx, dy) {
    const steps = 8;
    const stepDx = dx / steps;
    const stepDy = dy / steps;
    let x = bullet.x;
    let y = bullet.y;

    for (let i = 0; i < steps; i++) {
      const nextX = x + stepDx;
      const nextY = y + stepDy;
      const hitWall = this._findWallHit(nextX, nextY, bullet.radius);

      if (hitWall) {
        const isVertical = hitWall.right - hitWall.left < hitWall.bottom - hitWall.top;
        if (isVertical) {
          const wallCenterX = (hitWall.left + hitWall.right) / 2;
          x = nextX < wallCenterX ? hitWall.left - bullet.radius : hitWall.right + bullet.radius;
          bullet.angle = Math.PI - bullet.angle;
        } else {
          const wallCenterY = (hitWall.top + hitWall.bottom) / 2;
          y = nextY < wallCenterY ? hitWall.top - bullet.radius : hitWall.bottom + bullet.radius;
          bullet.angle = -bullet.angle;
        }
        return { x, y, bounced: true };
      }

      x = nextX;
      y = nextY;
    }

    return { x, y, bounced: false };
  }

  _findWallHit(px, py, radius) {
    let closestWall = null;
    let closestDistSq = Infinity;

    for (const wall of this.wallRects) {
      const closestX = Math.max(wall.left, Math.min(px, wall.right));
      const closestY = Math.max(wall.top, Math.min(py, wall.bottom));
      const dx = px - closestX;
      const dy = py - closestY;
      const distSq = dx * dx + dy * dy;
      if (distSq < radius * radius && distSq < closestDistSq) {
        closestDistSq = distSq;
        closestWall = wall;
      }
    }

    return closestWall;
  }

  worldToCell(x, y) {
    return {
      row: Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize))),
      col: Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)))
    };
  }

  // Shortest path (in cell steps) from one cell to another, following
  // only open passages — BFS on an unweighted grid always finds the
  // shortest path. Returns an array of {row, col} from "from" to "to"
  // inclusive, or null if unreachable (shouldn't happen; the maze is
  // always fully connected by construction).
  findPath(from, to) {
    if (from.row === to.row && from.col === to.col) return [from];

    const visited = [];
    const cameFrom = [];
    for (let row = 0; row < this.rows; row++) {
      visited.push(new Array(this.cols).fill(false));
      cameFrom.push(new Array(this.cols).fill(null));
    }

    const queue = [from];
    visited[from.row][from.col] = true;

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.row === to.row && current.col === to.col) {
        const path = [current];
        let node = current;
        while (cameFrom[node.row][node.col]) {
          node = cameFrom[node.row][node.col];
          path.push(node);
        }
        return path.reverse();
      }

      const moves = [
        ['top', -1, 0],
        ['right', 0, 1],
        ['bottom', 1, 0],
        ['left', 0, -1]
      ];
      for (const [dir, dRow, dCol] of moves) {
        const nRow = current.row + dRow;
        const nCol = current.col + dCol;
        if (
          nRow >= 0 && nRow < this.rows && nCol >= 0 && nCol < this.cols &&
          !visited[nRow][nCol] && !this.cells[current.row][current.col][dir]
        ) {
          visited[nRow][nCol] = true;
          cameFrom[nRow][nCol] = current;
          queue.push({ row: nRow, col: nCol });
        }
      }
    }

    return null;
  }

  // Two grid cells that are maximally distant from each other, measured by
  // path distance through the maze (not straight-line), per GAME_SPEC.md
  // section 3.3. Classic "maze diameter" technique: BFS from any cell to
  // find the farthest cell A, then BFS from A to find the farthest cell
  // from A — that pair is the maze's two most distant points.
  getSpawnPoints(count) {
    const first = this._farthestFrom({ row: 0, col: 0 });
    const second = this._farthestFrom(first);
    const points = [this._cellCenter(first.row, first.col), this._cellCenter(second.row, second.col)];
    return points.slice(0, count);
  }

  _farthestFrom(from) {
    const visited = [];
    for (let row = 0; row < this.rows; row++) visited.push(new Array(this.cols).fill(false));

    const queue = [{ row: from.row, col: from.col, dist: 0 }];
    visited[from.row][from.col] = true;
    let farthest = queue[0];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.dist > farthest.dist) farthest = current;

      const moves = [
        ['top', -1, 0],
        ['right', 0, 1],
        ['bottom', 1, 0],
        ['left', 0, -1]
      ];
      for (const [dir, dRow, dCol] of moves) {
        const nRow = current.row + dRow;
        const nCol = current.col + dCol;
        if (
          nRow >= 0 && nRow < this.rows && nCol >= 0 && nCol < this.cols &&
          !visited[nRow][nCol] && !this.cells[current.row][current.col][dir]
        ) {
          visited[nRow][nCol] = true;
          queue.push({ row: nRow, col: nCol, dist: current.dist + 1 });
        }
      }
    }

    return farthest;
  }

  _cellCenter(row, col) {
    return {
      x: col * this.cellSize + this.cellSize / 2,
      y: row * this.cellSize + this.cellSize / 2
    };
  }

  draw(ctx) {
    ctx.fillStyle = '#4a7a3d';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#5b3a29';
    for (const wall of this.wallRects) {
      ctx.fillRect(wall.left, wall.top, wall.right - wall.left, wall.bottom - wall.top);
    }
  }
}
