class MultiplayerGames {
    constructor(canvas, gameType) {
        this.ctx = canvas.getContext('2d');
        this.canvas = canvas;
        this.type = gameType;
        this.running = true;
        this.keys = {};
        this.canvas.width = 400;
        this.canvas.height = 400;

        window.addEventListener('keydown', e => this.keys[e.key] = true);
        window.addEventListener('keyup', e => this.keys[e.key] = false);

        this.init();
        this.loop();
    }

    init() {
        switch (this.type) {
            case 'pong':
                this.p1 = { y: 160, h: 80, score: 0 };
                this.p2 = { y: 160, h: 80, score: 0 };
                this.ball = { x: 200, y: 200, dx: 3, dy: 3 };
                break;
            case 'tron':
                this.p1 = { x: 50, y: 200, dir: 'right', trail: [], color: '#00d2ff' };
                this.p2 = { x: 350, y: 200, dir: 'left', trail: [], color: '#ff0080' };
                break;
            case 'ttt':
                this.board = Array(9).fill(null);
                this.turn = 'X';
                this.canvas.onclick = (e) => this.tttClick(e);
                break;
            case 'c4':
                this.grid = Array.from({ length: 6 }, () => Array(7).fill(0));
                this.turn = 1;
                this.canvas.onclick = (e) => this.c4Click(e);
                break;
            case 'sumo':
                this.p1 = { x: 150, y: 200, r: 25, color: '#fff' };
                this.p2 = { x: 250, y: 200, r: 25, color: '#ff5f57' };
                break;
            case 'tanks':
                this.p1 = { x: 50, y: 200, angle: 0, color: '#28C840' };
                this.p2 = { x: 350, y: 200, angle: Math.PI, color: '#0A84FF' };
                break;
            case 'race':
                this.p1 = { x: 100, y: 300, color: '#FF5F57' };
                this.p2 = { x: 250, y: 300, color: '#0A84FF' };
                break;
            case 'war':
                this.p1 = { x: 100, y: 200, color: '#00d2ff' };
                this.p2 = { x: 300, y: 200, color: '#ff0080' };
                break;
            case 'memory':
                this.cards = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8].sort(() => Math.random() - 0.5);
                this.revealed = [];
                this.found = [];
                this.turn = 1;
                this.canvas.onclick = (e) => this.memoryClick(e);
                break;
            case 'maze':
                this.p1 = { x: 20, y: 20 };
                this.p2 = { x: 20, y: 40 };
                break;
        }
    }

    loop() {
        if (!this.running) return;
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        if (this.type === 'pong') {
            if (this.keys['w'] && this.p1.y > 0) this.p1.y -= 5;
            if (this.keys['s'] && this.p1.y < 320) this.p1.y += 5;
            if (this.keys['ArrowUp'] && this.p2.y > 0) this.p2.y -= 5;
            if (this.keys['ArrowDown'] && this.p2.y < 320) this.p2.y += 5;
            this.ball.x += this.ball.dx;
            this.ball.y += this.ball.dy;
            if (this.ball.y < 0 || this.ball.y > 390) this.ball.dy *= -1;
            if (this.ball.x < 20 && this.ball.y > this.p1.y && this.ball.y < this.p1.y + this.p1.h) this.ball.dx *= -1.1;
            if (this.ball.x > 370 && this.ball.y > this.p2.y && this.ball.y < this.p2.y + this.p2.h) this.ball.dx *= -1.1;
            if (this.ball.x < 0 || this.ball.x > 400) this.resetPong();
        } else if (this.type === 'tron') {
            const move = (p, up, down, left, right) => {
                if (this.keys[up] && p.dir !== 'down') p.dir = 'up';
                if (this.keys[down] && p.dir !== 'up') p.dir = 'down';
                if (this.keys[left] && p.dir !== 'right') p.dir = 'left';
                if (this.keys[right] && p.dir !== 'left') p.dir = 'right';
                p.trail.push({ x: p.x, y: p.y });
                if (p.dir === 'up') p.y -= 2; if (p.dir === 'down') p.y += 2;
                if (p.dir === 'left') p.x -= 2; if (p.dir === 'right') p.x += 2;
            };
            move(this.p1, 'w', 's', 'a', 'd');
            move(this.p2, 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight');
            if (this.p1.x < 0 || this.p1.x > 400 || this.p1.y < 0 || this.p1.y > 400) this.init();
        } else if (this.type === 'sumo') {
            const move = (p, up, down, left, right) => {
                if (this.keys[up]) p.y -= 3; if (this.keys[down]) p.y += 3;
                if (this.keys[left]) p.x -= 3; if (this.keys[right]) p.x += 3;
            };
            move(this.p1, 'w', 's', 'a', 'd');
            move(this.p2, 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight');
            let dist = Math.hypot(this.p1.x - this.p2.x, this.p1.y - this.p2.y);
            if (dist < 50) {
                let angle = Math.atan2(this.p1.y - this.p2.y, this.p1.x - this.p2.x);
                this.p1.x += Math.cos(angle) * 10; this.p1.y += Math.sin(angle) * 10;
                this.p2.x -= Math.cos(angle) * 10; this.p2.y -= Math.sin(angle) * 10;
            }
            if (Math.hypot(this.p1.x - 200, this.p1.y - 200) > 180 || Math.hypot(this.p2.x - 200, this.p2.y - 200) > 180) this.init();
        } else if (this.type === 'tanks') {
            if (this.keys['a']) this.p1.angle -= 0.05; if (this.keys['d']) this.p1.angle += 0.05;
            if (this.keys['w']) { this.p1.x += Math.cos(this.p1.angle) * 2; this.p1.y += Math.sin(this.p1.angle) * 2; }
            if (this.keys['ArrowLeft']) this.p2.angle -= 0.05; if (this.keys['ArrowRight']) this.p2.angle += 0.05;
            if (this.keys['ArrowUp']) { this.p2.x += Math.cos(this.p2.angle) * 2; this.p2.y += Math.sin(this.p2.angle) * 2; }
        } else if (this.type === 'maze') {
            if (this.keys['w']) this.p1.y -= 2; if (this.keys['s']) this.p1.y += 2;
            if (this.keys['a']) this.p1.x -= 2; if (this.keys['d']) this.p1.x += 2;
            if (this.keys['ArrowUp']) this.p2.y -= 2; if (this.keys['ArrowDown']) this.p2.y += 2;
            if (this.keys['ArrowLeft']) this.p2.x -= 2; if (this.keys['ArrowRight']) this.p2.x += 2;
            if (this.p1.x > 380 || this.p2.x > 380) this.init();
        }
    }

    resetPong() { this.ball = { x: 200, y: 200, dx: 3, dy: 3 }; }

    tttClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / (rect.width / 3));
        const y = Math.floor((e.clientY - rect.top) / (rect.height / 3));
        const idx = y * 3 + x;
        if (!this.board[idx]) { this.board[idx] = this.turn; this.turn = this.turn === 'X' ? 'O' : 'X'; }
    }

    c4Click(e) {
        const rect = this.canvas.getBoundingClientRect();
        const col = Math.floor((e.clientX - rect.left) / (rect.width / 7));
        for (let r = 5; r >= 0; r--) {
            if (this.grid[r][col] === 0) { this.grid[r][col] = this.turn; this.turn = this.turn === 1 ? 2 : 1; break; }
        }
    }

    memoryClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / (rect.width / 4));
        const y = Math.floor((e.clientY - rect.top) / (rect.height / 4));
        const idx = y * 4 + x;
        if (this.revealed.length < 2 && !this.revealed.includes(idx) && !this.found.includes(idx)) {
            this.revealed.push(idx);
            if (this.revealed.length === 2) {
                if (this.cards[this.revealed[0]] === this.cards[this.revealed[1]]) {
                    this.found.push(...this.revealed); this.revealed = [];
                } else {
                    setTimeout(() => this.revealed = [], 1000);
                }
            }
        }
    }

    draw() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, 400, 400);

        if (this.type === 'pong') {
            this.ctx.fillStyle = '#fff';
            this.ctx.fillRect(10, this.p1.y, 8, 80);
            this.ctx.fillRect(382, this.p2.y, 8, 80);
            this.ctx.beginPath(); this.ctx.arc(this.ball.x, this.ball.y, 5, 0, Math.PI * 2); this.ctx.fill();
        } else if (this.type === 'tron') {
            const drawP = (p) => {
                this.ctx.strokeStyle = p.color; this.ctx.beginPath();
                p.trail.forEach((t, i) => i === 0 ? this.ctx.moveTo(t.x, t.y) : this.ctx.lineTo(t.x, t.y));
                this.ctx.lineTo(p.x, p.y); this.ctx.stroke();
            };
            drawP(this.p1); drawP(this.p2);
        } else if (this.type === 'ttt') {
            this.ctx.strokeStyle = '#444'; this.ctx.lineWidth = 2;
            for (let i = 1; i < 3; i++) {
                this.ctx.beginPath(); this.ctx.moveTo(i * 133, 0); this.ctx.lineTo(i * 133, 400); this.ctx.stroke();
                this.ctx.beginPath(); this.ctx.moveTo(0, i * 133); this.ctx.lineTo(400, i * 133); this.ctx.stroke();
            }
            this.board.forEach((b, i) => {
                if (b) {
                    this.ctx.fillStyle = b === 'X' ? '#0A84FF' : '#FF5F57';
                    this.ctx.font = '50px Arial'; this.ctx.fillText(b, (i % 3) * 133 + 45, Math.floor(i / 3) * 133 + 85);
                }
            });
        } else if (this.type === 'c4') {
            this.grid.forEach((row, r) => row.forEach((val, c) => {
                this.ctx.fillStyle = val === 0 ? '#222' : (val === 1 ? '#FF5F57' : '#FEBC2E');
                this.ctx.beginPath(); this.ctx.arc(c * 57 + 28, r * 65 + 40, 25, 0, Math.PI * 2); this.ctx.fill();
            }));
        } else if (this.type === 'sumo') {
            this.ctx.strokeStyle = '#fff'; this.ctx.beginPath(); this.ctx.arc(200, 200, 180, 0, Math.PI * 2); this.ctx.stroke();
            const drawS = (p) => { this.ctx.fillStyle = p.color; this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); this.ctx.fill(); };
            drawS(this.p1); drawS(this.p2);
        } else if (this.type === 'tanks') {
            const drawT = (p) => {
                this.ctx.save(); this.ctx.translate(p.x, p.y); this.ctx.rotate(p.angle);
                this.ctx.fillStyle = p.color; this.ctx.fillRect(-15, -10, 30, 20);
                this.ctx.fillStyle = '#333'; this.ctx.fillRect(0, -2, 20, 4); this.ctx.restore();
            };
            drawT(this.p1); drawT(this.p2);
        } else if (this.type === 'maze') {
            this.ctx.fillStyle = '#28C840'; this.ctx.fillRect(this.p1.x, this.p1.y, 10, 10);
            this.ctx.fillStyle = '#0A84FF'; this.ctx.fillRect(this.p2.x, this.p2.y, 10, 10);
            this.ctx.fillStyle = '#fff'; this.ctx.fillRect(390, 0, 10, 400);
        } else if (this.type === 'memory') {
            this.cards.forEach((c, i) => {
                const x = (i % 4) * 100, y = Math.floor(i / 4) * 100;
                this.ctx.fillStyle = (this.revealed.includes(i) || this.found.includes(i)) ? '#fff' : '#333';
                this.ctx.fillRect(x + 5, y + 5, 90, 90);
                if (this.revealed.includes(i) || this.found.includes(i)) {
                    this.ctx.fillStyle = '#000'; this.ctx.font = '30px Arial';
                    this.ctx.fillText(c, x + 40, y + 60);
                }
            });
        }
    }

    stop() { this.running = false; }
}
