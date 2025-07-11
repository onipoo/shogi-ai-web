from flask import Flask, request, jsonify, render_template
import shogi
import random
import copy
import time

app = Flask(__name__)
board = shogi.Board()

DEBUG_MODE = False # デバッグモードの初期設定


def minimax(board, depth, alpha, beta, is_ai_turn, start_time, time_limit):
    if depth == 0 or board.is_game_over():
        return evaluate_board(board)

    # 指し手の並べ替えのためのスコア計算
    moves_with_scores = []
    piece_values = {
        "P": 100, "+P": 500, "L": 300, "+L": 700, "N": 300, "+N": 700,
        "S": 500, "+S": 900, "G": 600, "B": 800, "+B": 1300, "R": 1000, "+R": 1500, "K": 10000
    }
    for move in board.legal_moves:
        score = 0
        # 捕獲の評価
        captured_piece = board.piece_at(move.to_square)
        if captured_piece:
            captured_symbol = captured_piece.symbol().upper()
            score += piece_values.get(captured_symbol, 0)

        # 成りの評価
        if move.promotion:
            score += 200

        # 王手の評価 (簡易的)
        board.push(move)
        if board.is_check():
            score += 100
        board.pop()

        moves_with_scores.append((score, move))

    # スコアの高い順にソート
    moves_with_scores.sort(key=lambda x: x[0], reverse=True)

    if is_ai_turn:
        max_eval = float('-inf')
        for score, move in moves_with_scores:
            board.push(move)
            eval = minimax(board, depth - 1, alpha, beta, False, start_time, time_limit)
            board.pop()
            max_eval = max(max_eval, eval)
            alpha = max(alpha, eval)
            if beta <= alpha:
                break
        return max_eval
    else:
        min_eval = float('inf')
        for score, move in moves_with_scores:
            board.push(move)
            eval = minimax(board, depth - 1, alpha, beta, True, start_time, time_limit)
            board.pop()
            min_eval = min(min_eval, eval)
            beta = min(beta, eval)
            if beta <= alpha:
                break
        return min_eval


# -------------------------
# 評価関数：盤面の評価値を計算
# -------------------------

# Piece-Square Tables (PSTs)
# 各駒の配置による価値を定義
# 先手（黒）から見た評価値。後手（白）の場合は盤面を180度回転させて評価
PST = {
    "P": [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1, 1, 1, 1, 1],
        [2, 2, 2, 2, 2, 2, 2, 2, 2],
        [3, 3, 3, 3, 3, 3, 3, 3, 3],
        [4, 4, 4, 4, 4, 4, 4, 4, 4],
        [5, 5, 5, 5, 5, 5, 5, 5, 5],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0]
    ],
    "L": [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1, 1, 1, 1, 1],
        [2, 2, 2, 2, 2, 2, 2, 2, 2],
        [3, 3, 3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3, 3, 3],
        [0, 0, 0, 0, 0, 0, 0, 0, 0]
    ],
    "N": [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 1, 0, 1, 0, 1, 0, 1, 0],
        [2, 3, 2, 3, 2, 3, 2, 3, 2],
        [3, 4, 3, 4, 3, 4, 3, 4, 3],
        [3, 4, 3, 4, 3, 4, 3, 4, 3],
        [2, 3, 2, 3, 2, 3, 2, 3, 2],
        [0, 1, 0, 1, 0, 1, 0, 1, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0]
    ],
    "S": [
        [5, 5, 5, 5, 5, 5, 5, 5, 5],
        [5, 6, 6, 6, 6, 6, 6, 6, 5],
        [6, 7, 7, 7, 7, 7, 7, 7, 6],
        [6, 7, 7, 7, 7, 7, 7, 7, 6],
        [6, 7, 7, 7, 7, 7, 7, 7, 6],
        [6, 7, 7, 7, 7, 7, 7, 7, 6],
        [5, 6, 6, 6, 6, 6, 6, 6, 5],
        [5, 5, 5, 5, 5, 5, 5, 5, 5],
        [5, 5, 5, 5, 5, 5, 5, 5, 5]
    ],
    "G": [
        [5, 5, 5, 5, 5, 5, 5, 5, 5],
        [5, 6, 6, 6, 6, 6, 6, 6, 5],
        [6, 7, 7, 7, 7, 7, 7, 7, 6],
        [6, 7, 7, 7, 7, 7, 7, 7, 6],
        [6, 7, 7, 7, 7, 7, 7, 7, 6],
        [6, 7, 7, 7, 7, 7, 7, 7, 6],
        [5, 6, 6, 6, 6, 6, 6, 6, 5],
        [5, 5, 5, 5, 5, 5, 5, 5, 5],
        [5, 5, 5, 5, 5, 5, 5, 5, 5]
    ],
    "B": [
        [6, 6, 6, 6, 6, 6, 6, 6, 6],
        [6, 8, 8, 8, 8, 8, 8, 8, 6],
        [6, 8, 9, 9, 9, 9, 9, 8, 6],
        [6, 8, 9, 10, 10, 10, 9, 8, 6],
        [6, 8, 9, 10, 10, 10, 9, 8, 6],
        [6, 8, 9, 9, 9, 9, 9, 8, 6],
        [6, 8, 8, 8, 8, 8, 8, 8, 6],
        [6, 6, 6, 6, 6, 6, 6, 6, 6],
        [6, 6, 6, 6, 6, 6, 6, 6, 6]
    ],
    "R": [
        [8, 8, 8, 8, 8, 8, 8, 8, 8],
        [8, 10, 10, 10, 10, 10, 10, 10, 8],
        [8, 10, 11, 11, 11, 11, 11, 10, 8],
        [8, 10, 11, 12, 12, 12, 11, 10, 8],
        [8, 10, 11, 12, 12, 12, 11, 10, 8],
        [8, 10, 11, 11, 11, 11, 11, 10, 8],
        [8, 10, 10, 10, 10, 10, 10, 10, 8],
        [8, 8, 8, 8, 8, 8, 8, 8, 8],
        [8, 8, 8, 8, 8, 8, 8, 8, 8]
    ],
    "K": [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
}
# 成り駒は元の駒のPSTを流用
PST["+P"] = PST["G"]
PST["+L"] = PST["G"]
PST["+N"] = PST["G"]
PST["+S"] = PST["G"]
PST["+B"] = PST["B"] # 馬は角の動きがベース
PST["+R"] = PST["R"] # 竜は飛車の動きがベース

def evaluate_board(bd):
    piece_values = {
        "P": 100, "+P": 500, "L": 300, "+L": 700, "N": 300, "+N": 700,
        "S": 500, "+S": 900, "G": 600, "B": 800, "+B": 1300, "R": 1000, "+R": 1500, "K": 10000
    }

    score = 0

    # 盤上の駒の評価
    for sq in shogi.SQUARES:
        p = bd.piece_at(sq)
        if p:
            symbol = p.symbol().upper()
            value = piece_values.get(symbol, 0)
            
            # PST評価値を取得
            # USI形式の座標文字列からx, yを取得
            usi_sq = shogi.SQUARE_NAMES[sq]
            x = 9 - int(usi_sq[0]) # ファイル (筋)
            y = ord(usi_sq[1]) - ord('a') # ランク (段)
            pst_value = 0
            if symbol in PST:
                if p.color == shogi.BLACK: # 先手
                    pst_value = PST[symbol][y][x]
                else: # 後手
                    pst_value = PST[symbol][8-y][8-x]
            
            # 駒の価値 + PST評価値
            total_value = value + pst_value
            score += total_value if p.color == shogi.WHITE else -total_value

    # 持ち駒の評価（後手: +, 先手: -）
    for color in [shogi.BLACK, shogi.WHITE]:
        hand = bd.pieces_in_hand[color]
        for piece_type, count in hand.items():
            symbol = shogi.PIECE_SYMBOLS[piece_type].upper()
            value = piece_values.get(symbol, 0) * count
            score += value if color == shogi.WHITE else -value

    return score


def find_best_move_iterative_deepening(board, time_limit=3.0):
    start_time = time.time()
    best_move = None
    best_score = float('-inf')

    # 合法手がなければNoneを返す
    if not board.legal_moves:
        return None

    # 探索深度を1から開始し、時間切れになるまで深くしていく
    for depth in range(1, 100):  # 深度は適当な上限を設定
        current_best_move_for_depth = None
        current_best_score_for_depth = float('-inf')

        # 指し手の並べ替えのためのスコア計算 (ここでも行うことで、浅い深度でも効率化)
        moves_with_scores = []
        piece_values = {
            "P": 100, "+P": 500, "L": 300, "+L": 700, "N": 300, "+N": 700,
            "S": 500, "+S": 900, "G": 600, "B": 800, "+B": 1300, "R": 1000, "+R": 1500, "K": 10000
        }
        for move in board.legal_moves:
            score = 0
            captured_piece = board.piece_at(move.to_square)
            if captured_piece:
                captured_symbol = captured_piece.symbol().upper()
                score += piece_values.get(captured_symbol, 0)
            if move.promotion:
                score += 200
            board.push(move)
            if board.is_check():
                score += 100
            board.pop()
            moves_with_scores.append((score, move))
        moves_with_scores.sort(key=lambda x: x[0], reverse=True)

        try:
            for score, move in moves_with_scores:
                board.push(move)
                # ミニマックス探索を呼び出す
                eval = minimax(board, depth - 1, float('-inf'), float('inf'), False, start_time, time_limit)
                board.pop()

                if eval > current_best_score_for_depth: # AIは最大化側なので、より高い評価値を探す
                    current_best_score_for_depth = eval
                    current_best_move_for_depth = move

                # 時間切れチェック
                if time.time() - start_time > time_limit:
                    raise TimeoutError()

            # この深度での最善手が見つかったら、それを記録
            best_move = current_best_move_for_depth
            best_score = current_best_score_for_depth

        except TimeoutError:
            # 時間切れになったら、それまでに最も深く探索できた深度での最善手を返す
            if DEBUG_MODE:
                print(f"Time out at depth {depth}. Returning best move found so far.")
            break # ループを抜ける

        if DEBUG_MODE:
            print(f"Finished depth {depth}. Best move: {best_move.usi() if best_move else 'None'}, Score: {best_score}")

    return best_move

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

# 指定されたマスの合法手を返す
@app.route("/legal_moves/<square>")
def get_legal_moves(square):
    try:
        print(f"Received square: '{square}'") # デバッグ用に追加
        from_sq_int = shogi.SQUARE_NAMES.index(square)
        legal_moves_for_square = []
        for move in board.legal_moves:
            if move.from_square == from_sq_int:
                legal_moves_for_square.append(shogi.SQUARE_NAMES[move.to_square])
        return jsonify({"legal_moves": legal_moves_for_square})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# ゲームをリセットする
@app.route("/reset", methods=["POST"])
def reset():
    global board
    board = shogi.Board()
    return jsonify({"message": "リセット完了"})

# -------------------------
# プレイヤーの指し手処理
# -------------------------
@app.route("/player_move", methods=["POST"])
def player_move():
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

        # 成功レスポンス
        return jsonify({
            "success": True,
            "board_sfen": board.sfen(),
            "hands": get_hands_json(),
            "game_over": False # プレイヤーの指し手ではゲーム終了しない
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

# -------------------------
# AIの指し手処理
# -------------------------
@app.route("/get_ai_move", methods=["POST"])
def get_ai_move():
    global board

    if board.is_game_over():
        return jsonify({"success": False, "error": "ゲームは終了しています"}), 400

    try:
        # 反復深化でAIの指し手を取得
        ai_move = find_best_move_iterative_deepening(board, time_limit=3.0) # 3秒の時間制限

        if not ai_move: # 合法手がなければ
            return jsonify({"success": False, "error": "合法手がありません"}), 400

        # AIが動かす駒のシンボルを取得（移動前）
        ai_moved_piece_symbol = board.piece_at(ai_move.from_square).symbol() if ai_move.from_square else None

        board.push(ai_move)
        ai_move_str = ai_move.usi()

        if board.is_checkmate():
            return jsonify({
                "success": True,
                "board_sfen": board.sfen(),
                "hands": get_hands_json(),
                "ai_move": ai_move_str,
                "ai_moved_piece": ai_moved_piece_symbol,
                "game_over": True,
                "winner": "後手"
            })

        return jsonify({
            "success": True,
            "board_sfen": board.sfen(),
            "hands": get_hands_json(),
            "ai_move": ai_move_str,
            "ai_moved_piece": ai_moved_piece_symbol,
            "game_over": False
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

# -------------------------
# デバッグモード切り替え
# -------------------------
@app.route("/debug_mode", methods=["GET", "POST"])
def debug_mode():
    global DEBUG_MODE
    if request.method == "POST":
        data = request.json
        DEBUG_MODE = bool(data.get("debug", False))
        return jsonify({"debug_mode": DEBUG_MODE, "message": f"デバッグモードを {'ON' if DEBUG_MODE else 'OFF'} にしました"})
    else:
        return jsonify({"debug_mode": DEBUG_MODE})

if __name__ == "__main__":
    import os
    # FLASK_ENVが'development'の場合のみ開発サーバーを起動
    if os.environ.get("FLASK_ENV") == "development":
        port = int(os.environ.get("PORT", 5000))
        app.run(host="0.0.0.0", port=port)
    else:
        # 本番環境ではGunicornなどのWSGIサーバーがappを起動するため、ここでは何もしない
        print("Running in production mode. Gunicorn or another WSGI server should be used.")