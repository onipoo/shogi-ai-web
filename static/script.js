document.addEventListener("DOMContentLoaded", () => {
  const board = new ShogiBoard("board", {
    draggable: true,
    position: "start",
    pieceTheme: "https://murosan.github.io/shogi-board/dist/piece/koma_{piece}.svg",
    onMoveEnd: async (move) => {
      if (!move) return;
      try {
        const resp = await fetch("/move", { /* 既存のPOST処理 */ });
        const data = await resp.json();
        if (data.ai_move) {
          board.move(data.ai_move.slice(0,2), data.ai_move.slice(2,4));
        } else {
          alert("AIからの応手がありません。");
        }
      } catch (e) {
        console.error(e);
        alert("サーバーとの通信エラーです。");
      }
    }
  });
  window.board = board;
});