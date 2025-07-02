from flask import Flask, request, jsonify, render_template
import shogi
import random
import copy
import time

app = Flask(__name__)
board = shogi.Board()


def minimax(board, depth, alpha, beta, is_ai_turn):
    if depth == 0 or board.is_game_over():
        return evaluate_board(board)

    if is_ai_turn:
        max_eval = float('-inf')
        for move in board.legal_moves:
            board.push(move)
            eval = minimax(board, depth - 1, alpha, beta, False)
            board.pop()
            max_eval = max(max_eval, eval)
            alpha = max(alpha, eval)
            if beta <= alpha:
                break  # βカット（相手がこれ以上の悪手は選ばない）
        return max_eval
    else:
        min_eval = float('inf')
        for move in board.legal_moves:
            board.push(move)
            eval = minimax(board, depth - 1, alpha, beta, True)
            board.pop()
            min_eval = min(min_eval, eval)
            beta = min(beta, eval)
            if beta <= alpha:
                break  # αカット（AIがこれ以上の手は選ばない）
        return min_eval


# -------------------------
# 評価関数：盤面の評価値を計算
# -------------------------
def evaluate_board(bd):
    piece_values = {
        "P": 1, "+P": 5, "L": 3, "+L": 7, "N": 3, "+N": 7,
        "S": 5, "+S": 9, "G": 6, "B": 8, "+B": 13, "R": 10, "+R": 15, "K": 0
    }

    score = 0

    # 盤上の駒の評価
    for sq in shogi.SQUARES:
        p = bd.piece_at(sq)
        if p:
            symbol = p.symbol().upper()
            value = piece_values.get(symbol, 0)
            score += value if p.color == shogi.WHITE else -value

    # 持ち駒の評価（後手: +, 先手: -）
    for color in [shogi.BLACK, shogi.WHITE]:
        hand = bd.pieces_in_hand[color]
        for piece_type, count in hand.items():
            symbol = shogi.PIECE_SYMBOLS[piece_type].upper()
            value = piece_values.get(symbol, 0) * count
            score += value if color == shogi.WHITE else -value

    return score

# -----------------------------------
# 一手読みの評価関数：合法手を1手ずつ読む
# -----------------------------------
def evaluate_move(board, move, time_limit=2.0):
    start_time = time.time()
    board.push(move)

    if board.is_checkmate():
        board.pop()
        print(f"{move.usi()} → 勝ち（即詰み）: +9999")
        return 9999

    def minimax(board, depth, alpha, beta, is_ai_turn):
        if time.time() - start_time > time_limit:
            raise TimeoutError()

        if depth == 0 or board.is_game_over():
            return evaluate_board(board)

        if is_ai_turn:
            max_eval = float('-inf')
            for mv in board.legal_moves:
                board.push(mv)
                try:
                    eval = minimax(board, depth - 1, alpha, beta, False)
                except TimeoutError:
                    board.pop()
                    raise
                board.pop()
                max_eval = max(max_eval, eval)
                alpha = max(alpha, eval)
                if beta <= alpha:
                    break
            return max_eval
        else:
            min_eval = float('inf')
            for mv in board.legal_moves:
                board.push(mv)
                try:
                    eval = minimax(board, depth - 1, alpha, beta, True)
                except TimeoutError:
                    board.pop()
                    raise
                board.pop()
                min_eval = min(min_eval, eval)
                beta = min(beta, eval)
                if beta <= alpha:
                    break
            return min_eval

    try:
        score = minimax(board, depth=2, alpha=float('-inf'), beta=float('inf'), is_ai_turn=False)
    except TimeoutError:
        score = evaluate_board(board)  # タイムアウト時は現在局面評価

    if move.promotion:
        score += 2

    board.pop()

    print(f"{move.usi()} → 評価（時間制限付き）: {score}")
    return score
# -------------------------
# 持ち駒をJSON形式で返す
# -------------------------
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

# -------------------------
# フロント用ルート
# -------------------------
@app.route("/")
def index():
    return render_template("index.html")

# 現在の盤面を返す
@app.route("/board")
def get_board():
    return jsonify({
        "sfen": board.sfen(),
        "hands": get_hands_json()
    })

# ゲームをリセットする
@app.route("/reset", methods=["POST"])
def reset():
    global board
    board = shogi.Board()
    return jsonify({"message": "リセット完了"})

# -------------------------
# プレイヤーの指し手処理
# -------------------------
@app.route("/move", methods=["POST"])
def move():
    global board
    data = request.json
    from_sq = data.get("from")
    to_sq = data.get("to")
    promote = data.get("promote", False)

    try:
        # USI形式の手を組み立て
        if "*" in from_sq:
            usi = f"{from_sq.upper()}{to_sq}"
        else:
            usi = f"{from_sq}{to_sq}"
            if promote:
                usi += "+"

        move_obj = shogi.Move.from_usi(usi)

        if move_obj not in board.legal_moves:
            return jsonify({"success": False, "error": "不正な手です"}), 400

        # プレイヤーの手を実行
        board.push(move_obj)

        # 詰み判定
        if board.is_checkmate():
            return jsonify({
                "success": True,
                "board_sfen": board.sfen(),
                "hands": get_hands_json(),
                "game_over": True,
                "winner": "先手"
            })

        ai_move_str = None
        ai_piece = None

        # AIの手を生成（ランダム選択）
        if not board.is_game_over():
            best_score = None
            best_moves = []

            for mv in board.legal_moves:
                score = evaluate_move(board, mv)
                if best_score is None or score > best_score:
                    best_score = score
                    best_moves = [mv]
                elif score == best_score:
                    best_moves.append(mv)

            ai_move = random.choice(best_moves)
            board.push(ai_move)
            ai_move_str = ai_move.usi()
            ai_piece = board.piece_at(ai_move.to_square).symbol()

            if board.is_checkmate():
                return jsonify({
                    "success": True,
                    "board_sfen": board.sfen(),
                    "hands": get_hands_json(),
                    "ai_move": ai_move_str,
                    "ai_piece": ai_piece,
                    "game_over": True,
                    "winner": "後手"
                })

        # 成功レスポンス
        return jsonify({
            "success": True,
            "board_sfen": board.sfen(),
            "hands": get_hands_json(),
            "ai_move": ai_move_str,
            "ai_piece": ai_piece
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)