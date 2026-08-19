// Tracks which keys are currently held down.
const Input = {
  keys: {}
};

window.addEventListener('keydown', (e) => {
  Input.keys[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', (e) => {
  Input.keys[e.key.toLowerCase()] = false;
});
