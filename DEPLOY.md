# FinAdvisor — Деплой на Render

## Что нужно перед началом

1. Аккаунт на [render.com](https://render.com) (бесплатный план подходит)
2. Telegram Bot Token — получить у [@BotFather](https://t.me/BotFather)
3. Anthropic API Key — получить на [console.anthropic.com](https://console.anthropic.com)
4. OpenAI API Key — получить на [platform.openai.com](https://platform.openai.com) (для голосовых сообщений)
5. Репозиторий загружен на GitHub

---

## Способ 1: Blueprint (автоматический) — рекомендуется

### Шаг 1 — Создать сервисы через Blueprint

1. Зайди на [dashboard.render.com](https://dashboard.render.com)
2. Нажми **New** → **Blueprint**
3. Подключи свой GitHub-репозиторий
4. Render автоматически найдёт `render.yaml` и создаст:
   - **PostgreSQL базу данных** `finbot-db`
   - **Web Service** `finbot`
5. Нажми **Apply**

### Шаг 2 — Заполнить секреты (Environment Variables)

После создания сервисов зайди в **finbot** → **Environment**:

| Переменная           | Значение                                            |
|---------------------|-----------------------------------------------------|
| `TELEGRAM_BOT_TOKEN`| Токен от BotFather                                  |
| `ANTHROPIC_API_KEY` | Ключ Anthropic API                                  |
| `OPENAI_API_KEY`    | Ключ OpenAI API                                     |
| `WEBHOOK_URL`       | URL твоего сервиса (см. шаг 3)                      |

> `DATABASE_URL` заполнится автоматически из базы данных.

### Шаг 3 — Установить WEBHOOK_URL

1. Зайди в **finbot** сервис на Render
2. Скопируй URL сервиса вверху страницы — он выглядит как:
   ```
   https://finbot-xxxx.onrender.com
   ```
3. Зайди в **Environment** → установи `WEBHOOK_URL` = этот URL
4. Нажми **Save Changes** — сервис перезапустится

### Шаг 4 — Проверить

1. Открой `https://finbot-xxxx.onrender.com/health` — должен вернуть `{"status":"ok"}`
2. Напиши боту `/start` в Telegram
3. Попробуй: `"потратил 45 на продукты"`

---

## Способ 2: Ручная настройка

### Шаг 1 — Создать PostgreSQL базу

1. Render Dashboard → **New** → **PostgreSQL**
2. Name: `finbot-db`
3. Plan: **Free**
4. Нажми **Create Database**
5. Скопируй **Internal Connection String** (понадобится на шаге 3)

### Шаг 2 — Создать Web Service

1. Render Dashboard → **New** → **Web Service**
2. Подключи репозиторий с GitHub
3. Настрой:

| Параметр         | Значение                          |
|-----------------|-----------------------------------|
| Name            | `finbot`                          |
| Runtime         | **Node**                          |
| Build Command   | `npm run build:render`            |
| Start Command   | `npm start`                       |
| Plan            | **Free**                          |
| Health Check    | `/health`                         |

### Шаг 3 — Environment Variables

Зайди в **Environment** → добавь все переменные:

```
NODE_ENV=production
PORT=10000
DATABASE_URL=<Internal Connection String из шага 1>
TELEGRAM_BOT_TOKEN=<от BotFather>
ANTHROPIC_API_KEY=<ключ Anthropic>
OPENAI_API_KEY=<ключ OpenAI>
WEBHOOK_URL=<URL сервиса, после первого деплоя>
LOG_LEVEL=info
```

### Шаг 4 — Первый деплой

1. Нажми **Manual Deploy** → **Deploy latest commit**
2. Дождись пока билд пройдёт (2-3 минуты)
3. Скопируй URL сервиса и добавь `WEBHOOK_URL`
4. Сервис перезапустится автоматически

---

## Как получить Telegram Bot Token

1. Открой Telegram, найди [@BotFather](https://t.me/BotFather)
2. Напиши `/newbot`
3. Введи имя бота (например: `FinAdvisor`)
4. Введи username (например: `my_finadvisor_bot`)
5. BotFather даст токен вида: `7123456789:AAHxxx...`
6. Скопируй его — это `TELEGRAM_BOT_TOKEN`

---

## Устранение проблем

### Бот не отвечает
- Проверь `/health` эндпоинт — работает?
- Проверь логи: Render Dashboard → **Logs**
- Убедись что `WEBHOOK_URL` установлен правильно (без `/webhook` на конце)

### Ошибки базы данных
- Проверь `DATABASE_URL` — должен начинаться с `postgresql://`
- Render автоматически запустит `prisma db push` при билде

### Бот отвечает медленно
- Free план Render засыпает после 15 мин неактивности
- Первый запрос после "сна" занимает ~30 сек (cold start)
- Решение: перейти на платный план ($7/мес) для постоянной работы

### Ошибки webhook
- Убедись что `WEBHOOK_URL` = полный URL без `/webhook`
- Бот автоматически добавит `/webhook` при старте

---

## Локальная разработка (с PostgreSQL)

```bash
# Установить зависимости
npm install

# Создать .env файл
cp .env.example .env
# Заполни ключи в .env

# Если используешь Docker для PostgreSQL:
docker run -d --name finbot-pg -e POSTGRES_DB=finbot -e POSTGRES_USER=finbot -e POSTGRES_PASSWORD=secret -p 5432:5432 postgres:16

# DATABASE_URL=postgresql://finbot:secret@localhost:5432/finbot

# Создать таблицы
npx prisma db push

# Запустить бота (polling mode)
npm run dev
```

---

## Обновление бота

Просто пушь в GitHub — Render автоматически подхватит и задеплоит:

```bash
git add .
git commit -m "update bot"
git push
```
