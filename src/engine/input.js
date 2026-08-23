// Tracks which keys are currently held down, plus which were pressed this
// frame (for single-shot actions like firing, as opposed to held actions
// like movement). Call Input.update() once per frame after reading input.
const Input = {
  keys: {},
  justPressed: {},

  // Pause is shared by the whole match (not per-player) and is never
  // rebindable — it's always Escape, per GAME_SPEC.md section 7. Escape
  // is also reserved as the universal cancel/back key within the pause
  // menu, so it can never be assigned to any other action either.
  pauseKey: 'escape',

  // One control scheme per local player slot (up to 3), per GAME_SPEC.md
  // section 7's default table. Rebindable via rebind() from the Mission
  // Briefing screen or the pause menu's Change Controls screen.
  playerBindings: [
    { forward: 'w', backward: 's', left: 'a', right: 'd', fire: ' ' },
    { forward: 'arrowup', backward: 'arrowdown', left: 'arrowleft', right: 'arrowright', fire: 'enter' },
    { forward: 'i', backward: 'k', left: 'j', right: 'l', fire: 'p' }
  ]
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

// Assigns `key` to playerBindings[playerIndex][action]. If any action —
// this player's own, a different player's, doesn't matter — already used
// that key, the two actions swap keys instead of letting one physical key
// double up. Every key must stay unique across the whole match.
Input.rebind = function (playerIndex, action, key) {
  for (let p = 0; p < Input.playerBindings.length; p++) {
    for (const otherAction in Input.playerBindings[p]) {
      const isSameSlot = p === playerIndex && otherAction === action;
      if (!isSameSlot && Input.playerBindings[p][otherAction] === key) {
        const previousKey = Input.playerBindings[playerIndex][action];
        Input.playerBindings[p][otherAction] = previousKey;
        Input.playerBindings[playerIndex][action] = key;
        return;
      }
    }
  }
  Input.playerBindings[playerIndex][action] = key;
};
