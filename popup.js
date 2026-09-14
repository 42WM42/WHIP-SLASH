const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State
let isRunning = false;
let score = 0;
let frameCount = 0;
let spawnRate = 120;
let screenShake = 0;

// Mouse Controls
const mouse = { x: 400, y: 250, isDown: false, prevX: 400, prevY: 250, vx: 0, vy: 0 };

// Physics Constants
const GRAVITY = 0.55;
const GROUND_Y = 430;

// Player Entity
const player = {
  x: 400,
  y: GROUND_Y - 20,
  vx: 0,
  vy: 0,
  radius: 16,
  hp: 100,
  maxHp: 100,
  isGrounded: false,
  jumpCooldown: 0,
  handX: 400,
  handY: 250
};

// Sword Object
const sword = {
  tipX: 400,
  tipY: 200,
  prevTipX: 400,
  prevTipY: 200,
  length: 55,
  speed: 0,
  trail: []
};

// Array Containers
let enemies = [];
let particles = [];
let damageTexts = [];

// Event Listeners
window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});

window.addEventListener('mousedown', (e) => { if (e.button === 0) mouse.isDown = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.isDown = false; });

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

function startGame() {
  score = 0;
  frameCount = 0;
  spawnRate = 110;
  enemies = [];
  particles = [];
  damageTexts = [];
  
  player.x = 400;
  player.y = GROUND_Y - 20;
  player.vx = 0;
  player.vy = 0;
  player.hp = 100;

  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  updateHUD();

  isRunning = true;
  requestAnimationFrame(gameLoop);
}

function updateHUD() {
  document.getElementById('score-val').textContent = score;
  const hpPercent = Math.max(0, (player.hp / player.maxHp) * 100);
  document.getElementById('hp-bar').style.width = `${hpPercent}%`;
}

function spawnEnemy() {
  const spawnLeft = Math.random() < 0.5;
  const speedBoost = Math.min(2.5, 1 + (score * 0.05));
  
  enemies.push({
    x: spawnLeft ? -20 : canvas.width + 20,
    y: GROUND_Y - 18,
    vx: 0,
    vy: 0,
    radius: 14,
    hp: 40 + Math.floor(score * 2),
    maxHp: 40 + Math.floor(score * 2),
    speed: (1.2 + Math.random() * 0.8) * speedBoost,
    isGrounded: false,
    color: spawnLeft ? '#ff0055' : '#ff4400'
  });
}

function lineCircleIntersect(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return false;

  const u = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / (len * len)));
  const nearestX = x1 + u * dx;
  const nearestY = y1 + u * dy;
  const dist = Math.hypot(cx - nearestX, cy - nearestY);

  return { hit: dist < r + 4, nearestX, nearestY };
}

function createSparks(x, y, count, color = '#00ffcc') {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 6;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.03 + Math.random() * 0.04,
      color
    });
  }
}

function createFloatingText(x, y, text, color = '#fff') {
  damageTexts.push({ x, y, text, color, life: 1, vy: -1.5 });
}

function gameLoop() {
  if (!isRunning) return;
  frameCount++;

  // 1. Mouse Velocity Tracking
  mouse.vx = mouse.x - mouse.prevX;
  mouse.vy = mouse.y - mouse.prevY;
  mouse.prevX = mouse.x;
  mouse.prevY = mouse.y;

  // 2. Player Movement Physics
  if (mouse.isDown) {
    const dx = mouse.x - player.x;
    const dirX = Math.sign(dx);
    player.vx += dirX * 0.75;

    if (mouse.y < player.y - 20 && player.isGrounded && player.jumpCooldown <= 0) {
      player.vy = -11;
      player.isGrounded = false;
      player.jumpCooldown = 15;
    }
  }

  if (player.jumpCooldown > 0) player.jumpCooldown--;

  player.vy += GRAVITY;
  player.vx *= player.isGrounded ? 0.82 : 0.94;

  player.x += player.vx;
  player.y += player.vy;

  if (player.y >= GROUND_Y - player.radius) {
    player.y = GROUND_Y - player.radius;
    player.vy = 0;
    player.isGrounded = true;
  }

  player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));

  // 3. Sword Kinematics
  const armAngle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
  player.handX = player.x + Math.cos(armAngle) * 18;
  player.handY = player.y + Math.sin(armAngle) * 18;

  sword.prevTipX = sword.tipX;
  sword.prevTipY = sword.tipY;

  sword.tipX = player.handX + Math.cos(armAngle) * sword.length;
  sword.tipY = player.handY + Math.sin(armAngle) * sword.length;

  const tipVx = sword.tipX - sword.prevTipX;
  const tipVy = sword.tipY - sword.prevTipY;
  sword.speed = Math.hypot(tipVx, tipVy);

  sword.trail.push({ hx: player.handX, hy: player.handY, tx: sword.tipX, ty: sword.tipY, alpha: 1 });
  if (sword.trail.length > 6) sword.trail.shift();
  sword.trail.forEach(t => t.alpha -= 0.15);

  // 4. Enemy AI & Spawning
  if (frameCount % Math.max(30, Math.floor(spawnRate)) === 0) {
    spawnEnemy();
    if (spawnRate > 35) spawnRate -= 0.8;
  }

  enemies.forEach((enemy, eIndex) => {
    const eDir = Math.sign(player.x - enemy.x);
    enemy.vx += eDir * 0.35;
    enemy.vy += GRAVITY;

    enemy.vx *= 0.88;
    enemy.x += enemy.vx;
    enemy.y += enemy.vy;

    if (enemy.y >= GROUND_Y - enemy.radius) {
      enemy.y = GROUND_Y - enemy.radius;
      enemy.vy = 0;
      enemy.isGrounded = true;
    }

    const distToPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (distToPlayer < player.radius + enemy.radius) {
      player.hp -= 0.4;
      player.vx += (player.x - enemy.x) * 0.2;
      updateHUD();

      if (player.hp <= 0) {
        isRunning = false;
        document.getElementById('final-score').textContent = `Final Score: ${score} Kills`;
        document.getElementById('gameover-screen').classList.remove('hidden');
      }
    }

    // 5. Sword Kinetic Collision Damage
    const hitData = lineCircleIntersect(
      player.handX, player.handY,
      sword.tipX, sword.tipY,
      enemy.x, enemy.y, enemy.radius
    );

    if (hitData.hit) {
      const MIN_CUT_SPEED = 7.0; 
      
      if (sword.speed > MIN_CUT_SPEED) {
        const rawDamage = Math.floor((sword.speed - MIN_CUT_SPEED) * 3.5);
        enemy.hp -= rawDamage;

        const knockAngle = Math.atan2(sword.tipY - sword.prevTipY, sword.tipX - sword.prevTipX);
        const knockForce = sword.speed * 0.85;
        enemy.vx += Math.cos(knockAngle) * knockForce;
        enemy.vy += Math.sin(knockAngle) * knockForce - 2;

        createSparks(hitData.nearestX, hitData.nearestY, Math.min(20, Math.floor(sword.speed)), '#00ffcc');
        
        if (rawDamage > 30) {
          screenShake = Math.min(12, Math.floor(rawDamage * 0.2));
          createFloatingText(hitData.nearestX, hitData.nearestY - 10, `CRIT ${rawDamage}!`, '#ffea00');
        } else {
          createFloatingText(hitData.nearestX, hitData.nearestY - 10, `${rawDamage}`, '#00ffcc');
        }

        if (enemy.hp <= 0) {
          createSparks(enemy.x, enemy.y, 25, enemy.color);
          enemies.splice(eIndex, 1);
          score++;
          updateHUD();
        }
      }
    }
  });

  // Particles & Damage Text Updates
  particles.forEach((p, pIdx) => {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(pIdx, 1);
  });

  damageTexts.forEach((dt, dtIdx) => {
    dt.y += dt.vy;
    dt.life -= 0.03;
    if (dt.life <= 0) damageTexts.splice(dtIdx, 1);
  });

  // 6. Canvas Rendering Pass
  ctx.save();

  if (screenShake > 0) {
    const sx = (Math.random() - 0.5) * screenShake;
    const sy = (Math.random() - 0.5) * screenShake;
    ctx.translate(sx, sy);
    screenShake *= 0.85;
    if (screenShake < 0.2) screenShake = 0;
  }

  ctx.fillStyle = '#020307';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#00ffcc';
  ctx.lineWidth = 2;
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#00ffcc';
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(canvas.width, GROUND_Y);
  ctx.stroke();
  ctx.shadowBlur = 0;

  sword.trail.forEach(t => {
    ctx.strokeStyle = `rgba(0, 255, 204, ${t.alpha * 0.4})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(t.hx, t.hy);
    ctx.lineTo(t.tx, t.ty);
    ctx.stroke();
  });

  // Player Character
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(player.x, player.y - 10, 8, 0, Math.PI * 2);
  ctx.moveTo(player.x, player.y - 2);
  ctx.lineTo(player.x, player.y + 10);
  ctx.lineTo(player.x - 6, player.y + 18);
  ctx.moveTo(player.x, player.y + 10);
  ctx.lineTo(player.x + 6, player.y + 18);
  ctx.moveTo(player.x, player.y + 2);
  ctx.lineTo(player.handX, player.handY);
  ctx.stroke();

  // Kinetic Sword
  const isHighVelocity = sword.speed > 7.0;
  ctx.strokeStyle = isHighVelocity ? '#00ffcc' : '#aaccff';
  ctx.lineWidth = isHighVelocity ? 4 : 2;
  if (isHighVelocity) {
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#00ffcc';
  }
  ctx.beginPath();
  ctx.moveTo(player.handX, player.handY);
  ctx.lineTo(sword.tipX, sword.tipY);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Enemies
  enemies.forEach(enemy => {
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();

    if (enemy.hp < enemy.maxHp) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius + 3, 0, (enemy.hp / enemy.maxHp) * Math.PI * 2);
      ctx.stroke();
    }
  });

  // Effects
  particles.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.fillRect(p.x, p.y, 2.5, 2.5);
  });
  ctx.globalAlpha = 1.0;

  damageTexts.forEach(dt => {
    ctx.fillStyle = dt.color;
    ctx.font = 'bold 12px monospace';
    ctx.globalAlpha = dt.life;
    ctx.fillText(dt.text, dt.x, dt.y);
  });
  ctx.globalAlpha = 1.0;

  ctx.restore();

  requestAnimationFrame(gameLoop);
}