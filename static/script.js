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

const fileMap = { 0: "９", 1: "８", 2: "７", 3: "６", 4: "５", 5: "４", 6: "３", 7: "２", 8: "１" };
const rankMap = { 0: "一", 1: "二", 2: "三", 3: "四", 4: "五", 5: "六", 6: "七", 7: "八", 8: "九" };

// 盤面座標を人間向け表示に変換
function usiToHuman(usiSq) {
  const file = parseInt(usiSq[0]);
  const rank = "abcdefghi".indexOf(usiSq[1]) + 1;
  return `${file}${rank}`;
}

// USI形式 → 棋譜表記へ変換
function usiToKifu(usi, piece, isGote, fromSq = null) {
  const file = parseInt(usi[2]);
  const rankIndex = "abcdefghi".indexOf(usi[3]);
  const toPos = file + "一二三四五六七八九"[rankIndex];
  const turnSymbol = isGote ? "△" : "▲";
  const src = fromSq ? `(${usiToHuman(fromSq)})` : "(打)";

  if (usi.length === 5 && usi[4] === "+") {
    piece += "成";
  }

  moveCount += 1;
  return `${moveCount} ${turnSymbol}${toPos}${piece}${src}`;
}

// 棋譜ログを表示エリアに追加
function appendKifu(usi, piece, isGote, fromSq = null) {
  const line = usiToKifu(usi, piece, isGote, fromSq);
  kifuLog.push(line);
  const log = document.getElementById("kifu-log");
  if (log) log.innerText = kifuLog.join("\n");
}

// 駒の記号 → 日本語名に変換
function pieceSymbol(k) {
  return {
    P: "歩", L: "香", N: "桂", S: "銀", G: "金", B: "角", R: "飛", K: "王"
  }[k.toUpperCase()] || "?";
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
        parsedRow.push({ piece: pieceMap[pieceCode] || "？", gote });
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
        cell.textContent = data.piece;
        if (data.gote) cell.classList.add("gote");
      }
      cell.addEventListener("click", () => onCellClick(x, y));
      board.appendChild(cell);
    }
  }
}

// 持ち駒を描画
function drawHands() {
  ["white", "black"].forEach(side => {
    const el = document.getElementById(`${side}-hands`);
    el.innerHTML = "";
    Object.entries(hands[side]).forEach(([k, v]) => {
      if (v > 0) {
        const div = document.createElement("div");
        div.className = "piece";
        div.textContent = `${pieceSymbol(k)}×${v}`;
        div.addEventListener("click", () => {
          selectedHandPiece = { side, type: k };
          document.querySelectorAll(".piece").forEach(p => p.classList.remove("selected-hand"));
          div.classList.add("selected-hand");
        });
        el.appendChild(div);
      }
    });
  });
}

// 成れる駒か？
function isPromotable(piece) {
  return ["歩", "香", "銀", "桂", "角", "飛"].includes(piece);
}

// 成りゾーン（敵陣）か？
function inPromotionZone(y) {
  return y <= 2;
}

// セルクリック時の処理
async function onCellClick(x, y) {
  const to = `${9 - x}${String.fromCharCode(97 + y)}`;

  // 打ち駒処理
  if (selectedHandPiece) {
    const moveData = { from: `${selectedHandPiece.type}*`, to };
    const isGote = selectedHandPiece.side === "white";
    const piece = pieceSymbol(moveData.from[0]);

    try {
      const res = await fetch("/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(moveData)
      });

      const data = await res.json();
      if (!res.ok) {
        alert(`HTTP ${res.status} エラー: ${data.error}`);
        return;
      }

      appendKifu(`${moveData.from}${moveData.to}`, piece, isGote, null);
      selectedHandPiece = null;
      document.querySelectorAll(".piece").forEach(p => p.classList.remove("selected-hand"));
      boardState = parseSFEN(data.board_sfen.split(" ")[0]);
      hands = data.hands;
      drawBoard();
      drawHands();

      if (data.ai_move) handleAIMove(data.ai_move);
      if (data.game_over) alert(`詰みです！${data.winner}の勝ち`);

    } catch (err) {
      console.error("通信失敗:", err);
    }
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
        promote = confirm(`${pieceObj.piece} を成りますか？`);
      }
    }

    const moveData = { from, to, promote };

    try {
      const res = await fetch("/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(moveData)
      });

      const data = await res.json();
      if (!res.ok) {
        alert(`HTTP ${res.status} エラー: ${data.error}`);
        return;
      }

      let fullUsi = from + to;
      if (promote) fullUsi += "+";
      appendKifu(fullUsi, pieceObj.piece, pieceObj.gote, from);

      if (data.ai_move) handleAIMove(data.ai_move);

      boardState = parseSFEN(data.board_sfen.split(" ")[0]);
      hands = data.hands;
      drawBoard();
      drawHands();

      if (data.game_over) alert(`詰みです！${data.winner}の勝ち`);

    } catch (err) {
      console.error("通信失敗:", err);
    }

    selected = null;
  } else {
    selected = [x, y];
    document.querySelector(`.cell[data-x='${x}'][data-y='${y}']`).classList.add("selected");
  }
}

// AIの手の棋譜反映
function handleAIMove(usi) {
  if (usi.includes("*")) {
    const piece = pieceSymbol(usi[0]);
    appendKifu(usi, piece, true, null);
  } else {
    const fromX = "987654321".indexOf(usi[0]);
    const fromY = "abcdefghi".indexOf(usi[1]);
    const pieceObj = boardState[fromY]?.[fromX];
    const piece = pieceObj?.piece || "？";

    appendKifu(usi, piece, true, usi.slice(0, 2));
  }
}

// リセット処理
async function resetGame() {
  try {
    const res = await fetch("/reset", { method: "POST" });
    if (res.ok) {
      moveCount = 0;
      kifuLog.length = 0;
      document.getElementById("kifu-log").innerText = "";
      await fetchBoardState();
    }
  } catch (err) {
    console.error("リセット失敗:", err);
  }
}

document.addEventListener("DOMContentLoaded", fetchBoardState);
