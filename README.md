# 衣櫃收納

把衣服記在 Google 試算表裡，用手機就能瀏覽、篩選，並選今天要穿什麼。這是一個可加到主畫面的 PWA（Progressive Web App）。頁首可以切換「中文 / English」，選擇會記在這個瀏覽器的 localStorage。

資料存在試算表 [衣櫃收納](https://docs.google.com/spreadsheets/d/1D3quZn6bvrtlQn2YcPn2NVmBmJyl-hkDx7WR-QDcZ7w/edit)。試算表欄位與寫入的值維持中文（名稱、類別、可穿、春、夏、秋、冬、四季等）。畫面上的按鈕、分頁、空狀態、表單標籤、提示，以及選項的顯示文字會跟著語言切換；存進試算表的仍是原本的中文。

## 在 GitHub Pages 開啟

網站從 `main` 分支的根目錄（`/`）發布。

預期網址：

https://joejoe66-bot.github.io/Clothes-/

若打不開，到這個 repository 的 **Settings → Pages**：

1. Build and deployment 的 Source 選 **Deploy from a branch**。
2. Branch 選 `main`，資料夾選 `/ (root)`。
3. 儲存後等幾分鐘，再用上面的網址重新整理。

## 在手機上使用

1. 用手機瀏覽器打開 https://joejoe66-bot.github.io/Clothes-/ 。
2. 登入你的 Google 帳號，授權讀寫試算表。
3. 加到主畫面：
   - iPhone：Safari 點「分享」→「加入主畫面」
   - Android：Chrome 選單 →「安裝應用程式」或「加到主畫面」

安裝後會以獨立 app 的方式開啟。頁首的「中文 / English」會記住你的選擇。

## 設定 Google 登入

前端用 Google Sheets API 讀寫資料，需要一個 OAuth **網頁應用程式**用戶端 ID。`config.js` 的 `CLIENT_ID` 目前是空的，請自行填上，不要改 `SPREADSHEET_ID`（已是 `1D3quZn6bvrtlQn2YcPn2NVmBmJyl-hkDx7WR-QDcZ7w`）。

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 開一個專案（或用現有專案）。
2. 啟用 **Google Sheets API**。
3. 設定 OAuth 同意畫面（外部或內部皆可；測試期間把你的 Google 帳號加進測試使用者）。
4. 建立「OAuth 用戶端 ID」，類型選「網頁應用程式」。
5. 在「已授權的 JavaScript 來源」加入下面兩個來源。Google 不接受帶路徑的來源，所以 Pages 要填網站的 origin，而不是完整路徑：
   - `https://joejoe66-bot.github.io`（對應 Pages 網址 https://joejoe66-bot.github.io/Clothes-/）
   - `http://localhost:8765`（本機預覽）
6. 把 Client ID 貼到 `config.js` 的 `CLIENT_ID`，推上 `main` 後重新整理 Pages 網站。

請用擁有該試算表的同一個 Google 帳號登入。

## 本機預覽

在倉庫根目錄執行：

```bash
python3 -m http.server 8765
```

然後在瀏覽器打開 http://localhost:8765 。本機預覽時，OAuth 用戶端的已授權 JavaScript 來源要包含 `http://localhost:8765`。
