from flask import Flask, render_template, request, jsonify
from shogi_ai import get_ai_move  # あなたのAI関数を使う想定

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route("/get_ai_move", methods=["POST"])
def get_ai_move_route():
    data = request.get_json()
    sfen = data.get("sfen")
    ai_move = get_ai_move(sfen)  # 自作AIの関数（sfenを渡す想定）
    return jsonify({"ai_move_sfen": ai_move})





if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=port)