// Tracks which keys are currently held down, plus which were pressed this
// frame (for single-shot actions like firing, as opposed to held actions
// like movement). Call Input.update() once per frame after reading input.
const Input = {
  keys: {},
  justPressed: {},
  // Default control scheme, per GAME_SPEC.md section 7. Rebindable via
  // rebind() from the pause menu's Change Controls screen. 'escape' is
  // reserved as the universal cancel/back key and can never be assigned.
  bindings: {
    forward: 'w',
    backward: 's',
    left: 'a',
    right: 'd',
    fire: ' ',
    pause: 'escape'
  }
};

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (!Input.keys[key]) {
    Input.justPressed[key] = true;
  }
  Input.keys[key] = true;
});

window.addEventListener('keyup', (e) => {
  Input.keys[e.key.toLowerCase()] = false;
});

Input.update = function () {
  Input.justPressed = {};
};

// Assigns `key` to `action`. If another action already used that key,
// the two actions swap keys instead — so no action is ever left
// unbound and no key is ever bound to two actions at once.
Input.rebind = function (action, key) {
  const conflictingAction = Object.keys(Input.bindings).find(
    (other) => other !== action && Input.bindings[other] === key
  );
  const previousKey = Input.bindings[action];
  Input.bindings[action] = key;
  if (conflictingAction) {
    Input.bindings[conflictingAction] = previousKey;
  }
};
