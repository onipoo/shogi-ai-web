from flask import Flask, render_template, request, jsonify
import shogi
from shogi_ai import get_ai_move

app = Flask(__name__)
board = shogi.Board()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/move', methods=['POST'])
def move():
    global board
    data = request.json
    user_move = data.get('move')

    try:
        # ユーザーの手を盤に反映
        board.push_usi(user_move)

        # AIの手を生成して盤に反映
        ai_move = get_ai_move(board)
        board.push_usi(ai_move)

        return jsonify({'ai_move': ai_move})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)