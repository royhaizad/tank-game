const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const playerTank = new Tank(canvas.width / 2, canvas.height / 2, '#3b6ea5');

startLoop(
  (dt) => {
    playerTank.update(dt, Input.keys);
    playerTank.clampToBounds(canvas.width, canvas.height);
  },
  () => {
    ctx.fillStyle = '#4a7a3d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    playerTank.draw(ctx);
  }
);
