# Jenkins Setup Checklist

Thực hiện các bước này **một lần duy nhất** trên Jenkins server. Sau đó mọi push lên GitHub sẽ tự trigger build.

---

## 1. Cài Plugins

Vào **Manage Jenkins → Plugin Manager → Available plugins**, tìm và cài:

| Plugin | Mục đích |
|---|---|
| **GitHub Integration Plugin** | Nhận webhook từ GitHub, trigger build khi push/PR |
| **Docker Pipeline Plugin** | Dùng `agent { docker { ... } }` trong Jenkinsfile |
| **Allure Jenkins Plugin** | Render Allure report ngay trên Jenkins build page |

Restart Jenkins sau khi cài xong.

---

## 2. Thêm Credentials

Vào **Manage Jenkins → Credentials → System → Global credentials → Add Credentials**.

Tạo 3 credential, loại **Secret text**:

| ID (phải khớp chính xác) | Value |
|---|---|
| `codecept-base-url` | URL của app đang test, vd: `https://dev.yourapp.com` |
| `codecept-api-url` | URL của API, vd: `https://api.dev.yourapp.com` |
| `anthropic-api-key` | API key Anthropic (lấy từ console.anthropic.com) |

> Nếu cần thêm `ADMIN_EMAIL`, `ADMIN_PASSWORD` cho login test: thêm tương tự và khai báo trong block `environment {}` của Jenkinsfile.

---

## 3. Tạo Pipeline Job

1. **New Item** → chọn **Pipeline** → đặt tên `codecept-hybrid-ci`
2. Trong tab **General**: tick **GitHub project**, điền URL repo GitHub
3. Trong tab **Build Triggers**: tick **GitHub hook trigger for GITScm polling**
4. Trong tab **Pipeline**:
   - Definition: **Pipeline script from SCM**
   - SCM: **Git**
   - Repository URL: URL GitHub repo của bạn
   - Branch: `*/main` (hoặc `*/master`)
   - Script Path: `Jenkinsfile`
5. **Save**

---

## 4. Cấu hình GitHub Webhook

Trên GitHub repo → **Settings → Webhooks → Add webhook**:

| Trường | Giá trị |
|---|---|
| Payload URL | `http://<jenkins-server>/github-webhook/` |
| Content type | `application/json` |
| Events | Chọn: **Pushes** + **Pull requests** |
| Active | ✅ |

> Nếu Jenkins chạy local (không có public IP), dùng [ngrok](https://ngrok.com/) để expose: `ngrok http 8080` → dùng URL ngrok làm Payload URL.

---

## 5. Verify

1. Tạo một dummy commit và push lên GitHub
2. Trong vòng 30 giây, Jenkins job `codecept-hybrid-ci` sẽ tự trigger
3. Sau khi build xong, tab **Allure Report** xuất hiện trên build page
4. Screenshots/traces/videos download được qua **Build Artifacts**

---

## Cấu trúc Output trên Jenkins

```
Build #N
├── Allure Report          ← Kết quả chromium + firefox gộp lại
├── Build Artifacts
│   ├── output/screenshots/
│   ├── output/trace/      ← .zip mở bằng `npx playwright show-trace`
│   └── output/videos/
└── Console Output         ← Raw logs để debug
```

---

## Nightly Regression

Nightly đã được cấu hình trong Jenkinsfile (`cron('H 2 * * *')` — 2am UTC mỗi đêm). Không cần tạo job riêng. Khi nightly fail, email tự động gửi tới địa chỉ cấu hình trong `Jenkinsfile` block `post { failure { mail ... } }`.

Để đổi email nhận thông báo, sửa dòng `mail to:` trong `Jenkinsfile`.
