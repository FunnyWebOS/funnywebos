class OnlineGames {
    constructor(canvas, type, winData) {
        this.ctx = canvas.getContext('2d');
        this.canvas = canvas;
        this.type = type;
        this.winData = winData;
        this.running = true;
        this.data = { x: 200, y: 200 };
        this.remoteData = { x: 200, y: 200 };
        this.canvas.width = 400;
        this.canvas.height = 400;

        window.addEventListener('keydown', e => this.handleInput(e));
        if (type === 'draw') {
            this.canvas.onmousemove = (e) => this.handleDraw(e);
            this.drawHistory = [];
        }

        this.loop();
    }

    handleInput(e) {
        if (!this.running) return;
        let moved = false;
        if (e.key === 'ArrowUp') { this.data.y -= 5; moved = true; }
        if (e.key === 'ArrowDown') { this.data.y += 5; moved = true; }
        if (e.key === 'ArrowLeft') { this.data.x -= 5; moved = true; }
        if (e.key === 'ArrowRight') { this.data.x += 5; moved = true; }

        if (moved && this.winData.conn) {
            this.winData.conn.send({ type: 'move', pos: this.data });
        }
    }

    handleDraw(e) {
        if (e.buttons !== 1) return;
        const rect = this.canvas.getBoundingClientRect();
        const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        this.drawHistory.push(pos);
        if (this.winData.conn) {
            this.winData.conn.send({ type: 'draw', pos: pos });
        }
    }

    onRemoteData(data) {
        if (data.type === 'move') {
            this.remoteData = data.pos;
        } else if (data.type === 'draw') {
            this.drawHistory.push(data.pos);
        }
    }

    loop() {
        if (!this.running) return;
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    update() { }

    draw() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, 400, 400);

        if (this.type === 'draw') {
            this.ctx.fillStyle = '#0A84FF';
            this.drawHistory.forEach(p => {
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
                this.ctx.fill();
            });
        } else {
            // Local Player
            this.ctx.fillStyle = '#28C840';
            this.ctx.beginPath();
            this.ctx.arc(this.data.x, this.data.y, 10, 0, Math.PI * 2);
            this.ctx.fill();

            // Remote Player
            this.ctx.fillStyle = '#FF5F57';
            this.ctx.beginPath();
            this.ctx.arc(this.remoteData.x, this.remoteData.y, 10, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = 'white';
            this.ctx.font = '12px Arial';
            this.ctx.fillText("You (Green) vs Friend (Red)", 10, 20);
        }
    }

    stop() {
        this.running = false;
        if (this.winData.peer) this.winData.peer.destroy();
    }
}
