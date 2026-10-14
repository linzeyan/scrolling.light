# SCROLLING.LIGHT

滿版跑馬燈。打一段文字，它就從右往左捲過整個螢幕，可以是 LED 點陣，也可以是平滑的大字。所有設定都在網址裡，沒有後端、沒有帳號，伺服器上也不存任何東西。

參考 [BIGWORDS.PAGE](https://github.com/SpeakingOfBrad/BIGWORDS.PAGE) 的做法：內容放在網址的 fragment（`#` 後面），瀏覽器不會把這段送給伺服器。

## 使用

| 網址 | 內容 |
|---|---|
| `/` | 編輯器，附即時預覽 |
| `/edit#…` | 編輯既有的跑馬燈，編輯器會把目前狀態寫進這個網址 |
| `/#…` | 播放畫面，沒有任何控制項。點一下切換全螢幕，手機會鎖橫向（支援的話） |

播放時會要求螢幕保持常亮。iPhone 的 Safari 不支援網頁全螢幕，可以改用「加入主畫面」。

## 網址參數

```
/#歡迎光臨&fg=ff3b30&speed=3&led=off
```

訊息是第一個沒編碼的 `&` 之前的所有內容，之後每一段是一個 `key=value`。

| 參數 | 作用 | 值 | 預設 |
|---|---|---|---|
| *(訊息)* | 要捲動的文字 | 百分比編碼過的文字；換行會顯示成空格 | *(空)* |
| `fg` | 文字顏色 | 6 碼 hex，不含 `#` | `ffb000` |
| `bg` | 背景顏色 | 6 碼 hex，不含 `#` | `000000` |
| `speed` | 每秒捲動幾個「字高」，所以手機和電視的閱讀速度一樣 | `0.5`–`10` | `2` |
| `led` | LED 點陣的列數，`off` 是平滑大字 | `8`–`64` 或 `off` | `32` |

無效的值會退回預設，超出範圍的數字會被夾到上下限，播放畫面永遠不會顯示錯誤。訊息裡的 `&`、`#`、`%` 一定要編碼成 `%26`、`%23`、`%25`；編輯器產生的連結都已經編碼好了。

## 部署到 Cloudflare Pages

整個網站就是 `public/` 這個資料夾，不需要 build。

- **Git 整合**：Build command 留空，Build output directory 填 `public`。
- **直接上傳**：`npm run deploy`（也就是 `npx wrangler pages deploy public --project-name scrolling-light`）。

`public/_redirects` 把 `/edit` 改寫到 `index.html`，`public/_headers` 設定 CSP 等安全標頭。

## 開發

```sh
npm run dev   # wrangler pages dev，會套用 _headers 和 _redirects
npm test      # node --test，不需要安裝任何套件
```

| 檔案 | 用途 |
|---|---|
| `public/state.js` | 網址 fragment 的解析、驗證與產生 |
| `public/marquee.js` | Canvas 繪製器，播放畫面和編輯器預覽共用 |
| `public/app.js` | 路由、編輯器、播放畫面（常亮、全螢幕） |

## 授權

`public/state.js` 的 fragment 解析改寫自 BIGWORDS.PAGE（MIT），見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
