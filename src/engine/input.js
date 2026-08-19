// Tracks which keys are currently held down, plus which were pressed this
// frame (for single-shot actions like firing, as opposed to held actions
// like movement). Call Input.update() once per frame after reading input.
const Input = {
  keys: {},
  justPressed: {}
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
