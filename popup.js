const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// DOM Elements
const enemyIntroOverlay = document.getElementById('enemy-intro-overlay');
const introEnemyName = document.getElementById('intro-enemy-name');
const introEnemyDesc = document.getElementById('intro-enemy-desc');
const enemyIntroBtn = document.getElementById('enemy-intro-btn');
const previewCanvas = document.getElementById('enemy-preview-canvas');
const previewCtx = previewCanvas ? previewCanvas.getContext('2d') : null;
const upgradeOverlay = document.getElementById('upgrade-overlay');
const cardsWrapper = document.getElementById('cards-wrapper');

// Game State
let isRunning = false;
let score = 0;
let frameCount = 0;
let screenShake = 0;

// Wave System State
let currentWave = 1;
let waveState = 'IN_WAVE'; // 'IN_WAVE', 'INTRO_PAUSE', 'UPGRADE_PAUSE', 'COUNTDOWN'
let spawnCooldown = 0;
let enemiesRemainingToSpawn = 0;
let seenEnemies = new Set();

// Countdown System State
let countdownValue = 3;
let countdownFrames = 0;
let pendingWaveNum = 1;

// Boss System State
let currentBoss = null;
let isTestingBoss = false;

// Boss Special Hazard Arrays
let sawBlades = [];
let groundWarnings = [];
let groundWaves = [];
let minions = [];
let explosions = [];

// Player Persistent Stats
const playerStats = {
  maxHp: 100,
  damageMult: 1.0,
  dashCooldownMult: 1.0,
  lifesteal: 0,
  swordLength: 62,
  moveSpeedMult: 1.0,
  critChance: 0.10,
  critDamage: 1.50,
  damageReduce: 0,
  thorns: 0,

  reset() {
    this.maxHp = 100;
    this.damageMult = 1.0;
    this.dashCooldownMult = 1.0;
    this.lifesteal = 0;
    this.swordLength = 62;
    this.moveSpeedMult = 1.0;
    this.critChance = 0.10;
    this.critDamage = 1.50;
    this.damageReduce = 0;
    this.thorns = 0;
  }
};

// Upgrade Rarity Weights & Configs
const RARITIES = {
  COMMON: { name: 'Common', color: '#aaaaaa', weight: 60 },
  RARE: { name: 'Rare', color: '#00aaff', weight: 25 },
  EPIC: { name: 'Epic', color: '#aa00ff', weight: 11 },
  LEGENDARY: { name: 'Legendary', color: '#ffaa00', weight: 4 }
};

const CATEGORY_COLORS = {
  OFFENSE: '#ff4444',
  DEFENSE: '#00aaff',
  MOBILITY: '#00ff66',
  SURVIVAL: '#ff00aa'
};

// Upgrade Database
const UPGRADE_TYPES = [
  {
    id: 'lifesteal', category: 'SURVIVAL', title: 'Vampiric Blade',
    desc: (val) => `Restores +${val} HP whenever you slay an enemy.`,
    values: { COMMON: 2, RARE: 5, EPIC: 9, LEGENDARY: 16 },
    apply: (val) => { playerStats.lifesteal += val; }
  },
  {
    id: 'damage', category: 'OFFENSE', title: 'Plasma Edge',
    desc: (val) => `Increases all blade slash damage by +${val}%.`,
    values: { COMMON: 15, RARE: 32, EPIC: 55, LEGENDARY: 100 },
    apply: (val) => { playerStats.damageMult += val / 100; }
  },
  {
    id: 'max_hp', category: 'DEFENSE', title: 'Cyber Core',
    desc: (val) => `Increases Max HP by +${val} and restores +${val} HP.`,
    values: { COMMON: 25, RARE: 50, EPIC: 85, LEGENDARY: 150 },
    apply: (val) => {
      playerStats.maxHp += val;
      ragdoll.hp = Math.min(playerStats.maxHp, ragdoll.hp + val);
    }
  },
  {
    id: 'dash_cd', category: 'MOBILITY', title: 'Overclock Drive',
    desc: (val) => `Reduces dash cooldown time by ${val}%.`,
    values: { COMMON: 15, RARE: 28, EPIC: 42, LEGENDARY: 60 },
    apply: (val) => { playerStats.dashCooldownMult *= (1 - val / 100); }
  },
  {
    id: 'crit', category: 'OFFENSE', title: 'Precision Optics',
    desc: (val) => `Increases Crit Chance by +${val}% and Crit Dmg by +${val * 2}%.`,
    values: { COMMON: 10, RARE: 20, EPIC: 35, LEGENDARY: 50 },
    apply: (val) => {
      playerStats.critChance += val / 100;
      playerStats.critDamage += (val * 2) / 100;
    }
  },
  {
    id: 'sword_len', category: 'OFFENSE', title: 'Extended Filament',
    desc: (val) => `Extends blade reach distance by +${val}px.`,
    values: { COMMON: 10, RARE: 20, EPIC: 32, LEGENDARY: 50 },
    apply: (val) => { playerStats.swordLength += val; }
  },
  {
    id: 'move_speed', category: 'MOBILITY', title: 'Thruster Boots',
    desc: (val) => `Increases move velocity and jump control by +${val}%.`,
    values: { COMMON: 15, RARE: 30, EPIC: 45, LEGENDARY: 70 },
    apply: (val) => { playerStats.moveSpeedMult += val / 100; }
  },
  {
    id: 'armor', category: 'DEFENSE', title: 'Nanotech Weave',
    desc: (val) => `Reduces incoming damage taken by ${val}%.`,
    values: { COMMON: 10, RARE: 18, EPIC: 28, LEGENDARY: 45 },
    apply: (val) => { playerStats.damageReduce += val / 100; }
  },
  {
    id: 'thorns', category: 'DEFENSE', title: 'Reactive Plating',
    desc: (val) => `Reflects ${val} kinetic damage back to attackers on hit.`,
    values: { COMMON: 15, RARE: 30, EPIC: 55, LEGENDARY: 100 },
    apply: (val) => { playerStats.thorns += val; }
  },
  {
    id: 'heal', category: 'SURVIVAL', title: 'Nano Repair System',
    desc: (val) => `Instantly restores ${val}% of total Max HP.`,
    values: { COMMON: 30, RARE: 50, EPIC: 75, LEGENDARY: 100 },
    apply: (val) => {
      const healAmt = Math.floor(playerStats.maxHp * (val / 100));
      ragdoll.hp = Math.min(playerStats.maxHp, ragdoll.hp + healAmt);
    }
  }
];

// Enemy Profiles & Descriptions
const ENEMY_PROFILES = {
  regular: { name: 'SLASHER', desc: 'Relentless frontline grunt. Charges at high speed and attempts to overwhelm you with numbers.', color: '#ff0055' },
  bouncing: { name: 'HOPPER', desc: 'Kinetic mobility drone. Bounces unpredictably across the arena with random super jumps.', color: '#00ff66' },
  shield: { name: 'SHIELD GUARDIAN', desc: 'Heavy vanguard bearing a directional kinetic shield. Frontal slashes are blocked—dash behind it!', color: '#00aaff' },
  drone: { name: 'PLASMA DRONE', desc: 'Airborne ranged unit. Hovers above ground and fires high-velocity plasma bolts downward.', color: '#aa00ff' },
  tank: { name: 'BRUTE TANK', desc: 'Heavy armored juggernaut. Absorbs blade impact with massive weight and deals heavy knockback.', color: '#ff00aa' },
  bomber: { name: 'KAMIKAZE BOMBER', desc: 'Volatile explosive runner. Charges toward you and ignites a short-fuse bomb.', color: '#ffaa00' },
  phantom: { name: 'BLINK PHANTOM', desc: 'Phase-shifting assassin. Teleports unpredictably across space to ambush you from blind spots.', color: '#ff00ff' }
};

// Physics Constants
const GRAVITY = 0.50;
const GROUND_Y = 360; 
const STANDING_HIP_HEIGHT = 38;

// Inputs
const mouse = { x: 400, y: 200, prevX: 400, prevY: 200, vx: 0, vy: 0 };
const keys = {};

// Physics Node
class Node {
  constructor(x, y, radius = 6, mass = 1, collideGround = true) {
    this.x = x; this.y = y;
    this.oldX = x; this.oldY = y;
    this.radius = radius; this.mass = mass;
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

    this.oldX = this.x; this.oldY = this.y;
    this.x += vx; this.y += vy + GRAVITY;

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

// Character Physics Nodes
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
    
    this.hp = playerStats.maxHp;
    this.iFrames = 0;
    this.dashCooldown = 0;
    this.dashTimer = 0;
    this.walkCycle = 0;
    this.flopTimer = 0;
  }
};

// Constraints
const constraints = [
  { p1: ragdoll.head, p2: ragdoll.chest, len: 18, stiffness: 0.35 },
  { p1: ragdoll.chest, p2: ragdoll.hip, len: 18, stiffness: 0.35 },
  { p1: ragdoll.hip, p2: ragdoll.lKnee, len: 20, stiffness: 0.32 },
  { p1: ragdoll.lKnee, p2: ragdoll.lFoot, len: 20, stiffness: 0.32 },
  { p1: ragdoll.hip, p2: ragdoll.rKnee, len: 20, stiffness: 0.32 },
  { p1: ragdoll.rKnee, p2: ragdoll.rFoot, len: 20, stiffness: 0.32 },
  { p1: ragdoll.chest, p2: ragdoll.elbow, len: 19, stiffness: 0.28 },
  { p1: ragdoll.elbow, p2: ragdoll.hand, len: 19, stiffness: 0.28 },
  { p1: ragdoll.chest, p2: ragdoll.lElbow, len: 19, stiffness: 0.25 },
  { p1: ragdoll.lElbow, p2: ragdoll.lHand, len: 19, stiffness: 0.25 }
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

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  keys[key] = true;

  if (key === 'i' && isRunning && waveState !== 'COUNTDOWN' && waveState !== 'UPGRADE_PAUSE' && waveState !== 'INTRO_PAUSE') {
    triggerBossTest();
  }
});

window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

if (enemyIntroBtn) {
  enemyIntroBtn.addEventListener('click', () => {
    enemyIntroOverlay.classList.add('hidden');
    waveState = 'IN_WAVE';
  });
}

function triggerBossTest() {
  enemies = [];
  projectiles = [];
  sawBlades = [];
  groundWarnings = [];
  groundWaves = [];
  minions = [];
  explosions = [];
  currentBoss = null;
  isTestingBoss = true;

  pendingWaveNum = Math.ceil(currentWave / 10) * 10;
  if (pendingWaveNum === 0 || pendingWaveNum === currentWave) pendingWaveNum += 10;

  startCountdown(pendingWaveNum);
  createFloatingText(ragdoll.chest.x, ragdoll.chest.y - 40, 'BOSS TEST LOADED', '#ff0055');
}

function getRandomRarity() {
  const totalWeight = Object.values(RARITIES).reduce((acc, r) => acc + r.weight, 0);
  let rand = Math.random() * totalWeight;

  for (const [rarityKey, rarityData] of Object.entries(RARITIES)) {
    if (rand < rarityData.weight) return rarityKey;
    rand -= rarityData.weight;
  }
  return 'COMMON';
}

function startCountdown(waveNum) {
  pendingWaveNum = waveNum;
  waveState = 'COUNTDOWN';
  countdownValue = 3;
  countdownFrames = 0;
}

function showUpgradeSelection() {
  waveState = 'UPGRADE_PAUSE';
  if (!cardsWrapper) return;
  cardsWrapper.innerHTML = '';

  const shuffledTypes = [...UPGRADE_TYPES].sort(() => 0.5 - Math.random());
  const selectedTypes = shuffledTypes.slice(0, 3);

  selectedTypes.forEach(upgType => {
    const rarityKey = getRandomRarity();
    const rarityInfo = RARITIES[rarityKey];
    const val = upgType.values[rarityKey];
    const catColor = CATEGORY_COLORS[upgType.category] || '#00ffcc';

    const card = document.createElement('div');
    card.className = 'upgrade-card';
    card.style.borderColor = rarityInfo.color;
    card.style.boxShadow = `0 0 16px ${rarityInfo.color}44`;

    card.innerHTML = `
      <div>
        <div class="card-category" style="color: ${catColor}">${upgType.category}</div>
        <div class="card-rarity" style="color: ${rarityInfo.color}">${rarityInfo.name}</div>
        <div class="card-name">${upgType.title}</div>
        <div class="card-desc">${upgType.desc(val)}</div>
      </div>
      <button class="card-select-btn" style="color: ${rarityInfo.color}">CHOOSE</button>
    `;

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      upgType.apply(val);
      sword.length = playerStats.swordLength;
      createFloatingText(ragdoll.chest.x, ragdoll.chest.y - 30, `${upgType.title} UPGRADED!`, rarityInfo.color);
      upgradeOverlay.classList.add('hidden');
      updateHUD();
      startCountdown(currentWave + 1);
    });

    cardsWrapper.appendChild(card);
  });

  upgradeOverlay.classList.remove('hidden');
}

function renderEnemyPreview(type) {
  if (!previewCtx) return;
  const w = previewCanvas.width;
  const h = previewCanvas.height;

  previewCtx.clearRect(0, 0, w, h);
  previewCtx.fillStyle = '#080d1a';
  previewCtx.fillRect(0, 0, w, h);

  previewCtx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
  previewCtx.lineWidth = 1.5;
  previewCtx.beginPath();
  previewCtx.moveTo(0, 105); previewCtx.lineTo(w, 105);
  previewCtx.stroke();

  const profile = ENEMY_PROFILES[type];
  if (!profile) return;

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

  previewCtx.beginPath(); previewCtx.arc(centerX, headY, headR, 0, Math.PI * 2); previewCtx.stroke();
  previewCtx.beginPath(); previewCtx.moveTo(centerX, headY + headR); previewCtx.lineTo(centerX, chestY); previewCtx.lineTo(centerX, hipY);

  const legOffset = 8 * scale;
  previewCtx.lineTo(centerX + legOffset, groundY); previewCtx.moveTo(centerX, hipY); previewCtx.lineTo(centerX - legOffset, groundY);
  previewCtx.moveTo(centerX, chestY); previewCtx.lineTo(centerX + 10 * scale, chestY + 4 * scale);
  previewCtx.moveTo(centerX, chestY); previewCtx.lineTo(centerX - 10 * scale, chestY + 4 * scale);
  previewCtx.stroke();

  if (type === 'shield') {
    previewCtx.strokeStyle = '#00ffff'; previewCtx.lineWidth = 4;
    previewCtx.beginPath(); previewCtx.moveTo(centerX + 16, groundY - 32 * scale); previewCtx.lineTo(centerX + 16, groundY + 2 * scale); previewCtx.stroke();
  } else if (type === 'drone') {
    previewCtx.strokeStyle = '#aa00ff'; previewCtx.lineWidth = 2;
    previewCtx.beginPath(); previewCtx.arc(centerX, headY - 2, headR + 12, 0, Math.PI * 2); previewCtx.stroke();
  } else if (type === 'bomber') {
    previewCtx.fillStyle = '#ffaa00'; previewCtx.beginPath(); previewCtx.arc(centerX, chestY, 7, 0, Math.PI * 2); previewCtx.fill();
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
  if (!isRunning || ragdoll.dashCooldown > 0 || ragdoll.flopTimer > 0 || waveState === 'INTRO_PAUSE' || waveState === 'UPGRADE_PAUSE') return;

  const dx = mouse.x - ragdoll.chest.x;
  const dy = mouse.y - ragdoll.chest.y;
  const dist = Math.hypot(dx, dy) || 1;
  const dirX = dx / dist;
  const dirY = dy / dist;

  const DASH_POWER = 22.0 * playerStats.moveSpeedMult;

  ragdoll.head.addImpulse(dirX * DASH_POWER, dirY * DASH_POWER);
  ragdoll.chest.addImpulse(dirX * DASH_POWER, dirY * DASH_POWER);
  ragdoll.hip.addImpulse(dirX * DASH_POWER * 0.9, dirY * DASH_POWER * 0.9);
  ragdoll.lKnee.addImpulse(dirX * DASH_POWER * 0.8, dirY * DASH_POWER * 0.8);
  ragdoll.rKnee.addImpulse(dirX * DASH_POWER * 0.8, dirY * DASH_POWER * 0.8);
  ragdoll.lFoot.addImpulse(dirX * DASH_POWER * 0.7, dirY * DASH_POWER * 0.7);
  ragdoll.rFoot.addImpulse(dirX * DASH_POWER * 0.7, dirY * DASH_POWER * 0.7);

  ragdoll.dashCooldown = Math.floor(50 * playerStats.dashCooldownMult);
  ragdoll.dashTimer = 10;
  ragdoll.iFrames = 18;

  createSparks(ragdoll.chest.x, ragdoll.chest.y, 20, '#00ffcc');
  createFloatingText(ragdoll.chest.x, ragdoll.chest.y - 30, 'DASH!', '#00ffcc');
  screenShake = 7;
}

function spawnBoss(type) {
  const hpMultiplier = 1 + (currentWave - 10) * 0.12;

  if (type === 'butcher') {
    currentBoss = {
      type: 'butcher', name: 'THE BUTCHER',
      x: canvas.width - 100, y: GROUND_Y - 32, vx: 0, vy: 0, radius: 32, mass: 3.5,
      hp: Math.floor(520 * hpMultiplier), maxHp: Math.floor(520 * hpMultiplier),
      contactDamage: 22, attackTimer: 0, hitCooldown: 0, walkCycle: 0, alpha: 1.0, color: '#ff0055'
    };
  } else if (type === 'gardener') {
    currentBoss = {
      type: 'gardener', name: 'THE GARDENER',
      x: canvas.width - 100, y: GROUND_Y - 30, vx: 0, vy: 0, radius: 30, mass: 2.8,
      hp: Math.floor(480 * hpMultiplier), maxHp: Math.floor(480 * hpMultiplier),
      contactDamage: 18, attackTimer: 0, hitCooldown: 0, walkCycle: 0, alpha: 1.0, color: '#00ff66'
    };
  } else if (type === 'wrestler') {
    currentBoss = {
      type: 'wrestler', name: 'THE WRESTLER',
      x: canvas.width - 100, y: GROUND_Y - 36, vx: 0, vy: 0, radius: 36, mass: 4.5,
      hp: Math.floor(700 * hpMultiplier), maxHp: Math.floor(700 * hpMultiplier),
      contactDamage: 28, jumpTimer: 0, isAirborne: false, hitCooldown: 0, walkCycle: 0, alpha: 1.0, color: '#ffaa00'
    };
  } else if (type === 'captain') {
    currentBoss = {
      type: 'captain', name: 'THE CAPTAIN',
      x: canvas.width / 2, y: 160, vx: 0, vy: 0, radius: 28, mass: 2.5,
      hp: Math.floor(580 * hpMultiplier), maxHp: Math.floor(580 * hpMultiplier),
      contactDamage: 16, state: 'FLYING', summonTimer: 0, summonsCount: 0, refuelTimer: 0, hitCooldown: 0, walkCycle: 0, alpha: 1.0, color: '#00aaff'
    };
  } else if (type === 'ninja') {
    currentBoss = {
      type: 'ninja', name: 'THE NINJA',
      x: canvas.width - 100, y: GROUND_Y - 26, vx: 0, vy: 0, radius: 26, mass: 1.8,
      hp: Math.floor(420 * hpMultiplier), maxHp: Math.floor(420 * hpMultiplier),
      contactDamage: 18, cycleState: 'INVISIBLE', cycleTimer: 300, alpha: 0.15, hasThrownShuriken: false, hitCooldown: 0, walkCycle: 0, color: '#aa00ff'
    };
  }
}

function startGame() {
  score = 0; 
  frameCount = 0;
  enemies = []; particles = []; damageTexts = []; projectiles = [];
  sawBlades = []; groundWarnings = []; groundWaves = []; minions = []; explosions = [];
  currentBoss = null; isTestingBoss = false;
  seenEnemies.clear();
  
  playerStats.reset();
  sword.length = playerStats.swordLength;
  ragdoll.reset();

  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  if (enemyIntroOverlay) enemyIntroOverlay.classList.add('hidden');
  if (upgradeOverlay) upgradeOverlay.classList.add('hidden');
  
  startCountdown(1);
  updateHUD();

  isRunning = true;
  requestAnimationFrame(gameLoop);
}

function startWave(waveNum) {
  currentWave = waveNum;
  waveState = 'IN_WAVE';
  enemies = [];
  sawBlades = []; groundWarnings = []; groundWaves = []; minions = []; explosions = [];

  const isBossWave = (waveNum % 10 === 0) || isTestingBoss;

  if (isBossWave) {
    enemiesRemainingToSpawn = 0;
    const bossTypes = ['butcher', 'gardener', 'wrestler', 'captain', 'ninja'];
    const selectedBoss = bossTypes[Math.floor(Math.random() * bossTypes.length)];
    spawnBoss(selectedBoss);
    isTestingBoss = false;
  } else {
    currentBoss = null;
    enemiesRemainingToSpawn = 3 + Math.floor(waveNum * 1.5);
    spawnCooldown = 0;

    let newTypeToIntroduce = null;
    if (waveNum === 1 && !seenEnemies.has('regular')) newTypeToIntroduce = 'regular';
    else if (waveNum === 3 && !seenEnemies.has('bouncing')) newTypeToIntroduce = 'bouncing';
    else if (waveNum === 5 && !seenEnemies.has('shield')) newTypeToIntroduce = 'shield';
    else if (waveNum === 7 && !seenEnemies.has('drone')) newTypeToIntroduce = 'drone';
    else if (waveNum === 12 && !seenEnemies.has('tank')) newTypeToIntroduce = 'tank';
    else if (waveNum === 15 && !seenEnemies.has('bomber')) newTypeToIntroduce = 'bomber';
    else if (waveNum === 18 && !seenEnemies.has('phantom')) newTypeToIntroduce = 'phantom';

    if (newTypeToIntroduce) {
      seenEnemies.add(newTypeToIntroduce);
      showEnemyIntro(newTypeToIntroduce);
    }
  }
}

function updateHUD() {
  document.getElementById('score-val').textContent = score;
  const hpPercent = Math.max(0, (ragdoll.hp / playerStats.maxHp) * 100);
  document.getElementById('hp-bar').style.width = `${hpPercent}%`;
}

function spawnEnemy() {
  const spawnLeft = Math.random() < 0.5;
  const startX = spawnLeft ? -40 : canvas.width + 40;

  let pool = ['regular'];
  if (currentWave >= 3) pool.push('bouncing');
  if (currentWave >= 5) pool.push('shield');
  if (currentWave >= 7) pool.push('drone');
  if (currentWave >= 12) pool.push('tank');
  if (currentWave >= 15) pool.push('bomber');
  if (currentWave >= 18) pool.push('phantom');

  const selectedType = pool[Math.floor(Math.random() * pool.length)];
  const hpScale = 1 + (currentWave - 1) * 0.08;
  const speedScale = 1 + Math.min(0.5, (currentWave - 1) * 0.03);

  if (selectedType === 'tank') {
    enemies.push({
      type: 'tank', x: startX, y: GROUND_Y - 34, vx: 0, vy: 0, radius: 32, mass: 2.8,
      hp: Math.floor(110 * hpScale), maxHp: Math.floor(110 * hpScale),
      speed: (0.45 + Math.random() * 0.15) * speedScale,
      contactDamage: 16 + Math.floor(currentWave * 0.3), hitCooldown: 0, walkCycle: Math.random() * 10, color: '#ff00aa'
    });
  } else if (selectedType === 'shield') {
    enemies.push({
      type: 'shield', x: startX, y: GROUND_Y - 26, vx: 0, vy: 0, radius: 24, mass: 1.6,
      hp: Math.floor(55 * hpScale), maxHp: Math.floor(55 * hpScale),
      speed: (0.65 + Math.random() * 0.2) * speedScale,
      contactDamage: 12 + Math.floor(currentWave * 0.25), hitCooldown: 0, walkCycle: Math.random() * 10, color: '#00aaff'
    });
  } else if (selectedType === 'drone') {
    enemies.push({
      type: 'drone', x: startX, y: GROUND_Y - 210, vx: 0, vy: 0, radius: 20, mass: 0.8,
      hp: Math.floor(32 * hpScale), maxHp: Math.floor(32 * hpScale),
      speed: (0.8 + Math.random() * 0.3) * speedScale,
      contactDamage: 8, shootTimer: 0, hitCooldown: 0, walkCycle: Math.random() * 10, color: '#aa00ff'
    });
  } else if (selectedType === 'bomber') {
    enemies.push({
      type: 'bomber', x: startX, y: GROUND_Y - 22, vx: 0, vy: 0, radius: 22, mass: 1.0,
      hp: Math.floor(25 * hpScale), maxHp: Math.floor(25 * hpScale),
      speed: (1.3 + Math.random() * 0.3) * speedScale,
      contactDamage: 22, fuse: 45, hitCooldown: 0, walkCycle: Math.random() * 10, color: '#ffaa00'
    });
  } else if (selectedType === 'phantom') {
    enemies.push({
      type: 'phantom', x: startX, y: GROUND_Y - 24, vx: 0, vy: 0, radius: 22, mass: 1.0,
      hp: Math.floor(45 * hpScale), maxHp: Math.floor(45 * hpScale),
      speed: (0.9 + Math.random() * 0.3) * speedScale,
      contactDamage: 14, teleportTimer: 0, hitCooldown: 0, walkCycle: Math.random() * 10, color: '#ff00ff'
    });
  } else if (selectedType === 'bouncing') {
    enemies.push({
      type: 'bouncing', x: startX, y: GROUND_Y - 20, vx: 0, vy: 0, radius: 20, mass: 0.9,
      hp: Math.floor(28 * hpScale), maxHp: Math.floor(28 * hpScale),
      speed: (1.0 + Math.random() * 0.4) * speedScale,
      contactDamage: 8 + Math.floor(currentWave * 0.2), bouncePower: -7.5 - (Math.random() * 2.0),
      hitCooldown: 0, walkCycle: Math.random() * 10, color: '#00ff66'
    });
  } else {
    enemies.push({
      type: 'regular', x: startX, y: GROUND_Y - 24, vx: 0, vy: 0, radius: 23, mass: 1.1,
      hp: Math.floor(40 * hpScale), maxHp: Math.floor(40 * hpScale),
      speed: (0.75 + Math.random() * 0.4) * speedScale,
      contactDamage: 10 + Math.floor(currentWave * 0.25), hitCooldown: 0, walkCycle: Math.random() * 10, color: spawnLeft ? '#ff0055' : '#ff4400'
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

function applyDamageToPlayer(rawDmg) {
  const dmg = Math.max(1, Math.floor(rawDmg * (1 - playerStats.damageReduce)));
  ragdoll.hp -= dmg;
  createFloatingText(ragdoll.chest.x, ragdoll.chest.y - 15, `-${dmg} HP`, '#ff3333');
  updateHUD();

  if (ragdoll.hp <= 0) {
    isRunning = false;
    document.getElementById('final-score').textContent = `Reached Wave ${currentWave} | Kills: ${score}`;
    document.getElementById('gameover-screen').classList.remove('hidden');
  }
}

function renderScene() {
  ctx.save();
  if (screenShake > 0) {
    ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    screenShake *= 0.85;
    if (screenShake < 0.2) screenShake = 0;
  }

  ctx.fillStyle = '#020307'; ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 2;
  ctx.shadowBlur = 10; ctx.shadowColor = '#00ffcc';
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(canvas.width, GROUND_Y); ctx.stroke();
  ctx.shadowBlur = 0;

  sword.trail.forEach(t => {
    ctx.strokeStyle = `rgba(0, 255, 204, ${t.alpha * 0.4})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(t.hx, t.hy); ctx.lineTo(t.tx, t.ty); ctx.stroke();
  });

  // Render Gardener Ground Blade Warnings & Active Spikes
  groundWarnings.forEach(gw => {
    if (gw.warningTimer > 0) {
      ctx.fillStyle = 'rgba(255, 0, 85, 0.35)';
      ctx.fillRect(gw.x - 14, GROUND_Y - 50, 28, 50);
      ctx.strokeStyle = '#ff0055'; ctx.lineWidth = 1.5;
      ctx.strokeRect(gw.x - 14, GROUND_Y - 50, 28, 50);
    } else {
      ctx.fillStyle = '#ff0055'; ctx.shadowBlur = 12; ctx.shadowColor = '#ff0055';
      ctx.beginPath();
      ctx.moveTo(gw.x - 14, GROUND_Y);
      ctx.lineTo(gw.x, GROUND_Y - 55);
      ctx.lineTo(gw.x + 14, GROUND_Y);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
    }
  });

  // Render Wrestler Ground Shockwaves
  groundWaves.forEach(gw => {
    ctx.strokeStyle = '#ffaa00'; ctx.lineWidth = 4; ctx.shadowBlur = 12; ctx.shadowColor = '#ffaa00';
    ctx.beginPath();
    ctx.arc(gw.x, GROUND_Y - 8, 18, Math.PI, 0, false);
    ctx.stroke();
    ctx.shadowBlur = 0;
  });

  // Render Butcher Saw Blades
  sawBlades.forEach(sb => {
    ctx.save();
    ctx.translate(sb.x, sb.y);
    ctx.rotate(sb.rotation);
    ctx.strokeStyle = '#ff0055'; ctx.lineWidth = 3; ctx.shadowBlur = 10; ctx.shadowColor = '#ff0055';
    ctx.beginPath(); ctx.arc(0, 0, sb.radius, 0, Math.PI * 2); ctx.stroke();

    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * sb.radius, Math.sin(angle) * sb.radius);
      ctx.lineTo(Math.cos(angle) * (sb.radius + 10), Math.sin(angle) * (sb.radius + 10));
      ctx.stroke();
    }
    ctx.restore();
  });

  // Render Captain Minions
  minions.forEach(m => {
    ctx.fillStyle = '#00aaff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.shadowBlur = 10; ctx.shadowColor = '#00aaff';
    ctx.beginPath(); ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
  });

  // Render Explosions (Captain / Bomber)
  explosions.forEach(exp => {
    ctx.strokeStyle = `rgba(255, 85, 0, ${exp.life})`; ctx.lineWidth = 4;
    ctx.shadowBlur = 15; ctx.shadowColor = '#ff5500';
    ctx.beginPath(); ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
  });

  // Render Projectiles (Shurikens & Plasma Bolts)
  projectiles.forEach(proj => {
    if (proj.isShuriken) {
      ctx.save();
      ctx.translate(proj.x, proj.y);
      ctx.rotate(frameCount * 0.3);
      ctx.fillStyle = '#aa00ff'; ctx.shadowBlur = 10; ctx.shadowColor = '#aa00ff';
      ctx.beginPath();
      ctx.moveTo(0, -9); ctx.lineTo(3, -3); ctx.lineTo(9, 0); ctx.lineTo(3, 3);
      ctx.lineTo(0, 9); ctx.lineTo(-3, 3); ctx.lineTo(-9, 0); ctx.lineTo(-3, -3);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = '#aa00ff'; ctx.shadowBlur = 10; ctx.shadowColor = '#aa00ff';
      ctx.beginPath(); ctx.arc(proj.x, proj.y, 5, 0, Math.PI * 2); ctx.fill();
    }
  });
  ctx.shadowBlur = 0;

  // Draw Player
  const isInvincible = ragdoll.iFrames > 0;
  const isFlickerOff = isInvincible && Math.floor(frameCount / 4) % 2 === 0;

  let playerColor = '#ffffff';
  if (ragdoll.dashTimer > 0) playerColor = '#ffea00';
  else if (ragdoll.iFrames > 0) playerColor = '#ff3333';

  ctx.strokeStyle = playerColor; ctx.lineWidth = 3;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  if (!isFlickerOff) {
    ctx.beginPath(); ctx.moveTo(ragdoll.chest.x, ragdoll.chest.y);
    ctx.quadraticCurveTo(ragdoll.lElbow.x, ragdoll.lElbow.y, ragdoll.lHand.x, ragdoll.lHand.y); ctx.stroke();

    ctx.beginPath(); ctx.arc(ragdoll.head.x, ragdoll.head.y, ragdoll.head.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ragdoll.head.x, ragdoll.head.y + ragdoll.head.radius);
    ctx.lineTo(ragdoll.chest.x, ragdoll.chest.y); ctx.lineTo(ragdoll.hip.x, ragdoll.hip.y); ctx.stroke();

    ctx.beginPath(); ctx.moveTo(ragdoll.hip.x, ragdoll.hip.y);
    ctx.quadraticCurveTo(ragdoll.lKnee.x, ragdoll.lKnee.y, ragdoll.lFoot.x, ragdoll.lFoot.y); ctx.stroke();

    ctx.beginPath(); ctx.moveTo(ragdoll.hip.x, ragdoll.hip.y);
    ctx.quadraticCurveTo(ragdoll.rKnee.x, ragdoll.rKnee.y, ragdoll.rFoot.x, ragdoll.rFoot.y); ctx.stroke();

    ctx.beginPath(); ctx.moveTo(ragdoll.chest.x, ragdoll.chest.y);
    ctx.quadraticCurveTo(ragdoll.elbow.x, ragdoll.elbow.y, ragdoll.hand.x, ragdoll.hand.y); ctx.stroke();
  }

  // Draw Katana
  const hx = ragdoll.hand.x; const hy = ragdoll.hand.y;
  const tx = sword.tipX; const ty = sword.tipY;
  const swordAngle = Math.atan2(ty - hy, tx - hx);
  const sCos = Math.cos(swordAngle); const sSin = Math.sin(swordAngle);
  const perpX = -sSin; const perpY = sCos;

  const isHighVelocity = sword.speed > 4.5 || ragdoll.dashTimer > 0;
  const mainColor = isHighVelocity ? '#00ffcc' : '#e0e6ed';
  if (isHighVelocity) { ctx.shadowBlur = 12; ctx.shadowColor = '#00ffcc'; }

  ctx.strokeStyle = '#888888'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(hx - sCos * 6, hy - sSin * 6); ctx.lineTo(hx, hy); ctx.stroke();

  ctx.fillStyle = mainColor;
  ctx.beginPath(); ctx.arc(hx - sCos * 7, hy - sSin * 7, 3, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = mainColor; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(hx + perpX * 9, hy + perpY * 9); ctx.lineTo(hx - perpX * 9, hy - perpY * 9); ctx.stroke();

  ctx.fillStyle = mainColor;
  ctx.beginPath();
  ctx.moveTo(hx + sCos * 2 + perpX * 3.5, hy + sSin * 2 + perpY * 3.5);
  ctx.lineTo(tx, ty);
  ctx.lineTo(hx + sCos * 2 - perpX * 3.5, hy + sSin * 2 - perpY * 3.5);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;

  // Draw Enemies
  enemies.forEach(enemy => {
    ctx.strokeStyle = enemy.color;
    ctx.shadowBlur = (enemy.type === 'tank' || enemy.type === 'phantom') ? 14 : 8;
    ctx.shadowColor = enemy.color; ctx.lineCap = 'round';

    const scale = enemy.type === 'tank' ? 2.2 : (enemy.type === 'bouncing' ? 1.45 : (enemy.type === 'bomber' ? 1.5 : 1.7));
    ctx.lineWidth = enemy.type === 'tank' ? 5.5 : 4.0;

    const headR = 6.5 * scale;
    const headY = enemy.y - 20 * scale;
    const chestY = enemy.y - 8 * scale;
    const hipY = enemy.y + 4 * scale;

    ctx.beginPath(); ctx.arc(enemy.x, headY, headR, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(enemy.x, headY + headR); ctx.lineTo(enemy.x, chestY); ctx.lineTo(enemy.x, hipY);

    const legSwing = Math.sin(enemy.walkCycle) * 10 * scale;
    const legLift = Math.abs(Math.cos(enemy.walkCycle)) * 4 * scale;

    ctx.lineTo(enemy.x + legSwing, enemy.y + 16 * scale - legLift);
    ctx.moveTo(enemy.x, hipY);
    ctx.lineTo(enemy.x - legSwing, enemy.y + 16 * scale - (4 * scale - legLift));

    const enemyArmAngle = Math.atan2(ragdoll.chest.y - chestY, ragdoll.chest.x - enemy.x);
    ctx.moveTo(enemy.x, chestY);
    ctx.lineTo(enemy.x + Math.cos(enemyArmAngle) * (12 * scale), chestY + Math.sin(enemyArmAngle) * (12 * scale));
    ctx.stroke();

    if (enemy.type === 'shield') {
      ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 4.5;
      const shieldX = enemy.x + (enemy.x < ragdoll.hip.x ? 18 : -18);
      ctx.beginPath(); ctx.moveTo(shieldX, enemy.y - 32); ctx.lineTo(shieldX, enemy.y + 10); ctx.stroke();
    } else if (enemy.type === 'drone') {
      ctx.strokeStyle = '#aa00ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(enemy.x, headY, headR + 10, 0, Math.PI * 2); ctx.stroke();
    } else if (enemy.type === 'bomber') {
      ctx.fillStyle = enemy.fuse < 20 && Math.floor(frameCount / 4) % 2 === 0 ? '#ffffff' : '#ffaa00';
      ctx.beginPath(); ctx.arc(enemy.x, chestY, 8, 0, Math.PI * 2); ctx.fill();
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

  // Draw Active Boss
  if (currentBoss) {
    ctx.save();
    if (currentBoss.type === 'ninja') {
      ctx.globalAlpha = currentBoss.alpha;
    }

    ctx.strokeStyle = currentBoss.color; ctx.shadowBlur = 16; ctx.shadowColor = currentBoss.color;
    ctx.lineWidth = 6.0; ctx.lineCap = 'round';

    const bScale = 2.4;
    const bHeadR = 7 * bScale;
    const bHeadY = currentBoss.y - 20 * bScale;
    const bChestY = currentBoss.y - 8 * bScale;
    const bHipY = currentBoss.y + 4 * bScale;

    ctx.beginPath(); ctx.arc(currentBoss.x, bHeadY, bHeadR, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(currentBoss.x, bHeadY + bHeadR); ctx.lineTo(currentBoss.x, bChestY); ctx.lineTo(currentBoss.x, bHipY);

    // Draw Boss Legs
    const walkCycle = currentBoss.walkCycle || 0;
    const legSwing = Math.sin(walkCycle) * 8 * bScale;
    const legLift = Math.abs(Math.cos(walkCycle)) * 3 * bScale;

    ctx.lineTo(currentBoss.x + legSwing, currentBoss.y + 16 * bScale - legLift);
    ctx.moveTo(currentBoss.x, bHipY);
    ctx.lineTo(currentBoss.x - legSwing, currentBoss.y + 16 * bScale - (3 * bScale - legLift));

    // Draw Boss Arms
    const bArmAngle = Math.atan2(ragdoll.chest.y - bChestY, ragdoll.chest.x - currentBoss.x);
    ctx.moveTo(currentBoss.x, bChestY);
    ctx.lineTo(currentBoss.x + Math.cos(bArmAngle) * (16 * bScale), bChestY + Math.sin(bArmAngle) * (16 * bScale));
    ctx.stroke();

    if (currentBoss.type === 'captain') {
      ctx.strokeStyle = '#00aaff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(currentBoss.x - 30, bChestY); ctx.lineTo(currentBoss.x + 30, bChestY); ctx.stroke();
      if (currentBoss.state === 'REFUELING') {
        ctx.textAlign = 'center'; ctx.font = 'bold 12px monospace'; ctx.fillStyle = '#ffea00';
        ctx.fillText('REFUELING...', currentBoss.x, bHeadY - 20);
      }
    }

    ctx.restore();
  }

  particles.forEach(p => { ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.fillRect(p.x, p.y, 2.5, 2.5); }); ctx.globalAlpha = 1.0;
  damageTexts.forEach(dt => { ctx.fillStyle = dt.color; ctx.font = 'bold 12px monospace'; ctx.globalAlpha = dt.life; ctx.fillText(dt.text, dt.x, dt.y); }); ctx.globalAlpha = 1.0;

  // HUD Elements
  ctx.textAlign = 'center'; ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#00ffcc';
  ctx.fillText(`WAVE ${currentWave}`, canvas.width / 2, 20);

  ctx.font = '11px monospace'; ctx.fillStyle = '#ffffff';
  ctx.fillText(`ENEMIES LEFT: ${enemiesRemainingToSpawn + enemies.length + (currentBoss ? 1 : 0)}`, canvas.width / 2, 34);

  const dashBarWidth = 70; const dashBarHeight = 5;
  const dashBarX = canvas.width / 2 - dashBarWidth / 2; const dashBarY = 42;
  const dashProgress = Math.max(0, 1 - (ragdoll.dashCooldown / Math.floor(50 * playerStats.dashCooldownMult)));

  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(dashBarX, dashBarY, dashBarWidth, dashBarHeight);
  ctx.fillStyle = dashProgress === 1 ? '#00ffcc' : '#ffaa00';
  ctx.fillRect(dashBarX, dashBarY, dashBarWidth * dashProgress, dashBarHeight);

  // Big Boss Health Bar (Top Left to Top Right)
  if (currentBoss) {
    const barMargin = 20;
    const barY = 56;
    const barWidth = canvas.width - (barMargin * 2);
    const barHeight = 14;
    const hpRatio = Math.max(0, currentBoss.hp / currentBoss.maxHp);

    ctx.textAlign = 'center'; ctx.font = 'bold 13px monospace'; ctx.fillStyle = '#ff0055';
    ctx.shadowBlur = 8; ctx.shadowColor = '#ff0055';
    ctx.fillText(currentBoss.name, canvas.width / 2, barY - 4);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(10, 12, 24, 0.85)';
    ctx.fillRect(barMargin - 2, barY - 2, barWidth + 4, barHeight + 4);
    ctx.strokeStyle = '#ff0055'; ctx.lineWidth = 1.5;
    ctx.strokeRect(barMargin - 2, barY - 2, barWidth + 4, barHeight + 4);

    const grad = ctx.createLinearGradient(barMargin, 0, barMargin + barWidth, 0);
    grad.addColorStop(0, '#ff0055');
    grad.addColorStop(1, '#ff5500');
    ctx.fillStyle = grad;
    ctx.fillRect(barMargin, barY, barWidth * hpRatio, barHeight);
  }

  // Render Countdown Overlay
  if (waveState === 'COUNTDOWN') {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const isBossNext = (pendingWaveNum % 10 === 0) || isTestingBoss;

    if (isBossNext) {
      ctx.fillStyle = '#ff0055'; ctx.shadowBlur = 20; ctx.shadowColor = '#ff0055';
      ctx.font = 'bold 34px monospace';
      ctx.fillText('WARNING: BOSS INCOMING!', canvas.width / 2, canvas.height / 2 - 35);
      ctx.font = 'bold 84px monospace';
      ctx.fillText(countdownValue, canvas.width / 2, canvas.height / 2 + 35);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#00ffcc'; ctx.shadowBlur = 15; ctx.shadowColor = '#00ffcc';
      ctx.font = 'bold 28px monospace';
      ctx.fillText('NEXT WAVE IN', canvas.width / 2, canvas.height / 2 - 35);
      ctx.font = 'bold 80px monospace';
      ctx.fillText(countdownValue, canvas.width / 2, canvas.height / 2 + 30);
      ctx.shadowBlur = 0;
    }
  }

  ctx.restore();
}

function gameLoop() {
  if (!isRunning) return;

  if (waveState === 'INTRO_PAUSE' || waveState === 'UPGRADE_PAUSE') {
    renderScene();
    requestAnimationFrame(gameLoop);
    return;
  }

  frameCount++;

  // Handle Countdown Timer
  if (waveState === 'COUNTDOWN') {
    countdownFrames++;
    if (countdownFrames >= 60) {
      countdownFrames = 0;
      countdownValue--;
      if (countdownValue <= 0) {
        startWave(pendingWaveNum);
      }
    }
  }

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
    } else if (enemies.length === 0 && !currentBoss) {
      showUpgradeSelection();
      renderScene();
      requestAnimationFrame(gameLoop);
      return;
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
      ragdoll.lKnee.applyForce(bodyVx * 0.03, 0.08);
      ragdoll.rKnee.applyForce(bodyVx * 0.03, 0.08);
    }

    if (isMovingLeft || isMovingRight) {
      const moveDir = isMovingLeft ? -1 : 1;
      const moveForce = moveDir * (isGrounded ? 0.65 : 0.50) * playerStats.moveSpeedMult; 

      ragdoll.hip.applyForce(moveForce, 0);
      ragdoll.chest.applyForce(moveForce * 0.85, 0);

      if (!isGrounded) {
        ragdoll.head.applyForce(moveForce * 0.55, 0);
        ragdoll.lFoot.applyForce(moveForce * 0.35, 0);
        ragdoll.rFoot.applyForce(moveForce * 0.35, 0);
      }

      if (isGrounded) {
        ragdoll.walkCycle += 0.22 * playerStats.moveSpeedMult;
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
      const jumpHoriz = ((isMovingLeft ? -4.8 : 0) + (isMovingRight ? 4.8 : 0)) * playerStats.moveSpeedMult;

      ragdoll.head.addImpulse(jumpHoriz, -19.5);
      ragdoll.chest.addImpulse(jumpHoriz, -18.0);
      ragdoll.hip.addImpulse(jumpHoriz, -16.0);
      ragdoll.lKnee.addImpulse(jumpHoriz * 0.8, -12.0);
      ragdoll.rKnee.addImpulse(jumpHoriz * 0.8, -12.0);
      ragdoll.lFoot.addImpulse(jumpHoriz * 0.6, -9.0);
      ragdoll.rFoot.addImpulse(jumpHoriz * 0.6, -9.0);
      ragdoll.jumpCooldown = 18;
    }
  }

  if (ragdoll.jumpCooldown > 0) ragdoll.jumpCooldown--;

  ragdoll.head.update(); ragdoll.chest.update(); ragdoll.hip.update();
  ragdoll.lKnee.update(); ragdoll.rKnee.update(); ragdoll.lFoot.update(); ragdoll.rFoot.update();
  ragdoll.elbow.update(); ragdoll.hand.update(); ragdoll.lElbow.update(); ragdoll.lHand.update();

  const enforceLegJoints = (knee, foot, isLeft) => {
    if (knee.y < ragdoll.hip.y + 4) { knee.y = ragdoll.hip.y + 4; knee.oldY = knee.y; }
    if (foot.y < knee.y + 2) { foot.y = knee.y + 2; foot.oldY = foot.y; }
    const midX = (ragdoll.hip.x + foot.x) / 2;
    const midY = (ragdoll.hip.y + foot.y) / 2;
    const kneeOffset = isLeft ? -3 : 3;
    knee.x += (midX + kneeOffset - knee.x) * 0.25;
    knee.y += (midY - knee.y) * 0.25;

    const dx = foot.x - ragdoll.hip.x;
    const dy = foot.y - ragdoll.hip.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 22 && dist > 0) {
      const factor = (22 - dist) / dist;
      foot.x += dx * factor * 0.5;
      foot.y += dy * factor * 0.5;
    }
  };

  enforceLegJoints(ragdoll.lKnee, ragdoll.lFoot, true);
  enforceLegJoints(ragdoll.rKnee, ragdoll.rFoot, false);

  const armDx = mouse.x - ragdoll.chest.x;
  const armDy = mouse.y - ragdoll.chest.y;
  const distToMouse = Math.hypot(armDx, armDy);
  const armAngle = Math.atan2(armDy, armDx);
  const reach = Math.min(distToMouse, 36);

  const targetHandX = ragdoll.chest.x + Math.cos(armAngle) * reach;
  const targetHandY = ragdoll.chest.y + Math.sin(armAngle) * reach;
  ragdoll.hand.x += (targetHandX - ragdoll.hand.x) * 0.85;
  ragdoll.hand.y += (targetHandY - ragdoll.hand.y) * 0.85;

  const targetElbowX = (ragdoll.chest.x + ragdoll.hand.x) / 2;
  const targetElbowY = (ragdoll.chest.y + ragdoll.hand.y) / 2 + (reach < 22 ? 8 : 0);
  ragdoll.elbow.x += (targetElbowX - ragdoll.elbow.x) * 0.7;
  ragdoll.elbow.y += (targetElbowY - ragdoll.elbow.y) * 0.7;

  const walkSwing = Math.sin(ragdoll.walkCycle) * 12;
  const targetOffHandX = (ragdoll.chest.x - 6) - ((isMovingLeft || isMovingRight) ? walkSwing : idleSway * 0.4);
  const targetOffHandY = (ragdoll.chest.y + 26) + (isGrounded ? idleBreath * 0.5 : 2);

  ragdoll.lHand.x += (targetOffHandX - ragdoll.lHand.x) * 0.25;
  ragdoll.lHand.y += (targetOffHandY - ragdoll.lHand.y) * 0.25;
  ragdoll.lElbow.x += (((ragdoll.chest.x + ragdoll.lHand.x) / 2 - 2) - ragdoll.lElbow.x) * 0.3;
  ragdoll.lElbow.y += (((ragdoll.chest.y + ragdoll.lHand.y) / 2) - ragdoll.lElbow.y) * 0.3;

  for (let i = 0; i < 2; i++) constraints.forEach(solveConstraint);

  [ragdoll.head, ragdoll.chest, ragdoll.hip, ragdoll.lKnee, ragdoll.rKnee, ragdoll.lFoot, ragdoll.rFoot].forEach(node => {
    node.x = Math.max(12, Math.min(canvas.width - 12, node.x));
  });

  sword.prevTipX = sword.tipX;
  sword.prevTipY = sword.tipY;

  const forearmAngle = Math.atan2(ragdoll.hand.y - ragdoll.elbow.y, ragdoll.hand.x - ragdoll.elbow.x);
  sword.tipX = ragdoll.hand.x + Math.cos(forearmAngle) * sword.length;
  sword.tipY = ragdoll.hand.y + Math.sin(forearmAngle) * sword.length;

  sword.speed = Math.hypot(sword.tipX - sword.prevTipX, sword.tipY - sword.prevTipY);
  sword.trail.push({ hx: ragdoll.hand.x, hy: ragdoll.hand.y, tx: sword.tipX, ty: sword.tipY, alpha: 1 });
  if (sword.trail.length > 6) sword.trail.shift();
  sword.trail.forEach(t => t.alpha -= 0.15);

  // Update Boss Mechanics
  if (currentBoss && waveState === 'IN_WAVE') {
    if (currentBoss.hitCooldown > 0) currentBoss.hitCooldown--;
    const bDir = Math.sign(ragdoll.hip.x - currentBoss.x) || 1;

    if (currentBoss.type === 'butcher') {
      currentBoss.x += bDir * 0.7;
      currentBoss.walkCycle += 0.10;
      currentBoss.attackTimer++;

      if (currentBoss.attackTimer >= 250) {
        currentBoss.attackTimer = 0;
        sawBlades.push({
          x: currentBoss.x, y: GROUND_Y - 20,
          vx: bDir * 5.2, radius: 18, rotation: 0
        });
        createFloatingText(currentBoss.x, currentBoss.y - 45, 'SAW SLAM!', '#ff0055');
      }
    } else if (currentBoss.type === 'gardener') {
      currentBoss.x += bDir * 0.8;
      currentBoss.walkCycle += 0.12;
      currentBoss.attackTimer++;

      if (currentBoss.attackTimer >= 260) {
        currentBoss.attackTimer = 0;
        const px = ragdoll.hip.x;
        groundWarnings.push({ x: px - 35, warningTimer: 60, activeTimer: 25 });
        groundWarnings.push({ x: px, warningTimer: 60, activeTimer: 25 });
        groundWarnings.push({ x: px + 35, warningTimer: 60, activeTimer: 25 });
        createFloatingText(currentBoss.x, currentBoss.y - 45, 'GROUND BLADES!', '#00ff66');
      }
    } else if (currentBoss.type === 'wrestler') {
      currentBoss.jumpTimer++;

      if (!currentBoss.isAirborne && currentBoss.jumpTimer >= 480) { // Every 8 sec
        currentBoss.jumpTimer = 0;
        currentBoss.isAirborne = true;
        currentBoss.vy = -18;
        createFloatingText(currentBoss.x, currentBoss.y - 45, 'BODY SLAM!', '#ffaa00');
      }

      if (currentBoss.isAirborne) {
        currentBoss.vy += GRAVITY;
        currentBoss.y += currentBoss.vy;

        if (currentBoss.y >= GROUND_Y - currentBoss.radius) {
          currentBoss.y = GROUND_Y - currentBoss.radius;
          currentBoss.vy = 0;
          currentBoss.isAirborne = false;
          screenShake = 16;

          groundWaves.push({ x: currentBoss.x, vx: -7 });
          groundWaves.push({ x: currentBoss.x, vx: 7 });
        }
      } else {
        currentBoss.x += bDir * 0.9;
        currentBoss.walkCycle += 0.14;
      }
    } else if (currentBoss.type === 'captain') {
      currentBoss.walkCycle += 0.08;
      if (currentBoss.state === 'FLYING') {
        currentBoss.y = 160;
        currentBoss.x = canvas.width / 2 + Math.sin(frameCount * 0.03) * 280;
        currentBoss.summonTimer++;

        if (currentBoss.summonTimer >= 300) { // Every 5 sec
          currentBoss.summonTimer = 0;
          currentBoss.summonsCount++;

          minions.push({ x: currentBoss.x, y: currentBoss.y + 20, radius: 10, vy: 4.5 });
          createFloatingText(currentBoss.x, currentBoss.y - 30, 'MINION DROPPED!', '#00aaff');

          if (currentBoss.summonsCount >= 5) {
            currentBoss.state = 'REFUELING';
            currentBoss.summonsCount = 0;
            currentBoss.refuelTimer = 600; // 10 seconds
          }
        }
      } else if (currentBoss.state === 'REFUELING') {
        currentBoss.y = GROUND_Y - currentBoss.radius;
        currentBoss.refuelTimer--;

        if (currentBoss.refuelTimer <= 0) {
          currentBoss.state = 'FLYING';
          currentBoss.summonTimer = 0;
        }
      }
    } else if (currentBoss.type === 'ninja') {
      currentBoss.cycleTimer--;

      if (currentBoss.cycleState === 'INVISIBLE') {
        currentBoss.alpha = 0.15;
        currentBoss.x += bDir * 1.8;
        currentBoss.walkCycle += 0.20;

        if (currentBoss.cycleTimer <= 0) {
          currentBoss.cycleState = 'VISIBLE';
          currentBoss.cycleTimer = 180; // 3 seconds
          currentBoss.alpha = 1.0;
          currentBoss.hasThrownShuriken = false;
          createSparks(currentBoss.x, currentBoss.y, 25, '#aa00ff');
        }
      } else if (currentBoss.cycleState === 'VISIBLE') {
        currentBoss.alpha = 1.0;

        if (currentBoss.cycleTimer <= 120 && !currentBoss.hasThrownShuriken) { // After 1 sec visible
          currentBoss.hasThrownShuriken = true;
          const sAngle = Math.atan2(ragdoll.chest.y - currentBoss.y, ragdoll.chest.x - currentBoss.x);
          projectiles.push({
            x: currentBoss.x, y: currentBoss.y,
            vx: Math.cos(sAngle) * 9, vy: Math.sin(sAngle) * 9,
            isShuriken: true
          });
          createFloatingText(currentBoss.x, currentBoss.y - 30, 'SHURIKEN!', '#aa00ff');
        }

        if (currentBoss.cycleTimer <= 0) {
          createSparks(currentBoss.x, currentBoss.y, 30, '#aaaaaa');
          currentBoss.cycleState = 'INVISIBLE';
          currentBoss.cycleTimer = 300; // 5 seconds
        }
      }
    }

    // Boss Collision Check (No damage taken on direct body contact, only attack hazards)
    const distBossChest = Math.hypot(ragdoll.chest.x - currentBoss.x, ragdoll.chest.y - currentBoss.y);
    if (distBossChest < ragdoll.chest.radius + currentBoss.radius + 4) {
      const pushDir = Math.sign(ragdoll.hip.x - currentBoss.x) || 1;
      ragdoll.hip.addImpulse(pushDir * 2, 0);

      if (playerStats.thorns > 0 && ragdoll.iFrames <= 0) {
        currentBoss.hp -= playerStats.thorns;
        createFloatingText(currentBoss.x, currentBoss.y - 35, `THORNS ${playerStats.thorns}`, '#00aaff');
      }
    }

    // Hit Detection: Player Sword vs Boss
    const bossHit = lineCircleIntersect(ragdoll.hand.x, ragdoll.hand.y, sword.tipX, sword.tipY, currentBoss.x, currentBoss.y, currentBoss.radius);
    const effectiveSpeed = ragdoll.dashTimer > 0 ? 12.0 : sword.speed;
    const isBossHitValid = (bossHit.hit || (ragdoll.dashTimer > 0 && distBossChest < ragdoll.chest.radius + currentBoss.radius + 8)) &&
                           currentBoss.hitCooldown <= 0 &&
                           (currentBoss.alpha === undefined || currentBoss.alpha > 0.3);

    if (isBossHitValid) {
      if (effectiveSpeed > 4.5) {
        const excessSpeed = effectiveSpeed - 4.5;
        let baseDmg = Math.floor(14 + Math.sqrt(excessSpeed) * 5.5);
        if (ragdoll.dashTimer > 0) baseDmg += 12;

        const isCrit = Math.random() < playerStats.critChance;
        let finalDamage = Math.floor(baseDmg * playerStats.damageMult * (isCrit ? playerStats.critDamage : 1.0));

        currentBoss.hp -= finalDamage;
        currentBoss.hitCooldown = 12;

        const knockAngle = Math.atan2(sword.tipY - sword.prevTipY, sword.tipX - sword.prevTipX);
        const knockForce = (effectiveSpeed * 0.3) / currentBoss.mass;
        currentBoss.x += Math.cos(knockAngle) * knockForce;

        createSparks(currentBoss.x, currentBoss.y, 25, currentBoss.color);

        if (isCrit) {
          screenShake = 10;
          createFloatingText(currentBoss.x, currentBoss.y - 25, `CRIT ${finalDamage}!`, '#ffea00');
        } else {
          createFloatingText(currentBoss.x, currentBoss.y - 25, `${finalDamage}`, '#00ffcc');
        }

        if (currentBoss.hp <= 0) {
          createSparks(currentBoss.x, currentBoss.y, 70, currentBoss.color);
          createFloatingText(ragdoll.chest.x, ragdoll.chest.y - 40, 'BOSS DEFEATED!', '#00ffcc');
          score += 10;

          if (playerStats.lifesteal > 0 && ragdoll.hp < playerStats.maxHp) {
            ragdoll.hp = Math.min(playerStats.maxHp, ragdoll.hp + playerStats.lifesteal * 3);
          }

          currentBoss = null;
          updateHUD();
        }
      }
    }
  }

  // Update Saw Blades (The Butcher)
  for (let sIdx = sawBlades.length - 1; sIdx >= 0; sIdx--) {
    const sb = sawBlades[sIdx];
    sb.x += sb.vx;
    sb.rotation += 0.2;

    if (Math.hypot(ragdoll.hip.x - sb.x, ragdoll.hip.y - sb.y) < sb.radius + 12 && ragdoll.iFrames <= 0) {
      ragdoll.iFrames = 30; ragdoll.flopTimer = 22;
      applyDamageToPlayer(20);
      createSparks(ragdoll.chest.x, ragdoll.chest.y, 15, '#ff0055');
    }

    if (sb.x < -40 || sb.x > canvas.width + 40) sawBlades.splice(sIdx, 1);
  }

  // Update Ground Blade Warnings (The Gardener)
  for (let gIdx = groundWarnings.length - 1; gIdx >= 0; gIdx--) {
    const gw = groundWarnings[gIdx];
    if (gw.warningTimer > 0) {
      gw.warningTimer--;
    } else {
      gw.activeTimer--;
      if (Math.abs(ragdoll.lFoot.x - gw.x) < 18 && ragdoll.lFoot.y >= GROUND_Y - 10 && ragdoll.iFrames <= 0) {
        ragdoll.iFrames = 30; ragdoll.flopTimer = 24;
        applyDamageToPlayer(24);
        createSparks(ragdoll.lFoot.x, ragdoll.lFoot.y, 18, '#ff0055');
      }

      if (gw.activeTimer <= 0) groundWarnings.splice(gIdx, 1);
    }
  }

  // Update Ground Shockwaves (The Wrestler)
  for (let wIdx = groundWaves.length - 1; wIdx >= 0; wIdx--) {
    const gw = groundWaves[wIdx];
    gw.x += gw.vx;

    if (Math.abs(ragdoll.hip.x - gw.x) < 22 && ragdoll.lFoot.y >= GROUND_Y - 14 && ragdoll.iFrames <= 0) {
      ragdoll.iFrames = 30; ragdoll.flopTimer = 25;
      applyDamageToPlayer(22);
      ragdoll.hip.addImpulse(Math.sign(gw.vx) * 8, -6);
      createSparks(ragdoll.chest.x, ragdoll.chest.y, 15, '#ffaa00');
    }

    if (gw.x < -30 || gw.x > canvas.width + 30) groundWaves.splice(wIdx, 1);
  }

  // Update Falling Minions (The Captain)
  for (let mIdx = minions.length - 1; mIdx >= 0; mIdx--) {
    const m = minions[mIdx];
    m.y += m.vy;

    const hitPlayer = Math.hypot(ragdoll.chest.x - m.x, ragdoll.chest.y - m.y) < ragdoll.chest.radius + m.radius;
    if (m.y >= GROUND_Y - m.radius || hitPlayer) {
      explosions.push({ x: m.x, y: m.y, radius: canvas.width / 5, life: 1.0 }); // 1/5 screen radius = 160px
      screenShake = 12;

      if (Math.hypot(ragdoll.chest.x - m.x, ragdoll.chest.y - m.y) < (canvas.width / 5) && ragdoll.iFrames <= 0) {
        ragdoll.iFrames = 35; ragdoll.flopTimer = 28;
        applyDamageToPlayer(22);
        createSparks(ragdoll.chest.x, ragdoll.chest.y, 25, '#ff5500');
      }

      minions.splice(mIdx, 1);
    }
  }

  // Update Explosions
  for (let eIdx = explosions.length - 1; eIdx >= 0; eIdx--) {
    const exp = explosions[eIdx];
    exp.life -= 0.04;
    if (exp.life <= 0) explosions.splice(eIdx, 1);
  }

  // Update Projectiles
  for (let pIdx = projectiles.length - 1; pIdx >= 0; pIdx--) {
    const proj = projectiles[pIdx];
    proj.x += proj.vx; proj.y += proj.vy;

    if (Math.hypot(ragdoll.chest.x - proj.x, ragdoll.chest.y - proj.y) < ragdoll.chest.radius + 8 && ragdoll.iFrames <= 0) {
      ragdoll.iFrames = 25; ragdoll.flopTimer = 22;
      const pushDir = Math.sign(ragdoll.chest.x - proj.x) || 1;
      ragdoll.chest.addImpulse(pushDir * 7, -3);

      createSparks(proj.x, proj.y, 10, '#aa00ff');
      applyDamageToPlayer(14);
      projectiles.splice(pIdx, 1);
      continue;
    }

    if (proj.x < -20 || proj.x > canvas.width + 20 || proj.y > GROUND_Y) projectiles.splice(pIdx, 1);
  }

  // Update Standard Enemies
  for (let eIndex = enemies.length - 1; eIndex >= 0; eIndex--) {
    const enemy = enemies[eIndex];
    if (enemy.hitCooldown > 0) enemy.hitCooldown--;

    const eDir = Math.sign(ragdoll.hip.x - enemy.x);

    if (enemy.type === 'drone') {
      enemy.vx += (ragdoll.hip.x - enemy.x) * 0.008;
      enemy.vy = Math.sin(frameCount * 0.05) * 1.5;
      enemy.shootTimer++;
      if (enemy.shootTimer > 110) {
        enemy.shootTimer = 0;
        const angle = Math.atan2(ragdoll.chest.y - enemy.y, ragdoll.chest.x - enemy.x);
        projectiles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * 5.5, vy: Math.sin(angle) * 5.5 });
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
      } else enemy.vx += eDir * (0.22 * enemy.speed);
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
        const isSuperJump = Math.random() < 0.25; 
        enemy.vy = isSuperJump ? enemy.bouncePower * 1.85 : enemy.bouncePower;
        if (isSuperJump) createFloatingText(enemy.x, enemy.y - 18, 'SUPER JUMP!', '#00ff66');
      } else enemy.vy = 0;
    }

    const distToHip = Math.hypot(ragdoll.hip.x - enemy.x, ragdoll.hip.y - enemy.y);
    const distToChest = Math.hypot(ragdoll.chest.x - enemy.x, ragdoll.chest.y - enemy.y);
    const isTouchingPlayer = (distToHip < ragdoll.hip.radius + enemy.radius + 4 || distToChest < ragdoll.chest.radius + enemy.radius + 4);

    if (enemy.type === 'bomber' && distToHip < 60) {
      enemy.fuse--;
      if (enemy.fuse <= 0) {
        createSparks(enemy.x, enemy.y, 35, '#ffaa00');
        if (distToHip < 80 && ragdoll.iFrames <= 0) {
          ragdoll.iFrames = 30; ragdoll.flopTimer = 30;
          const expDir = Math.sign(ragdoll.hip.x - enemy.x) || 1;
          ragdoll.hip.addImpulse(expDir * 12, -8);
          screenShake = 12;
          applyDamageToPlayer(enemy.contactDamage);
        }
        enemies.splice(eIndex, 1);
        continue;
      }
    }

    if (isTouchingPlayer && ragdoll.iFrames <= 0) {
      const isParrying = sword.speed > 5.0 || ragdoll.dashTimer > 0;

      if (isParrying) {
        const parryDir = Math.sign(enemy.x - ragdoll.hip.x) || 1;
        enemy.vx = parryDir * 16; enemy.vy = -7; enemy.hitCooldown = 15;
        createSparks(enemy.x, enemy.y, 18, '#00ffcc');
        createFloatingText(enemy.x, enemy.y - 20, ragdoll.dashTimer > 0 ? 'DASH SLAM!' : 'PARRY!', '#00ffcc');

        if (playerStats.thorns > 0) {
          enemy.hp -= playerStats.thorns;
          createFloatingText(enemy.x, enemy.y - 35, `THORNS ${playerStats.thorns}`, '#00aaff');
        }

        screenShake = 6; ragdoll.iFrames = 15;
      } else {
        ragdoll.iFrames = 45; ragdoll.flopTimer = 32;
        const pushDir = Math.sign(ragdoll.hip.x - enemy.x) || 1;
        ragdoll.hip.addImpulse(pushDir * 9, -5);
        enemy.vx = -pushDir * 8; enemy.vy = -4;

        if (playerStats.thorns > 0) {
          enemy.hp -= playerStats.thorns;
          createFloatingText(enemy.x, enemy.y - 35, `THORNS ${playerStats.thorns}`, '#00aaff');
        }

        screenShake = 8;
        applyDamageToPlayer(enemy.contactDamage);
        if (!isRunning) return;
      }
    }

    const hitData = lineCircleIntersect(ragdoll.hand.x, ragdoll.hand.y, sword.tipX, sword.tipY, enemy.x, enemy.y, enemy.radius);
    const effectiveSpeed = ragdoll.dashTimer > 0 ? 12.0 : sword.speed;

    if ((hitData.hit || (ragdoll.dashTimer > 0 && isTouchingPlayer)) && enemy.hitCooldown <= 0) {
      const MIN_CUT_SPEED = 4.5;
      if (effectiveSpeed > MIN_CUT_SPEED) {

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
        let baseDmg = Math.floor(12 + Math.sqrt(excessSpeed) * 5.0);
        if (ragdoll.dashTimer > 0) baseDmg += 10;
        if (enemy.type === 'tank') baseDmg = Math.floor(baseDmg * 0.7);

        const isCrit = Math.random() < playerStats.critChance;
        let finalDamage = Math.floor(baseDmg * playerStats.damageMult * (isCrit ? playerStats.critDamage : 1.0));
        finalDamage = Math.min(180, Math.max(1, finalDamage));

        enemy.hp -= finalDamage;
        enemy.hitCooldown = 10;

        const knockAngle = Math.atan2(sword.tipY - sword.prevTipY, sword.tipX - sword.prevTipX);
        const knockForce = (effectiveSpeed * 0.5) / enemy.mass;
        enemy.vx += Math.cos(knockAngle) * knockForce;
        enemy.vy += (Math.sin(knockAngle) * knockForce - 2) / enemy.mass;

        createSparks(enemy.x, enemy.y, Math.min(22, Math.floor(effectiveSpeed)), enemy.color);

        if (isCrit) {
          screenShake = 8;
          createFloatingText(enemy.x, enemy.y - 20, `CRIT ${finalDamage}!`, '#ffea00');
        } else {
          createFloatingText(enemy.x, enemy.y - 20, `${finalDamage}`, '#00ffcc');
        }

        if (enemy.hp <= 0) {
          createSparks(enemy.x, enemy.y, 28, enemy.color);
          enemies.splice(eIndex, 1);
          score++;

          if (playerStats.lifesteal > 0 && ragdoll.hp < playerStats.maxHp) {
            ragdoll.hp = Math.min(playerStats.maxHp, ragdoll.hp + playerStats.lifesteal);
            createFloatingText(ragdoll.chest.x, ragdoll.chest.y - 25, `+${playerStats.lifesteal} HP`, '#00ff66');
          }

          updateHUD();
        }
      }
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.x += p.vx; p.y += p.vy; p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }

  for (let i = damageTexts.length - 1; i >= 0; i--) {
    const dt = damageTexts[i]; dt.y += dt.vy; dt.life -= 0.03;
    if (dt.life <= 0) damageTexts.splice(i, 1);
  }

  renderScene();
  requestAnimationFrame(gameLoop);
}