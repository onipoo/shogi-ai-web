document.addEventListener("DOMContentLoaded", () => {
  if (typeof ShogiBoard === "undefined") {
    console.error("ShogiBoard ライブラリが読み込まれていません。CDN URL を確認してください。");
    return;
  }

  const board = new ShogiBoard("board", {
    draggable: true,
    position: "start",
    pieceTheme: "/static/piece/koma_{piece}.svg",
    onMoveEnd: async (move) => {
      if (!move) return;
      try {
        const response = await fetch("/move", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ move: move.from + move.to })
        });
        const data = await response.json();
        if (data.ai_move) {
          board.move(data.ai_move.slice(0, 2), data.ai_move.slice(2, 4));
        } else {
          alert("AIからの応手がありません。");
        }
      } catch (err) {
        console.error(err);
        alert("サーバーとの通信エラーです。");
      }
    }
  });

  window.board = board;
});