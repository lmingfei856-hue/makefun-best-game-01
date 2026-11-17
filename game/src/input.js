// Keyboard + mouse + pointer lock. The game reads a plain state object, so the
// autopilot (screenshots, self-test) can drive the same input the player uses.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mousePressed = false; // edge: consumed by the game each frame
    this.locked = false;
    this.onLockChange = null;
    this.onKey = null; // (code) => void, for menu shortcuts

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      if (!e.repeat) {
        this.keys.add(e.code);
        if (this.onKey) this.onKey(e.code);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.locked) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.mouseDown = false;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) {
        p.catch(() => {
          const p2 = this.canvas.requestPointerLock();
          if (p2 && p2.catch) p2.catch(() => {});
        });
      }
    } catch {
      try {
        const p = this.canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch { /* headless: no lock */ }
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code); }

  /** Movement axes in [-1, 1]: x = strafe right, y = forward. */
  axes() {
    let x = 0; let y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  consumeMouse() {
    const dx = this.mouseDX; const dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  consumePressed() {
    const p = this.mousePressed;
    this.mousePressed = false;
    return p;
  }
}
