import shogi
import random

def get_ai_move(board):
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return None
    return random.choice(legal_moves).usi()