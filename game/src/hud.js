// HUD: every DOM read/write lives here, so the game logic never touches the
// page directly. Elements are looked up once at construction.
import { SHOP, WEAPONS, TOTAL_ROUNDS } from './config.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), title: $('title'), shop: $('shop'), end: $('end'),
      hp: $('hp-fill'), armor: $('armor-fill'),
      round: $('round-label'), drones: $('drones-label'),
      credits: $('credits-label'), shopCredits: $('shop-credits'),
      weapon: $('weapon-name'), ammo: $('ammo-label'), reloadHint: $('reload-hint'),
      crosshair: $('crosshair'), hitmarker: $('hitmarker'),
      killfeed: $('killfeed'), banner: $('banner'),
      bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
      vignette: $('vignette'), best: $('best-line'),
      shopGrid: $('shop-grid'),
      endTitle: $('end-title'), endSub: $('end-sub'), endStats: $('end-stats'),
    };
    this.bannerTimer = 0;
    this.hitTimer = 0;
    this.vignetteTimer = 0;
    this.feed = [];
  }

  showScreen(name) {
    this.el.hud.classList.toggle('hidden', name !== 'play');
    this.el.title.classList.toggle('hidden', name !== 'title');
    this.el.shop.classList.toggle('hidden', name !== 'shop');
    this.el.end.classList.toggle('hidden', name !== 'end');
  }

  update(state) {
    const hpPct = Math.max(0, state.hp);
    this.el.hp.style.width = `${hpPct}%`;
    this.el.hp.classList.toggle('low', hpPct <= 30);
    this.el.armor.style.width = `${Math.max(0, state.armor)}%`;
    this.el.round.textContent = `ROUND ${Math.min(state.round, TOTAL_ROUNDS)} / ${TOTAL_ROUNDS}`;
    this.el.drones.textContent = `DRONES ${state.dronesLeft}`;
    this.el.credits.textContent = `${state.credits} CR`;
    const def = WEAPONS[state.weapon];
    this.el.weapon.textContent = def.name;
    const st = state.ammo;
    this.el.ammo.innerHTML = st.reloading
      ? `${st.mag} <span class="res">/ ∞</span>`
      : `${st.mag} <span class="res">/ ∞</span>`;
    this.el.reloadHint.classList.toggle('hidden', !st.reloading);
    this.el.crosshair.style.display = state.locked ? 'block' : 'none';
  }

  showBanner(title, sub = '', seconds = 2.2) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.add('show');
    this.bannerTimer = seconds;
  }

  tick(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.remove('show');
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) {
        this.el.hitmarker.style.opacity = '0';
        this.el.hitmarker.classList.remove('kill');
      }
    }
    if (this.vignetteTimer > 0) {
      this.vignetteTimer -= dt;
      this.el.vignette.style.opacity = String(Math.max(0, this.vignetteTimer / 0.5) * 0.9);
      if (this.vignetteTimer <= 0) this.el.vignette.style.opacity = '0';
    }
  }

  hitmarker(kill) {
    this.el.hitmarker.style.opacity = '1';
    this.el.hitmarker.classList.toggle('kill', kill);
    this.hitTimer = kill ? 0.3 : 0.12;
  }

  damageFlash() {
    this.el.vignette.style.opacity = '0.9';
    this.vignetteTimer = 0.5;
  }

  addKill(text) {
    const div = document.createElement('div');
    div.innerHTML = text;
    this.el.killfeed.prepend(div);
    this.feed.push(div);
    while (this.feed.length > 5) this.feed.shift().remove();
    setTimeout(() => { div.style.opacity = '0'; }, 2600);
    setTimeout(() => { div.remove(); }, 3000);
  }

  setBest(text) {
    this.el.best.textContent = text;
  }

  /** Build the shop grid; onBuy(item) and onNext() are wired by the game. */
  buildShop(game, onBuy, onNext) {
    const grid = this.el.shopGrid;
    grid.innerHTML = '';
    SHOP.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'shop-item';
      div.dataset.id = item.id;
      div.innerHTML = `<span class="key">[${i + 1}]</span><div class="name">${item.label}</div>` +
        `<div class="detail">${item.detail}</div><div class="price">${item.price} CR</div>`;
      div.addEventListener('click', () => onBuy(item));
      grid.appendChild(div);
    });
    $('next-round-btn').onclick = onNext;
    this.refreshShop(game);
  }

  refreshShop(game) {
    this.el.shopCredits.textContent = `${game.player.credits} CR`;
    for (const div of this.el.shopGrid.children) {
      const item = SHOP.find((s) => s.id === div.dataset.id);
      const owned = item.kind === 'weapon' && game.weapons.owned.has(item.id);
      div.classList.toggle('owned', owned);
      div.classList.toggle('cant', !owned && game.player.credits < item.price);
      if (owned) div.querySelector('.price').textContent = 'OWNED';
    }
  }

  showEnd(victory, stats) {
    this.el.endTitle.textContent = victory ? 'ARENA CLEARED' : 'SIGNAL LOST';
    this.el.endTitle.style.textShadow = victory
      ? '0 0 18px #19e6ff, 0 0 60px #19e6ff'
      : '0 0 18px #ff3d5e, 0 0 60px #ff3d5e';
    this.el.endSub.textContent = victory
      ? 'All five rounds cleared — the arena is yours, runner.'
      : 'The drones keep the arena. Run it back.';
    this.el.endStats.innerHTML =
      `ROUNDS CLEARED <b>${stats.rounds}</b> / ${TOTAL_ROUNDS}<br>` +
      `DRONES DOWN <b>${stats.kills}</b> · SCORE <b>${stats.score}</b><br>` +
      `CREDITS BANKED <b>${stats.credits}</b> · SHOTS FIRED <b>${stats.shots}</b> · ACCURACY <b>${stats.accuracy}%</b>`;
  }
}
