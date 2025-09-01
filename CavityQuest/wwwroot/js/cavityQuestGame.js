window.cavityQuestGame = {
    start: function(canvasRef) {
        const canvas = canvasRef instanceof HTMLCanvasElement ? canvasRef : document.getElementById('game-canvas');
        const ctx = canvas.getContext('2d');
        let lastTime = 0;
        let player = { x: 100, y: 350, w: 40, h: 40, vy: 0, onGround: false, health: 3, invincible: 0 };
        let keys = {};
        let gravity = 0.7;
        let jumpPower = -12;
        let groundY = 400;

        // --- Monsters and PowerUps ---
        let monsters = [
            { x: 400, y: 360, w: 40, h: 40, alive: true },
            { x: 600, y: 360, w: 40, h: 40, alive: true }
        ];
        let powerUps = [
            { x: 300, y: 370, w: 24, h: 24, collected: false }
        ];
        let score = 0;
        let level = 1;
        let maxLevel = 4;
        let gameOver = false;
        let endingState = null; // null | 'happy' | 'sad'

        // --- Map and Camera ---
        const mapWidth = 2400;
        let cameraX = 0;
        // --- Door ---
        let door = { x: mapWidth - 80, y: groundY - 60, w: 40, h: 60 };
        // --- Obstacles ---
        let obstacles = [];
        // --- Ground Obstacles ---
        let groundObstacles = [];
        // --- Helper for random enemy spawn ---
        // --- Monster spawn on platforms or ground, spaced, not overlapping, not inside obstacles ---
        function spawnMonsters(num) {
            let arr = [];
            let tries = 0;
            let minDist = 80;
            let candidates = [];
            // Collect all valid spawn positions (platforms and ground)
            obstacles.forEach(p => {
                candidates.push({ x: p.x + 10, y: p.y - 40, w: p.w - 20, platform: p });
            });
            // Add ground as a spawn area, avoiding ground obstacles
            let groundSpots = [];
            let gx = 80;
            while (gx < mapWidth - 120) {
                let blocked = groundObstacles.some(ob => gx + 40 > ob.x && gx < ob.x + ob.w);
                if (!blocked) groundSpots.push(gx);
                gx += 80;
            }
            groundSpots.forEach(gx => {
                candidates.push({ x: gx, y: groundY - 40, w: 40, platform: null });
            });
            // Place monsters
            while (arr.length < num && tries < 200) {
                let c = candidates[Math.floor(Math.random() * candidates.length)];
                let px = c.x + Math.random() * (c.w - 40);
                let py = c.y;
                // Ensure not overlapping other monsters
                let overlap = arr.some(m => Math.abs(m.x - px) < minDist && Math.abs(m.y - py) < 40);
                if (!overlap) {
                    arr.push({ x: px, y: py, w: 40, h: 40, alive: true, dir: -1, platform: c.platform });
                }
                tries++;
            }
            return arr;
        }
        // --- Helper for random obstacle spawn ---
        function spawnObstacles(num) {
            let arr = [];
            for (let i = 0; i < num; i++) {
                let safeZone = 150;
                let width = 80 + Math.random() * 80;
                let height = 20 + Math.random() * 20;
                let x = Math.random() * (mapWidth - 2 * safeZone - width) + safeZone;
                let y = groundY - 60 - Math.random() * 200; // up to 200px above ground
                arr.push({ x, y, w: width, h: height });
            }
            // Add a few fixed platforms for demo
            arr.push({ x: 500, y: groundY - 120, w: 120, h: 20 });
            arr.push({ x: 1200, y: groundY - 180, w: 100, h: 20 });
            arr.push({ x: 1800, y: groundY - 100, w: 140, h: 20 });
            return arr;
        }
        // --- Helper for ground obstacles ---
        function spawnGroundObstacles(num) {
            let arr = [];
            let minGap = 120;
            let safeZone = 180;
            let lastX = safeZone;
            for (let i = 0; i < num; i++) {
                let width = 40 + Math.random() * 80;
                let x = lastX + minGap + Math.random() * 180;
                if (x + width > mapWidth - safeZone) break;
                let topY = getGroundYAt(x + width / 2) - 40;
                let blocked = obstacles && obstacles.some(p =>
                    p.x < x + width && p.x + p.w > x && p.y < topY + 100 && p.y + p.h > topY
                );
                if (!blocked) {
                    arr.push({ x, y: getGroundYAt(x + width / 2) - 40, w: width, h: 40 });
                    lastX = x + width;
                }
            }
            return arr;
        }

        document.addEventListener('keydown', e => keys[e.code] = true);
        document.addEventListener('keyup', e => keys[e.code] = false);

        function rectsCollide(a, b) {
            return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        }

        // Monster flattening animation
        function flattenMonster(monster) {
            monster.flattening = true;
            monster.flattenFrame = 0;
        }

        // --- Static Level Data ---
        const staticLevels = [
            // Level 1
            {
                ground: [
                    { x1: 0, x2: mapWidth, y: groundY }
                ],
                platforms: [
                    { x: 700, y: 210, w: 100, h: 16 }, // 80px above second row (y: 230)
                    { x: 1000, y: 130, w: 140, h: 16 }, // 80px above second row (y: 130)
                    { x: 1300, y: 130, w: 100, h: 16 }, // 80px above second row (y: 130)
                    { x: 1500, y: 170, w: 120, h: 16 }, // 80px above second row (y: 170)
                    { x: 2000, y: 260, w: 100, h: 16 } // 80px above ground (y: 320)
                ],
                groundObstacles: [
                    { x: 300, y: groundY - 40, w: 340, h: 80 }, // moved from 150 to 300
                    { x: 600, y: groundY - 80, w: 400, h: 80 },
                    { x: 1100, y: groundY - 60, w: 120, h: 60 },
                    { x: 1700, y: groundY - 40, w: 180, h: 40 },
                    // Second row (flush, never overhangs, shorter and centered)
                    { x: 300 + 80, y: (groundY - 40) - 30, w: 180, h: 30 }, // above first
                    { x: 600 + 100, y: (groundY - 80) - 30, w: 200, h: 30 }, // above second
                    { x: 1100 + 20, y: (groundY - 60) - 30, w: 80, h: 30 }, // above third
                    { x: 1700 + 30, y: (groundY - 40) - 30, w: 120, h: 30 } // above fourth
                ],
                powerUps: [
                    { x: 2000 + 50 - 12, y: 240 - 24 }
                ],
                monsterSpawns: [
                    { x: 1200, y: 360 },
                    { x: 1600, y: 360 },
                    { x: 2200, y: 500 }
                ],
                teeth: [
                    { x: 700 + 50 - 16, y: 210 - 32 },
                    { x: 1500 + 60 - 16, y: 170 - 32 }
                ]
            },
            // Level 2
            {
                ground: [
                    { x1: 0, x2: mapWidth, y: groundY }
                ],
                platforms: [
                    { x: 350, y: 220, w: 120, h: 16 }, // 80px above first row obstacle (y: groundY-60+80=420, so y=220)
                    { x: 600, y: 70, w: 100, h: 16 }, // 80px above second row (y: 70)
                    { x: 1200, y: 190, w: 140, h: 16 }, // 80px above second row (y: 190)
                    { x: 1700, y: 130, w: 120, h: 16 }, // 80px above second row (y: 130)
                    { x: 2100, y: 220, w: 100, h: 16 } // 80px above ground (y: 220)
                ],
                groundObstacles: [
                    { x: 300, y: groundY - 60, w: 260, h: 60 }, // moved from 200 to 300
                    { x: 700, y: groundY - 40, w: 220, h: 40 },
                    { x: 1200, y: groundY - 80, w: 300, h: 80 },
                    { x: 1700, y: groundY - 40, w: 200, h: 40 },
                    // Second row
                    { x: 300 + 60, y: (groundY - 60) - 30, w: 140, h: 30 }, // above first
                    { x: 1200 + 60, y: (groundY - 80) - 30, w: 180, h: 30 } // above third
                ],
                powerUps: [
                    { x: 600 + 50 - 12, y: 50 - 24 }
                ],
                monsterSpawns: [
                    { x: 600, y: 360 },
                    { x: 1000, y: 360 },
                    { x: 1300, y: 360 },
                    { x: 1800, y: 360 },
                    { x: 2000, y: 360 },
                    { x: 1600, y: 360 }
                ],
                teeth: [
                    { x: 1200 + 70 - 16, y: 190 - 32 },
                    { x: 1700 + 60 - 16, y: 130 - 32 }
                ]
            },
            // Level 3
            {
                ground: [
                    { x1: 0, x2: mapWidth, y: groundY }
                ],
                platforms: [
                    { x: 400, y: 210, w: 120, h: 16 }, // 80px above first row obstacle (y: groundY-80+80=400, so y=210)
                    { x: 800, y: 50, w: 100, h: 16 }, // 80px above second row (y: 50)
                    { x: 1000, y: 170, w: 60, h: 16 }, // 80px above second row (y: 50)
                    { x: 1300, y: 190, w: 140, h: 16 }, // 80px above second row (y: 190)
                    { x: 1800, y: 130, w: 120, h: 16 }, // 80px above second row (y: 130)
                    { x: 2200, y: 220, w: 100, h: 16 } // 80px above ground (y: 220)
                ],
                groundObstacles: [
                    { x: 300, y: groundY - 80, w: 300, h: 80 },
                    { x: 900, y: groundY - 40, w: 220, h: 40 },
                    { x: 1400, y: groundY - 60, w: 180, h: 60 },
                    { x: 1800, y: groundY - 40, w: 300, h: 40 },
                    // Second row
                    { x: 300 + 60, y: (groundY - 80) - 30, w: 180, h: 30 }, // above first
                    { x: 1400 + 40, y: (groundY - 60) - 30, w: 100, h: 30 } // above third
                ],
                powerUps: [
                    { x: 1300 + 70 - 16, y: 170 - 24 }
                ],
                monsterSpawns: [
                    { x: 700, y: 360 },
                    { x: 1200, y: 360 },
                    { x: 1650, y: 360 },
                    { x: 2200, y: 360 }
                ],
                teeth: [
                    { x: 800 + 50 - 12, y: 50 - 32 },
                    { x: 1800 + 60 - 16, y: 130 - 32 }
                ]
            },
            // Level 4
            {
                ground: [
                    { x1: 0, x2: mapWidth, y: groundY }
                ],
                platforms: [
                    { x: 700, y: 210, w: 100, h: 16 }, // 80px above second row (y: 210)
                    { x: 1000, y: 50, w: 140, h: 16 }, // 80px above second row (y: 50)
                    { x: 1500, y: 170, w: 120, h: 16 }, // 80px above second row (y: 170)
                    { x: 2000, y: 260, w: 100, h: 16 } // 80px above ground (y: 260)
                ],
                groundObstacles: [
                    { x: 300, y: groundY - 40, w: 340, h: 40 }, // moved from 150 to 300
                    { x: 600, y: groundY - 80, w: 300, h: 80 },
                    { x: 1100, y: groundY - 60, w: 240, h: 60 },
                    { x: 1700, y: groundY - 40, w: 160, h: 40 },
                    // Second row
                    { x: 300 + 80, y: (groundY - 40) - 30, w: 180, h: 30 }, // above first
                    { x: 600 + 60, y: (groundY - 80) - 30, w: 180, h: 30 }, // above second
                    { x: 1100 + 40, y: (groundY - 60) - 30, w: 120, h: 30 } // above third
                ],
                powerUps: [
                    { x: 2000 + 50 - 12, y: 240 - 24 }
                ],
                monsterSpawns: [
                    { x: 400, y: 360 },
                    { x: 800, y: 360 },
                    { x: 1200, y: 360 },
                    { x: 1400, y: 360 },
                    { x: 1600, y: 360 },
                    { x: 2200, y: 360 }
                ],
                teeth: [
                    { x: 1000 + 70 - 12, y: 50 - 32 },
                    { x: 1500 + 60 - 16, y: 170 - 32 }
                ]
            }
        ];

        // --- Player Sprites ---
        const playerStandingImg = new window.Image();
        playerStandingImg.src = '/pictures/sprite-standing.png';
        const playerWalkingRight1Img = new window.Image();
        playerWalkingRight1Img.src = '/pictures/sprite-walking-right1.png';
        const playerWalkingRight2Img = new window.Image();
        playerWalkingRight2Img.src = '/pictures/sprite-walking-right2.png';
        const playerWalkingLeft1Img = new window.Image();
        playerWalkingLeft1Img.src = '/pictures/sprite-walking-left1.png';
        const playerWalkingLeft2Img = new window.Image();
        playerWalkingLeft2Img.src = '/pictures/sprite-walking-left2.png';
        // --- Monster Sprites ---
        const monsterStandingImg = new window.Image();
        monsterStandingImg.src = '/pictures/monster-standing.png';
        const monsterWalkingRight1Img = new window.Image();
        monsterWalkingRight1Img.src = '/pictures/monster-walking-right1.png';
        const monsterWalkingRight2Img = new window.Image();
        monsterWalkingRight2Img.src = '/pictures/monster-walking-right2.png';
        const monsterWalkingLeft1Img = new window.Image();
        monsterWalkingLeft1Img.src = '/pictures/monster-walking-left1.png';
        const monsterWalkingLeft2Img = new window.Image();
        monsterWalkingLeft2Img.src = '/pictures/monster-walking-left2.png';
        // --- PowerUp Sprite ---
        const powerUpHeartImg = new window.Image();
        powerUpHeartImg.src = '/pictures/heart filled.png';
        // --- Angry, Happy, Sad Sprites ---
        const angrySpriteImg = new window.Image();
        angrySpriteImg.src = '/pictures/angry-sprite.png';
        const happySpriteImg = new window.Image();
        happySpriteImg.src = '/pictures/happy-sprite.png';
        const sadSpriteImg = new window.Image();
        sadSpriteImg.src = '/pictures/sad-sprite.png';
        // --- Walking Animation State ---
        let walkFrame = 0;
        let walkFrameCounter = 0;
        let lastPlayerX = player.x;
        let lastPlayerDirection = 'right'; // 'left' or 'right'

        // --- Sprite Hitbox Definitions (relative to top-left, for 2x scale) ---
        const SCALE = 2;
        const HITBOXES = {
            player: { offsetX: 12 * SCALE, offsetY: 10 * SCALE, w: 16 * SCALE, h: 20 * SCALE }, // smaller/tighter hitbox
            monster: { offsetX: 10 * SCALE, offsetY: 12 * SCALE, w: 12 * SCALE, h: 16 * SCALE }, // smaller/tighter hitbox
            powerUp: { offsetX: 6 * SCALE, offsetY: 6 * SCALE, w: 12 * SCALE, h: 12 * SCALE },
            tooth: { offsetX: 8 * SCALE, offsetY: 8 * SCALE, w: 8 * SCALE, h: 12 * SCALE }
        };

        // --- Helper: Get hitbox for an entity ---
        function getHitbox(entity, type) {
            const hb = HITBOXES[type];
            return {
                x: entity.x + hb.offsetX,
                y: entity.y + hb.offsetY,
                w: hb.w,
                h: hb.h
            };
        }

        // --- Updated collision function using hitboxes ---
        function hitboxesCollide(a, aType, b, bType) {
            const ha = getHitbox(a, aType);
            const hb = getHitbox(b, bType);
            return ha.x < hb.x + hb.w && ha.x + ha.w > hb.x && ha.y < hb.y + hb.h && ha.y + ha.h > hb.y;
        }

        function startLevel() {
            player.x = 100; player.y = 350; player.vy = 0;
            let idx = Math.min(level - 1, staticLevels.length - 1);
            let lvl = staticLevels[idx];
            groundSegments = lvl.ground;
            obstacles = lvl.platforms;
            // --- Add ground obstacles at ground height transitions ---
            groundObstacles = lvl.groundObstacles.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
            // Add vertical ground obstacles at each ground segment transition where y changes
            for (let i = 1; i < groundSegments.length; i++) {
                let prev = groundSegments[i-1];
                let curr = groundSegments[i];
                if (prev.y !== curr.y) {
                    // Place a vertical wall at the transition
                    let x = curr.x1;
                    let yTop = Math.min(prev.y, curr.y);
                    let yBot = Math.max(prev.y, curr.y);
                    groundObstacles.push({ x: x-2, y: yTop, w: 4, h: yBot - yTop });
                }
            }
            // Place power-ups only if not inside obstacles/platforms or within 100px of door
            powerUps = lvl.powerUps.filter(pu => {
                let nearDoor = pu.x > door.x - 100 && pu.x < door.x + door.w + 100;
                let inObstacle = obstacles.some(ob => pu.x + 24 > ob.x && pu.x < ob.x + ob.w && pu.y + 24 > ob.y && pu.y < ob.y + ob.h);
                let inGroundObs = groundObstacles.some(ob => pu.x + 24 > ob.x && pu.x < ob.x + ob.w && pu.y + 24 > ob.y && pu.y < ob.y + ob.h);
                let nearTooth = lvl.teeth.some(t => Math.hypot((pu.x+12)-(t.x+16), (pu.y+12)-(t.y+16)) < 48);
                return !nearDoor && !inObstacle && !inGroundObs && !nearTooth;
            }).map(pu => ({ x: pu.x, y: pu.y, w: 24 * SCALE, h: 24 * SCALE, collected: false }));
            // Place monsters only if not near player spawn or door
            monsters = lvl.monsterSpawns.filter(m => {
                let nearPlayer = Math.abs(m.x - player.x) < 200;
                let nearDoor = m.x > door.x - 100 && m.x < door.x + door.w + 100;
                // Ensure monster spawns at least 30px away from any ground obstacle horizontally
                let nearGroundObstacle = groundObstacles.some(ob => Math.abs(m.x - (ob.x + ob.w/2)) < (ob.w/2 + 30));
                return !nearPlayer && !nearDoor && !nearGroundObstacle;
            }).map(m => {
                // Check if this spawn is on a platform
                let platform = obstacles.find(ob => m.x >= ob.x && m.x <= ob.x + ob.w && Math.abs(m.y - ob.y) < 40);
                let monsterHeight = 40 * SCALE / 2;
                let y;
                if (platform) {
                    y = platform.y - monsterHeight;
                } else {
                    y = getGroundYAt(m.x) - monsterHeight;
                }
                return { x: m.x, y: y, w: 40 * SCALE / 2, h: 40 * SCALE / 2, alive: true, dir: -1, platform: platform, vy: 0 };
            });
            // Place teeth collectibles for this level
            teeth = lvl.teeth.map(t => ({ x: t.x, y: t.y, w: 32, h: 32, collected: false }));
        }
        // --- Structured platform generation ---
        function generateStructuredPlatforms() {
            const platforms = [];
            const platformThickness = 16;
            const minY = groundY - 60;
            const maxPlatforms = 10;
            let y = minY;
            let x = 80;
            let count = 0;
            while (count < maxPlatforms && x < mapWidth - 200) {
                let len = 80 + Math.random() * 100;
                platforms.push({ x, y, w: len, h: platformThickness });
                // Next platform: 100px higher, random horizontal offset
                y -= 100;
                if (y < 80) break; // Don't go above the screen
                x += 120 + Math.random() * 180;
                count++;
            }
            return platforms;
        }

        // --- Ground Segments ---
        let groundSegments = [];
        function generateGroundSegments() {
            let segments = [];
            let x = 0;
            let y = groundY;
            while (x < mapWidth) {
                let segLen = 120 + Math.random() * 180;
                let nextY = y;
                if (Math.random() < 0.3) {
                    let delta = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 40);
                    nextY = Math.max(220, Math.min(groundY, y + delta));
                }
                segments.push({ x1: x, x2: Math.min(x + segLen, mapWidth), y });
                x += segLen;
                y = nextY;
            }
            return segments;
        }
        function getGroundYAt(x) {
            for (let i = 0; i < groundSegments.length; i++) {
                let seg = groundSegments[i];
                if (x >= seg.x1 && x <= seg.x2) return seg.y;
            }
            return groundY;
        }

        // --- Tooth Collectibles ---
        let teeth = [];
        let collectedTeeth = 0;
        // --- Preload tooth image with load check ---
        const toothImg = new window.Image();
        let toothImgLoaded = false;
        toothImg.onload = () => { toothImgLoaded = true; };
        toothImg.src = '/pictures/tooth.png';
        // --- Preload heart images ---
        const heartFilledImg = new window.Image();
        heartFilledImg.src = '/pictures/heart filled.png';
        const heartEmptyImg = new window.Image();
        heartEmptyImg.src = '/pictures/heart empty.png';
        // --- Background Image ---
        const backgroundImg = new window.Image();
        backgroundImg.src = '/pictures/candyland.png';
        backgroundImg.onerror = logImageError('backgroundImg', backgroundImg.src);

        // --- Candybean Images ---
        const candybeanImgs = [
            (() => { let img = new window.Image(); img.src = '/pictures/candybean1.png'; return img; })(),
            (() => { let img = new window.Image(); img.src = '/pictures/candybean2.png'; return img; })(),
            (() => { let img = new window.Image(); img.src = '/pictures/candybean3.png'; return img; })(),
            (() => { let img = new window.Image(); img.src = '/pictures/candybean4.png'; return img; })()
        ];
        // --- Candybean Rain State ---
        let candybeans = [];
        let candybeanRainTimer = 0;
        const CANDYBEAN_SIZE = 20; // px, smaller than player
        const CANDYBEAN_SPAWN_INTERVAL = 15; // frames
        const CANDYBEAN_FALL_SPEED_MIN = 1.5;
        const CANDYBEAN_FALL_SPEED_MAX = 3.5;

        function update() {
            if (gameOver || endingState) return;
            // Horizontal movement
            let movingLeft = keys['ArrowLeft'] && !keys['ArrowRight'];
            let movingRight = keys['ArrowRight'] && !keys['ArrowLeft'];
            if (movingLeft) player.x -= 5;
            if (movingRight) player.x += 5;
            // Clamp player to map
            player.x = Math.max(0, Math.min(player.x, mapWidth - player.w));
            // Camera follows player
            cameraX = player.x + player.w / 2 - canvas.width / 2;
            cameraX = Math.max(0, Math.min(cameraX, mapWidth - canvas.width));

            // Jump
            if (keys['Space'] && player.onGround) {
                player.vy = jumpPower;
                player.onGround = false;
            }

            // Gravity
            player.vy += gravity;
            player.y += player.vy;
            // Platform collision (only if falling and feet land on top)
            let onAnyPlatform = false;
            obstacles.forEach(ob => {
                let prevBottom = player.y + player.h - player.vy;
                let nextBottom = player.y + player.h;
                let onTop = prevBottom <= ob.y && nextBottom >= ob.y;
                let withinX = player.x + player.w > ob.x && player.x < ob.x + ob.w;
                if (onTop && withinX && player.vy >= 0) {
                    player.y = ob.y - player.h;
                    player.vy = 0;
                    onAnyPlatform = true;
                }
            });
            // Ground obstacle collision (same as before)
            groundObstacles.forEach(ob => {
                let prevBottom = player.y + player.h - player.vy;
                let nextBottom = player.y + player.h;
                let onTop = prevBottom <= ob.y && nextBottom >= ob.y;
                let withinX = player.x + player.w > ob.x && player.x < ob.x + ob.w;
                if (onTop && withinX && player.vy >= 0) {
                    player.y = ob.y - player.h;
                    player.vy = 0;
                    onAnyPlatform = true;
                }
                // Sides
                let hitLeft = player.x + player.w > ob.x && player.x < ob.x && player.y + player.h > ob.y && player.y < ob.y + ob.h;
                if (hitLeft) player.x = ob.x - player.w;
                let hitRight = player.x < ob.x + ob.w && player.x + player.w > ob.x + ob.w && player.y + player.h > ob.y && player.y < ob.y + ob.h;
                if (hitRight) player.x = ob.x + ob.w;
            });
            // Ground collision (use new ground)
            let groundAtPlayer = getGroundYAt(player.x + player.w / 2);
            if (player.y + player.h >= groundAtPlayer) {
                player.y = groundAtPlayer - player.h;
                player.vy = 0;
                onAnyPlatform = true;
            }
            player.onGround = onAnyPlatform;
            // Monster collision
            monsters.forEach(monster => {
                if (!monster.alive || monster.flattening) return;
                if (hitboxesCollide(player, 'player', monster, 'monster')) {
                    // Check if player is falling and above monster
                    let playerBottom = player.y + player.h;
                    let monsterTop = monster.y;
                    let vyDown = player.vy > 0;
                    let above = playerBottom - player.vy <= monsterTop + 5;
                    if (vyDown && above) {
                        // Defeat monster
                        flattenMonster(monster);
                        player.vy = jumpPower * 0.7; // bounce up
                        score += 20;
                    } else if (player.invincible <= 0) {
                        // Player takes damage
                        player.health--;
                        player.invincible = 40; // frames of invincibility
                        player.flashTimer = 40;
                        // Pushback
                        if (player.x < monster.x) {
                            player.x -= 40;
                        } else {
                            player.x += 40;
                        }
                        // Clamp to map
                        player.x = Math.max(0, Math.min(player.x, mapWidth - player.w));
                        if (player.health <= 0) {
                            gameOver = true;
                        }
                    }
                }
            });
            // Flattening animation
            monsters.forEach(monster => {
                if (monster.flattening) {
                    monster.flattenFrame++;
                    monster.h *= 0.85;
                    monster.y += monster.h * 0.15;
                    monster.w *= 1.05;
                    if (monster.h < 8) {
                        monster.alive = false;
                        monster.flattening = false;
                    }
                }
            });
            // Invincibility timer and flash
            if (player.invincible > 0) player.invincible--;
            if (player.flashTimer > 0) player.flashTimer--;
            // PowerUp collision
            powerUps.forEach(pu => {
                if (!pu.collected && hitboxesCollide(player, 'player', pu, 'powerUp')) {
                    pu.collected = true;
                    player.health = Math.min(3, player.health + 1);
                }
            });
            // Tooth collectible collision
            teeth.forEach(tooth => {
                if (!tooth.collected && hitboxesCollide(player, 'player', tooth, 'tooth')) {
                    tooth.collected = true;
                    collectedTeeth++;
                }
            });
            // Door collision
            if (rectsCollide(player, door)) {
                if (level < maxLevel) {
                    level++;
                    startLevel();
                } else {
                    // End screen logic for level 4
                    if (collectedTeeth === 8) {
                        endingState = 'happy';
                    } else {
                        endingState = 'sad';
                    }
                }
            }
            // Monster movement
            monsters.forEach(monster => {
                if (!monster.alive || monster.flattening) return;
                let speed = 2;
                // Platform logic
                if (monster.platform) {
                    let nextX = monster.x + monster.dir * speed;
                    // Reverse at platform edges
                    if (nextX < monster.platform.x || nextX + monster.w > monster.platform.x + monster.platform.w) {
                        monster.dir *= -1;
                    } else {
                        monster.x = nextX;
                    }
                    // Check if monster is still on platform (support for falling off)
                    let feetX = monster.x + monster.w / 2;
                    if (monster.y + monster.h < monster.platform.y || feetX < monster.platform.x || feetX > monster.platform.x + monster.platform.w) {
                        monster.platform = null; // No longer on platform, start falling
                    }
                } else {
                    // --- Ground obstacle logic for monsters ---
                    // Check if monster is standing on a ground obstacle
                    let standingOnObstacle = null;
                    let feetX = monster.x + monster.w / 2;
                    for (let ob of groundObstacles) {
                        if (feetX >= ob.x && feetX <= ob.x + ob.w && Math.abs(monster.y + monster.h - ob.y) < 6) {
                            standingOnObstacle = ob;
                            break;
                        }
                    }
                    if (standingOnObstacle) {
                        // Refined edge logic: allow monster to walk up to the edge, then reverse
                        let nextX = monster.x + monster.dir * speed;
                        let margin = 2; // px
                        // Check if the monster's feet would be off the obstacle after moving
                        let nextFeetLeft = nextX + margin;
                        let nextFeetRight = nextX + monster.w - margin;
                        if (nextFeetLeft < standingOnObstacle.x || nextFeetRight > standingOnObstacle.x + standingOnObstacle.w) {
                            monster.dir *= -1;
                        } else {
                            monster.x = nextX;
                        }
                        // Stay on top of obstacle
                        monster.y = standingOnObstacle.y - monster.h;
                        monster.vy = 0;
                    } else {
                        // --- Gravity and ground logic for monsters ---
                        let nextX = monster.x + monster.dir * speed;
                        let hitEdge = nextX < 0 || nextX + monster.w > mapWidth;
                        let hitObstacle = groundObstacles.some(ob =>
                            nextX + monster.w > ob.x && nextX < ob.x + ob.w && monster.y + monster.h > ob.y && monster.y < ob.y + ob.h
                        );
                        if (hitEdge || hitObstacle) {
                            monster.dir *= -1;
                        } else {
                            monster.x = nextX;
                        }
                        // Gravity
                        monster.vy += gravity;
                        monster.y += monster.vy;
                        // Find what is directly below the monster
                        let feetX = monster.x + monster.w / 2;
                        let groundY = getGroundYAt(feetX);
                        let standingOnObstacle = null;
                        for (let ob of groundObstacles) {
                            if (feetX >= ob.x && feetX <= ob.x + ob.w && monster.y + monster.h <= ob.y + 10 && monster.y + monster.h + monster.vy >= ob.y) {
                                standingOnObstacle = ob;
                                break;
                            }
                        }
                        if (standingOnObstacle) {
                            monster.y = standingOnObstacle.y - monster.h;
                            monster.vy = 0;
                        } else if (monster.y + monster.h >= groundY) {
                            monster.y = groundY - monster.h;
                            monster.vy = 0;
                        }
                    }
                }
            });
            // Double jump logic
            if (player.jumpCount === undefined) player.jumpCount = 0;
            if (player.lastJumpKey === undefined) player.lastJumpKey = false;
            let jumpPressed = keys['Space'];
            if (jumpPressed && !player.lastJumpKey) {
                if (player.onGround || player.jumpCount < 2) {
                    player.vy = jumpPower;
                    player.onGround = false;
                    player.jumpCount++;
                }
            }
            player.lastJumpKey = jumpPressed;
            // Reset jump count when landing
            if (player.onGround) player.jumpCount = 0;

            // --- Walking Animation Logic ---
            let isWalking = false;
            if (movingLeft) {
                lastPlayerDirection = 'left';
                if (player.x !== lastPlayerX) {
                    isWalking = true;
                    walkFrameCounter++;
                    if (walkFrameCounter > 8) {
                        walkFrame = 1 - walkFrame;
                        walkFrameCounter = 0;
                    }
                }
            } else if (movingRight) {
                lastPlayerDirection = 'right';
                if (player.x !== lastPlayerX) {
                    isWalking = true;
                    walkFrameCounter++;
                    if (walkFrameCounter > 8) {
                        walkFrame = 1 - walkFrame;
                        walkFrameCounter = 0;
                    }
                }
            } else {
                walkFrame = 0;
                walkFrameCounter = 0;
            }
            lastPlayerX = player.x;
            player.isWalking = isWalking;
            player.walkFrame = walkFrame;
            player.lastDirection = lastPlayerDirection;

            // --- Monster Animation State ---
            monsters.forEach(monster => {
                if (!monster.alive || monster.flattening) return;
                if (monster.lastX === undefined) monster.lastX = monster.x;
                if (monster.walkFrame === undefined) monster.walkFrame = 0;
                if (monster.walkFrameCounter === undefined) monster.walkFrameCounter = 0;
                if (monster.lastDirection === undefined) monster.lastDirection = 'left';
                let moved = false;
                if (monster.x > monster.lastX) {
                    monster.lastDirection = 'right';
                    moved = true;
                } else if (monster.x < monster.lastX) {
                    monster.lastDirection = 'left';
                    moved = true;
                }
                if (moved) {
                    monster.walkFrameCounter++;
                    if (monster.walkFrameCounter > 8) {
                        monster.walkFrame = 1 - monster.walkFrame;
                        monster.walkFrameCounter = 0;
                    }
                } else {
                    monster.walkFrame = 0;
                    monster.walkFrameCounter = 0;
                }
                monster.lastX = monster.x;
            });

            // --- Candybean Rain Update ---
            candybeanRainTimer++;
            if (candybeanRainTimer >= CANDYBEAN_SPAWN_INTERVAL) {
                candybeanRainTimer = 0;
                // Spawn a new candybean at a random x above the visible area
                let spawnX = cameraX + Math.random() * canvas.width;
                let speed = CANDYBEAN_FALL_SPEED_MIN + Math.random() * (CANDYBEAN_FALL_SPEED_MAX - CANDYBEAN_FALL_SPEED_MIN);
                let imgIdx = Math.floor(Math.random() * candybeanImgs.length);
                candybeans.push({ x: spawnX, y: -CANDYBEAN_SIZE, vy: speed, imgIdx });
            }
            // Move candybeans
            candybeans.forEach(cb => {
                cb.y += cb.vy;
            });
            // Remove candybeans that fall off the bottom
            candybeans = candybeans.filter(cb => cb.y < canvas.height + 40);
        }

        function drawHearts() {
            for (let i = 0; i < 3; i++) {
                let img = i < player.health ? heartFilledImg : heartEmptyImg;
                ctx.drawImage(img, 10 + i * 40, 10, 32, 32);
            }
        }
        function draw() {
            // Show ending screen if game is finished
            if (endingState === 'happy' || endingState === 'sad') {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                let img = endingState === 'happy' ? happySpriteImg : sadSpriteImg;
                let msg = endingState === 'happy' ? 'Happy Ending' : 'Sad Ending :c';
                // Draw sprite centered
                let imgW = 180, imgH = 180;
                ctx.drawImage(img, (canvas.width - imgW) / 2, (canvas.height - imgH) / 2 - 40, imgW, imgH);
                // Draw message
                ctx.fillStyle = '#222';
                ctx.font = 'bold 48px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(msg, canvas.width / 2, (canvas.height - imgH) / 2 + imgH + 40);
                return;
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Draw background image, tile horizontally, scroll with camera, keep aspect ratio
            if (backgroundImg.complete && backgroundImg.naturalWidth > 0) {
                let bgW = backgroundImg.width;
                let bgH = backgroundImg.height;
                // Vertically: do not stretch, just draw at y=0 (top-aligned)
                // Horizontally: tile, offset by cameraX so it scrolls with the player
                let startX = -((cameraX % bgW) + bgW) % bgW;
                for (let x = startX; x < canvas.width; x += bgW) {
                    ctx.drawImage(backgroundImg, x, 0, bgW, bgH);
                }
            } else {
                ctx.fillStyle = '#aee'; // fallback color
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            // Draw candybeans (rain) behind everything else
            candybeans.forEach(cb => {
                ctx.drawImage(candybeanImgs[cb.imgIdx], cb.x - cameraX, cb.y, CANDYBEAN_SIZE, CANDYBEAN_SIZE);
            });
            // Always draw UI elements first
            drawHearts();
            // Draw collected teeth in upper right corner
            for (let i = 0; i < collectedTeeth; i++) {
                ctx.drawImage(toothImg, canvas.width - 50 - i * 40, 10, 32, 32);
            }
            // Draw score/level
            ctx.fillStyle = '#222';
            ctx.font = '20px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('Score: ' + score, 10, 80);
            ctx.fillText('Level: ' + level, 10, 110);
            // Draw ground as a single forest green rectangle
            ctx.fillStyle = '#228B22';
            ctx.fillRect(0 - cameraX, groundY, mapWidth, canvas.height - groundY);
            // Draw ground obstacles (forest green, raised floor)
            ctx.fillStyle = '#228B22';
            groundObstacles.forEach(ob => {
                ctx.fillRect(ob.x - cameraX, ob.y, ob.w, ob.h);
            });
            // Draw platforms (now visible)
            // Use platform.png, stretched to fit
            obstacles.forEach(ob => {
                ctx.drawImage(platformImg, ob.x - cameraX, ob.y, ob.w, ob.h);
            });
            // Draw door or angry-sprite
            if (level === maxLevel) {
                // Draw angry-sprite with correct aspect ratio (height matches door, width scaled)
                let img = angrySpriteImg;
                let aspect = img.width / img.height;
                let drawH = door.h;
                let drawW = aspect * drawH;
                ctx.drawImage(img, door.x - cameraX + (door.w - drawW) / 2, door.y, drawW, drawH);
            } else {
                ctx.fillStyle = (level === 1 || level === 2 || level === 3) ? '#FF69B4' : '#8e44ad';
                ctx.fillRect(door.x - cameraX, door.y, door.w, door.h);
                ctx.fillStyle = '#fff';
                ctx.fillRect(door.x - cameraX + 12, door.y + 20, 16, 24);
            }
            // Draw player
            let playerImg = playerStandingImg;
            if (player.isWalking) {
                if (player.lastDirection === 'left') {
                    playerImg = player.walkFrame === 0 ? playerWalkingLeft1Img : playerWalkingLeft2Img;
                } else {
                    playerImg = player.walkFrame === 0 ? playerWalkingRight1Img : playerWalkingRight2Img;
                }
            }
            // If invincible and flashing, draw with reduced opacity
            if (player.invincible > 0 && player.flashTimer % 8 < 4) {
                ctx.save();
                ctx.globalAlpha = 0.5;
                ctx.drawImage(playerImg, player.x - cameraX, player.y, player.w, player.h);
                ctx.restore();
            } else {
                ctx.drawImage(playerImg, player.x - cameraX, player.y, player.w, player.h);
            }
            // Draw monsters
            monsters.forEach(monster => {
                if (!monster.alive) return;
                let monsterImg = monsterStandingImg;
                if (monster.lastDirection === 'left') {
                    if (monster.walkFrame === 1) {
                        monsterImg = monsterWalkingLeft2Img;
                    } else if (monster.walkFrame === 0 && monster.x !== monster.lastX) {
                        monsterImg = monsterWalkingLeft1Img;
                    }
                } else if (monster.lastDirection === 'right') {
                    if (monster.walkFrame === 1) {
                        monsterImg = monsterWalkingRight2Img;
                    } else if (monster.walkFrame === 0 && monster.x !== monster.lastX) {
                        monsterImg = monsterWalkingRight1Img;
                    }
                }
                ctx.drawImage(monsterImg, monster.x - cameraX, monster.y, monster.w, monster.h);
            });
            // Draw power-ups
            powerUps.forEach(pu => {
                if (!pu.collected) ctx.drawImage(powerUpHeartImg, pu.x - cameraX, pu.y, pu.w, pu.h);
            });
            // Draw teeth collectibles on platforms
            teeth.forEach(tooth => {
                if (!tooth.collected) {
                    ctx.drawImage(toothImg, tooth.x - cameraX, tooth.y, tooth.w, tooth.h);
                }
            });
            // Game Over
            if (gameOver) {
                ctx.save();
                ctx.globalAlpha = 0.85;
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#c0392b';
                ctx.font = '60px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(level > maxLevel ? 'You Win!' : 'Game Over', canvas.width / 2, canvas.height / 2);
                ctx.font = '30px Arial';
                ctx.fillText('Refresh to try again!', canvas.width / 2, canvas.height / 2 + 50);
                ctx.textAlign = 'left';
                ctx.restore();
            }
        }

        function gameLoop(ts) {
            update();
            draw();
            if (!gameOver) requestAnimationFrame(gameLoop);
        }
        requestAnimationFrame(gameLoop);

        // Start first level
        startLevel();

        // Add error logging for all sprite images
        function logImageError(name, src) {
            return function() { console.error('Failed to load image:', name, src); };
        }
        playerStandingImg.onerror = logImageError('playerStandingImg', playerStandingImg.src);
        playerWalkingRight1Img.onerror = logImageError('playerWalkingRight1Img', playerWalkingRight1Img.src);
        playerWalkingRight2Img.onerror = logImageError('playerWalkingRight2Img', playerWalkingRight2Img.src);
        playerWalkingLeft1Img.onerror = logImageError('playerWalkingLeft1Img', playerWalkingLeft1Img.src);
        playerWalkingLeft2Img.onerror = logImageError('playerWalkingLeft2Img', playerWalkingLeft2Img.src);
        monsterStandingImg.onerror = logImageError('monsterStandingImg', monsterStandingImg.src);
        monsterWalkingRight1Img.onerror = logImageError('monsterWalkingRight1Img', monsterWalkingRight1Img.src);
        monsterWalkingRight2Img.onerror = logImageError('monsterWalkingRight2Img', monsterWalkingRight2Img.src);
        monsterWalkingLeft1Img.onerror = logImageError('monsterWalkingLeft1Img', monsterWalkingLeft1Img.src);
        monsterWalkingLeft2Img.onerror = logImageError('monsterWalkingLeft2Img', monsterWalkingLeft2Img.src);
        powerUpHeartImg.onerror = logImageError('powerUpHeartImg', powerUpHeartImg.src);
        // --- Platform Sprite ---
        const platformImg = new window.Image();
        platformImg.src = '/pictures/platform.png';
        platformImg.onerror = logImageError('platformImg', platformImg.src);
    },
    initMusic: function(audioRef) {
        // Get the audio element from the reference or fallback to id
        var audio = audioRef instanceof HTMLAudioElement ? audioRef : document.getElementById('bg-music');
        if (!audio) return;
        let started = false;
        function startMusic() {
            if (!started) {
                started = true;
                audio.volume = 0.5;
                audio.play().catch(() => {}); // Ignore play errors
                // Remove listeners
                window.removeEventListener('click', startMusic);
                window.removeEventListener('keydown', startMusic);
                window.removeEventListener('touchstart', startMusic);
            }
        }
        window.addEventListener('click', startMusic);
        window.addEventListener('keydown', startMusic);
        window.addEventListener('touchstart', startMusic);
        // Loop music when it ends
        audio.addEventListener('ended', function() {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        });
    }
};
