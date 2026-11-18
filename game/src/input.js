/**
 * Keyboard state, mouse look with pointer lock, action bindings.
 *
 * Controls:
 *   WASD — move       Shift — run      Space — jump
 *   E    — interact   F    — punch      Mouse left — shoot (later)
 *   M    — mute       Esc  — pause      Enter — confirm
 *   Mouse move — camera orbit (when pointer locked)
 *   Wheel — zoom
 */

const keys = new Set();
let mouseDX = 0;
let mouseDY = 0;
let mouseLeft = false;
let wheelDelta = 0;
let pointerLocked = false;
let muted = false;

/** Bind DOM events to capture input. */
export function bindInput(canvas) {
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyM') {
      muted = !muted;
    }
    // Prevent scrolling for game keys
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
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
    if (e.button === 0) mouseLeft = true;
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

/** Check if a key was just pressed this frame (consumes it). */
export function consumeKey(code) {
  if (keys.has(code)) {
    keys.delete(code);
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
    interact: consumeKey('KeyE'),
    punch: consumeKey('KeyF'),
    pause: consumeKey('Escape'),
    confirm: consumeKey('Enter') || consumeKey('NumpadEnter'),
    shoot: mouseLeft,
    muted,
  };
}

export function isPointerLocked() {
  return pointerLocked;
}
