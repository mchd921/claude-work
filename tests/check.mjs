// ブロック崩しの自動チェック。使い方: node tests/check.mjs
// ブラウザの代わりに「にせもののブラウザ」を用意して index.html のスクリプトを動かし、
// 決まったルールが守られているかを確かめる。失敗したら終了コード1で終わる。
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('NG: index.html に <script> が見つからない'); process.exit(1); }
const code = m[1];

let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`OK  ${name}`); }
  catch (e) { failed++; console.log(`NG  ${name}\n    → ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ---------- にせもののブラウザ ----------
function makeBrowser({ storageThrows = false } = {}) {
  const listeners = {};
  const on = (t, fn) => { (listeners[t] ||= []).push(fn); };
  // 描画命令はすべて「何もしない」で受け流す
  const noop = new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : noop),
    apply: () => noop,
    set: () => true,
  });
  const canvas = {
    style: {}, width: 0, height: 0,
    getContext: () => noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 640 }),
  };
  let now = 0, rafCb = null;
  const storage = {};
  const win = {
    innerWidth: 480, innerHeight: 640, devicePixelRatio: 1,
    addEventListener: on,
    requestAnimationFrame: (cb) => { rafCb = cb; },
    performance: { now: () => now },
    setTimeout: () => 0,
    document: { getElementById: () => canvas, addEventListener: on, hidden: false },
    Math, Number, String, Array, Object,
  };
  Object.defineProperty(win, 'localStorage', {
    get() {
      if (storageThrows) throw new Error('SecurityError');
      return { getItem: (k) => storage[k] ?? null, setItem: (k, v) => { storage[k] = String(v); } };
    },
  });
  win.window = win;
  vm.createContext(win);
  vm.runInContext(code, win);
  const game = win.__breakout;
  return {
    game, storage,
    // 1フレーム進める（ms は前のフレームからの経過時間。16.7 で 60fps）
    frame(ms = 1000 / 60) { now += ms; const cb = rafCb; rafCb = null; cb(now); },
    fire(type, ev = {}) { for (const fn of listeners[type] || []) fn({ preventDefault() {}, ...ev }); },
    tap() { this.fire('pointerdown', { clientX: game.paddle.x, clientY: 600, pointerType: 'touch' }); },
    // パドルをボールの下に動かす（完璧なプレイヤー）。真ん中で受けると真上に跳ね続けるので、
    // 受ける位置を少しずつずらす（パドル幅の半分45pxより内側なので必ず当たる）
    follow(t) { this.fire('pointermove', { clientX: game.ball.x + Math.sin(t * 0.01) * 30, pointerType: 'mouse' }); },
  };
}

// ---------- チェック項目 ----------
check('文法エラーがない (node --check)', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'breakout-')), 'game.js');
  writeFileSync(f, code);
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { throw new Error(String(e.stderr).split('\n').slice(0, 5).join('\n    ')); }
});

check('起動して10秒動かしても例外が出ない', () => {
  const b = makeBrowser();
  for (let i = 0; i < 600; i++) b.frame();
  assert(b.game.state === 'title', `最初は title のはずが ${b.game.state}`);
});

check('タップで title → ready → play と進む', () => {
  const b = makeBrowser();
  b.frame(); b.tap();
  assert(b.game.state === 'ready', `1回目のタップ後は ready のはずが ${b.game.state}`);
  b.frame(); b.tap();
  assert(b.game.state === 'play', `2回目のタップ後は play のはずが ${b.game.state}`);
});

check('どのステージでもブロックが画面内に収まり、1個以上ある', () => {
  const b = makeBrowser();
  const { W, H } = b.game;
  for (let lv = 1; lv <= 20; lv++) {
    b.game.level = lv; b.game.buildLevel();
    const bs = b.game.bricks;
    assert(bs.length > 0, `ステージ${lv}のブロックが0個`);
    for (const k of bs) {
      assert(k.x >= 0 && k.x + 52 <= W && k.y >= 0 && k.y < H / 2,
        `ステージ${lv}に画面外のブロック (${k.x}, ${k.y})`);
      assert(k.hp === 1 || k.hp === 2, `ステージ${lv}に hp=${k.hp} のブロック`);
    }
  }
});

for (const [label, ms] of [['60fps', 1000 / 60], ['20fps（重い端末）', 50]]) {
  check(`完璧に操作すれば、${label}でもミスせずステージ1をクリアできる`, () => {
    const b = makeBrowser();
    const g = b.game;
    b.frame(); b.tap(); b.frame(); b.tap();
    for (let i = 0; i < 60 * 60 * 5 && g.state === 'play'; i++) {
      b.follow(i); b.frame(ms);
      assert(g.ball.x >= g.ball.r - 0.01 && g.ball.x <= g.W - g.ball.r + 0.01,
        `ボールが横の壁を抜けた (x=${g.ball.x.toFixed(1)})`);
      assert(Math.hypot(g.ball.vx, g.ball.vy) <= g.MAX_SPEED + 0.01, 'ボールが MAX_SPEED を超えた');
    }
    assert(g.lives === 3, `ライフが減った (残り${g.lives})`);
    assert(g.state === 'clear', `5分以内にクリアできなかった (state=${g.state}, 残りブロック${g.bricks.filter((k) => k.alive).length})`);
  });
}

check('ボールが速くなっても MAX_SPEED を超えない（ステージ10で長く打ち続ける）', () => {
  const b = makeBrowser();
  const g = b.game;
  b.frame(); b.tap();
  g.level = 10; g.buildLevel();
  b.frame(); b.tap();
  let top = 0, afterMax = 0;
  // 上限に届いてからも10秒打ち続けて、超えないことを確かめる
  for (let i = 0; i < 60 * 60 * 10 && afterMax < 600; i++) {
    if (top >= g.MAX_SPEED - 0.01) afterMax++;
    if (g.state === 'clear') { b.tap(); b.frame(); b.tap(); } // 次のステージへ進んで発射
    assert(g.state === 'play', `途中で state=${g.state} になった`);
    b.follow(i); b.frame();
    top = Math.max(top, Math.hypot(g.ball.vx, g.ball.vy));
    assert(top <= g.MAX_SPEED + 0.01, `速さ ${top.toFixed(2)} が MAX_SPEED(${g.MAX_SPEED}) を超えた`);
  }
  assert(top > g.MAX_SPEED - 0.5, `上限近くまで加速しなかった（最高 ${top.toFixed(2)}）。このテストが上限を試せていない`);
});

check('3回ミスでゲームオーバー → タップで最初からやり直せる', () => {
  const b = makeBrowser();
  const g = b.game;
  b.frame(); b.tap();
  for (let miss = 0; miss < 3; miss++) {
    b.frame(); b.tap(); // 発射
    // パドルを左端に置いたまま、ボールが落ちるのを待つ
    for (let i = 0; i < 60 * 60 && g.state === 'play'; i++) {
      b.fire('pointermove', { clientX: g.ball.x < 240 ? 470 : 10, pointerType: 'mouse' });
      b.frame();
    }
  }
  assert(g.state === 'over', `3回ミスしたのに state=${g.state}`);
  assert(g.lives === 0, `ゲームオーバーなのにライフが ${g.lives}`);
  b.tap();
  assert(g.state === 'ready' && g.lives === 3 && g.score === 0 && g.level === 1,
    `やり直し後の状態がおかしい (state=${g.state}, lives=${g.lives}, score=${g.score}, level=${g.level})`);
});

check('localStorage が使えない環境（プライベートブラウズ等）でも動く', () => {
  const b = makeBrowser({ storageThrows: true });
  b.frame(); b.tap(); b.frame(); b.tap();
  for (let i = 0; i < 300; i++) b.frame();
});

console.log(failed ? `\n${failed}件 失敗` : '\nすべてOK');
process.exit(failed ? 1 : 0);
