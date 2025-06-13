from flask import Flask, request, jsonify, render_template
import shogi
import traceback


app = Flask(__name__)
board = shogi.Board()

def get_hands_json():
    return {
        "black": {
            shogi.PIECE_SYMBOLS[p]: board.pieces_in_hand[shogi.BLACK].get(p, 0)
            for p in shogi.PIECE_TYPES
            if board.pieces_in_hand[shogi.BLACK].get(p, 0) > 0
        },
        "white": {
            shogi.PIECE_SYMBOLS[p]: board.pieces_in_hand[shogi.WHITE].get(p, 0)
            for p in shogi.PIECE_TYPES
            if board.pieces_in_hand[shogi.WHITE].get(p, 0) > 0
        }
    }

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/move", methods=["POST"])
def move():
    global board
    data = request.json
    from_sq = data.get("from")
    to_sq = data.get("to")
    promote = data.get("promote", False)

    try:

        if "*" in from_sq:
          usi = f"{from_sq}{to_sq}"  # 打ち駒（例: "P*7f"）
        else:
          usi = f"{from_sq}{to_sq}"
          if promote:
            usi += "+"

        move = shogi.Move.from_usi(usi)

        if move not in board.legal_moves:
            return jsonify({"success": False, "error": "不正な手です。"}), 400

        board.push(move)

        # プレイヤーが詰ませた
        if board.is_checkmate():
            return jsonify({
                "success": True,
                "board_sfen": board.sfen(),
                "hands": get_hands_json(),
                "game_over": True,
                "winner": "先手"  # プレイヤー
            })

        # AI応手
        ai_move_str = None
        if not board.is_game_over():
            ai_move = next(iter(board.legal_moves))
            board.push(ai_move)
            ai_move_str = ai_move.usi()

            # AIが詰ませた
            if board.is_checkmate():
                return jsonify({
                    "success": True,
                    "board_sfen": board.sfen(),
                    "hands": get_hands_json(),
                    "ai_move": ai_move_str,
                    "game_over": True,
                    "winner": "後手"  # AI
                })

        return jsonify({
            "success": True,
            "board_sfen": board.sfen(),
            "hands": get_hands_json(),
            "ai_move": ai_move_str
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/board")
def get_board():
    global board
    return jsonify({
        "sfen": board.sfen(),
        "hands": get_hands_json()
    })

@app.route("/reset", methods=["POST"])
def reset():
    global board
    board = shogi.Board()
    return jsonify({"message": "リセット完了"})


if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)