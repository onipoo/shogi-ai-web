document.addEventListener("DOMContentLoaded", () => {
  const board = document.getElementById("board");

  // 仮の駒配置（9x9）
  const initialBoard = Array(81).fill("");

  // 駒を初期化表示
  initialBoard.forEach((piece, index) => {
    const square = document.createElement("div");
    square.className = "square";
    square.dataset.index = index;
    square.textContent = piece;
    board.appendChild(square);
  });
});