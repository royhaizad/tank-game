// Randomly generated grid-based maze, per GAME_SPEC.md section 3.3.
// Recursive backtracking carves a perfect maze (guaranteed connected, no
// loops), then a light "room-opening" pass removes a few extra interior
// walls for a mix of tight 1-tile corridors and small open rooms. The
// outer boundary is never touched by either pass, so it always fully
// encloses the grid.
//
// Walls are exposed as axis-aligned line segments so Tank/Bullet can
// collide with them the same general way they collided with canvas edges
// before a maze existed (see resolveCircleCollision / reflectOffWalls).
class Maze {
  constructor(cols, rows, cellSize) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
    this.width = cols * cellSize;
    this.height = rows * cellSize;
    this.wallThickness = 4; // px

    this.cells = this._buildEmptyGrid();
    this._carve();
    this._openRooms(0.08);
    this.walls = this._buildWallSegments();
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

  // Occasionally knock down an extra interior wall to create small open
  // rooms/loops on top of the perfect maze. Never touches the outer
  // boundary (col/row bounds below always stay within the grid).
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
  // emitted directly from the edge cells.
  _buildWallSegments() {
    const segments = [];
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cell = this.cells[row][col];
        const x = col * this.cellSize;
        const y = row * this.cellSize;

        if (cell.top) segments.push({ x1: x, y1: y, x2: x + this.cellSize, y2: y });
        if (cell.left) segments.push({ x1: x, y1: y, x2: x, y2: y + this.cellSize });
        if (col === this.cols - 1 && cell.right) {
          segments.push({ x1: x + this.cellSize, y1: y, x2: x + this.cellSize, y2: y + this.cellSize });
        }
        if (row === this.rows - 1 && cell.bottom) {
          segments.push({ x1: x, y1: y + this.cellSize, x2: x + this.cellSize, y2: y + this.cellSize });
        }
      }
    }
    return segments;
  }

  static _closestPointOnSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return { x: x1 + t * dx, y: y1 + t * dy };
  }

  // Pushes a circle at (x, y) out of any wall it's overlapping. Used for
  // the tank: no bounce, it just can't pass through.
  resolveCircleCollision(x, y, radius) {
    let px = x;
    let py = y;
    const effRadius = radius + this.wallThickness / 2;

    for (let pass = 0; pass < 2; pass++) {
      for (const wall of this.walls) {
        const closest = Maze._closestPointOnSegment(px, py, wall.x1, wall.y1, wall.x2, wall.y2);
        const dx = px - closest.x;
        const dy = py - closest.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > 0 && distSq < effRadius * effRadius) {
          const dist = Math.sqrt(distSq);
          const overlap = effRadius - dist;
          px += (dx / dist) * overlap;
          py += (dy / dist) * overlap;
        }
      }
    }

    return { x: px, y: py };
  }

  // Moves a bullet by (dx, dy) in small substeps rather than one big jump,
  // so a fast bullet can't skip clean over a thin wall between frames (a
  // single endpoint-only check can miss walls thinner than one frame's
  // travel distance). 8 substeps keeps each substep's travel comfortably
  // under a wall's collision margin at the bullet's fixed speed. Stops and
  // reflects at the first substep that hits a wall — mirrors the bullet's
  // angle off it (vertical wall flips horizontal velocity, horizontal
  // wall flips vertical velocity) and repositions it just outside.
  moveWithBounce(bullet, dx, dy) {
    const steps = 8;
    const stepDx = dx / steps;
    const stepDy = dy / steps;
    const effRadius = bullet.radius + this.wallThickness / 2;
    let x = bullet.x;
    let y = bullet.y;

    for (let i = 0; i < steps; i++) {
      const nextX = x + stepDx;
      const nextY = y + stepDy;
      const hitWall = this._findWallHit(nextX, nextY, effRadius);

      if (hitWall) {
        const isVertical = hitWall.x1 === hitWall.x2;
        if (isVertical) {
          const wallX = hitWall.x1;
          x = nextX < wallX ? wallX - effRadius : wallX + effRadius;
          bullet.angle = Math.PI - bullet.angle;
        } else {
          const wallY = hitWall.y1;
          y = nextY < wallY ? wallY - effRadius : wallY + effRadius;
          bullet.angle = -bullet.angle;
        }
        return { x, y, bounced: true };
      }

      x = nextX;
      y = nextY;
    }

    return { x, y, bounced: false };
  }

  _findWallHit(px, py, effRadius) {
    let closestWall = null;
    let closestDistSq = Infinity;

    for (const wall of this.walls) {
      const closest = Maze._closestPointOnSegment(px, py, wall.x1, wall.y1, wall.x2, wall.y2);
      const dx = px - closest.x;
      const dy = py - closest.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < effRadius * effRadius && distSq < closestDistSq) {
        closestDistSq = distSq;
        closestWall = wall;
      }
    }

    return closestWall;
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

    ctx.strokeStyle = '#5b3a29';
    ctx.lineWidth = this.wallThickness;
    ctx.lineCap = 'square';
    for (const wall of this.walls) {
      ctx.beginPath();
      ctx.moveTo(wall.x1, wall.y1);
      ctx.lineTo(wall.x2, wall.y2);
      ctx.stroke();
    }
  }
}
