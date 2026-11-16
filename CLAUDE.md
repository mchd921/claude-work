# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト

ブラウザで遊ぶブロック崩しゲーム。HTML・CSS・JavaScriptはすべて `index.html` 1ファイルに入っていて、依存ライブラリ・ビルド・テストはない。持ち主は主にiPadのSafariで遊ぶので、タッチ操作とiPadの画面サイズを最優先にする。画面に出す文字は日本語。

## 公開

`main` ブランチのルートが GitHub Pages（https://mchd921.github.io/claude-work/ ）で公開されている。**`main` にプッシュするとそのまま公開される**ので、プッシュ前に必ずユーザーに確認する。Codespacesの `gh` トークンではPagesの設定を変更できない（403になる）ので、設定変更はユーザーにGitHubの画面から操作してもらう。

## 動作確認

`index.html` を変えたら、終わりにする前に必ず次を実行し、すべてOKになることを確かめる。

```bash
node tests/check.mjs
```

文法チェックと、にせもののブラウザでゲームを動かすテスト（状態の進み方、ステージの形、スピード上限、ゲームオーバーからのやり直し、localStorageが使えない場合）を約2秒で行う。ゲームの中身は `window.__breakout`（スクリプトの末尾）から見ている。仕様を変えたときはテストも合わせて直し、新しい機能にはテストを足す。

遊び心地はブラウザでしか確認できない（`index.html` を直接開くか、PagesのURLで確認する）。

## 構成（`index.html` の中身）

- **座標系**：ゲームの処理はすべて 480×640 の固定サイズ（`W`, `H`）で行う。`resize()` が `ctx.setTransform` でウィンドウサイズとdevicePixelRatioに合わせて拡大縮小する。ポインタの位置は `toGameX`/`toGameY` で変換する。ゲームの処理に実際のピクセル数を使わないこと。
- **状態管理**：変数 `state` は `title` / `ready` / `play` / `pause` / `over` / `clear` のどれか。タップ・クリック・Space/Enter はすべて `action()` が受け取り、今の状態に応じて次に進める。`update()` と `draw()` もそれぞれ `state` で処理を分けている。
- **ゲームループ**：`requestAnimationFrame` で回す。`f` は60fpsを1とした経過時間の倍率（上限3）で、速度はすべて「60fpsの1フレームで進むピクセル数 × `f`」で計算する。ボールが速くてもブロックをすり抜けないよう、移動を約3pxずつに分けて当たり判定する。
- **当たり判定**：ブロックとは、円と矩形の最近接点で判定し、1回の分割移動で当てるのは最大1ブロック。パドルに当たった位置で跳ね返る角度が変わる（最大約60°）。ブロックに当てるたびにボールが少し速くなり、上限は `MAX_SPEED`。
- **ステージ**：`buildLevel()` が `level` の値からステージを作る。ステージが進むと段が増え、上の段に2回当てないと壊れるブロックが入り、ステージ3からはところどころ穴があく。
- **保存**：ベストスコアは `localStorage` のキー `breakout-best` に保存する。読み書きはすべて try/catch で囲んでいる。
- **効果音**：WebAudioで音をコードから作っている。iOSでは音を鳴らすのにユーザーの操作が必要なので、最初のタップのときに `unlockAudio()` で `AudioContext` を作成・再開する。
- **iOSのタッチ対策**：`touch-action: none` と、`touchmove` で `preventDefault` するリスナーの両方で、ページのスクロールや拡大を止めている。入力まわりを変えるときもこの2つは残すこと。
