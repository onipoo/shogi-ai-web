import shogi
import random

# 盤面を保持（最初は初期局面）
board = shogi.Board()

def get_ai_move(player_move):
    global board

    # プレイヤーの手を盤面に適用
    try:
        move = board.push_usi(player_move)
    except Exception as e:
        return "不正な手です"

    # AIが指す手（合法手からランダムで選ぶ）
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return "投了"

    ai_move = random.choice(legal_moves)
    board.push(ai_move)

    return ai_move.usi()