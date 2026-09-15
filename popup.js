const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State
let isRunning = false;
let score = 0;
let frameCount = 0;
let screenShake = 0;

// Wave System State
let currentWave = 1;
let waveState = 'IN_WAVE'; // 'IN_WAVE' | 'WAVE_PAUSE'
let waveTimer = 0;
let enemiesRemainingToSpawn = 0;
let spawnCooldown = 0;

// Physics Constants
const GRAVITY = 0.55;
const GROUND_Y = 430;
const STANDING_HIP_HEIGHT = 40;

// Inputs
const mouse = { x: 400, y: 250, prevX: 400, prevY: 250, vx: 0, vy: 0 };
const keys = {};

// Verlet Physics Node
class Node {
  constructor(x, y, radius = 6, mass = 1, collideGround = true) {
    this.x = x;
    this.y = y;
    this.oldX = x;
    this.oldY = y;
    this.radius = radius;
    this.mass = mass;
    this.collideGround = collideGround;
  }

  update() {
    let vx = (this.x - this.oldX) * 0.88;
    let vy = (this.y - this.oldY) * 0.88;

    const speed = Math.hypot(vx, vy);
    const maxSpeed = 16.0;
    if (speed > maxSpeed) {
      vx = (vx / speed) * maxSpeed;
      vy = (vy / speed) * maxSpeed;
    }

    this.oldX = this.x;
    this.oldY = this.y;
    this.x += vx;
    this.y += vy + GRAVITY;

    if (this.collideGround && this.y >= GROUND_Y) {
      this.y = GROUND_Y;
      this.oldX = this.x + (this.x - this.oldX) * 0.4;
    }
  }

  applyForce(fx, fy) {
    this.x += fx / this.mass;
    this.y += fy / this.mass;
  }
}

// Character Physics Nodes
const ragdoll = {
  head: new Node(400, 350, 9, 0.7),
  chest: new Node(400, 370, 10, 1.0),
  hip: new Node(400, 390, 8, 1.2),
  lFoot: new Node(388, GROUND_Y, 6, 1.0),
  rFoot: new Node(412, GROUND_Y, 6, 1.0),
  elbow: new Node(410, 370, 4, 0.3, false),
  hand: new Node(418, 370, 5, 0.4, false),
  hp: 100,
  maxHp: 100,
  jumpCooldown: 0,
  iFrames: 0,
  walkCycle: 0,

  reset() {
    this.head.x = this.head.oldX = 400; this.head.y = this.head.oldY = 350;
    this.chest.x = this.chest.oldX = 400; this.chest.y = this.chest.oldY = 370;
    this.hip.x = this.hip.oldX = 400; this.hip.y = this.hip.oldY = 390;
    this.lFoot.x = this.lFoot.oldX = 388; this.lFoot.y = this.lFoot.oldY = GROUND_Y;
    this.rFoot.x = this.rFoot.oldX = 412; this.rFoot.y = this.rFoot.oldY = GROUND_Y;
    this.elbow.x = this.elbow.oldX = 410; this.elbow.y = this.elbow.oldY = 370;
    this.hand.x = this.hand.oldX = 418; this.hand.y = this.hand.oldY = 370;
    this.hp = 100;
    this.iFrames = 0;
    this.walkCycle = 0;
  }
};

// Elastic Constraints
const constraints = [
  { p1: ragdoll.head, p2: ragdoll.chest, len: 18, stiffness: 0.85 },
  { p1: ragdoll.chest, p2: ragdoll.hip, len: 18, stiffness: 0.85 },
  { p1: ragdoll.hip, p2: ragdoll.lFoot, len: 38, stiffness: 0.70 },
  { p1: ragdoll.hip, p2: ragdoll.rFoot, len: 38, stiffness: 0.70 },
  { p1: ragdoll.chest, p2: ragdoll.elbow, len: 14, stiffness: 0.75 },
  { p1: ragdoll.elbow, p2: ragdoll.hand, len: 14, stiffness: 0.75 }
];

function solveConstraint(c) {
  const dx = c.p2.x - c.p1.x;
  const dy = c.p2.y - c.p1.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const diff = (dist - c.len) / dist;

  const mTotal = c.p1.mass + c.p2.mass;
  const w1 = (c.p2.mass / mTotal) * c.stiffness;
  const w2 = (c.p1.mass / mTotal) * c.stiffness;

  c.p1.x += dx * diff * w1;
  c.p1.y += dy * diff * w1;
  c.p2.x -= dx * diff * w2;
  c.p2.y -= dy * diff * w2;
}

// Kinetic Sword
const sword = {
  length: 58,
  tipX: 400, tipY: 200,
  prevTipX: 400, prevTipY: 200,
  speed: 0,
  trail: []
};

// Global Arrays
let enemies = [];
let particles = [];
let damageTexts = [];

// Event Listeners
window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});

window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

function startGame() {
  score = 0; 
  frameCount = 0;
  enemies = []; particles = []; damageTexts = [];
  ragdoll.reset();

  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  
  startWave(1);
  updateHUD();

  isRunning = true;
  requestAnimationFrame(gameLoop);
}

function startWave(waveNum) {
  currentWave = waveNum;
  waveState = 'IN_WAVE';
  enemiesRemainingToSpawn = 4 + waveNum * 3; // Waves get bigger: W1=7, W2=10, W3=13, etc.
  spawnCooldown = 0;
}

function updateHUD() {
  document.getElementById('score-val').textContent = score;
  const hpPercent = Math.max(0, (ragdoll.hp / ragdoll.maxHp) * 100);
  document.getElementById('hp-bar').style.width = `${hpPercent}%`;
}

function spawnEnemy() {
  const spawnLeft = Math.random() < 0.5;
  const startX = spawnLeft ? -25 : canvas.width + 25;

  // Wave-based progression & enemy unlocks
  let types = ['regular'];
  if (currentWave >= 3) types.push('bouncing');
  if (currentWave >= 5) types.push('tank');

  let rand = Math.random();
  let selectedType = 'regular';

  if (types.includes('tank') && rand < 0.2 + (currentWave * 0.02)) {
    selectedType = 'tank';
  } else if (types.includes('bouncing') && rand < 0.45) {
    selectedType = 'bouncing';
  }

  // Multipliers that scale with Wave progression
  const hpScale = 1 + (currentWave - 1) * 0.15;
  const speedScale = 1 + Math.min(0.75, (currentWave - 1) * 0.08);

  if (selectedType === 'tank') {
    enemies.push({
      type: 'tank',
      x: startX, y: GROUND_Y - 20, vx: 0, vy: 0,
      radius: 20, mass: 2.6,
      hp: Math.floor(110 * hpScale), maxHp: Math.floor(110 * hpScale),
      speed: (0.45 + Math.random() * 0.2) * speedScale,
      contactDamage: 16 + Math.floor(currentWave * 0.5),
      hitCooldown: 0,
      color: '#aa00ff'
    });
  } else if (selectedType === 'bouncing') {
    enemies.push({
      type: 'bouncing',
      x: startX, y: GROUND_Y - 11, vx: 0, vy: 0,
      radius: 11, mass: 0.8,
      hp: Math.floor(28 * hpScale), maxHp: Math.floor(28 * hpScale),
      speed: (1.1 + Math.random() * 0.5) * speedScale,
      contactDamage: 8 + Math.floor(currentWave * 0.3),
      bouncePower: -8.5 - (Math.random() * 3),
      hitCooldown: 0,
      color: '#00ff66'
    });
  } else {
    enemies.push({
      type: 'regular',
      x: startX, y: GROUND_Y - 14, vx: 0, vy: 0,
      radius: 14, mass: 1.0,
      hp: Math.floor(40 * hpScale), maxHp: Math.floor(40 * hpScale),
      speed: (0.8 + Math.random() * 0.5) * speedScale,
      contactDamage: 10 + Math.floor(currentWave * 0.4),
      hitCooldown: 0,
      color: spawnLeft ? '#ff0055' : '#ff4400'
    });
  }
}

function lineCircleIntersect(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1; const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return false;
  const u = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / (len * len)));
  const nearestX = x1 + u * dx;
  const nearestY = y1 + u * dy;
  return { hit: Math.hypot(cx - nearestX, cy - nearestY) < r + 4, nearestX, nearestY };
}

function createSparks(x, y, count, color = '#00ffcc') {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, decay: 0.03 + Math.random() * 0.04, color });
  }
}

function createFloatingText(x, y, text, color = '#fff') {
  damageTexts.push({ x, y, text, color, life: 1, vy: -1.5 });
}

function gameLoop() {
  if (!isRunning) return;
  frameCount++;

  mouse.vx = mouse.x - mouse.prevX;
  mouse.vy = mouse.y - mouse.prevY;
  mouse.prevX = mouse.x; mouse.prevY = mouse.y;

  if (ragdoll.iFrames > 0) ragdoll.iFrames--;

  // WAVE CONTROL LOGIC
  if (waveState === 'IN_WAVE') {
    if (enemiesRemainingToSpawn > 0) {
      spawnCooldown--;
      if (spawnCooldown <= 0) {
        spawnEnemy();
        enemiesRemainingToSpawn--;
        // Waves spawn faster as difficulty rises
        spawnCooldown = Math.max(25, 90 - currentWave * 5);
      }
    } else if (enemies.length === 0) {
      // Wave Cleared!
      waveState = 'WAVE_PAUSE';
      waveTimer = 180; // 3 Seconds pause (at 60 FPS)

      // Wave Clear Health Reward (+15 HP)
      if (ragdoll.hp < ragdoll.maxHp) {
        ragdoll.hp = Math.min(ragdoll.maxHp, ragdoll.hp + 15);
        createFloatingText(ragdoll.chest.x, ragdoll.chest.y - 30, 'WAVE CLEARED! +15 HP', '#00ff66');
        updateHUD();
      }
    }
  } else if (waveState === 'WAVE_PAUSE') {
    waveTimer--;
    if (waveTimer <= 0) {
      startWave(currentWave + 1);
    }
  }

  const isGrounded = ragdoll.lFoot.y >= GROUND_Y - 4 || ragdoll.rFoot.y >= GROUND_Y - 4;

  const isMovingLeft = keys['a'] || keys['arrowleft'];
  const isMovingRight = keys['d'] || keys['arrowright'];
  const isJumping = keys['w'] || keys['arrowup'] || keys[' '];

  // 1. Standing Active Lift
  if (isGrounded) {
    const targetHipY = GROUND_Y - STANDING_HIP_HEIGHT;
    const hipSpring = (targetHipY - ragdoll.hip.y) * 0.18;
    ragdoll.hip.applyForce(0, hipSpring);
  }

  // Persistent Upright Spine Drive
  ragdoll.chest.applyForce(0, (ragdoll.hip.y - 18 - ragdoll.chest.y) * 0.3);
  ragdoll.head.applyForce(0, (ragdoll.chest.y - 18 - ragdoll.head.y) * 0.35);

  // 2. Active Movement
  if (isMovingLeft || isMovingRight) {
    const moveDir = isMovingLeft ? -1 : 1;
    const moveForce = moveDir * (isGrounded ? 0.9 : 0.5);

    ragdoll.hip.applyForce(moveForce, 0);
    ragdoll.chest.applyForce(moveForce * 1.1, 0);

    if (isGrounded) {
      ragdoll.walkCycle += 0.15;
      const legOffset = Math.sin(ragdoll.walkCycle) * 14;
      const legLift = Math.abs(Math.cos(ragdoll.walkCycle)) * 8;

      ragdoll.lFoot.applyForce((ragdoll.hip.x + legOffset - ragdoll.lFoot.x) * 0.2, -legLift * 0.15);
      ragdoll.rFoot.applyForce((ragdoll.hip.x - legOffset - ragdoll.rFoot.x) * 0.2, legLift * 0.1);
    }
  } else if (isGrounded) {
    ragdoll.lFoot.applyForce((ragdoll.hip.x - 10 - ragdoll.lFoot.x) * 0.15, 0);
    ragdoll.rFoot.applyForce((ragdoll.hip.x + 10 - ragdoll.rFoot.x) * 0.15, 0);
  }

  // 3. Super Jump Impulse
  if (isJumping && isGrounded && ragdoll.jumpCooldown <= 0) {
    const jumpImpulse = -26.0;
    ragdoll.head.applyForce(0, jumpImpulse * 1.1);
    ragdoll.chest.applyForce(0, jumpImpulse * 1.0);
    ragdoll.hip.applyForce(0, jumpImpulse * 0.9);
    ragdoll.jumpCooldown = 20;
  }

  if (ragdoll.jumpCooldown > 0) ragdoll.jumpCooldown--;

  // Physics Updates
  ragdoll.head.update();
  ragdoll.chest.update();
  ragdoll.hip.update();
  ragdoll.lFoot.update();
  ragdoll.rFoot.update();
  ragdoll.elbow.update();
  ragdoll.hand.update();

  // Mouse Aiming & Arm Tracking
  const armDx = mouse.x - ragdoll.chest.x;
  const armDy = mouse.y - ragdoll.chest.y;
  const distToMouse = Math.hypot(armDx, armDy);
  const armAngle = Math.atan2(armDy, armDx);

  const maxReach = 28;
  const reach = Math.min(distToMouse, maxReach);

  const targetHandX = ragdoll.chest.x + Math.cos(armAngle) * reach;
  const targetHandY = ragdoll.chest.y + Math.sin(armAngle) * reach;

  ragdoll.hand.x += (targetHandX - ragdoll.hand.x) * 0.85;
  ragdoll.hand.y += (targetHandY - ragdoll.hand.y) * 0.85;

  const targetElbowX = (ragdoll.chest.x + ragdoll.hand.x) / 2;
  const targetElbowY = (ragdoll.chest.y + ragdoll.hand.y) / 2 + (reach < 18 ? 5 : 0);
  ragdoll.elbow.x += (targetElbowX - ragdoll.elbow.x) * 0.7;
  ragdoll.elbow.y += (targetElbowY - ragdoll.elbow.y) * 0.7;

  // Solve Constraints
  for (let i = 0; i < 5; i++) {
    constraints.forEach(solveConstraint);
  }

  // Screen Boundaries
  [ragdoll.head, ragdoll.chest, ragdoll.hip, ragdoll.lFoot, ragdoll.rFoot].forEach(node => {
    node.x = Math.max(12, Math.min(canvas.width - 12, node.x));
  });

  // Sword Physics
  sword.prevTipX = sword.tipX;
  sword.prevTipY = sword.tipY;

  const forearmAngle = Math.atan2(ragdoll.hand.y - ragdoll.elbow.y, ragdoll.hand.x - ragdoll.elbow.x);
  sword.tipX = ragdoll.hand.x + Math.cos(forearmAngle) * sword.length;
  sword.tipY = ragdoll.hand.y + Math.sin(forearmAngle) * sword.length;

  const tipVx = sword.tipX - sword.prevTipX;
  const tipVy = sword.tipY - sword.prevTipY;
  sword.speed = Math.hypot(tipVx, tipVy);

  sword.trail.push({ hx: ragdoll.hand.x, hy: ragdoll.hand.y, tx: sword.tipX, ty: sword.tipY, alpha: 1 });
  if (sword.trail.length > 6) sword.trail.shift();
  sword.trail.forEach(t => t.alpha -= 0.15);

  // Enemy AI & Collision
  enemies.forEach((enemy, eIndex) => {
    if (enemy.hitCooldown > 0) enemy.hitCooldown--;

    const eDir = Math.sign(ragdoll.hip.x - enemy.x);
    enemy.vx += eDir * (0.22 * (enemy.speed || 1));
    enemy.vy += GRAVITY;

    enemy.vx *= 0.88;
    enemy.x += enemy.vx;
    enemy.y += enemy.vy;

    if (enemy.y >= GROUND_Y - enemy.radius) {
      enemy.y = GROUND_Y - enemy.radius;
      if (enemy.type === 'bouncing') {
        enemy.vy = enemy.bouncePower;
      } else {
        enemy.vy = 0;
      }
    }

    // Player Hit Detection & Deflective Parry System
    const distToHip = Math.hypot(ragdoll.hip.x - enemy.x, ragdoll.hip.y - enemy.y);
    const distToChest = Math.hypot(ragdoll.chest.x - enemy.x, ragdoll.chest.y - enemy.y);
    const isTouchingPlayer = (distToHip < ragdoll.hip.radius + enemy.radius + 2 || distToChest < ragdoll.chest.radius + enemy.radius + 2);

    if (isTouchingPlayer && ragdoll.iFrames <= 0) {
      const isParrying = sword.speed > 5.0;

      if (isParrying) {
        const parryDir = Math.sign(enemy.x - ragdoll.hip.x) || 1;
        enemy.vx = parryDir * 18;
        enemy.vy = -8;
        enemy.hitCooldown = 15;

        createSparks(enemy.x, enemy.y, 16, '#00ffcc');
        createFloatingText(enemy.x, enemy.y - 12, 'PARRY!', '#00ffcc');
        screenShake = 5;
        ragdoll.iFrames = 15;
      } else {
        ragdoll.hp -= enemy.contactDamage;
        ragdoll.iFrames = 45;

        const pushDir = Math.sign(ragdoll.hip.x - enemy.x) || 1;
        ragdoll.hip.applyForce(pushDir * 18, -8);
        ragdoll.chest.applyForce(pushDir * 20, -10);
        ragdoll.head.applyForce(pushDir * 22, -10);

        enemy.vx = -pushDir * 12;
        enemy.vy = -6;

        screenShake = 8;
        createFloatingText(ragdoll.chest.x, ragdoll.chest.y - 15, `-${enemy.contactDamage} HP`, '#ff3333');
        updateHUD();

        if (ragdoll.hp <= 0) {
          isRunning = false;
          document.getElementById('final-score').textContent = `Reached Wave ${currentWave} | Kills: ${score}`;
          document.getElementById('gameover-screen').classList.remove('hidden');
        }
      }
    }

    // Sword Cut Check
    const hitData = lineCircleIntersect(ragdoll.hand.x, ragdoll.hand.y, sword.tipX, sword.tipY, enemy.x, enemy.y, enemy.radius);
    if (hitData.hit && enemy.hitCooldown <= 0) {
      const MIN_CUT_SPEED = 4.5; 
      if (sword.speed > MIN_CUT_SPEED) {
        const excessSpeed = sword.speed - MIN_CUT_SPEED;
        
        let rawDamage = Math.floor(12 + Math.sqrt(excessSpeed) * 5.0);
        if (enemy.type === 'tank') rawDamage = Math.floor(rawDamage * 0.7);
        rawDamage = Math.min(35, rawDamage);

        enemy.hp -= rawDamage;
        enemy.hitCooldown = 10;

        const knockAngle = Math.atan2(sword.tipY - sword.prevTipY, sword.tipX - sword.prevTipX);
        const knockForce = (sword.speed * 0.65) / enemy.mass;
        enemy.vx += Math.cos(knockAngle) * knockForce;
        enemy.vy += (Math.sin(knockAngle) * knockForce - 2) / enemy.mass;

        createSparks(hitData.nearestX, hitData.nearestY, Math.min(20, Math.floor(sword.speed)), enemy.color);
        
        if (rawDamage >= 28) {
          screenShake = Math.min(8, Math.floor(rawDamage * 0.2));
          createFloatingText(hitData.nearestX, hitData.nearestY - 10, `CRIT ${rawDamage}!`, '#ffea00');
        } else {
          createFloatingText(hitData.nearestX, hitData.nearestY - 10, `${rawDamage}`, '#00ffcc');
        }

        if (enemy.hp <= 0) {
          createSparks(enemy.x, enemy.y, 28, enemy.color);
          enemies.splice(eIndex, 1);
          score++; 

          if (ragdoll.hp < ragdoll.maxHp) {
            ragdoll.hp = Math.min(ragdoll.maxHp, ragdoll.hp + 6);
            createFloatingText(ragdoll.chest.x, ragdoll.chest.y - 25, '+6 HP', '#00ff66');
          }

          updateHUD();
        }
      }
    }
  });

  // Particles & Damage Text
  particles.forEach((p, pIdx) => {
    p.x += p.vx; p.y += p.vy; p.life -= p.decay;
    if (p.life <= 0) particles.splice(pIdx, 1);
  });
  damageTexts.forEach((dt, dtIdx) => {
    dt.y += dt.vy; dt.life -= 0.03;
    if (dt.life <= 0) damageTexts.splice(dtIdx, 1);
  });

  // Render Loop
  ctx.save();
  if (screenShake > 0) {
    ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    screenShake *= 0.85;
    if (screenShake < 0.2) screenShake = 0;
  }

  ctx.fillStyle = '#020307';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Ground Line
  ctx.strokeStyle = '#00ffcc';
  ctx.lineWidth = 2;
  ctx.shadowBlur = 10; ctx.shadowColor = '#00ffcc';
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(canvas.width, GROUND_Y); ctx.stroke();
  ctx.shadowBlur = 0;

  // Sword Trail FX
  sword.trail.forEach(t => {
    ctx.strokeStyle = `rgba(0, 255, 204, ${t.alpha * 0.4})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(t.hx, t.hy); ctx.lineTo(t.tx, t.ty); ctx.stroke();
  });

  // Stickman Render
  const isInvincible = ragdoll.iFrames > 0;
  const isFlickerOff = isInvincible && Math.floor(frameCount / 4) % 2 === 0;

  ctx.strokeStyle = isInvincible ? '#ff4444' : '#ffffff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  if (!isFlickerOff) {
    ctx.beginPath(); ctx.arc(ragdoll.head.x, ragdoll.head.y, ragdoll.head.radius, 0, Math.PI * 2); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ragdoll.head.x, ragdoll.head.y + ragdoll.head.radius);
    ctx.lineTo(ragdoll.chest.x, ragdoll.chest.y); ctx.lineTo(ragdoll.hip.x, ragdoll.hip.y);

    ctx.lineTo(ragdoll.lFoot.x, ragdoll.lFoot.y);
    ctx.moveTo(ragdoll.hip.x, ragdoll.hip.y);
    ctx.lineTo(ragdoll.rFoot.x, ragdoll.rFoot.y);
    
    ctx.moveTo(ragdoll.chest.x, ragdoll.chest.y);
    ctx.lineTo(ragdoll.elbow.x, ragdoll.elbow.y);
    ctx.lineTo(ragdoll.hand.x, ragdoll.hand.y);
    ctx.stroke();
  }

  // Sword Render
  const isHighVelocity = sword.speed > 4.5;
  ctx.strokeStyle = isHighVelocity ? '#00ffcc' : '#aaccff';
  ctx.lineWidth = isHighVelocity ? 4 : 2;
  if (isHighVelocity) { ctx.shadowBlur = 12; ctx.shadowColor = '#00ffcc'; }
  ctx.beginPath(); ctx.moveTo(ragdoll.hand.x, ragdoll.hand.y); ctx.lineTo(sword.tipX, sword.tipY); ctx.stroke();
  ctx.shadowBlur = 0;

  // Enemies Render
  enemies.forEach(enemy => {
    ctx.fillStyle = enemy.color;
    ctx.shadowBlur = enemy.type === 'tank' ? 12 : 6;
    ctx.shadowColor = enemy.color;
    
    ctx.beginPath(); 
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2); 
    ctx.fill();
    ctx.shadowBlur = 0;

    if (enemy.type === 'tank') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.radius - 4, 0, Math.PI * 2); ctx.stroke();
    }

    if (enemy.hp < enemy.maxHp) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); 
      ctx.arc(enemy.x, enemy.y, enemy.radius + 4, 0, (enemy.hp / enemy.maxHp) * Math.PI * 2); 
      ctx.stroke();
    }
  });

  particles.forEach(p => { ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fillRect(p.x, p.y, 2.5, 2.5); }); ctx.globalAlpha = 1.0;
  damageTexts.forEach(dt => { ctx.fillStyle = dt.color; ctx.font = 'bold 12px monospace'; ctx.globalAlpha = dt.life; ctx.fillText(dt.text, dt.x, dt.y); }); ctx.globalAlpha = 1.0;

  // Wave UI Canvas Overlay
  ctx.textAlign = 'left';
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = '#00ffcc';
  ctx.fillText(`WAVE ${currentWave}`, 20, 30);

  ctx.font = '12px monospace';
  ctx.fillStyle = '#ffffff';
  const remainingCount = enemiesRemainingToSpawn + enemies.length;
  ctx.fillText(`ENEMIES LEFT: ${remainingCount}`, 20, 48);

  // Pause Banner between Waves
  if (waveState === 'WAVE_PAUSE') {
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#00ffcc';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00ffcc';
    ctx.fillText(`WAVE ${currentWave} CLEARED!`, canvas.width / 2, 180);

    ctx.shadowBlur = 0;
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#ffffff';
    const secondsRemaining = Math.ceil(waveTimer / 60);
    ctx.fillText(`NEXT WAVE IN ${secondsRemaining}...`, canvas.width / 2, 215);
  }

  ctx.restore();
  requestAnimationFrame(gameLoop);
}