let selected = null;
let boardState = [];
let hands = { black: {}, white: {} };
let selectedHandPiece = null;  // クリックされた持ち駒

async function fetchBoardState() {
  try {
    const res = await fetch("/board");
    const data = await res.json();

    // 🔽 ここに挿入！
    boardState = parseSFEN(data.sfen.split(" ")[0]);
    hands = data.hands;
    drawBoard();
    drawHands();
  } catch (err) {
    console.error("盤面の取得に失敗:", err);
    alert("盤面データの取得に失敗しました");
  }
}

function parseSFEN(sfen) {
  const rows = sfen.split("/");
  const board = [];

  for (let row of rows) {
    const parsedRow = [];
    for (let i = 0; i < row.length; i++) {
      const char = row[i];

      if (!isNaN(char)) {
        for (let j = 0; j < parseInt(char); j++) {
          parsedRow.push(null);
        }
      } else {
        let gote = char === char.toLowerCase();
        let pieceCode = char;

        // 成り駒処理：「+P」など
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

        const piece = pieceMap[pieceCode] || "?";
        parsedRow.push({ piece, gote });
      }
    }
    board.push(parsedRow);
  }

  return board;
}


async function resetGame() {
  try {
    const res = await fetch("/reset", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      await fetchBoardState();  // 初期状態を取得して描画
    } else {
      alert(`リセット失敗: ${data.error}`);
    }
  } catch (err) {
    console.error("リセット通信エラー:", err);
    alert("サーバーに接続できませんでした");
  }
}


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
      } else {
        cell.textContent = "";
      }

      cell.addEventListener("click", () => onCellClick(x, y));
      board.appendChild(cell);
    }
  }
}


function drawHands() {
  const container = (side) => document.getElementById(`${side}-hands`);

  // 表示順を後手 → 先手 にすることで、上：後手／下：先手
  ["white", "black"].forEach(side => {
    const el = container(side);
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

function pieceSymbol(k) {
  return {
    P: "歩", L: "香", N: "桂", S: "銀", G: "金", B: "角", R: "飛", K: "王"
  }[k.toUpperCase()] || "?";
}


function toUsiSquare(x, y) {
  const file = 9 - x;
  const rank = String.fromCharCode(97 + y);  // y=0 → 'a', y=8 → 'i'
  return `${file}${rank}`;
}


function isPromotable(piece) {
  return ["歩", "銀", "桂", "角", "飛"].includes(piece);
}

function inPromotionZone(y) {
  return y <= 2;  // 敵陣（上から0〜2段目）
}

async function onCellClick(x, y) {
  const to = toUsiSquare(x, y);

  // ① 持ち駒から打つ場合
  if (selectedHandPiece) {
    const moveData = {
      from: `${selectedHandPiece.type}*`, // 例: "P*"
      to: to
    };

    try {
      const res = await fetch("/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(moveData)
      });

      const data = await res.json();
      selectedHandPiece = null;
      document.querySelectorAll(".piece").forEach(p => p.classList.remove("selected-hand"));

      if (!res.ok) {
        alert(`HTTP ${res.status} エラー: ${data.error}`);
        return;
      }

      if (data.success) {
        boardState = parseSFEN(data.board_sfen.split(" ")[0]);
        hands = data.hands;
        drawBoard();
        drawHands();

        if (data.game_over) {
          alert(`詰みです！${data.winner}の勝ち`);
          document.removeEventListener("click", onCellClick);
        }
      }
    } catch (err) {
      console.error("通信失敗:", err);
      alert("サーバーとの通信に失敗しました");
    }
    return;
  }

  // ② 通常の盤面移動
  if (selected) {
    const [fromX, fromY] = selected;

    if (fromX === x && fromY === y) {
      selected = null;
      drawBoard();
      return;
    }

    const from = toUsiSquare(fromX, fromY);
    const pieceObj = boardState[fromY][fromX];

    let promote = false;
    if (pieceObj && isPromotable(pieceObj.piece)) {
      const fromZone = inPromotionZone(fromY);
      const toZone = inPromotionZone(y);
      if (fromZone || toZone) {
        promote = confirm(`${pieceObj.piece} を成りますか？`);
      }
    }

    const moveData = { from, to };
    if (promote) {
      moveData.promote = true;
    }

    try {
      const res = await fetch("/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(moveData)
      });

      const data = await res.json();
      if (!res.ok) {
        alert(`HTTP ${res.status} エラー: ${data.error}`);
        selected = null;
        return;
      }

      if (data.success) {
        boardState = parseSFEN(data.board_sfen.split(" ")[0]);
        hands = data.hands;
        drawBoard();
        drawHands();

        if (data.game_over) {
          alert(`詰みです！${data.winner}の勝ち`);
          document.removeEventListener("click", onCellClick);
        }
      }
    } catch (err) {
      console.error("通信失敗:", err);
      alert("サーバーとの通信に失敗しました");
    }

    selected = null;
  } else {
    selected = [x, y];
    document.querySelector(`.cell[data-x='${x}'][data-y='${y}']`).classList.add("selected");
  }
}

document.addEventListener("DOMContentLoaded", fetchBoardState);