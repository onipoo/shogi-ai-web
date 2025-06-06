from flask import Flask, render_template, request, jsonify
from shogi_ai import get_ai_move  # あなたのAI関数を使う想定

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/move', methods=['POST'])
def move():
    data = request.get_json()
    player_move = data.get('player_move')

    # AIの手を計算（仮にget_ai_moveという関数名だとする）
    ai_move = get_ai_move(player_move)

    return jsonify({'ai_move': ai_move})





if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=port)