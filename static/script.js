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
let aiMovePollInterval = null; // AIの指し手ポーリング用のインターバルID

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

  let pieceName = pieceSymbol(pieceCode);

  if (usi.length === 5 && usi[4] === "+") {
    const unpromotedPieceCode = pieceCode.startsWith("+") ? pieceCode.substring(1) : pieceCode;
    if (["P", "L", "N", "S", "B", "R"].includes(unpromotedPieceCode.toUpperCase())) {
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
        parsedRow.push({ piece: pieceCode, gote });
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
        cell.textContent = pieceSymbol(data.piece);
        if (data.gote) cell.classList.add("gote");
        cell.draggable = true;
        cell.addEventListener("dragstart", (e) => onDragStart(e, x, y));
      }
      if (lastMoveHighlighted && lastMoveHighlighted.x === x && lastMoveHighlighted.y === y) {
        cell.classList.add("player-move");
      }
      cell.addEventListener("click", () => onCellClick(x, y));
      cell.addEventListener("dragover", onDragOver);
      cell.addEventListener("drop", (e) => onDrop(e, x, y));
      cell.addEventListener("dragleave", onDragLeave);
      board.appendChild(cell);
    }
  }
}

let draggedFrom = null;
function onDragStart(e, x, y) {
  if (!isPlayerTurn) {
    e.preventDefault();
    return;
  }
  const pieceData = boardState[y][x];
  if (pieceData && !pieceData.gote) {
    draggedFrom = { x, y };
    e.dataTransfer.setData("text/plain", JSON.stringify({ x, y }));
    e.dataTransfer.effectAllowed = "move";
    clearHighlights();
    highlightLegalMoves(x, y);
  } else {
    e.preventDefault();
  }
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  if (e.target.classList.contains("cell") && e.target.classList.contains("highlight-move")) {
    e.target.classList.add("drag-over");
  }
}

function onDragLeave(e) {
  if (e.target.classList.contains("cell")) {
    e.target.classList.remove("drag-over");
  }
}

async function onDrop(e, toX, toY) {
  e.preventDefault();
  e.target.classList.remove("drag-over");

  const to = `${9 - toX}${String.fromCharCode(97 + toY)}`;
  let moveData = null;

  if (selectedHandPiece) {
    moveData = { from: `${selectedHandPiece.type}*`, to };
    selectedHandPiece = null;
  } else if (draggedFrom) {
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
    draggedFrom = null;
  }

  if (moveData) {
    await sendPlayerMove(moveData);
  }
  clearHighlights();
}

function drawHands() {
  ["white", "black"].forEach(side => {
    const el = document.getElementById(`${side}-hands`);
    el.innerHTML = "";
    Object.entries(hands[side]).forEach(([k, v]) => {
      if (v > 0) {
        const div = document.createElement("div");
        div.className = "piece-hand";
        const pieceText = pieceSymbol(k);
        const textNode = document.createTextNode(pieceText);
        div.appendChild(textNode);
        div.draggable = true;
        div.addEventListener("dragstart", (e) => onHandDragStart(e, k));
        const countSpan = document.createElement("span");
        countSpan.textContent = `×${v}`;
        div.appendChild(countSpan);
        div.addEventListener("click", () => {
          if (!isPlayerTurn) return;
          selectedHandPiece = { side, type: k };
          selected = null;
          clearHighlights();
          document.querySelectorAll(".hands .piece-hand").forEach(p => p.classList.remove("selected-hand"));
          div.classList.add("selected-hand");
        });
        el.appendChild(div);
      }
    });
  });
}

function onHandDragStart(e, pieceType) {
  if (!isPlayerTurn) {
    e.preventDefault();
    return;
  }
  selectedHandPiece = { side: "black", type: pieceType };
  e.dataTransfer.setData("text/plain", JSON.stringify({ type: pieceType }));
  e.dataTransfer.effectAllowed = "move";
  clearHighlights();
}

function isPromotable(piece) {
  const promotableSFEN = ["P", "L", "N", "S", "B", "R"];
  return promotableSFEN.includes(piece.toUpperCase());
}

function inPromotionZone(y) {
  return y <= 2;
}

async function onCellClick(x, y) {
  if (!isPlayerTurn) return;

  const to = `${9 - x}${String.fromCharCode(97 + y)}`;
  clearHighlights();

  if (selectedHandPiece) {
    const moveData = { from: `${selectedHandPiece.type}*`, to };
    await sendPlayerMove(moveData);
    selectedHandPiece = null;
    return;
  }

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
    const clickedPiece = boardState[y][x];
    if (clickedPiece && !clickedPiece.gote) {
      selected = [x, y];
      document.querySelectorAll(".cell").forEach(c => c.classList.remove("selected"));
      document.querySelector(`.cell[data-x='${x}'][data-y='${y}']`).classList.add("selected");
      highlightLegalMoves(x, y);
    }
  }
}

// ポーリングを開始する関数
function startPollingForAiMove() {
  if (aiMovePollInterval) return;
  aiMovePollInterval = setInterval(getAiMove, 1000); // 1秒ごとにAIの手をチェック
}

// AIの指し手を取得・反映する関数 (ポーリング対応)
async function getAiMove() {
  try {
    const res = await fetch("/get_ai_move", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    const data = await res.json();
    console.log('Polling /get_ai_move:', data);

    if (!res.ok) {
      alert(`HTTP ${res.status} エラー: ${data.error}`);
      isPlayerTurn = true;
      updateTurnIndicator();
      clearInterval(aiMovePollInterval);
      aiMovePollInterval = null;
      return;
    }

    if (data.thinking) {
      return; // AIがまだ思考中なら、何もせずに次のポーリングを待つ
    }

    // AIの手が返ってきたらポーリングを停止
    clearInterval(aiMovePollInterval);
    aiMovePollInterval = null;

    if (data.ai_move) {
      handleAIMove(data.ai_move, data.ai_moved_piece);
      boardState = parseSFEN(data.board_sfen.split(" ")[0]);
      hands = data.hands;
      drawBoard();
      drawHands();
    }

    if (data.game_over) {
      alert(`詰みです！${data.winner}の勝ち`);
      isPlayerTurn = false;
    } else {
      isPlayerTurn = true;
    }
    updateTurnIndicator();

  } catch (err) {
    console.error("AIの指し手取得失敗:", err);
    isPlayerTurn = true;
    updateTurnIndicator();
    clearInterval(aiMovePollInterval);
    aiMovePollInterval = null;
  }
}

function clearHighlights() {
  document.querySelectorAll(".highlight-move, .selected, .selected-hand, .drag-over").forEach(el => {
    el.classList.remove("highlight-move", "selected", "selected-hand", "drag-over");
  });
}

async function highlightLegalMoves(x, y) {
  const fromSquareUsi = `${9 - x}${String.fromCharCode(97 + y)}`;
  try {
    const res = await fetch(`/legal_moves/${fromSquareUsi}`);
    const data = await res.json();
    if (data.legal_moves) {
      data.legal_moves.forEach(moveUsi => {
        const toX = 9 - parseInt(moveUsi[0]);
        const toY = "abcdefghi".indexOf(moveUsi[1]);
        const cell = document.querySelector(`.cell[data-x='${toX}'][data-y='${toY}']`);
        if (cell) cell.classList.add("highlight-move");
      });
    }
  } catch (err) {
    console.error("合法手の取得に失敗:", err);
  }
}

function handleAIMove(usi, movedPieceSymbol) {
  let pieceForKifu;
  if (usi.includes("*")) {
    pieceForKifu = usi[0];
    appendKifu(usi, pieceForKifu, true, null);
  } else {
    pieceForKifu = movedPieceSymbol;
    appendKifu(usi, pieceForKifu, true, usi.slice(0, 2));
  }
  const toSquareUsi = usi.slice(-2);
  const toX = 9 - parseInt(toSquareUsi[0]);
  const toY = "abcdefghi".indexOf(toSquareUsi[1]);
  lastMoveHighlighted = { x: toX, y: toY };
}

async function resetGame() {
  if (aiMovePollInterval) {
    clearInterval(aiMovePollInterval);
    aiMovePollInterval = null;
  }
  try {
    const res = await fetch("/reset", { method: "POST" });
    if (res.ok) {
      moveCount = 0;
      kifuLog.length = 0;
      document.getElementById("kifu-log").innerText = "";
      isPlayerTurn = true;
      lastMoveHighlighted = null;
      clearHighlights();
      await fetchBoardState();
    }
  } catch (err) {
    console.error("リセット失敗:", err);
  }
}

document.addEventListener("DOMContentLoaded", fetchBoardState);

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

async function sendPlayerMove(moveData) {
  clearHighlights();
  try {
    const res = await fetch("/player_move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(moveData)
    });

    const data = await res.json();
    if (!res.ok) {
      alert(`HTTP ${res.status} エラー: ${data.error}`);
      return;
    }

    const fromSq = moveData.from.includes("*") ? null : moveData.from;
    const pieceCodeForKifu = fromSq ? boardState["abcdefghi".indexOf(fromSq[1])][9 - parseInt(fromSq[0])].piece : moveData.from[0];
    let fullUsi = moveData.from.includes("*") ? `${moveData.from}${moveData.to}` : `${moveData.from}${moveData.to}`;
    if (moveData.promote) fullUsi += "+";
    appendKifu(fullUsi, pieceCodeForKifu, false, fromSq);

    const toSquareUsi = moveData.to;
    const toX = 9 - parseInt(toSquareUsi[0]);
    const toY = "abcdefghi".indexOf(toSquareUsi[1]);
    lastMoveHighlighted = { x: toX, y: toY };

    boardState = parseSFEN(data.board_sfen.split(" ")[0]);
    hands = data.hands;
    drawBoard();
    drawHands();

    if (data.game_over) {
      alert(`詰みです！${data.winner}の勝ち`);
      isPlayerTurn = false;
      updateTurnIndicator();
      return;
    }

    isPlayerTurn = false;
    updateTurnIndicator();
    startPollingForAiMove();

  } catch (err) {
    console.error("通信失敗:", err);
    isPlayerTurn = true;
    updateTurnIndicator();
  } finally {
    selected = null;
    selectedHandPiece = null;
    document.querySelectorAll(".piece-hand").forEach(p => p.classList.remove("selected-hand"));
  }
}