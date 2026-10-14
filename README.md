# SCROLLING.LIGHT

滿版跑馬燈：打一段文字，讓它捲過整個螢幕，可以是 LED 點陣，也可以是平滑的大字。所有設定都在網址裡，沒有後端，沒有帳號，伺服器上也不存任何東西。

**https://scrolling-light.pages.dev**

做法參考 [BIGWORDS.PAGE](https://github.com/SpeakingOfBrad/BIGWORDS.PAGE)：內容放在網址的 fragment（`#` 後面），瀏覽器不會把這段送給伺服器。

## 使用

| 網址 | 內容 |
|---|---|
| `/` | 編輯器，附即時預覽。打開時會接著上次的內容 |
| `/edit#…` | 編輯一個既有的跑馬燈；編輯器會把目前的狀態寫進這個網址 |
| `/#…` | 播放畫面。點一下畫面會出現「編輯」和「全螢幕」，幾秒後自動隱藏 |

- 播放時會讓螢幕保持常亮。手機進全螢幕時會鎖定橫向（裝置支援的話）。
- 可以安裝成 App（Chrome 的「安裝」，或 iPhone／iPad 的「分享 → 加入主畫面」）。iPhone 的 Safari 不支援網頁全螢幕，裝成 App 才會滿版。
- 開過一次之後，沒有網路也能打開，在收訊差的場館也能用。網頁字型則是用過的才會存下來。

## 網址參數

```
/#開演倒數 {countdown}&until=2027-01-01T19:00:00Z&zero=開演！&fg=ff3b30
```

訊息是第一個沒編碼的 `&` 之前的所有內容，之後每一段是一個 `key=value`。

| 參數 | 作用 | 值 | 預設 |
|---|---|---|---|
| *(訊息)* | 要捲動的文字；換行會顯示成空格 | 百分比編碼過的文字 | *(空)* |
| `fg` | 文字顏色 | 6 碼 hex，不含 `#` | `ffb000` |
| `bg` | 背景顏色 | 6 碼 hex，不含 `#` | `000000` |
| `speed` | 每秒捲動幾個字高，所以手機和電視上的閱讀速度一樣 | `0.5`–`10` | `2` |
| `led` | LED 點陣的列數；`off` 是平滑大字 | `8`–`64` 或 `off` | `32` |
| `dir` | 往哪裡捲 | `left`、`right` | `left` |
| `font` | 字型：裝置內建、思源黑體（每台裝置都一樣）、俐方體11號（點陣字） | `system`、`noto`、`pixel` | `system` |
| `until` | 倒數到這個時間。沒寫時區就用播放裝置的時間 | ISO 8601（`2027-01-01T19:00:00Z`） | *(無)* |
| `timer` | 從打開畫面開始倒數多久 | 秒數，或 `d`/`h`/`m`/`s`（`1h30m`），最長 99 天 | *(無)* |
| `zero` | 倒數歸零後改顯示的文字；不寫就停在 `0:00` | 百分比編碼過的文字 | *(無)* |

- 訊息裡的 `{countdown}` 會換成倒數，例如 `2天 03:04:05`、`3:04:05`、`4:05`。設了倒數但沒有寫訊息時，就只顯示倒數。
- `until` 和 `timer` 只能用一個；兩個都寫的話，用網址裡先出現的那個。
- `font=pixel` 搭配 LED 時固定 16 列，一個字型像素剛好對一顆燈，`led` 的數字不作用；`led=off` 時是放大的點陣字。字型裡沒有的字會改用系統字型。
- 思源黑體依字分成約 100 個檔，用到哪些字才下載哪些檔。文字本身不會送出，但伺服器的請求紀錄看得出下載了哪幾個檔，也就能粗略推知用到哪一批字。介意的話用 `system`，或用 `pixel`（俐方體是單一檔案）。
- 無效的值會退回預設，超出範圍的數字會被夾到上下限，播放畫面永遠不會顯示錯誤。
- 訊息裡的 `&`、`#`、`%` 一定要分別寫成 `%26`、`%23`、`%25`。編輯器產生的連結都已經編碼好了。

## 部署

push 到 `main`，Cloudflare Pages 就會直接發布 `public/`。不需要 build，也沒有依賴要裝。`public/_redirects` 把 `/edit` 改寫到 `index.html`，`public/_headers` 設定 CSP 等安全標頭。Pages 開了 Cloudflare Web Analytics，CSP 只放行它的腳本（`static.cloudflareinsights.com`）和回報位址（`cloudflareinsights.com`）。它回報的頁面網址不含 `#` 之後的訊息。

### 自架

```sh
make up      # docker compose：Caddy 在 http://localhost:8080 服務 public/
make down
```

映像用 `Caddyfile` 重現 Pages 的行為：送出同樣的 headers，所有路徑都回應 app。`make test` 會檢查 `Caddyfile` 和 `public/_headers` 的內容一致。

## 開發

開發工具（node、pnpm、resvg）的版本寫在 `mise.toml`，Makefile 透過 `mise exec` 使用，第一次執行時會自動安裝。wrangler 比較大，只有 `make dev` 會用到，所以用 `pnpm dlx` 在需要時才抓，版本寫在 Makefile。

```sh
make test    # 單元測試（node --test）
make dev     # wrangler pages dev，跟 Pages 一樣套用 _headers 和 _redirects
make icons   # 從 SVG 重新產生 App 圖示的 PNG（產生的 PNG 要一起 commit）
make fonts   # 重新產生 public/fonts/（產生的字型要一起 commit）
```

思源黑體用 pnpm 管理，版本鎖在 `tools/pnpm-lock.yaml`。lockfile 刻意不放在根目錄：Pages 在根目錄看到 lockfile 就會在部署時安裝依賴。俐方體沒有上 npm，版本和 SHA-256 寫在 Makefile。

| 檔案 | 用途 |
|---|---|
| `public/state.js` | 網址 fragment 的解析、驗證、產生，以及倒數 |
| `public/marquee.js` | Canvas 繪製器，播放畫面和編輯器預覽共用 |
| `public/app.js` | 路由、編輯器、播放畫面（常亮、全螢幕、控制列） |
| `public/sw.js` | 離線用的 service worker，網路優先，網路斷了或卡住時用存下來的版本 |
| `public/fonts/` | 網頁字型，由 `make fonts` 產生 |
| `assets/icon-full.svg` | 滿版的圖示原稿，給 Android maskable 圖示和 iOS 主畫面圖示用 |

## 授權

`public/state.js` 的 fragment 解析和倒數參數改寫自 BIGWORDS.PAGE（MIT）。`public/fonts/` 裡的思源黑體（Noto Sans TC）和俐方體11號都是 SIL OFL 1.1，授權全文放在各自的目錄。見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
