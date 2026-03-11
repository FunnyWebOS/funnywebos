class FlappyGame {
    constructor(canvas) {
        this.ctx = canvas.getContext('2d');
        this.bird = { x: 50, y: 150, v: 0, gravity: 0.15, jump: -4 };
        this.pipes = [];
        this.score = 0;
        this.running = true;
        this.canvas = canvas;
        this.handleResize();

        window.addEventListener('keydown', this.handleKey.bind(this));
        this.animate();
    }

    handleResize() {
        this.canvas.width = 400;
        this.canvas.height = 400;
    }

    handleKey(e) {
        if (!this.running) return;
        if (e.key === ' ' || e.key === 'ArrowUp') this.bird.v = this.bird.jump;
    }

    animate() {
        if (!this.running) return;
        this.update();
        this.draw();
        requestAnimationFrame(this.animate.bind(this));
    }

    update() {
        this.bird.v += this.bird.gravity;
        this.bird.y += this.bird.v;

        if (this.pipes.length === 0 || this.pipes[this.pipes.length - 1].x < 250) {
            this.pipes.push({ x: 400, gapY: 100 + Math.random() * 200, width: 50, gap: 100 });
        }

        this.pipes.forEach(p => {
            p.x -= 2;
            // Collision Pipe
            if (this.bird.x + 10 > p.x && this.bird.x - 10 < p.x + p.width) {
                if (this.bird.y - 10 < p.gapY - p.gap / 2 || this.bird.y + 10 > p.gapY + p.gap / 2) {
                    this.reset();
                }
            }
            if (p.x + p.width < 0) {
                this.pipes.shift();
                this.score++;
            }
        });

        if (this.bird.y > 400 || this.bird.y < 0) this.reset();
    }

    reset() {
        this.bird = { x: 50, y: 150, v: 0, gravity: 0.15, jump: -4 };
        this.pipes = [];
        this.score = 0;
    }

    draw() {
        this.ctx.clearRect(0, 0, 400, 400);

        // Bird
        this.ctx.fillStyle = '#f1c40f';
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#f1c40f';
        this.ctx.beginPath();
        this.ctx.arc(this.bird.x, this.bird.y, 10, 0, Math.PI * 2);
        this.ctx.fill();

        // Pipes
        this.pipes.forEach(p => {
            this.ctx.fillStyle = '#2ecc71';
            this.ctx.shadowBlur = 5;
            this.ctx.shadowColor = '#2ecc71';
            // Upper
            this.ctx.fillRect(p.x, 0, p.width, p.gapY - p.gap / 2);
            // Lower
            this.ctx.fillRect(p.x, p.gapY + p.gap / 2, p.width, 400 - (p.gapY + p.gap / 2));
        });

        this.ctx.fillStyle = 'rgba(255,255,255,0.7)';
        this.ctx.font = '16px Arial';
        this.ctx.fillText(`Score: ${this.score}`, 10, 25);
    }

    stop() {
        this.running = false;
    }
}
