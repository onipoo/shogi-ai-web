document.addEventListener("DOMContentLoaded", () => {
  if (typeof ShogiBoard === "undefined") {
    console.error("shogiboardjs が読み込まれていません");
    return;
  }

  const board = ShogiBoard(document.getElementById("board"), {
    width: 480,
    position: "start",
    draggable: true,
    cssClasses: "shogiboardjs-theme-default"
  });

  board.enableMoveInput(move => {
    console.log("ユーザーの手:", move);
    // AIへの通信・応答処理をここに
  });

  window.board = board;
});