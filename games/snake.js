class SnakeGame {
    constructor(canvas) {
        this.ctx = canvas.getContext('2d');
        this.gridSize = 20;
        this.snake = [{ x: 10, y: 10 }];
        this.food = { x: 15, y: 15 };
        this.dir = { x: 0, y: 0 };
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
        this.cols = Math.floor(this.canvas.width / this.gridSize);
        this.rows = Math.floor(this.canvas.height / this.gridSize);
    }

    handleKey(e) {
        if (!this.running) return;
        switch (e.key) {
            case 'ArrowUp': if (this.dir.y === 0) this.dir = { x: 0, y: -1 }; break;
            case 'ArrowDown': if (this.dir.y === 0) this.dir = { x: 0, y: 1 }; break;
            case 'ArrowLeft': if (this.dir.x === 0) this.dir = { x: -1, y: 0 }; break;
            case 'ArrowRight': if (this.dir.x === 0) this.dir = { x: 1, y: 0 }; break;
        }
    }

    animate() {
        if (!this.running) return;
        setTimeout(() => {
            this.update();
            this.draw();
            requestAnimationFrame(this.animate.bind(this));
        }, 100);
    }

    update() {
        if (this.dir.x === 0 && this.dir.y === 0) return;

        const next = {
            x: this.snake[0].x + this.dir.x,
            y: this.snake[0].y + this.dir.y
        };

        // Collision Check
        if (next.x < 0 || next.x >= this.cols || next.y < 0 || next.y >= this.rows ||
            this.snake.some(s => s.x === next.x && s.y === next.y)) {
            this.reset();
            return;
        }

        this.snake.unshift(next);
        if (next.x === this.food.x && next.y === this.food.y) {
            this.score += 10;
            this.placeFood();
        } else {
            this.snake.pop();
        }
    }

    placeFood() {
        this.food = {
            x: Math.floor(Math.random() * this.cols),
            y: Math.floor(Math.random() * this.rows)
        };
    }

    reset() {
        this.snake = [{ x: 10, y: 10 }];
        this.dir = { x: 0, y: 0 };
        this.score = 0;
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Snake
        this.snake.forEach((s, idx) => {
            this.ctx.fillStyle = idx === 0 ? '#27c93f' : '#2ecc71';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = '#2ecc71';
            this.ctx.beginPath();
            this.ctx.roundRect(s.x * this.gridSize, s.y * this.gridSize, this.gridSize - 2, this.gridSize - 2, 5);
            this.ctx.fill();
        });

        // Draw Food
        this.ctx.fillStyle = '#ff5f56';
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = '#ff5f56';
        this.ctx.beginPath();
        this.ctx.arc(this.food.x * this.gridSize + this.gridSize / 2, this.food.y * this.gridSize + this.gridSize / 2, this.gridSize / 2 - 2, 0, Math.PI * 2);
        this.ctx.fill();

        // Score
        this.ctx.fillStyle = 'rgba(255,255,255,0.7)';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.shadowBlur = 0;
        this.ctx.fillText(`Score: ${this.score}`, 10, 25);
    }

    stop() {
        this.running = false;
    }
}
