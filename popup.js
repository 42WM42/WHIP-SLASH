const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// DOM Elements for Intro Overlay
const enemyIntroOverlay = document.getElementById('enemy-intro-overlay');
const introEnemyName = document.getElementById('intro-enemy-name');
const introEnemyDesc = document.getElementById('intro-enemy-desc');
const enemyIntroBtn = document.getElementById('enemy-intro-btn');
const previewCanvas = document.getElementById('enemy-preview-canvas');
const previewCtx = previewCanvas ? previewCanvas.getContext('2d') : null;

// Game State
let isRunning = false;
let score = 0;
let frameCount = 0;
let screenShake = 0;

// Wave System State
let currentWave = 1;
let waveState = 'IN_WAVE'; // 'IN_WAVE', 'WAVE_PAUSE', 'INTRO_PAUSE'
let waveTimer = 0;
let enemiesRemainingToSpawn = 0;
let spawnCooldown = 0;
let seenEnemies = new Set();

// Enemy Profiles & Descriptions
const ENEMY_PROFILES = {
  regular: {
    name: 'SLASHER',
    desc: 'Relentless frontline grunt. Charges at high speed and attempts to overwhelm you with swarming numbers.',
    color: '#ff0055'
  },
  bouncing: {
    name: 'HOPPER',
    desc: 'Kinetic mobility drone. Bounces unpredictably across the arena to evade slashes and catch you off guard.',
    color: '#00ff66'
  },
  shield: {
    name: 'SHIELD GUARDIAN',
    desc: 'Heavy vanguard bearing a directional kinetic shield. Frontal slashes are blocked—dash behind it or strike from above!',
    color: '#00aaff'
  },
  drone: {
    name: 'PLASMA DRONE',
    desc: 'Airborne ranged unit. Hovers above ground and fires high-velocity plasma bolts downward at your position.',
    color: '#aa00ff'
  },
  tank: {
    name: 'BRUTE TANK',
    desc: 'Heavy armored juggernaut. Absorbs massive blade impact with high mass and deals heavy knockback damage.',
    color: '#ff00aa'
  },
  bomber: {
    name: 'KAMIKAZE BOMBER',
    desc: 'Volatile explosive runner. Charges toward you and ignites a short-fuse bomb. Destroy it before it detonates!',
    color: '#ffaa00'
  },
  phantom: {
    name: 'BLINK PHANTOM',
    desc: 'Phase-shifting assassin. Teleports unpredictably across space to ambush you from blind spots.',
    color: '#ff00ff'
  }
};

// Physics Constants
const GRAVITY = 0.50;
const GROUND_Y = 360; // Raised ground level to provide more room to swing
const STANDING_HIP_HEIGHT = 38;

// Inputs
const mouse = { x: 400, y: 200, prevX: 400, prevY: 200, vx: 0, vy: 0 };
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
    let vx = (this.x - this.oldX) * 0.90;
    let vy = (this.y - this.oldY) * 0.90;

    const speed = Math.hypot(vx, vy);
    const maxSpeed = 32.0; 
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

  addImpulse(vx, vy) {
    this.oldX -= vx / this.mass;
    this.oldY -= vy / this.mass;
  }
}

// Character Physics Nodes (Positions adjusted upward for new GROUND_Y)
const ragdoll = {
  head: new Node(400, 280, 9, 0.6),
  chest: new Node(400, 300, 10, 0.9),
  hip: new Node(400, 320, 8, 1.1),
  
  lKnee: new Node(394, 340, 5, 0.7),
  lFoot: new Node(388, GROUND_Y, 6, 0.9),

  rKnee: new Node(406, 340, 5, 0.7),
  rFoot: new Node(412, GROUND_Y, 6, 0.9),
  
  elbow: new Node(412, 315, 4, 0.3, false),
  hand: new Node(422, 325, 5, 0.4, false),

  lElbow: new Node(392, 315, 4, 0.3, false),
  lHand: new Node(392, 328, 4, 0.3, false),

  hp: 100,
  maxHp: 100,
  jumpCooldown: 0,
  dashCooldown: 0,
  dashTimer: 0,
  iFrames: 0,
  walkCycle: 0,
  flopTimer: 0,

  reset() {
    this.head.x = this.head.oldX = 400; this.head.y = this.head.oldY = 280;
    this.chest.x = this.chest.oldX = 400; this.chest.y = this.chest.oldY = 300;
    this.hip.x = this.hip.oldX = 400; this.hip.y = this.hip.oldY = 320;
    
    this.lKnee.x = this.lKnee.oldX = 394; this.lKnee.y = this.lKnee.oldY = 340;
    this.lFoot.x = this.lFoot.oldX = 388; this.lFoot.y = this.lFoot.oldY = GROUND_Y;
    
    this.rKnee.x = this.rKnee.oldX = 406; this.rKnee.y = this.rKnee.oldY = 340;
    this.rFoot.x = this.rFoot.oldX = 412; this.rFoot.y = this.rFoot.oldY = GROUND_Y;

    this.elbow.x = this.elbow.oldX = 412; this.elbow.y = this.elbow.oldY = 315;
    this.hand.x = this.hand.oldX = 422; this.hand.y = this.hand.oldY = 325;
    this.lElbow.x = this.lElbow.oldX = 392; this.lElbow.y = this.lElbow.oldY = 315;
    this.lHand.x = this.lHand.oldX = 392; this.lHand.y = this.lHand.oldY = 328;
    
    this.hp = 100;
    this.iFrames = 0;
    this.dashCooldown = 0;
    this.dashTimer = 0;
    this.walkCycle = 0;
    this.flopTimer = 0;
  }
};

// Elastic Constraints
const constraints = [
  { p1: ragdoll.head, p2: ragdoll.chest, len: 18, stiffness: 0.32 },
  { p1: ragdoll.chest, p2: ragdoll.hip, len: 18, stiffness: 0.32 },
  
  { p1: ragdoll.hip, p2: ragdoll.lKnee, len: 20, stiffness: 0.28 },
  { p1: ragdoll.lKnee, p2: ragdoll.lFoot, len: 20, stiffness: 0.28 },
  
  { p1: ragdoll.hip, p2: ragdoll.rKnee, len: 20, stiffness: 0.28 },
  { p1: ragdoll.rKnee, p2: ragdoll.rFoot, len: 20, stiffness: 0.28 },

  { p1: ragdoll.chest, p2: ragdoll.elbow, len: 19, stiffness: 0.25 },
  { p1: ragdoll.elbow, p2: ragdoll.hand, len: 19, stiffness: 0.25 },
  
  { p1: ragdoll.chest, p2: ragdoll.lElbow, len: 19, stiffness: 0.22 },
  { p1: ragdoll.lElbow, p2: ragdoll.lHand, len: 19, stiffness: 0.22 }
];

function solveConstraint(c) {
  const dx = c.p2.x - c.p1.x;
  const dy = c.p2.y - c.p1.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const diff = (dist - c.len) / dist;

  const currentStiffness = ragdoll.flopTimer > 0 ? c.stiffness * 0.3 : c.stiffness;

  const mTotal = c.p1.mass + c.p2.mass;
  const w1 = (c.p2.mass / mTotal) * currentStiffness;
  const w2 = (c.p1.mass / mTotal) * currentStiffness;

  c.p1.x += dx * diff * w1;
  c.p1.y += dy * diff * w1;
  c.p2.x -= dx * diff * w2;
  c.p2.y -= dy * diff * w2;
}

// Kinetic Sword
const sword = {
  length: 62,
  tipX: 400, tipY: 150,
  prevTipX: 400, prevTipY: 150,
  speed: 0,
  trail: []
};

// Global Arrays
let enemies = [];
let particles = [];
let damageTexts = [];
let projectiles = [];

// Event Listeners
window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});

window.addEventListener('mousedown', (e) => {
  if (e.button === 0) performDash();
});

window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

enemyIntroBtn.addEventListener('click', () => {
  enemyIntroOverlay.classList.add('hidden');
  waveState = 'IN_WAVE';
});

function renderEnemyPreview(type) {
  if (!previewCtx) return;
  const w = previewCanvas.width;
  const h = previewCanvas.height;

  previewCtx.clearRect(0, 0, w, h);
  previewCtx.fillStyle = '#080d1a';
  previewCtx.fillRect(0, 0, w, h);

  // Ground Line
  previewCtx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
  previewCtx.lineWidth = 1.5;
  previewCtx.beginPath();
  previewCtx.moveTo(0, 105); previewCtx.lineTo(w, 105);
  previewCtx.stroke();

  const profile = ENEMY_PROFILES[type];
  previewCtx.strokeStyle = profile.color;
  previewCtx.shadowBlur = (type === 'tank' || type === 'phantom') ? 14 : 8;
  previewCtx.shadowColor = profile.color;
  previewCtx.lineCap = 'round';

  const centerX = w / 2;
  const groundY = type === 'drone' ? 65 : 105;

  const scale = type === 'tank' ? 2.0 : (type === 'bouncing' ? 1.4 : (type === 'bomber' ? 1.5 : 1.6));
  previewCtx.lineWidth = type === 'tank' ? 5.0 : 3.5;

  const headR = 6 * scale;
  const headY = groundY - 20 * scale;
  const chestY = groundY - 8 * scale;
  const hipY = groundY + 4 * scale;

  // Head
  previewCtx.beginPath();
  previewCtx.arc(centerX, headY, headR, 0, Math.PI * 2);
  previewCtx.stroke();

  // Torso & Legs
  previewCtx.beginPath();
  previewCtx.moveTo(centerX, headY + headR);
  previewCtx.lineTo(centerX, chestY);
  previewCtx.lineTo(centerX, hipY);

  const legOffset = 8 * scale;
  previewCtx.lineTo(centerX + legOffset, groundY);
  previewCtx.moveTo(centerX, hipY);
  previewCtx.lineTo(centerX - legOffset, groundY);

  // Arms & Specific Features
  previewCtx.moveTo(centerX, chestY);
  previewCtx.lineTo(centerX + 10 * scale, chestY + 4 * scale);
  previewCtx.moveTo(centerX, chestY);
  previewCtx.lineTo(centerX - 10 * scale, chestY + 4 * scale);
  previewCtx.stroke();

  if (type === 'shield') {
    previewCtx.strokeStyle = '#00ffff';
    previewCtx.lineWidth = 4;
    previewCtx.beginPath();
    previewCtx.moveTo(centerX + 16, groundY - 32 * scale);
    previewCtx.lineTo(centerX + 16, groundY + 2 * scale);
    previewCtx.stroke();
  } else if (type === 'drone') {
    previewCtx.strokeStyle = '#aa00ff';
    previewCtx.lineWidth = 2;
    previewCtx.beginPath();
    previewCtx.arc(centerX, headY - 2, headR + 12, 0, Math.PI * 2);
    previewCtx.stroke();
  } else if (type === 'bomber') {
    previewCtx.fillStyle = '#ffaa00';
    previewCtx.beginPath();
    previewCtx.arc(centerX, chestY, 7, 0, Math.PI * 2);
    previewCtx.fill();
  }

  previewCtx.shadowBlur = 0;
}

function showEnemyIntro(type) {
  const profile = ENEMY_PROFILES[type];
  if (!profile) return;

  waveState = 'INTRO_PAUSE';
  introEnemyName.textContent = profile.name;
  introEnemyDesc.textContent = profile.desc;
  introEnemyName.style.color = profile.color;
  introEnemyName.style.textShadow = `0 0 10px ${profile.color}`;

  renderEnemyPreview(type);
  enemyIntroOverlay.classList.remove('hidden');
}

function performDash() {
  if (!isRunning || ragdoll.dashCooldown > 0 || ragdoll.flopTimer > 0 || waveState === 'INTRO_PAUSE') return;

  const dx = mouse.x - ragdoll.chest.x;
  const dy = mouse.y - ragdoll.chest.y;
  const dist = Math.hypot(dx, dy) || 1;
  const dirX = dx / dist;
  const dirY = dy / dist;

  const DASH_POWER = 24.0;

  ragdoll.head.addImpulse(dirX * DASH_POWER, dirY * DASH_POWER);
  ragdoll.chest.addImpulse(dirX * DASH_POWER, dirY * DASH_POWER);
  ragdoll.hip.addImpulse(dirX * DASH_POWER * 0.9, dirY * DASH_POWER * 0.9);
  ragdoll.lKnee.addImpulse(dirX * DASH_POWER * 0.8, dirY * DASH_POWER * 0.8);
  ragdoll.rKnee.addImpulse(dirX * DASH_POWER * 0.8, dirY * DASH_POWER * 0.8);
  ragdoll.lFoot.addImpulse(dirX * DASH_POWER * 0.7, dirY * DASH_POWER * 0.7);
  ragdoll.rFoot.addImpulse(dirX * DASH_POWER * 0.7, dirY * DASH_POWER * 0.7);

  ragdoll.dashCooldown = 50;
  ragdoll.dashTimer = 10;
  ragdoll.iFrames = 18;

  createSparks(ragdoll.chest.x, ragdoll.chest.y, 20, '#00ffcc');
  createFloatingText(ragdoll.chest.x, ragdoll.chest.y - 30, 'DASH!', '#00ffcc');
  screenShake = 7;
}

function startGame() {
  score = 0; 
  frameCount = 0;
  enemies = []; particles = []; damageTexts = []; projectiles = [];
  seenEnemies.clear();
  ragdoll.reset();

  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  enemyIntroOverlay.classList.add('hidden');
  
  startWave(1);
  updateHUD();

  isRunning = true;
  requestAnimationFrame(gameLoop);
}

function startWave(waveNum) {
  currentWave = waveNum;
  waveState = 'IN_WAVE';
  enemiesRemainingToSpawn = 3 + Math.floor(waveNum * 1.5);
  spawnCooldown = 0;

  // Spaced Out Progression
  let newTypeToIntroduce = null;
  if (waveNum === 1 && !seenEnemies.has('regular')) newTypeToIntroduce = 'regular';
  else if (waveNum === 3 && !seenEnemies.has('bouncing')) newTypeToIntroduce = 'bouncing';
  else if (waveNum === 5 && !seenEnemies.has('shield')) newTypeToIntroduce = 'shield';
  else if (waveNum === 8 && !seenEnemies.has('drone')) newTypeToIntroduce = 'drone';
  else if (waveNum === 11 && !seenEnemies.has('tank')) newTypeToIntroduce = 'tank';
  else if (waveNum === 14 && !seenEnemies.has('bomber')) newTypeToIntroduce = 'bomber';
  else if (waveNum === 17 && !seenEnemies.has('phantom')) newTypeToIntroduce = 'phantom';

  if (newTypeToIntroduce) {
    seenEnemies.add(newTypeToIntroduce);
    showEnemyIntro(newTypeToIntroduce);
  }
}

function updateHUD() {
  document.getElementById('score-val').textContent = score;
  const hpPercent = Math.max(0, (ragdoll.hp / ragdoll.maxHp) * 100);
  document.getElementById('hp-bar').style.width = `${hpPercent}%`;
}

function spawnEnemy() {
  const spawnLeft = Math.random() < 0.5;
  const startX = spawnLeft ? -40 : canvas.width + 40;

  // Spaced out pool expansion
  let pool = ['regular'];
  if (currentWave >= 3) pool.push('bouncing');
  if (currentWave >= 5) pool.push('shield');
  if (currentWave >= 8) pool.push('drone');
  if (currentWave >= 11) pool.push('tank');
  if (currentWave >= 14) pool.push('bomber');
  if (currentWave >= 17) pool.push('phantom');

  const selectedType = pool[Math.floor(Math.random() * pool.length)];

  const hpScale = 1 + (currentWave - 1) * 0.07;
  const speedScale = 1 + Math.min(0.4, (currentWave - 1) * 0.03);

  if (selectedType === 'tank') {
    enemies.push({
      type: 'tank',
      x: startX, y: GROUND_Y - 34, vx: 0, vy: 0,
      radius: 32, mass: 2.8,
      hp: Math.floor(110 * hpScale), maxHp: Math.floor(110 * hpScale),
      speed: (0.45 + Math.random() * 0.15) * speedScale,
      contactDamage: 16 + Math.floor(currentWave * 0.3),
      hitCooldown: 0, walkCycle: Math.random() * 10, color: '#ff00aa'
    });
  } else if (selectedType === 'shield') {
    enemies.push({
      type: 'shield',
      x: startX, y: GROUND_Y - 26, vx: 0, vy: 0,
      radius: 24, mass: 1.6,
      hp: Math.floor(55 * hpScale), maxHp: Math.floor(55 * hpScale),
      speed: (0.65 + Math.random() * 0.2) * speedScale,
      contactDamage: 12 + Math.floor(currentWave * 0.25),
      hitCooldown: 0, walkCycle: Math.random() * 10, color: '#00aaff'
    });
  } else if (selectedType === 'drone') {
    enemies.push({
      type: 'drone',
      x: startX, y: GROUND_Y - 210, vx: 0, vy: 0, // Drone position raised relative to new ground
      radius: 20, mass: 0.8,
      hp: Math.floor(32 * hpScale), maxHp: Math.floor(32 * hpScale),
      speed: (0.8 + Math.random() * 0.3) * speedScale,
      contactDamage: 8, shootTimer: 0,
      hitCooldown: 0, walkCycle: Math.random() * 10, color: '#aa00ff'
    });
  } else if (selectedType === 'bomber') {
    enemies.push({
      type: 'bomber',
      x: startX, y: GROUND_Y - 22, vx: 0, vy: 0,
      radius: 22, mass: 1.0,
      hp: Math.floor(25 * hpScale), maxHp: Math.floor(25 * hpScale),
      speed: (1.3 + Math.random() * 0.3) * speedScale,
      contactDamage: 22, fuse: 45,
      hitCooldown: 0, walkCycle: Math.random() * 10, color: '#ffaa00'
    });
  } else if (selectedType === 'phantom') {
    enemies.push({
      type: 'phantom',
      x: startX, y: GROUND_Y - 24, vx: 0, vy: 0,
      radius: 22, mass: 1.0,
      hp: Math.floor(45 * hpScale), maxHp: Math.floor(45 * hpScale),
      speed: (0.9 + Math.random() * 0.3) * speedScale,
      contactDamage: 14, teleportTimer: 0,
      hitCooldown: 0, walkCycle: Math.random() * 10, color: '#ff00ff'
    });
  } else if (selectedType === 'bouncing') {
    enemies.push({
      type: 'bouncing',
      x: startX, y: GROUND_Y - 20, vx: 0, vy: 0,
      radius: 20, mass: 0.9,
      hp: Math.floor(28 * hpScale), maxHp: Math.floor(28 * hpScale),
      speed: (1.0 + Math.random() * 0.4) * speedScale,
      contactDamage: 8 + Math.floor(currentWave * 0.2),
      bouncePower: -7.5 - (Math.random() * 2.0),
      hitCooldown: 0, walkCycle: Math.random() * 10, color: '#00ff66'
    });
  } else {
    enemies.push({
      type: 'regular',
      x: startX, y: GROUND_Y - 24, vx: 0, vy: 0,
      radius: 23, mass: 1.1,
      hp: Math.floor(40 * hpScale), maxHp: Math.floor(40 * hpScale),
      speed: (0.75 + Math.random() * 0.4) * speedScale,
      contactDamage: 10 + Math.floor(currentWave * 0.25),
      hitCooldown: 0, walkCycle: Math.random() * 10, color: spawnLeft ? '#ff0055' : '#ff4400'
    });
  }
}

function lineCircleIntersect(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1; const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { hit: false };
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

  if (waveState === 'INTRO_PAUSE') {
    requestAnimationFrame(gameLoop);
    return;
  }

  frameCount++;

  mouse.vx = mouse.x - mouse.prevX;
  mouse.vy = mouse.y - mouse.prevY;
  mouse.prevX = mouse.x; mouse.prevY = mouse.y;

  if (ragdoll.iFrames > 0) ragdoll.iFrames--;
  if (ragdoll.flopTimer > 0) ragdoll.flopTimer--;
  if (ragdoll.dashCooldown > 0) ragdoll.dashCooldown--;
  if (ragdoll.dashTimer > 0) ragdoll.dashTimer--;

  if (waveState === 'IN_WAVE') {
    if (enemiesRemainingToSpawn > 0) {
      spawnCooldown--;
      if (spawnCooldown <= 0) {
        spawnEnemy();
        enemiesRemainingToSpawn--;
        spawnCooldown = Math.max(35, 95 - currentWave * 3);
      }
    } else if (enemies.length === 0) {
      waveState = 'WAVE_PAUSE';
      waveTimer = 180;

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

  const isGrounded = ragdoll.lFoot.y >= GROUND_Y - 6 || ragdoll.rFoot.y >= GROUND_Y - 6 || ragdoll.hip.y >= GROUND_Y - 42;
  const isMovingLeft = keys['a'] || keys['arrowleft'];
  const isMovingRight = keys['d'] || keys['arrowright'];
  const isJumping = keys['w'] || keys['arrowup'] || keys[' '];

  const idleSway = Math.sin(frameCount * 0.06) * 1.8;
  const idleBreath = Math.cos(frameCount * 0.08) * 1.2;

  if (ragdoll.flopTimer <= 0) {
    const targetChestX = ragdoll.hip.x + (isGrounded ? idleSway * 0.5 : 0);
    const targetChestY = ragdoll.hip.y - 18 + idleBreath;
    const targetHeadX = ragdoll.chest.x + (isGrounded ? idleSway : 0);
    const targetHeadY = ragdoll.chest.y - 18;

    ragdoll.chest.applyForce((targetChestX - ragdoll.chest.x) * 0.12, (targetChestY - ragdoll.chest.y) * 0.18);
    ragdoll.head.applyForce((targetHeadX - ragdoll.head.x) * 0.12, (targetHeadY - ragdoll.head.y) * 0.18);

    if (isGrounded) {
      const targetHipY = GROUND_Y - STANDING_HIP_HEIGHT;
      ragdoll.hip.applyForce(0, (targetHipY - ragdoll.hip.y) * 0.20);

      const lKneeTargetX = (ragdoll.hip.x + ragdoll.lFoot.x) / 2 - 2;
      const rKneeTargetX = (ragdoll.hip.x + ragdoll.rFoot.x) / 2 + 2;
      const kneeTargetY = (ragdoll.hip.y + GROUND_Y) / 2;

      ragdoll.lKnee.applyForce((lKneeTargetX - ragdoll.lKnee.x) * 0.15, (kneeTargetY - ragdoll.lKnee.y) * 0.15);
      ragdoll.rKnee.applyForce((rKneeTargetX - ragdoll.rKnee.x) * 0.15, (kneeTargetY - ragdoll.rKnee.y) * 0.15);
    } else {
      const bodyVx = ragdoll.hip.x - ragdoll.hip.oldX;
      ragdoll.lKnee.applyForce(-bodyVx * 0.20, 0.15);
      ragdoll.rKnee.applyForce(-bodyVx * 0.15, 0.15);
      ragdoll.lFoot.applyForce(-bodyVx * 0.25, 0.20);
      ragdoll.rFoot.applyForce(-bodyVx * 0.20, 0.20);
    }

    if (isMovingLeft || isMovingRight) {
      const moveDir = isMovingLeft ? -1 : 1;
      const moveForce = moveDir * (isGrounded ? 0.65 : 0.40);

      ragdoll.hip.applyForce(moveForce, 0);
      ragdoll.chest.applyForce(moveForce * 0.8, 0);

      if (isGrounded) {
        ragdoll.walkCycle += 0.22;
        const legOffset = Math.sin(ragdoll.walkCycle) * 16;
        const legLift = Math.abs(Math.cos(ragdoll.walkCycle)) * 10;

        ragdoll.lFoot.applyForce((ragdoll.hip.x + legOffset - ragdoll.lFoot.x) * 0.25, -legLift * 0.18);
        ragdoll.rFoot.applyForce((ragdoll.hip.x - legOffset - ragdoll.rFoot.x) * 0.25, legLift * 0.15);
        
        ragdoll.lKnee.applyForce((ragdoll.hip.x + legOffset * 0.5 - ragdoll.lKnee.x) * 0.2, -legLift * 0.10);
        ragdoll.rKnee.applyForce((ragdoll.hip.x - legOffset * 0.5 - ragdoll.rKnee.x) * 0.2, legLift * 0.08);
      }
    } else if (isGrounded) {
      ragdoll.lFoot.applyForce((ragdoll.hip.x - 8 + idleSway - ragdoll.lFoot.x) * 0.15, 0);
      ragdoll.rFoot.applyForce((ragdoll.hip.x + 8 + idleSway - ragdoll.rFoot.x) * 0.15, 0);
    }

    if (isJumping && isGrounded && ragdoll.jumpCooldown <= 0) {
      ragdoll.head.addImpulse(0, -22.0);
      ragdoll.chest.addImpulse(0, -20.0);
      ragdoll.hip.addImpulse(0, -18.0);
      ragdoll.lKnee.addImpulse(0, -14.0);
      ragdoll.rKnee.addImpulse(0, -14.0);
      ragdoll.lFoot.addImpulse(0, -10.0);
      ragdoll.rFoot.addImpulse(0, -10.0);
      ragdoll.jumpCooldown = 18;
    }
  }

  if (ragdoll.jumpCooldown > 0) ragdoll.jumpCooldown--;

  // Physics Updates
  ragdoll.head.update();
  ragdoll.chest.update();
  ragdoll.hip.update();
  ragdoll.lKnee.update();
  ragdoll.rKnee.update();
  ragdoll.lFoot.update();
  ragdoll.rFoot.update();
  ragdoll.elbow.update();
  ragdoll.hand.update();
  ragdoll.lElbow.update();
  ragdoll.lHand.update();

  // Joint Inversion Rules
  const enforceLegJoints = (knee, foot, isLeft) => {
    if (knee.y < ragdoll.hip.y + 4) {
      knee.y = ragdoll.hip.y + 4;
      knee.oldY = knee.y;
    }
    if (foot.y < knee.y + 2) {
      foot.y = knee.y + 2;
      foot.oldY = foot.y;
    }

    const midX = (ragdoll.hip.x + foot.x) / 2;
    const midY = (ragdoll.hip.y + foot.y) / 2;
    const kneeOffset = isLeft ? -3 : 3;
    knee.x += (midX + kneeOffset - knee.x) * 0.25;
    knee.y += (midY - knee.y) * 0.25;

    const dx = foot.x - ragdoll.hip.x;
    const dy = foot.y - ragdoll.hip.y;
    const dist = Math.hypot(dx, dy);
    const minLegDist = 22;
    if (dist < minLegDist && dist > 0) {
      const factor = (minLegDist - dist) / dist;
      foot.x += dx * factor * 0.5;
      foot.y += dy * factor * 0.5;
    }
  };

  enforceLegJoints(ragdoll.lKnee, ragdoll.lFoot, true);
  enforceLegJoints(ragdoll.rKnee, ragdoll.rFoot, false);

  // Sword Arm Tracking
  const armDx = mouse.x - ragdoll.chest.x;
  const armDy = mouse.y - ragdoll.chest.y;
  const distToMouse = Math.hypot(armDx, armDy);
  const armAngle = Math.atan2(armDy, armDx);

  const maxReach = 36;
  const reach = Math.min(distToMouse, maxReach);

  const targetHandX = ragdoll.chest.x + Math.cos(armAngle) * reach;
  const targetHandY = ragdoll.chest.y + Math.sin(armAngle) * reach;

  ragdoll.hand.x += (targetHandX - ragdoll.hand.x) * 0.85;
  ragdoll.hand.y += (targetHandY - ragdoll.hand.y) * 0.85;

  const targetElbowX = (ragdoll.chest.x + ragdoll.hand.x) / 2;
  const targetElbowY = (ragdoll.chest.y + ragdoll.hand.y) / 2 + (reach < 22 ? 8 : 0);
  ragdoll.elbow.x += (targetElbowX - ragdoll.elbow.x) * 0.7;
  ragdoll.elbow.y += (targetElbowY - ragdoll.elbow.y) * 0.7;

  // Off-Hand Arm Low Drop
  const walkSwing = Math.sin(ragdoll.walkCycle) * 12;
  const offHandBaseX = ragdoll.chest.x - 6;
  const offHandBaseY = ragdoll.chest.y + 26;

  const targetOffHandX = offHandBaseX - ((isMovingLeft || isMovingRight) ? walkSwing : idleSway * 0.4);
  const targetOffHandY = offHandBaseY + (isGrounded ? idleBreath * 0.5 : 2);

  ragdoll.lHand.x += (targetOffHandX - ragdoll.lHand.x) * 0.25;
  ragdoll.lHand.y += (targetOffHandY - ragdoll.lHand.y) * 0.25;

  const targetOffElbowX = (ragdoll.chest.x + ragdoll.lHand.x) / 2 - 2;
  const targetOffElbowY = (ragdoll.chest.y + ragdoll.lHand.y) / 2;
  ragdoll.lElbow.x += (targetOffElbowX - ragdoll.lElbow.x) * 0.3;
  ragdoll.lElbow.y += (targetOffElbowY - ragdoll.lElbow.y) * 0.3;

  for (let i = 0; i < 2; i++) {
    constraints.forEach(solveConstraint);
  }

  // Screen Boundaries
  [ragdoll.head, ragdoll.chest, ragdoll.hip, ragdoll.lKnee, ragdoll.rKnee, ragdoll.lFoot, ragdoll.rFoot].forEach(node => {
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

  // Update Projectiles
  for (let pIdx = projectiles.length - 1; pIdx >= 0; pIdx--) {
    const proj = projectiles[pIdx];
    proj.x += proj.vx;
    proj.y += proj.vy;

    const distToChest = Math.hypot(ragdoll.chest.x - proj.x, ragdoll.chest.y - proj.y);
    if (distToChest < ragdoll.chest.radius + 8 && ragdoll.iFrames <= 0) {
      ragdoll.hp -= 12;
      ragdoll.iFrames = 25;
      createSparks(proj.x, proj.y, 10, '#aa00ff');
      createFloatingText(ragdoll.chest.x, ragdoll.chest.y - 15, '-12 HP', '#ff3333');
      updateHUD();
      projectiles.splice(pIdx, 1);
      continue;
    }

    if (proj.x < -20 || proj.x > canvas.width + 20 || proj.y > GROUND_Y) {
      projectiles.splice(pIdx, 1);
    }
  }

  // Enemy AI & Combat Loop
  for (let eIndex = enemies.length - 1; eIndex >= 0; eIndex--) {
    const enemy = enemies[eIndex];
    if (enemy.hitCooldown > 0) enemy.hitCooldown--;

    const eDir = Math.sign(ragdoll.hip.x - enemy.x);

    // AI Behaviors
    if (enemy.type === 'drone') {
      enemy.vx += (ragdoll.hip.x - enemy.x) * 0.008;
      enemy.vy = Math.sin(frameCount * 0.05) * 1.5;
      enemy.shootTimer++;
      if (enemy.shootTimer > 110) {
        enemy.shootTimer = 0;
        const angle = Math.atan2(ragdoll.chest.y - enemy.y, ragdoll.chest.x - enemy.x);
        projectiles.push({
          x: enemy.x, y: enemy.y,
          vx: Math.cos(angle) * 5.5,
          vy: Math.sin(angle) * 5.5
        });
        createSparks(enemy.x, enemy.y, 6, '#aa00ff');
      }
    } else if (enemy.type === 'phantom') {
      enemy.teleportTimer++;
      if (enemy.teleportTimer > 130) {
        enemy.teleportTimer = 0;
        createSparks(enemy.x, enemy.y, 15, '#ff00ff');
        enemy.x = ragdoll.hip.x + (Math.random() < 0.5 ? -110 : 110);
        enemy.y = GROUND_Y - enemy.radius;
        createSparks(enemy.x, enemy.y, 15, '#ff00ff');
      } else {
        enemy.vx += eDir * (0.22 * enemy.speed);
      }
    } else {
      enemy.vx += eDir * (0.22 * (enemy.speed || 1));
      enemy.vy += GRAVITY;
    }

    enemy.vx *= 0.88;
    enemy.x += enemy.vx;
    enemy.y += enemy.vy;

    enemy.walkCycle += Math.abs(enemy.vx) * 0.25 + 0.05;

    if (enemy.type !== 'drone' && enemy.y >= GROUND_Y - enemy.radius) {
      enemy.y = GROUND_Y - enemy.radius;
      if (enemy.type === 'bouncing') {
        enemy.vy = enemy.bouncePower;
      } else {
        enemy.vy = 0;
      }
    }

    // Player Hit Detection
    const distToHip = Math.hypot(ragdoll.hip.x - enemy.x, ragdoll.hip.y - enemy.y);
    const distToChest = Math.hypot(ragdoll.chest.x - enemy.x, ragdoll.chest.y - enemy.y);
    const isTouchingPlayer = (distToHip < ragdoll.hip.radius + enemy.radius + 4 || distToChest < ragdoll.chest.radius + enemy.radius + 4);

    if (enemy.type === 'bomber' && distToHip < 60) {
      enemy.fuse--;
      if (enemy.fuse <= 0) {
        createSparks(enemy.x, enemy.y, 35, '#ffaa00');
        if (distToHip < 80 && ragdoll.iFrames <= 0) {
          ragdoll.hp -= enemy.contactDamage;
          ragdoll.iFrames = 30;
          screenShake = 12;
          createFloatingText(ragdoll.chest.x, ragdoll.chest.y - 15, `BOOM! -${enemy.contactDamage} HP`, '#ffaa00');
          updateHUD();
        }
        enemies.splice(eIndex, 1);
        continue;
      }
    }

    if (isTouchingPlayer && ragdoll.iFrames <= 0) {
      const isParrying = sword.speed > 5.0 || ragdoll.dashTimer > 0;

      if (isParrying) {
        const parryDir = Math.sign(enemy.x - ragdoll.hip.x) || 1;
        enemy.vx = parryDir * 16;
        enemy.vy = -7;
        enemy.hitCooldown = 15;

        createSparks(enemy.x, enemy.y, 18, '#00ffcc');
        createFloatingText(enemy.x, enemy.y - 20, ragdoll.dashTimer > 0 ? 'DASH SLAM!' : 'PARRY!', '#00ffcc');
        screenShake = 6;
        ragdoll.iFrames = 15;
      } else {
        ragdoll.hp -= enemy.contactDamage;
        ragdoll.iFrames = 45;
        ragdoll.flopTimer = 35;

        const pushDir = Math.sign(ragdoll.hip.x - enemy.x) || 1;
        
        ragdoll.hip.applyForce(pushDir * 11, -6);
        ragdoll.chest.applyForce(pushDir * 12, -7);
        ragdoll.head.applyForce(pushDir * 13, -8);

        enemy.vx = -pushDir * 8;
        enemy.vy = -4;

        screenShake = 8;
        createFloatingText(ragdoll.chest.x, ragdoll.chest.y - 15, `-${enemy.contactDamage} HP`, '#ff3333');
        updateHUD();

        if (ragdoll.hp <= 0) {
          isRunning = false;
          document.getElementById('final-score').textContent = `Reached Wave ${currentWave} | Kills: ${score}`;
          document.getElementById('gameover-screen').classList.remove('hidden');
          return;
        }
      }
    }

    // Sword & Dash Cut Check
    const hitData = lineCircleIntersect(ragdoll.hand.x, ragdoll.hand.y, sword.tipX, sword.tipY, enemy.x, enemy.y, enemy.radius);
    const effectiveSpeed = ragdoll.dashTimer > 0 ? 12.0 : sword.speed;

    if ((hitData.hit || (ragdoll.dashTimer > 0 && isTouchingPlayer)) && enemy.hitCooldown <= 0) {
      const MIN_CUT_SPEED = 4.5; 
      if (effectiveSpeed > MIN_CUT_SPEED) {

        // Shield Guardian Frontal Block Check
        if (enemy.type === 'shield' && ragdoll.dashTimer <= 0) {
          const slashFromRight = sword.tipX < sword.prevTipX;
          const enemyFacingRight = enemy.x < ragdoll.hip.x;
          if ((enemyFacingRight && slashFromRight) || (!enemyFacingRight && !slashFromRight)) {
            enemy.hitCooldown = 12;
            createSparks(enemy.x, enemy.y, 10, '#00ffff');
            createFloatingText(enemy.x, enemy.y - 20, 'BLOCKED!', '#00ffff');
            continue;
          }
        }

        const excessSpeed = effectiveSpeed - MIN_CUT_SPEED;
        let rawDamage = Math.floor(12 + Math.sqrt(excessSpeed) * 5.0);
        if (ragdoll.dashTimer > 0) rawDamage += 10;
        if (enemy.type === 'tank') rawDamage = Math.floor(rawDamage * 0.7);
        rawDamage = Math.min(42, rawDamage);

        enemy.hp -= rawDamage;
        enemy.hitCooldown = 10;

        const knockAngle = Math.atan2(sword.tipY - sword.prevTipY, sword.tipX - sword.prevTipX);
        const knockForce = (effectiveSpeed * 0.5) / enemy.mass;
        enemy.vx += Math.cos(knockAngle) * knockForce;
        enemy.vy += (Math.sin(knockAngle) * knockForce - 2) / enemy.mass;

        createSparks(enemy.x, enemy.y, Math.min(22, Math.floor(effectiveSpeed)), enemy.color);
        
        if (rawDamage >= 28) {
          screenShake = Math.min(8, Math.floor(rawDamage * 0.2));
          createFloatingText(enemy.x, enemy.y - 20, `CRIT ${rawDamage}!`, '#ffea00');
        } else {
          createFloatingText(enemy.x, enemy.y - 20, `${rawDamage}`, '#00ffcc');
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
  }

  // Update Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Update Damage Text
  for (let i = damageTexts.length - 1; i >= 0; i--) {
    const dt = damageTexts[i];
    dt.y += dt.vy; dt.life -= 0.03;
    if (dt.life <= 0) damageTexts.splice(i, 1);
  }

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

  // Projectiles Render
  projectiles.forEach(proj => {
    ctx.fillStyle = '#aa00ff';
    ctx.shadowBlur = 10; ctx.shadowColor = '#aa00ff';
    ctx.beginPath(); ctx.arc(proj.x, proj.y, 5, 0, Math.PI * 2); ctx.fill();
  });
  ctx.shadowBlur = 0;

  // Player Stickman Render
  const isInvincible = ragdoll.iFrames > 0;
  const isFlickerOff = isInvincible && Math.floor(frameCount / 4) % 2 === 0;

  let playerColor = '#ffffff';
  if (ragdoll.dashTimer > 0) {
    playerColor = '#ffea00';
  } else if (ragdoll.iFrames > 0) {
    playerColor = '#ff3333';
  }

  ctx.strokeStyle = playerColor;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (!isFlickerOff) {
    // Off-Hand Arm
    ctx.beginPath();
    ctx.moveTo(ragdoll.chest.x, ragdoll.chest.y);
    ctx.quadraticCurveTo(ragdoll.lElbow.x, ragdoll.lElbow.y, ragdoll.lHand.x, ragdoll.lHand.y);
    ctx.stroke();

    // Head & Torso
    ctx.beginPath(); ctx.arc(ragdoll.head.x, ragdoll.head.y, ragdoll.head.radius, 0, Math.PI * 2); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ragdoll.head.x, ragdoll.head.y + ragdoll.head.radius);
    ctx.lineTo(ragdoll.chest.x, ragdoll.chest.y); 
    ctx.lineTo(ragdoll.hip.x, ragdoll.hip.y);
    ctx.stroke();

    // Left Leg
    ctx.beginPath();
    ctx.moveTo(ragdoll.hip.x, ragdoll.hip.y);
    ctx.quadraticCurveTo(ragdoll.lKnee.x, ragdoll.lKnee.y, ragdoll.lFoot.x, ragdoll.lFoot.y);
    ctx.stroke();

    // Right Leg
    ctx.beginPath();
    ctx.moveTo(ragdoll.hip.x, ragdoll.hip.y);
    ctx.quadraticCurveTo(ragdoll.rKnee.x, ragdoll.rKnee.y, ragdoll.rFoot.x, ragdoll.rFoot.y);
    ctx.stroke();
    
    // Sword Arm
    ctx.beginPath();
    ctx.moveTo(ragdoll.chest.x, ragdoll.chest.y);
    ctx.quadraticCurveTo(ragdoll.elbow.x, ragdoll.elbow.y, ragdoll.hand.x, ragdoll.hand.y);
    ctx.stroke();
  }

  // Sword Rendering
  const hx = ragdoll.hand.x;
  const hy = ragdoll.hand.y;
  const tx = sword.tipX;
  const ty = sword.tipY;

  const swordAngle = Math.atan2(ty - hy, tx - hx);
  const sCos = Math.cos(swordAngle);
  const sSin = Math.sin(swordAngle);
  const perpX = -sSin;
  const perpY = sCos;

  const isHighVelocity = sword.speed > 4.5 || ragdoll.dashTimer > 0;
  const mainColor = isHighVelocity ? '#00ffcc' : '#e0e6ed';
  const edgeColor = isHighVelocity ? '#ffffff' : '#aaccff';

  if (isHighVelocity) { ctx.shadowBlur = 12; ctx.shadowColor = '#00ffcc'; }

  // Pommel & Grip
  ctx.strokeStyle = '#888888';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hx - sCos * 6, hy - sSin * 6);
  ctx.lineTo(hx, hy);
  ctx.stroke();

  ctx.fillStyle = mainColor;
  ctx.beginPath();
  ctx.arc(hx - sCos * 7, hy - sSin * 7, 3, 0, Math.PI * 2);
  ctx.fill();

  // Crossguard
  const guardWidth = 9;
  ctx.strokeStyle = mainColor;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(hx + perpX * guardWidth, hy + perpY * guardWidth);
  ctx.lineTo(hx - perpX * guardWidth, hy - perpY * guardWidth);
  ctx.stroke();

  // Blade Polygon
  const bladeBaseX = hx + sCos * 2;
  const bladeBaseY = hy + sSin * 2;
  const bladeWidth = 3.5;

  ctx.fillStyle = mainColor;
  ctx.beginPath();
  ctx.moveTo(bladeBaseX + perpX * bladeWidth, bladeBaseY + perpY * bladeWidth);
  ctx.lineTo(tx, ty);
  ctx.lineTo(bladeBaseX - perpX * bladeWidth, bladeBaseY - perpY * bladeWidth);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = edgeColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bladeBaseX, bladeBaseY);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  ctx.shadowBlur = 0;

  // Enemies
  enemies.forEach(enemy => {
    ctx.strokeStyle = enemy.color;
    ctx.shadowBlur = (enemy.type === 'tank' || enemy.type === 'phantom') ? 14 : 8;
    ctx.shadowColor = enemy.color;
    ctx.lineCap = 'round';

    const scale = enemy.type === 'tank' ? 2.2 : (enemy.type === 'bouncing' ? 1.45 : (enemy.type === 'bomber' ? 1.5 : 1.7));
    ctx.lineWidth = enemy.type === 'tank' ? 5.5 : 4.0;

    const headR = 6.5 * scale;
    const headY = enemy.y - 20 * scale;
    const chestY = enemy.y - 8 * scale;
    const hipY = enemy.y + 4 * scale;

    ctx.beginPath();
    ctx.arc(enemy.x, headY, headR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(enemy.x, headY + headR);
    ctx.lineTo(enemy.x, chestY);
    ctx.lineTo(enemy.x, hipY);

    const legSwing = Math.sin(enemy.walkCycle) * 10 * scale;
    const legLift = Math.abs(Math.cos(enemy.walkCycle)) * 4 * scale;

    ctx.lineTo(enemy.x + legSwing, enemy.y + 16 * scale - legLift);
    ctx.moveTo(enemy.x, hipY);
    ctx.lineTo(enemy.x - legSwing, enemy.y + 16 * scale - (4 * scale - legLift));

    const enemyArmAngle = Math.atan2(ragdoll.chest.y - chestY, ragdoll.chest.x - enemy.x);
    const armReach = 12 * scale;

    ctx.moveTo(enemy.x, chestY);
    ctx.lineTo(enemy.x + Math.cos(enemyArmAngle) * armReach, chestY + Math.sin(enemyArmAngle) * armReach);
    ctx.stroke();

    // Specific Enemy Overlays
    if (enemy.type === 'shield') {
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 4.5;
      const shieldX = enemy.x + (enemy.x < ragdoll.hip.x ? 18 : -18);
      ctx.beginPath();
      ctx.moveTo(shieldX, enemy.y - 32);
      ctx.lineTo(shieldX, enemy.y + 10);
      ctx.stroke();
    } else if (enemy.type === 'drone') {
      ctx.strokeStyle = '#aa00ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(enemy.x, headY, headR + 10, 0, Math.PI * 2);
      ctx.stroke();
    } else if (enemy.type === 'bomber') {
      ctx.fillStyle = enemy.fuse < 20 && Math.floor(frameCount / 4) % 2 === 0 ? '#ffffff' : '#ffaa00';
      ctx.beginPath();
      ctx.arc(enemy.x, chestY, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    if (enemy.hp < enemy.maxHp) {
      const barWidth = 32 * (scale * 0.7);
      const barHeight = 4;
      const barX = enemy.x - barWidth / 2;
      const barY = headY - headR - 12;
      const hpRatio = Math.max(0, enemy.hp / enemy.maxHp);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

      ctx.fillStyle = enemy.color;
      ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
    }
  });

  particles.forEach(p => { ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fillRect(p.x, p.y, 2.5, 2.5); }); ctx.globalAlpha = 1.0;
  damageTexts.forEach(dt => { ctx.fillStyle = dt.color; ctx.font = 'bold 12px monospace'; ctx.globalAlpha = dt.life; ctx.fillText(dt.text, dt.x, dt.y); }); ctx.globalAlpha = 1.0;

  // Canvas UI
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = '#00ffcc';
  ctx.fillText(`WAVE ${currentWave}`, canvas.width / 2, 24);

  ctx.font = '11px monospace';
  ctx.fillStyle = '#ffffff';
  const remainingCount = enemiesRemainingToSpawn + enemies.length;
  ctx.fillText(`ENEMIES LEFT: ${remainingCount}`, canvas.width / 2, 40);

  const dashBarWidth = 70;
  const dashBarHeight = 5;
  const dashBarX = canvas.width / 2 - dashBarWidth / 2;
  const dashBarY = 50;
  const dashProgress = Math.max(0, 1 - (ragdoll.dashCooldown / 50));

  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(dashBarX, dashBarY, dashBarWidth, dashBarHeight);

  ctx.fillStyle = dashProgress === 1 ? '#00ffcc' : '#ffaa00';
  ctx.fillRect(dashBarX, dashBarY, dashBarWidth * dashProgress, dashBarHeight);

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