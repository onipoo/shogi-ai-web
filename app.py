from flask import Flask, request, jsonify, render_template
from flask_apscheduler import APScheduler
import shogi
import random
import copy
import time
import os

app = Flask(__name__)
board = shogi.Board()

# Scheduler setup for Ponder
scheduler = APScheduler()
scheduler.init_app(app)
scheduler.start()

# Global variables for Ponder
ponder_move = None
ponder_job = None

DEBUG_MODE = False # デバッグモードの初期設定

def start_ponder_task():
    """AIの思考をバックグラウンドで実行するタスク"""
    global ponder_move
    if not board.is_game_over():
        # Ponder用に盤面をコピーして探索
        ponder_board = copy.deepcopy(board)
        # Ponderなので少し長めに思考させる
        move = find_best_move_iterative_deepening(ponder_board, time_limit=1.0)
        ponder_move = move
        if DEBUG_MODE:
            print(f"DEBUG: Ponder finished. Best move: {ponder_move.usi() if ponder_move else 'None'}")

def minimax(board, depth, alpha, beta, is_ai_turn, start_time, time_limit):
    if depth == 0 or board.is_game_over() or time.time() - start_time > time_limit:
        return evaluate_board(board)

    moves_with_scores = []
    piece_values = {
        "P": 100, "+P": 500, "L": 300, "+L": 700, "N": 300, "+N": 700,
        "S": 500, "+S": 900, "G": 600, "B": 800, "+B": 1300, "R": 1000, "+R": 1500, "K": 10000
    }
    for move in board.legal_moves:
        score = 0
        captured_piece = board.piece_at(move.to_square)
        if captured_piece:
            score += piece_values.get(captured_piece.symbol().upper(), 0)
        if move.promotion:
            score += 200
        board.push(move)
        if board.is_check():
            score += 100
        board.pop()
        moves_with_scores.append((score, move))

    moves_with_scores.sort(key=lambda x: x[0], reverse=True)

    if is_ai_turn:
        max_eval = float('-inf')
        for _, move in moves_with_scores:
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
        for _, move in moves_with_scores:
            board.push(move)
            eval = minimax(board, depth - 1, alpha, beta, True, start_time, time_limit)
            board.pop()
            min_eval = min(min_eval, eval)
            beta = min(beta, eval)
            if beta <= alpha:
                break
        return min_eval

PST = {
    "P": [
        [0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1, 1, 1, 1], [2, 2, 2, 2, 2, 2, 2, 2, 2],
        [3, 3, 3, 3, 3, 3, 3, 3, 3], [4, 4, 4, 4, 4, 4, 4, 4, 4], [5, 5, 5, 5, 5, 5, 5, 5, 5],
        [0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0]
    ],
    "L": [
        [0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1, 1, 1, 1], [2, 2, 2, 2, 2, 2, 2, 2, 2],
        [3, 3, 3, 3, 3, 3, 3, 3, 3], [3, 3, 3, 3, 3, 3, 3, 3, 3], [3, 3, 3, 3, 3, 3, 3, 3, 3],
        [3, 3, 3, 3, 3, 3, 3, 3, 3], [3, 3, 3, 3, 3, 3, 3, 3, 3], [0, 0, 0, 0, 0, 0, 0, 0, 0]
    ],
    "N": [
        [0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 1, 0, 1, 0, 1, 0], [2, 3, 2, 3, 2, 3, 2, 3, 2],
        [3, 4, 3, 4, 3, 4, 3, 4, 3], [3, 4, 3, 4, 3, 4, 3, 4, 3], [2, 3, 2, 3, 2, 3, 2, 3, 2],
        [0, 1, 0, 1, 0, 1, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0]
    ],
    "S": [
        [5, 5, 5, 5, 5, 5, 5, 5, 5], [5, 6, 6, 6, 6, 6, 6, 6, 5], [6, 7, 7, 7, 7, 7, 7, 7, 6],
        [6, 7, 7, 7, 7, 7, 7, 7, 6], [6, 7, 7, 7, 7, 7, 7, 7, 6], [6, 7, 7, 7, 7, 7, 7, 7, 6],
        [5, 6, 6, 6, 6, 6, 6, 6, 5], [5, 5, 5, 5, 5, 5, 5, 5, 5], [5, 5, 5, 5, 5, 5, 5, 5, 5]
    ],
    "G": [
        [5, 5, 5, 5, 5, 5, 5, 5, 5], [5, 6, 6, 6, 6, 6, 6, 6, 5], [6, 7, 7, 7, 7, 7, 7, 7, 6],
        [6, 7, 7, 7, 7, 7, 7, 7, 6], [6, 7, 7, 7, 7, 7, 7, 7, 6], [6, 7, 7, 7, 7, 7, 7, 7, 6],
        [5, 6, 6, 6, 6, 6, 6, 6, 5], [5, 5, 5, 5, 5, 5, 5, 5, 5], [5, 5, 5, 5, 5, 5, 5, 5, 5]
    ],
    "B": [
        [6, 6, 6, 6, 6, 6, 6, 6, 6], [6, 8, 8, 8, 8, 8, 8, 8, 6], [6, 8, 9, 9, 9, 9, 9, 8, 6],
        [6, 8, 9, 10, 10, 10, 9, 8, 6], [6, 8, 9, 10, 10, 10, 9, 8, 6], [6, 8, 9, 9, 9, 9, 9, 8, 6],
        [6, 8, 8, 8, 8, 8, 8, 8, 6], [6, 6, 6, 6, 6, 6, 6, 6, 6], [6, 6, 6, 6, 6, 6, 6, 6, 6]
    ],
    "R": [
        [8, 8, 8, 8, 8, 8, 8, 8, 8], [8, 10, 10, 10, 10, 10, 10, 10, 8], [8, 10, 11, 11, 11, 11, 11, 10, 8],
        [8, 10, 11, 12, 12, 12, 11, 10, 8], [8, 10, 11, 12, 12, 12, 11, 10, 8], [8, 10, 11, 11, 11, 11, 11, 10, 8],
        [8, 10, 10, 10, 10, 10, 10, 10, 8], [8, 8, 8, 8, 8, 8, 8, 8, 8], [8, 8, 8, 8, 8, 8, 8, 8, 8]
    ],
    "K": [
        [0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
}
PST["+P"] = PST["G"]
PST["+L"] = PST["G"]
PST["+N"] = PST["G"]
PST["+S"] = PST["G"]
PST["+B"] = PST["B"]
PST["+R"] = PST["R"]

def evaluate_board(bd):
    piece_values = {
        "P": 100, "+P": 500, "L": 300, "+L": 700, "N": 300, "+N": 700,
        "S": 500, "+S": 900, "G": 600, "B": 800, "+B": 1300, "R": 1000, "+R": 1500, "K": 10000
    }
    score = 0
    for sq in shogi.SQUARES:
        p = bd.piece_at(sq)
        if p:
            symbol = p.symbol().upper()
            value = piece_values.get(symbol, 0)
            usi_sq = shogi.SQUARE_NAMES[sq]
            x = 9 - int(usi_sq[0])
            y = ord(usi_sq[1]) - ord('a')
            pst_value = 0
            if symbol in PST:
                if p.color == shogi.BLACK:
                    pst_value = PST[symbol][y][x]
                else:
                    pst_value = PST[symbol][8-y][8-x]
            total_value = value + pst_value
            score += total_value if p.color == shogi.WHITE else -total_value
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
    if not board.legal_moves:
        return None
    for depth in range(1, 100):
        current_best_move_for_depth = None
        current_best_score_for_depth = float('-inf')
        moves_with_scores = []
        piece_values = {
            "P": 100, "+P": 500, "L": 300, "+L": 700, "N": 300, "+N": 700,
            "S": 500, "+S": 900, "G": 600, "B": 800, "+B": 1300, "R": 1000, "+R": 1500, "K": 10000
        }
        for move in board.legal_moves:
            score = 0
            captured_piece = board.piece_at(move.to_square)
            if captured_piece:
                score += piece_values.get(captured_piece.symbol().upper(), 0)
            if move.promotion:
                score += 200
            board.push(move)
            if board.is_check():
                score += 100
            board.pop()
            moves_with_scores.append((score, move))
        moves_with_scores.sort(key=lambda x: x[0], reverse=True)
        try:
            for _, move in moves_with_scores:
                board.push(move)
                eval = minimax(board, depth - 1, float('-inf'), float('inf'), False, start_time, time_limit)
                board.pop()
                if eval > current_best_score_for_depth:
                    current_best_score_for_depth = eval
                    current_best_move_for_depth = move
                if time.time() - start_time > time_limit:
                    raise TimeoutError()
            best_move = current_best_move_for_depth
        except TimeoutError:
            if DEBUG_MODE:
                print(f"Time out at depth {depth}.")
            break
        if DEBUG_MODE:
            print(f"Finished depth {depth}. Best move: {best_move.usi() if best_move else 'None'}")
    return best_move

def get_hands_json():
    return {
        "black": { shogi.PIECE_SYMBOLS[p]: board.pieces_in_hand[shogi.BLACK].get(p, 0) for p in shogi.PIECE_TYPES if board.pieces_in_hand[shogi.BLACK].get(p, 0) > 0 },
        "white": { shogi.PIECE_SYMBOLS[p]: board.pieces_in_hand[shogi.WHITE].get(p, 0) for p in shogi.PIECE_TYPES if board.pieces_in_hand[shogi.WHITE].get(p, 0) > 0 }
    }

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/board")
def get_board():
    return jsonify({ "sfen": board.sfen(), "hands": get_hands_json() })

@app.route("/legal_moves/<square>")
def get_legal_moves(square):
    try:
        from_sq_int = shogi.SQUARE_NAMES.index(square)
        legal_moves_for_square = [shogi.SQUARE_NAMES[m.to_square] for m in board.legal_moves if m.from_square == from_sq_int]
        return jsonify({"legal_moves": legal_moves_for_square})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/reset", methods=["POST"])
def reset():
    global board, ponder_move, ponder_job
    if ponder_job:
        try:
            ponder_job.remove()
        except Exception:
            pass # Job may have already completed
    board.reset()
    ponder_move = None
    ponder_job = None
    return jsonify({"message": "リセット完了"})

@app.route("/player_move", methods=["POST"])
def player_move():
    global board, ponder_job, ponder_move
    data = request.json
    from_sq, to_sq, promote = data.get("from"), data.get("to"), data.get("promote", False)
    try:
        usi = f"{from_sq.upper()}{to_sq}" if "*" in from_sq else f"{from_sq}{to_sq}{'+' if promote else ''}"
        move_obj = shogi.Move.from_usi(usi)
        if move_obj not in board.legal_moves:
            return jsonify({"success": False, "error": "不正な手です"}), 400
        
        board.push(move_obj)

        if ponder_job:
            try:
                ponder_job.remove()
                if DEBUG_MODE: print("DEBUG: Previous ponder job cancelled.")
            except Exception as e:
                if DEBUG_MODE: print(f"DEBUG: Could not remove previous ponder job: {e}")
        
        ponder_move = None
        
        if board.is_game_over():
            return jsonify({ "success": True, "board_sfen": board.sfen(), "hands": get_hands_json(), "game_over": True, "winner": "先手" })

        # AIの思考をバックグラウンドで開始
        ponder_job = scheduler.add_job(func=start_ponder_task, trigger='date', id='ponder_job_1', replace_existing=True)
        if DEBUG_MODE: print("DEBUG: Ponder job started.")

        return jsonify({ "success": True, "board_sfen": board.sfen(), "hands": get_hands_json(), "game_over": False })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/get_ai_move", methods=["POST"])
def get_ai_move():
    global board
    if board.is_game_over():
        return jsonify({"success": False, "error": "ゲームは終了しています"}), 400

    # Ponderingを無効化し、ここで直接AIの思考を呼び出す
    # Renderの環境を考慮して、思考時間は非常に短く設定
    ai_move = find_best_move_iterative_deepening(board, time_limit=3.0)

    if not ai_move:
        # もし万が一手が見つからなかった場合（時間切れなど）
        # ランダムな手を返すフォールバック
        if list(board.legal_moves):
            ai_move = random.choice(list(board.legal_moves))
        else:
            return jsonify({"success": False, "error": "合法手がありません"}), 400

    ai_moved_piece_symbol = board.piece_at(ai_move.from_square).symbol() if ai_move.from_square else None
    board.push(ai_move)
    
    game_over = board.is_checkmate()
    winner = "後手" if game_over else None

    return jsonify({
        "success": True, "board_sfen": board.sfen(), "hands": get_hands_json(),
        "ai_move": ai_move.usi(), "ai_moved_piece": ai_moved_piece_symbol,
        "game_over": game_over, "winner": winner
    })

@app.route("/debug_mode", methods=["GET", "POST"])
def debug_mode():
    global DEBUG_MODE
    if request.method == "POST":
        DEBUG_MODE = bool(request.json.get("debug", False))
        return jsonify({"debug_mode": DEBUG_MODE, "message": f"デバッグモードを {'ON' if DEBUG_MODE else 'OFF'} にしました"})
    else:
        return jsonify({"debug_mode": DEBUG_MODE})

if __name__ == "__main__":
    if os.environ.get("FLASK_ENV") == "development":
        port = int(os.environ.get("PORT", 5000))
        app.run(host="0.0.0.0", port=port)
    else:
        print("Running in production mode. Gunicorn or another WSGI server should be used.")
