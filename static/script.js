// ------------------------------
// 将棋 Web アプリ用クライアントスクリプト
// 盤面描画、操作、通信、棋譜記録
// ------------------------------

let selected = null;
let boardState = [];
let hands = { black: {}, white: {} };
let selectedHandPiece = null;
let moveCount = 0;
const kifuLog = [];
let lastMoveHighlighted = null; // 最後に指された手を保持
let isPlayerTurn = true; // プレイヤーのターンかどうか

// ターン表示を更新
function updateTurnIndicator() {
  const indicator = document.getElementById("turn-indicator");
  if (isPlayerTurn) {
    indicator.textContent = "あなたの番です";
  } else {
    indicator.textContent = "AIが考慮中です...";
  }
}

const fileMap = { 0: "９", 1: "８", 2: "７", 3: "６", 4: "５", 5: "４", 6: "３", 7: "２", 8: "１" };
const rankMap = { 0: "一", 1: "二", 2: "三", 3: "四", 4: "五", 5: "六", 6: "七", 7: "八", 8: "九" };

// 盤面座標を人間向け表示に変換
function usiToHuman(usiSq) {
  const file = parseInt(usiSq[0]);
  const rank = "abcdefghi".indexOf(usiSq[1]) + 1;
  return `${file}${rank}`;
}

// USI形式 → 棋譜表記へ変換
function usiToKifu(usi, pieceCode, isGote, fromSq = null) {
  const file = parseInt(usi[2]);
  const rankIndex = "abcdefghi".indexOf(usi[3]);
  const toPos = file + "一二三四五六七八九"[rankIndex];
  const turnSymbol = isGote ? "△" : "▲";
  const src = fromSq ? `(${usiToHuman(fromSq)})` : "(打)";

  // pieceSymbol関数を使って日本語名を取得
  let pieceName = pieceSymbol(pieceCode);

  // もし、この指し手で成った場合（USIの末尾が'+'）で、
  // かつpieceSymbolが成る前の駒の名前を返している場合（例: '歩'）
  // にのみ'成'を追加する。
  // pieceSymbolが既に成駒の名前（例: 'と'）を返している場合は追加しない。
  if (usi.length === 5 && usi[4] === "+") {
    const unpromotedPieceCode = pieceCode.startsWith("+") ? pieceCode.substring(1) : pieceCode;
    if (["P", "L", "N", "S", "B", "R"].includes(unpromotedPieceCode.toUpperCase())) {
        // 既に成駒の日本語名になっている場合は追加しない
        if (!["と", "成香", "成桂", "成銀", "馬", "竜"].includes(pieceName)) {
            pieceName += "成";
        }
    }
  }

  moveCount += 1;
  return `${moveCount} ${turnSymbol}${toPos}${pieceName}${src}`;
}

// 棋譜ログを表示エリアに追加
function appendKifu(usi, piece, isGote, fromSq = null) {
  const line = usiToKifu(usi, piece, isGote, fromSq);
  kifuLog.push(line);
  const log = document.getElementById("kifu-log");
  if (log) log.innerText = kifuLog.join("\n");
}

// 駒の記号 → 日本語名に変換
function pieceSymbol(sfenPieceCode) {
  const pieceMap = {
    P: "歩", L: "香", N: "桂", S: "銀", G: "金", B: "角", R: "飛", K: "王",
    p: "歩", l: "香", n: "桂", s: "銀", g: "金", b: "角", r: "飛", k: "玉",
    "+P": "と", "+L": "成香", "+N": "成桂", "+S": "成銀", "+B": "馬", "+R": "竜",
    "+p": "と", "+l": "成香", "+n": "成桂", "+s": "成銀", "+b": "馬", "+r": "竜"
  };
  return pieceMap[sfenPieceCode] || "?";
}

// SFEN → 内部データ構造に変換
function parseSFEN(sfen) {
  const rows = sfen.split("/");
  const board = [];
  for (let row of rows) {
    const parsedRow = [];
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (!isNaN(char)) {
        for (let j = 0; j < parseInt(char); j++) parsedRow.push(null);
      } else {
        let gote = char === char.toLowerCase();
        let pieceCode = char;
        if (char === "+") {
          i++;
          pieceCode = row[i];
          gote = pieceCode === pieceCode.toLowerCase();
          pieceCode = "+" + pieceCode;
        }
        const pieceMap = {
          P: "歩", L: "香", N: "桂", S: "銀", G: "金", B: "角", R: "飛", K: "王",
          p: "歩", l: "香", n: "桂", s: "銀", g: "金", b: "角", r: "飛", k: "玉",
          "+P": "と", "+L": "成香", "+N": "成桂", "+S": "成銀", "+B": "馬", "+R": "竜",
          "+p": "と", "+l": "成香", "+n": "成桂", "+s": "成銀", "+b": "馬", "+r": "竜"
        };
        parsedRow.push({ piece: pieceCode, gote }); // SFEN pieceCodeを直接保存
      }
    }
    board.push(parsedRow);
  }
  return board;
}

// 現在の盤面を取得
async function fetchBoardState() {
  try {
    const res = await fetch("/board");
    const data = await res.json();
    boardState = parseSFEN(data.sfen.split(" ")[0]);
    hands = data.hands;
    drawBoard();
    drawHands();
    updateTurnIndicator();
  } catch (err) {
    console.error("盤面の取得に失敗:", err);
  }
}

// 盤面を描画
function drawBoard() {
  console.log("Drawing board with boardState:", boardState); // 追加
  const board = document.getElementById("board");
  board.innerHTML = "";
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.x = x;
      cell.dataset.y = y;
      const data = boardState[y][x];
      if (data) {
        // 画像表示とテキスト表示の切り替え
        const useImages = false; // ここをfalseにするとテキスト表示に戻ります

        if (useImages) {
          const img = document.createElement("img");
          // 小文字の駒（後手）も考慮してファイル名を生成
          const pieceFileName = data.piece.toLowerCase();
          img.src = `static/images/pieces/${pieceFileName}.png`; // 画像パス
          img.alt = data.piece; // 代替テキスト
          img.className = "piece-image"; // CSSクラスを追加
          if (data.gote) img.classList.add("gote");
          img.draggable = true; // ドラッグ可能にする
          img.addEventListener("dragstart", (e) => onDragStart(e, x, y));
          cell.appendChild(img);
        } else {
          cell.textContent = pieceSymbol(data.piece);
          if (data.gote) cell.classList.add("gote");
          cell.draggable = true; // ドラッグ可能にする
          cell.addEventListener("dragstart", (e) => onDragStart(e, x, y));
        }
      }
      // 最後の指し手ハイライト
      if (lastMoveHighlighted && lastMoveHighlighted.x === x && lastMoveHighlighted.y === y) {
        cell.classList.add("player-move"); // player-moveクラスを流用
      }
      cell.addEventListener("click", () => onCellClick(x, y));
      // ドロップイベントリスナーを追加
      cell.addEventListener("dragover", onDragOver);
      cell.addEventListener("drop", (e) => onDrop(e, x, y));
      cell.addEventListener("dragleave", onDragLeave);
      board.appendChild(cell);
    }
  }
}

// ドラッグ開始時の処理
let draggedFrom = null; // ドラッグ元の座標を保持
function onDragStart(e, x, y) {
  if (!isPlayerTurn) {
    e.preventDefault(); // プレイヤーのターンでなければドラッグを無効化
    return;
  }
  const pieceData = boardState[y][x];
  if (pieceData && !pieceData.gote) { // 先手の駒のみドラッグ可能
    draggedFrom = { x, y };
    e.dataTransfer.setData("text/plain", JSON.stringify({ x, y }));
    e.dataTransfer.effectAllowed = "move";
    clearHighlights(); // ドラッグ開始時にハイライトをクリア
    highlightLegalMoves(x, y); // ドラッグ元の駒の合法手をハイライト
  } else {
    e.preventDefault(); // 後手の駒や空のセルはドラッグ不可
  }
}

// ドラッグ中の処理
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  // ドロップ可能なセルに視覚的なフィードバックを与える
  if (e.target.classList.contains("cell") && e.target.classList.contains("highlight-move")) {
    e.target.classList.add("drag-over");
  }
}

// ドラッグがセルから離れた時の処理
function onDragLeave(e) {
  if (e.target.classList.contains("cell")) {
    e.target.classList.remove("drag-over");
  }
}

// ドロップ時の処理
async function onDrop(e, toX, toY) {
  e.preventDefault();
  e.target.classList.remove("drag-over");

  const to = `${9 - toX}${String.fromCharCode(97 + toY)}`;
  let moveData = null;

  if (selectedHandPiece) { // 持ち駒をドロップする場合
    moveData = { from: `${selectedHandPiece.type}*`, to };
    selectedHandPiece = null; // 持ち駒選択状態をリセット
  } else if (draggedFrom) { // 盤上の駒を移動する場合
    const fromX = draggedFrom.x;
    const fromY = draggedFrom.y;

    const from = `${9 - fromX}${String.fromCharCode(97 + fromY)}`;
    const pieceObj = boardState[fromY][fromX];
    let promote = false;

    if (pieceObj && isPromotable(pieceObj.piece)) {
      if (inPromotionZone(fromY) || inPromotionZone(toY)) {
        promote = await askForPromotion();
      }
    }
    moveData = { from, to, promote };
    draggedFrom = null; // ドラッグ状態をリセット
  }

  if (moveData) {
    await sendPlayerMove(moveData);
  }
  clearHighlights(); // ハイライトをクリア
}

// ドラッグ終了時の処理
function onDragEnd(e) {
  draggedFrom = null; // ドラッグ状態をリセット
  clearHighlights(); // ハイライトをクリア
}

// 持ち駒を描画
function drawHands() {
  ["white", "black"].forEach(side => {
    const el = document.getElementById(`${side}-hands`);
    el.innerHTML = "";
    Object.entries(hands[side]).forEach(([k, v]) => {
      if (v > 0) {
        const div = document.createElement("div");
        div.className = "piece-hand"; // 新しいクラス名

        const useImages = false; // ここをfalseにするとテキスト表示に戻ります

        if (useImages) {
          const img = document.createElement("img");
          const pieceFileName = k.toLowerCase();
          img.src = `static/images/pieces/${pieceFileName}.png`; // 画像パス
          img.alt = k; // 代替テキスト
          img.className = "piece-image"; // CSSクラスを追加
          img.draggable = true; // ドラッグ可能にする
          img.addEventListener("dragstart", (e) => onHandDragStart(e, k));
          div.appendChild(img);
        } else {
          const pieceText = pieceSymbol(k); // pieceSymbol関数を使用
          const textNode = document.createTextNode(pieceText);
          div.appendChild(textNode);
          div.draggable = true; // ドラッグ可能にする
          div.addEventListener("dragstart", (e) => onHandDragStart(e, k));
        }

        const countSpan = document.createElement("span");
        countSpan.textContent = `×${v}`;
        div.appendChild(countSpan);
        div.addEventListener("click", () => {
          selectedHandPiece = { side, type: k };
          // 盤上の選択を解除
          selected = null;
          clearHighlights(); // 持ち駒選択時にハイライトをクリア
          // 持ち駒の選択をハイライト
          document.querySelectorAll(".hands .piece-hand").forEach(p => p.classList.remove("selected-hand"));
          div.classList.add("selected-hand");
        });
        el.appendChild(div);
      }
    });
  });
}

// 持ち駒のドラッグ開始時の処理
function onHandDragStart(e, pieceType) {
  if (!isPlayerTurn) {
    e.preventDefault();
    return;
  }
  selectedHandPiece = { side: "black", type: pieceType }; // プレイヤーは常に先手
  e.dataTransfer.setData("text/plain", JSON.stringify({ type: pieceType }));
  e.dataTransfer.effectAllowed = "move";
  clearHighlights();
  // 持ち駒をドラッグした際の合法手ハイライトは、ドロップ時に判断するためここでは行わない
}

// 成れる駒か？

// 成れる駒か？
function isPromotable(piece) {
  // SFENシンボルで判定
  const promotableSFEN = ["P", "L", "N", "S", "B", "R"];
  // 小文字（後手）の場合も考慮
  return promotableSFEN.includes(piece.toUpperCase());
}

// 成りゾーン（敵陣）か？
function inPromotionZone(y) {
  return y <= 2;
}

  // セルクリック時の処理
async function onCellClick(x, y) {
  if (!isPlayerTurn) return; // プレイヤーのターンでなければ何もしない

  aiLastMove = null;
  const to = `${9 - x}${String.fromCharCode(97 + y)}`;

  // ハイライトをクリア
  clearHighlights();

  // 打ち駒処理
  if (selectedHandPiece) {
    const moveData = { from: `${selectedHandPiece.type}*`, to };
    await sendPlayerMove(moveData);
    selectedHandPiece = null; // 持ち駒選択状態をリセット
    return;
  }

  // 通常移動処理
  if (selected) {
    const [fromX, fromY] = selected;
    if (fromX === x && fromY === y) {
      selected = null;
      drawBoard();
      return;
    }

    const from = `${9 - fromX}${String.fromCharCode(97 + fromY)}`;
    const pieceObj = boardState[fromY][fromX];
    let promote = false;

    if (pieceObj && isPromotable(pieceObj.piece)) {
      if (inPromotionZone(fromY) || inPromotionZone(y)) {
        promote = await askForPromotion();
      }
    }

    const moveData = { from, to, promote };
    await sendPlayerMove(moveData);

    selected = null;
  } else {
    // 駒が選択されていない場合、選択して合法手をハイライト
    const clickedPiece = boardState[y][x];
    if (clickedPiece && !clickedPiece.gote) { // 先手の駒のみ選択可能
      selected = [x, y];
      document.querySelectorAll(".cell").forEach(c => c.classList.remove("selected"));
      document.querySelector(`.cell[data-x='${x}'][data-y='${y}']`).classList.add("selected");
      highlightLegalMoves(x, y);
    }
  }
}

// AIの指し手を取得・反映する関数
async function getAiMove() {
  try {
    const res = await fetch("/get_ai_move", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    const data = await res.json();
    console.log('Response from /get_ai_move:', data);

    if (!res.ok) {
      alert(`HTTP ${res.status} エラー: ${data.error}`);
      isPlayerTurn = true; // エラー時はターンを戻す
      updateTurnIndicator();
      return;
    }

    if (data.ai_move) {
      handleAIMove(data.ai_move, data.ai_moved_piece);
      // AIの指し手後の盤面更新
      boardState = parseSFEN(data.board_sfen.split(" ")[0]);
      hands = data.hands;
      drawBoard();
      drawHands();
      console.log('Board re-rendered after AI move.');
      
    }

    if (data.game_over) {
      alert(`詰みです！${data.winner}の勝ち`);
      isPlayerTurn = false; // ゲーム終了
    } else {
      isPlayerTurn = true; // プレイヤーのターンに戻す
    }

    updateTurnIndicator();

  } catch (err) {
    console.error("AIの指し手取得失敗:", err);
    isPlayerTurn = true; // エラー時はターンを戻す
    updateTurnIndicator();
  }
  finally {
    selected = null;
    selectedHandPiece = null;
    document.querySelectorAll(".piece").forEach(p => p.classList.remove("selected-hand"));
  }
}

// ハイライトをクリアする関数
function clearHighlights() {
  document.querySelectorAll(".highlight-move").forEach(cell => {
    cell.classList.remove("highlight-move");
  });
  document.querySelectorAll(".selected").forEach(cell => {
    cell.classList.remove("selected");
  });
  document.querySelectorAll(".selected-hand").forEach(piece => {
    piece.classList.remove("selected-hand");
  });
}

// 合法手をハイライト表示する関数
async function highlightLegalMoves(x, y) {
  const fromSquareUsi = `${9 - x}${String.fromCharCode(97 + y)}`;
  console.log("Requesting legal moves for square:", fromSquareUsi); // 追加
  try {
    const res = await fetch(`/legal_moves/${fromSquareUsi}`);
    const data = await res.json();
    if (data.legal_moves) {
      data.legal_moves.forEach(moveUsi => {
        const toX = 9 - parseInt(moveUsi[0]);
        const toY = String.fromCharCode(97 + moveUsi[1]).charCodeAt(0) - 97; // 'a' -> 0, 'b' -> 1 ...
        const cell = document.querySelector(`.cell[data-x='${toX}'][data-y='${toY}']`);
        if (cell) {
          cell.classList.add("highlight-move");
        }
      });
    }
  } catch (err) {
    console.error("合法手の取得に失敗:", err);
  }
}

// AIの手の棋譜反映
function handleAIMove(usi, movedPieceSymbol) {
  playerLastMove = null; // プレイヤーの前の指し手ハイライトをクリア
  let pieceForKifu;
  if (usi.includes("*")) {
    // 持ち駒を打つ場合、usiの最初の文字が駒のSFENシンボル
    pieceForKifu = usi[0];
    appendKifu(usi, pieceForKifu, true, null);
  } else {
    // 盤上の駒を動かす場合、movedPieceSymbolがSFENシンボル
    pieceForKifu = movedPieceSymbol;
    appendKifu(usi, pieceForKifu, true, usi.slice(0, 2));
  }

  // AIの指し手があったマスをハイライトするためにlastMoveHighlightedを設定
  // USI形式のto_squareからx, y座標を計算
  const toSquareUsi = usi.slice(-2); // 例: "3d"
  const toX = 9 - parseInt(toSquareUsi[0]); // ファイル (筋)
  const toY = "abcdefghi".indexOf(toSquareUsi[1]); // ランク (段)
  lastMoveHighlighted = { x: toX, y: toY };
}

// リセット処理
async function resetGame() {
  try {
    const res = await fetch("/reset", { method: "POST" });
    if (res.ok) {
      moveCount = 0;
      kifuLog.length = 0;
      document.getElementById("kifu-log").innerText = "";
      isPlayerTurn = true;
      lastMoveHighlighted = null; // 最後の指し手ハイライトをクリア
      clearHighlights(); // リセット時にハイライトをクリア
      await fetchBoardState();
    }
  } catch (err) {
    console.error("リセット失敗:", err);
  }
}

document.addEventListener("DOMContentLoaded", fetchBoardState);

// 成り確認ダイアログを表示
function askForPromotion() {
  return new Promise(resolve => {
    const dialog = document.getElementById("promotion-dialog");
    dialog.style.display = "flex";

    document.getElementById("promote-yes").onclick = () => {
      dialog.style.display = "none";
      resolve(true);
    };
    document.getElementById("promote-no").onclick = () => {
      dialog.style.display = "none";
      resolve(false);
    };
  });
}

// サーバーにプレイヤーの手を送信
async function sendPlayerMove(moveData) {
  console.log('sendPlayerMove called with:', moveData);
  clearHighlights(); // ハイライトをクリア
  aiLastMove = null; // AIの前の指し手ハイライトをクリア

  try {
    const res = await fetch("/player_move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(moveData)
    });

    const data = await res.json();
    console.log('Response from /player_move:', data);

    if (!res.ok) {
      alert(`HTTP ${res.status} エラー: ${data.error}`);
      isPlayerTurn = true; // エラー時はターンを戻す
      updateTurnIndicator();
      return;
    }

    // プレイヤーの指し手を棋譜に追加
    const fromSq = moveData.from.includes("*") ? null : moveData.from;
    const pieceCodeForKifu = fromSq ? boardState["abcdefghi".indexOf(fromSq[1])][9 - parseInt(fromSq[0])].piece : moveData.from[0];
    let fullUsi = moveData.from.includes("*") ? `${moveData.from}${moveData.to}` : `${moveData.from}${moveData.to}`;
    if (moveData.promote) fullUsi += "+";
    appendKifu(fullUsi, pieceCodeForKifu, false, fromSq);

    // 盤面更新（プレイヤーの指し手を反映）
    // プレイヤーの指し手があったマスをハイライトするためにlastMoveHighlightedを設定
    const toSquareUsi = moveData.to; // 例: "3d"
    const toX = 9 - parseInt(toSquareUsi[0]); // ファイル (筋)
    const toY = "abcdefghi".indexOf(toSquareUsi[1]); // ランク (段)
    lastMoveHighlighted = { x: toX, y: toY };

    // 盤面更新（プレイヤーの指し手を反映）
    boardState = parseSFEN(data.board_sfen.split(" ")[0]);
    hands = data.hands;
    drawBoard();
    drawHands();
    console.log('Board re-rendered after player move.');

    // プレイヤーの指し手でゲームが終了した場合
    if (data.game_over) {
      alert(`詰みです！${data.winner}の勝ち`);
      isPlayerTurn = false; // ゲーム終了
      updateTurnIndicator();
      return;
    }

    // AIのターンに切り替え
    isPlayerTurn = false; 
    updateTurnIndicator(); // 「AIが考慮中です...」と表示

    // AIの指し手を取得
    await getAiMove();

  } catch (err) {
    console.error("通信失敗:", err);
    isPlayerTurn = true; // エラー時はターンを戻す
    updateTurnIndicator();
  }
  finally {
    selected = null;
    selectedHandPiece = null;
    document.querySelectorAll(".piece").forEach(p => p.classList.remove("selected-hand"));
  }
}