from flask import Flask, request, jsonify, render_template
import shogi
import traceback
import copy
import random

app = Flask(__name__)
board = shogi.Board()

def evaluate_board(bd):
    piece_values = {
        "P": 1,
        "+P": 5,
        "L": 3,
        "+L": 7,
        "N": 3,
        "+N": 7,
        "S": 5,
        "+S": 9,
        "G": 6,
        "B": 8,
        "+B": 13,
        "R": 10,
        "+R": 15,
        "K": 0
    }

    score = 0
    for square in shogi.SQUARES:
        piece = bd.piece_at(square)
        if piece:
            symbol = piece.symbol().upper()
            value = piece_values.get(symbol, 0)
            score += value if piece.color == shogi.WHITE else -value
    return score

    
def evaluate_move(board, move):

    import copy
    # 1. 現在の盤面を評価
    before = evaluate_board(board)
    # 2. 手を適用してから評価
    temp_board = copy.deepcopy(board)
    temp_board.push(move)
    after = evaluate_board(temp_board)
    # 3. 評価値の差分（AI視点のプラス）
    return after - before



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

    print(f"DEBUG: from={from_sq}, to={to_sq}, promote={promote}")

    try:
        # 1. USI作成
        if "*" in from_sq:
            usi = f"{from_sq.upper()}{to_sq}"  # 打ち駒だけ upper() に
        else:
            usi = f"{from_sq}{to_sq}"
            if promote:
                usi += "+"

        print(f"DEBUG: usi={usi}")

        # 2. 指し手オブジェクトに変換
        try:
            move = shogi.Move.from_usi(usi)
        except Exception as e:
            return jsonify({"success": False, "error": f"形式が不正です: {e}"}), 400

        # 3. 二歩チェック
        if usi.startswith("P*") and board.turn == shogi.BLACK:
            file = usi[2]  # 例: "P*7f" → "7"
            for rank in "abcdefghi":
                sq = f"{file}{rank}"
                try:
                    square = shogi.SQUARE_NAMES.index(sq)
                    piece = board.piece_at(square)
                    if piece and piece.piece_type == shogi.PAWN and piece.color == shogi.BLACK:
                        return jsonify({"success": False, "error": "二歩は禁止です"}), 400
                except ValueError:
                    continue

        # 4. 打ち歩詰めチェック
        if usi.startswith("P*"):
            temp_board = copy.deepcopy(board)
            temp_board.push(move)
            if temp_board.is_checkmate():
                return jsonify({"success": False, "error": "打ち歩詰めは禁止です"}), 400

        # 5. 合法手か？（最後に実行）
        if move not in board.legal_moves:
            return jsonify({"success": False, "error": "不正な手です。"}), 400

        # 6. 手を進める
        board.push(move)

        # 7. 詰みチェック
        if board.is_checkmate():
            return jsonify({
                "success": True,
                "board_sfen": board.sfen(),
                "hands": get_hands_json(),
                "game_over": True,
                "winner": "先手"
            })

        # 8. AI応手
        ai_move_str = None

        if not board.is_game_over():

            print("=== AI手候補と評価 ===")
            best_score = None
            best_moves = []

            for mv in board.legal_moves:
                score = evaluate_move(board, mv)
                print(f"{mv.usi()} : 評価値 = {score}")

                if best_score is None or score > best_score:
                    best_score = score
                    best_moves = [mv]
                elif score == best_score:
                    best_moves.append(mv)

            ai_move = random.choice(best_moves)
            board.push(ai_move)
            ai_move_str = ai_move.usi()
            print(f" AIが選んだ手: {ai_move_str}（評価値: {best_score}）")
            ai_move_piece = board.piece_at(ai_move.to_square)

            #  AIが指した後、詰みかチェック
            if board.is_checkmate():
                return jsonify({
                    "success": True,
                    "board_sfen": board.sfen(),
                    "hands": get_hands_json(),
                    "ai_move": ai_move_str,
                    "ai_piece": ai_move_piece.symbol(),
                    "game_over": True,
                    "winner": "後手"
                })

        # 9. 通常応答
        return jsonify({
            "success": True,
            "board_sfen": board.sfen(),
            "hands": get_hands_json(),
            "ai_move": ai_move_str,
            "ai_piece": ai_move_piece.symbol()
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