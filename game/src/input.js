/**
 * Keyboard state, mouse look with pointer lock, action bindings.
 *
 * Controls:
 *   WASD — move       Shift — run      Space — jump / handbrake
 *   E    — interact (enter/exit vehicle)
 *   M    — mute       Esc  — pause      Enter — confirm
 *   Mouse move — camera orbit (when pointer locked)
 *   Wheel — zoom
 */

const keys = new Set();
const justPressed = new Set();
let mouseDX = 0;
let mouseDY = 0;
let mouseLeft = false;
let wheelDelta = 0;
let pointerLocked = false;
let muted = false;

/** Bind DOM events to capture input. */
export function bindInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (!keys.has(e.code)) {
      justPressed.add(e.code);
    }
    keys.add(e.code);
    if (e.code === 'KeyM') {
      muted = !muted;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    justPressed.delete(e.code);
  });

  canvas.addEventListener('click', () => {
    if (!pointerLocked) {
      canvas.requestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === canvas;
  });

  document.addEventListener('mousemove', (e) => {
    if (pointerLocked) {
      mouseDX += e.movementX;
      mouseDY += e.movementY;
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      // Only register punch if pointer is already locked
      // (first click requests pointer lock, not a punch)
      if (pointerLocked) {
        mouseLeft = true;
      }
    }
  });
  canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseLeft = false;
  });

  canvas.addEventListener('wheel', (e) => {
    wheelDelta += e.deltaY;
    e.preventDefault();
  }, { passive: false });
}

/** Consume accumulated mouse movement. Returns { dx, dy, wheel } and resets accumulators. */
export function consumeMouse() {
  const dx = mouseDX;
  const dy = mouseDY;
  const w = wheelDelta;
  mouseDX = 0;
  mouseDY = 0;
  wheelDelta = 0;
  return { dx, dy, wheel: w };
}

/** Check if a key is currently held. */
export function isKeyDown(code) {
  return keys.has(code);
}

/** Check if a key was just pressed this frame (consumes it from justPressed). */
export function consumeKey(code) {
  if (justPressed.has(code)) {
    justPressed.delete(code);
    return true;
  }
  return false;
}

/** Action bindings: what the player wants to do. */
export function getActions() {
  return {
    forward: isKeyDown('KeyW') || isKeyDown('ArrowUp'),
    backward: isKeyDown('KeyS') || isKeyDown('ArrowDown'),
    left: isKeyDown('KeyA') || isKeyDown('ArrowLeft'),
    right: isKeyDown('KeyD') || isKeyDown('ArrowRight'),
    run: isKeyDown('ShiftLeft') || isKeyDown('ShiftRight'),
    jump: consumeKey('Space'),
    handbrake: isKeyDown('Space'),
    interact: consumeKey('KeyE'),
    punch: consumeKey('KeyF') || mouseLeft,
    pause: consumeKey('Escape'),
    confirm: consumeKey('Enter') || consumeKey('NumpadEnter'),
    shoot: mouseLeft,
    muted,
  };
}

export function isPointerLocked() {
  return pointerLocked;
}
