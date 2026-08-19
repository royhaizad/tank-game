// Fixed-callback game loop, passes delta time in seconds to update().
function startLoop(update, render) {
  let lastTime = performance.now();

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    update(dt);
    render();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
