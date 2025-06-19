FROM node:20.17.0

# 作業ディレクトリを設定
WORKDIR /workspace

# 必要なツールをインストール
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install git curl wget nano \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# 2. npm はベースイメージ付属の最新版を利用できる
RUN npm install -g npm@latest

# グローバルパッケージのインストール
RUN npm install -g nodemon

# node_modules のパーミッション問題を回避
RUN mkdir -p /workspace/node_modules && chown -R node:node /workspace

# ユーザーを node に切り替え
USER node

# コンテナ起動時のコマンド
CMD ["sleep", "infinity"]
