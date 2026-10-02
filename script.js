
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const mini = document.getElementById("minimap");
const mctx = mini.getContext("2d");

const $ = id => document.getElementById(id);

const keys = {};
let running = false;
let lastTime = 0;
let cash = 500;
let missionDone = false;
let nitro = 100;
let nitroUsed = false;
let hitCooldown = 0;

const world = { w: 2400, h: 2400 };
const roadWidth = 150;
const blockSize = 400;
const roadEvery = blockSize + roadWidth;

const car = {
  x: 1200,
  y: 1200,
  angle: -Math.PI / 2,
  speed: 0,
  maxSpeed: 390
};

const destination = { x: 1900, y: 400 };

const traffic = [];
const buildings = [];
const particles = [];

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function seededRandom(n) {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function createCity() {
  let id = 0;

  for (let x = 0; x < world.w; x += roadEvery) {
    for (let y = 0; y < world.h; y += roadEvery) {
      const inset = 22 + seededRandom(id + 2) * 25;
      const bx = x + roadWidth + inset;
      const by = y + roadWidth + inset;
      const bw = blockSize - inset * 2;
      const bh = blockSize - inset * 2;

      buildings.push({
        x: bx, y: by, w: bw, h: bh,
        color: ["#59616a", "#6b6864", "#495963", "#7b7166"][id % 4],
        height: 1 + seededRandom(id + 7) * 3
      });
      id++;
    }
  }

  for (let i = 0; i < 24; i++) {
    const vertical = i % 2 === 0;
    const lane = Math.floor(seededRandom(i + 40) * 4);
    traffic.push({
      x: vertical ? 250 + lane * 420 : seededRandom(i + 100) * world.w,
      y: vertical ? seededRandom(i + 200) * world.h : 250 + lane * 420,
      vertical,
      dir: i % 3 === 0 ? -1 : 1,
      speed: 80 + seededRandom(i + 300) * 100,
      color: ["#e9d8b4", "#d44f48", "#4b9cbd", "#dedfe3"][i % 4]
    });
  }
}
createCity();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roadAt(x, y) {
  const rx = ((x % roadEvery) + roadEvery) % roadEvery;
  const ry = ((y % roadEvery) + roadEvery) % roadEvery;

  return rx < roadWidth || ry < roadWidth;
}

function collidesWithBuilding(x, y) {
  return buildings.some(b =>
    x > b.x - 13 && x < b.x + b.w + 13 &&
    y > b.y - 13 && y < b.y + b.h + 13
  );
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawCar(x, y, angle, color, isPlayer = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Shadow
  ctx.fillStyle = "#0008";
  roundedRect(-13, -24, 31, 52, 7);

  // Wheels
  ctx.fillStyle = "#111820";
  roundedRect(-13, -20, 5, 13, 2);
  roundedRect(8, -20, 5, 13, 2);
  roundedRect(-13, 8, 5, 13, 2);
  roundedRect(8, 8, 5, 13, 2);

  // Body
  ctx.fillStyle = color;
  roundedRect(-11, -25, 23, 50, 7);

  // Roof and windshield
  ctx.fillStyle = isPlayer ? "#173747" : "#27323a";
  roundedRect(-8, -13, 17, 25, 4);

  ctx.fillStyle = "#b9efff";
  ctx.globalAlpha = 0.7;
  ctx.fillRect(-7, -16, 15, 5);
  ctx.globalAlpha = 1;

  // Headlights
  ctx.fillStyle = "#fff5c8";
  ctx.fillRect(-9, -24, 5, 3);
  ctx.fillRect(5, -24, 5, 3);

  // Tail lights
  ctx.fillStyle = "#ff334f";
  ctx.fillRect(-9, 21, 5, 3);
  ctx.fillRect(5, 21, 5, 3);

  if (isPlayer) {
    ctx.strokeStyle = "#60f6ff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-11, -25, 23, 50);
  }

  ctx.restore();
}

function drawCity(camX, camY, width, height) {
  ctx.fillStyle = "#385343";
  ctx.fillRect(0, 0, width, height);

  // Roads
  const startX = Math.floor(camX / roadEvery) * roadEvery;
  const startY = Math.floor(camY / roadEvery) * roadEvery;

  for (let x = startX; x < camX + width + roadEvery; x += roadEvery) {
    const sx = x - camX;
    ctx.fillStyle = "#333b42";
    ctx.fillRect(sx, 0, roadWidth, height);
    ctx.fillStyle = "#e7c66b";
    ctx.fillRect(sx + roadWidth / 2 - 1, 0, 2, height);

    ctx.fillStyle = "#aab1b0";
    ctx.fillRect(sx + 5, 0, 2, height);
    ctx.fillRect(sx + roadWidth - 7, 0, 2, height);
  }

  for (let y = startY; y < camY + height + roadEvery; y += roadEvery) {
    const sy = y - camY;
    ctx.fillStyle = "#333b42";
    ctx.fillRect(0, sy, width, roadWidth);
    ctx.fillStyle = "#e7c66b";
    ctx.fillRect(0, sy + roadWidth / 2 - 1, width, 2);

    ctx.fillStyle = "#aab1b0";
    ctx.fillRect(0, sy + 5, width, 2);
    ctx.fillRect(0, sy + roadWidth - 7, width, 2);
  }

  // Lane markings
  ctx.strokeStyle = "#d5d7ce";
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 17]);

  for (let x = startX; x < camX + width + roadEvery; x += roadEvery) {
    const sx = x - camX + roadWidth / 2;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
    ctx.stroke();
  }

  for (let y = startY; y < camY + height + roadEvery; y += roadEvery) {
    const sy = y - camY + roadWidth / 2;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Buildings
  for (const b of buildings) {
    const x = b.x - camX;
    const y = b.y - camY;

    if (x > width || y > height || x + b.w < 0 || y + b.h < 0) continue;

    ctx.fillStyle = "#17241d";
    ctx.fillRect(x - 8, y - 8, b.w + 16, b.h + 16);

    ctx.fillStyle = b.color;
    ctx.fillRect(x, y, b.w, b.h);

    ctx.fillStyle = "#ffffff0c";
    ctx.fillRect(x + 7, y + 7, b.w - 14, 8);

    // Rooftop details
    ctx.fillStyle = "#26353d";
    ctx.fillRect(x + b.w * 0.25, y + b.h * 0.25, b.w * 0.5, b.h * 0.4);

    ctx.fillStyle = "#e8d6a3";
    for (let wx = x + 14; wx < x + b.w - 8; wx += 28) {
      ctx.fillRect(wx, y + 14, 8, 4);
      ctx.fillRect(wx, y + b.h - 18, 8, 4);
    }
  }

  // Mission marker
  const dx = destination.x - camX;
  const dy = destination.y - camY;
  const pulse = 14 + Math.sin(performance.now() / 180) * 4;

  ctx.strokeStyle = "#ffcc66";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(dx, dy, pulse, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#ffcc66";
  ctx.beginPath();
  ctx.arc(dx, dy, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff2c9";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.fillText("DESTINATION", dx, dy - 25);
  ctx.textAlign = "left";
}

function update(dt) {
  if (!running) return;

  const accelerating = keys.w || keys.ArrowUp || keys.up;
  const braking = keys.s || keys.ArrowDown || keys.down;
  const left = keys.a || keys.ArrowLeft || keys.left;
  const right = keys.d || keys.ArrowRight || keys.right;
  const boosting = (keys.Shift || keys.nitro) && nitro > 0;

  if (accelerating) car.speed += 240 * dt;
  else if (braking) car.speed -= 330 * dt;
  else car.speed *= Math.pow(0.985, dt * 60);

  if (keys[" "] || keys.space) car.speed *= Math.pow(0.90, dt * 60);

  car.speed = clamp(car.speed, -100, boosting ? car.maxSpeed + 220 : car.maxSpeed);

  if (boosting && car.speed > 30) {
    car.speed += 260 * dt;
    nitro -= 32 * dt;
    nitroUsed = true;
  } else {
    nitro = Math.min(100, nitro + 8 * dt);
    if (nitro >= 99) nitroUsed = false;
  }

  const steer = (left ? -1 : 0) + (right ? 1 : 0);
  const grip = roadAt(car.x, car.y) ? 1 : 0.55;

  if (Math.abs(car.speed) > 4) {
    car.angle += steer * 2.1 * dt *
      Math.min(1, Math.abs(car.speed) / 100) *
      Math.sign(car.speed) * grip;
  }

  const oldX = car.x;
  const oldY = car.y;

  car.x += Math.sin(car.angle) * car.speed * dt;
  car.y -= Math.cos(car.angle) * car.speed * dt;

  car.x = clamp(car.x, 15, world.w - 15);
  car.y = clamp(car.y, 15, world.h - 15);

  if (collidesWithBuilding(car.x, car.y)) {
    car.x = oldX;
    car.y = oldY;
    car.speed *= -0.25;
  }

  // Traffic movement and collision
  hitCooldown = Math.max(0, hitCooldown - dt);

  for (const t of traffic) {
    if (t.vertical) {
      t.y += t.speed * t.dir * dt;
      if (t.y < 0) t.y = world.h;
      if (t.y > world.h) t.y = 0;
    } else {
      t.x += t.speed * t.dir * dt;
      if (t.x < 0) t.x = world.w;
      if (t.x > world.w) t.x = 0;
    }

    if (hitCooldown === 0 &&
        Math.hypot(car.x - t.x, car.y - t.y) < 28) {
      car.speed *= -0.35;
      hitCooldown = 1;
      cash = Math.max(0, cash - 10);
      $("cash").textContent = "$" + cash;
    }
  }

  // Mission
  const dist = Math.hypot(destination.x - car.x, destination.y - car.y);
  $("distance").textContent = Math.round(dist / 10) + " m";

  if (dist < 55 && !missionDone) {
    missionDone = true;
    cash += 250;
    $("cash").textContent = "$" + cash;
    $("missionTitle").textContent = "MISSION COMPLETE";
    $("missionText").textContent = "Great driving! Reward: $250";
    $("distance").textContent = "DONE!";
    $("wanted").textContent = "★ ☆ ☆ ☆ ☆";
  }

  $("speed").textContent = Math.round(Math.abs(car.speed) * 0.36);
  $("speedFill").style.width =
    Math.min(100, Math.abs(car.speed) / (car.maxSpeed + 220) * 100) + "%";

  $("gear").textContent =
    car.speed < 0 ? "R" : Math.min(6, 1 + Math.floor(car.speed / 65));

  $("nitroText").textContent = nitroUsed ? "BOOSTING" : Math.round(nitro) + "%";
  $("nitroBtn").disabled = nitro < 1;
}

function drawMinimap() {
  const w = mini.width;
  const h = mini.height;
  const scale = w / world.w;

  mctx.fillStyle = "#26372e";
  mctx.fillRect(0, 0, w, h);

  mctx.fillStyle = "#626c73";
  for (let p = 0; p < world.w; p += roadEvery) {
    mctx.fillRect(p * scale, 0, roadWidth * scale, h);
    mctx.fillRect(0, p * scale, w, roadWidth * scale);
  }

  mctx.fillStyle = "#ffcc66";
  mctx.beginPath();
  mctx.arc(destination.x * scale, destination.y * scale, 4, 0, Math.PI * 2);
  mctx.fill();

  mctx.fillStyle = "#4cf4ff";
  mctx.beginPath();
  mctx.arc(car.x * scale, car.y * scale, 4, 0, Math.PI * 2);
  mctx.fill();

  mctx.strokeStyle = "#4cf4ff";
  mctx.lineWidth = 2;
  mctx.beginPath();
  mctx.moveTo(car.x * scale, car.y * scale);
  mctx.lineTo(
    (car.x + Math.sin(car.angle) * 35) * scale,
    (car.y - Math.cos(car.angle) * 35) * scale
  );
  mctx.stroke();
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  const camX = clamp(car.x - width / 2, 0, world.w - width);
  const camY = clamp(car.y - height / 2, 0, world.h - height);

  drawCity(camX, camY, width, height);

  for (const t of traffic) {
    const x = t.x - camX;
    const y = t.y - camY;

    if (x < -50 || x > width + 50 || y < -50 || y > height + 50) continue;

    drawCar(x, y, t.vertical ? (t.dir > 0 ? Math.PI : 0) :
      (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2), t.color);
  }

  // Nitro exhaust particles
  if (running && nitroUsed && Math.abs(car.speed) > 100) {
    for (let i = 0; i < 2; i++) {
      particles.push({
        x: car.x - Math.sin(car.angle) * 28 + (Math.random() - .5) * 10,
        y: car.y + Math.cos(car.angle) * 28 + (Math.random() - .5) * 10,
        life: .3
      });
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= 0.025;

    ctx.fillStyle = `rgba(76,244,255,${Math.max(0, p.life * 2)})`;
    ctx.beginPath();
    ctx.arc(p.x - camX, p.y - camY, 3, 0, Math.PI * 2);
    ctx.fill();

    if (p.life <= 0) particles.splice(i, 1);
  }

  drawCar(car.x - camX, car.y - camY, car.angle, "#168dff", true);
  drawMinimap();
}

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000 || 0, 0.04);
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

function startGame() {
  running = true;
  $("message").classList.add("hidden");
  lastTime = performance.now();
}

function resetGame() {
  running = false;
  car.x = 1200;
  car.y = 1200;
  car.angle = -Math.PI / 2;
  car.speed = 0;
  cash = 500;
  nitro = 100;
  missionDone = false;
  hitCooldown = 0;
  particles.length = 0;

  $("cash").textContent = "$" + cash;
  $("missionTitle").textContent = "FIRST DRIVE";
  $("missionText").textContent = "Drive to the golden marker.";
  $("distance").textContent = "-- m";
  $("message").classList.remove("hidden");
  $("speed").textContent = "0";
  $("gear").textContent = "1";
  $("speedFill").style.width = "0%";
  $("nitroText").textContent = "READY";
}

window.addEventListener("keydown", e => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys[key] = true;

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
    e.preventDefault();
  }

  if (e.key === "Enter" && !running) startGame();
});

window.addEventListener("keyup", e => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys[key] = false;
});

window.addEventListener("blur", () => {
  for (const key in keys) keys[key] = false;
});

document.querySelectorAll("[data-key]").forEach(button => {
  const key = button.dataset.key;

  const down = e => {
    e.preventDefault();
    keys[key] = true;
  };

  const up = e => {
    e.preventDefault();
    keys[key] = false;
  };

  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointerleave", up);
  button.addEventListener("pointercancel", up);
});

$("startBtn").addEventListener("click", startGame);
$("resetBtn").addEventListener("click", resetGame);

$("nitroBtn").addEventListener("pointerdown", e => {
  e.preventDefault();
  keys.nitro = true;
});
["pointerup", "pointerleave", "pointercancel"].forEach(eventName => {
  $("nitroBtn").addEventListener(eventName, () => {
    keys.nitro = false;
  });
});

requestAnimationFrame(loop);
