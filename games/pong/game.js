// Reference game for the Forge contract. Hand-written, not generated.
const W = 960;
const H = 640;
const WIN_SCORE = 7;
const COLORS = { bg: 0x0b0f1a, player: 0x22d3ee, cpu: 0xe879f9, ball: 0xf8fafc };

const forge = (window.__FORGE__ = { ready: false, state: "menu", score: 0, lives: 0 });

let audio;
function blip(freq, ms = 60) {
  audio ??= new AudioContext();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.08, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + ms / 1000);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + ms / 1000);
}

class Pong extends Phaser.Scene {
  create() {
    const g = this.add.graphics();
    g.fillStyle(0x1e293b);
    for (let y = 10; y < H; y += 30) g.fillRect(W / 2 - 2, y, 4, 16);

    this.player = this.add.rectangle(40, H / 2, 14, 96, COLORS.player);
    this.cpu = this.add.rectangle(W - 40, H / 2, 14, 96, COLORS.cpu);
    this.ball = this.add.rectangle(W / 2, H / 2, 14, 14, COLORS.ball);
    this.trail = this.add.particles(0, 0, "__WHITE", {
      follow: this.ball, lifespan: 200, scale: { start: 6, end: 0 }, alpha: { start: 0.4, end: 0 }, frequency: 16,
    });

    const font = { fontFamily: "monospace", color: "#f8fafc" };
    this.scoreText = this.add.text(W / 2, 40, "0   0", { ...font, fontSize: "48px" }).setOrigin(0.5, 0);
    this.banner = this.add.text(W / 2, H / 2 - 40, "", { ...font, fontSize: "56px", align: "center" }).setOrigin(0.5);
    this.hint = this.add.text(W / 2, H / 2 + 40, "", { ...font, fontSize: "22px", color: "#94a3b8" }).setOrigin(0.5);

    this.keys = this.input.keyboard.addKeys("W,S,UP,DOWN,SPACE");
    this.keys.SPACE.on("down", () => {
      if (forge.state !== "playing") this.startMatch();
    });

    this.scale.on("resize", () => this.cameras.main.centerOn(W / 2, H / 2));
    this.showMenu("PONG: THE BEGINNING", "Press SPACE  ·  W/S or ↑/↓ to move");
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => (forge.ready = true));
  }

  showMenu(title, hint) {
    this.banner.setText(title).setVisible(true);
    this.hint.setText(hint).setVisible(true);
    this.resetBall(0);
  }

  startMatch() {
    this.playerScore = 0;
    this.cpuScore = 0;
    this.updateScore();
    this.banner.setVisible(false);
    this.hint.setVisible(false);
    forge.state = "playing";
    this.resetBall(Math.random() < 0.5 ? -1 : 1);
    blip(440, 120);
  }

  resetBall(dir) {
    this.ball.setPosition(W / 2, H / 2);
    const angle = Phaser.Math.FloatBetween(-0.5, 0.5);
    this.speed = 380;
    this.vel = new Phaser.Math.Vector2(Math.cos(angle) * dir, Math.sin(angle)).scale(this.speed);
  }

  updateScore() {
    this.scoreText.setText(`${this.playerScore}   ${this.cpuScore}`);
    forge.score = this.playerScore;
  }

  point(playerScored) {
    if (playerScored) this.playerScore++;
    else this.cpuScore++;
    this.updateScore();
    this.cameras.main.shake(120, 0.008);
    blip(playerScored ? 660 : 160, 200);
    if (this.playerScore >= WIN_SCORE || this.cpuScore >= WIN_SCORE) {
      const won = this.playerScore >= WIN_SCORE;
      forge.state = won ? "won" : "lost";
      this.showMenu(won ? "YOU WIN" : "CPU WINS", "Press SPACE to play again");
      return;
    }
    this.resetBall(playerScored ? 1 : -1);
  }

  bounceOff(paddle, dir) {
    const offset = Phaser.Math.Clamp((this.ball.y - paddle.y) / (paddle.height / 2), -1, 1);
    this.speed = Math.min(this.speed * 1.06, 900);
    this.vel.set(Math.cos(offset * 1.0) * dir, Math.sin(offset * 1.0)).normalize().scale(this.speed);
    this.ball.x = paddle.x + dir * (paddle.width / 2 + this.ball.width / 2 + 1);
    this.tweens.add({ targets: paddle, scaleX: 1.6, duration: 60, yoyo: true });
    blip(dir > 0 ? 520 : 390);
  }

  update(_, dtMs) {
    const dt = dtMs / 1000;
    if (forge.state !== "playing") return;

    const k = this.keys;
    const move = (k.W.isDown || k.UP.isDown ? -1 : 0) + (k.S.isDown || k.DOWN.isDown ? 1 : 0);
    this.player.y = Phaser.Math.Clamp(this.player.y + move * 520 * dt, 48, H - 48);

    const cpuStep = Phaser.Math.Clamp(this.ball.y - this.cpu.y, -1, 1) * Math.min(Math.abs(this.ball.y - this.cpu.y), 400 * dt);
    this.cpu.y = Phaser.Math.Clamp(this.cpu.y + cpuStep, 48, H - 48);

    this.ball.x += this.vel.x * dt;
    this.ball.y += this.vel.y * dt;
    if (this.ball.y < 7 || this.ball.y > H - 7) {
      this.vel.y *= -1;
      this.ball.y = Phaser.Math.Clamp(this.ball.y, 7, H - 7);
      blip(300, 40);
    }

    const hits = (p) => Math.abs(this.ball.x - p.x) < (p.width + this.ball.width) / 2 && Math.abs(this.ball.y - p.y) < (p.height + this.ball.height) / 2;
    if (this.vel.x < 0 && hits(this.player)) this.bounceOff(this.player, 1);
    if (this.vel.x > 0 && hits(this.cpu)) this.bounceOff(this.cpu, -1);

    if (this.ball.x < -20) this.point(false);
    else if (this.ball.x > W + 20) this.point(true);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: W,
  height: H,
  backgroundColor: COLORS.bg,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: Pong,
});
