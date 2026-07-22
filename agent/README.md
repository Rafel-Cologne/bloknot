# Bloknot Email Agent

Node.js скрипт, который запускается через GitHub Actions каждые 20 минут.

## Как это работает

1. Читает непрочитанные письма в `bloknot.app@gmail.com`
2. Определяет пользователя по Gmail-алиасу (`+rafael`, `+maria` и т.д.)
3. Классифицирует письмо через Claude API (бронирование / счёт / прочее)
4. Извлекает структурированные данные и пишет в Supabase
5. Помечает письмо лейблом `bloknot-processed`

## GitHub Secrets (нужно настроить в репозитории)

| Secret | Где взять |
|--------|-----------|
| `GMAIL_CLIENT_ID` | Google Cloud Console → OAuth 2.0 |
| `GMAIL_CLIENT_SECRET` | Google Cloud Console → OAuth 2.0 |
| `GMAIL_REFRESH_TOKEN` | Получить через OAuth playground или локальный скрипт |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (service_role, не anon!) |

## Настройка Gmail OAuth

1. Создать проект в Google Cloud Console
2. Включить Gmail API
3. Создать OAuth 2.0 client (Desktop App)
4. Получить `refresh_token`:
   - Зайти на https://developers.google.com/oauthplayground/
   - В шестерёнке: ввести client_id и client_secret, выбрать "Use your own OAuth credentials"
   - В Step 1 выбрать scope: `https://mail.google.com/`
   - Пройти авторизацию за аккаунт `bloknot.app@gmail.com`
   - В Step 2 обменять code на токены, скопировать `refresh_token`

## Настройка пересылки у пользователей

Каждый пользователь в своём личном Gmail настраивает фильтры:
- **От**: `automated@airbnb.com`, `express@airbnb.com`
  → **Переслать на**: `bloknot.app+ЕГО_АЛИАС@gmail.com`
- **От**: `*@booking.com`
  → **Переслать на**: тот же адрес
- **От**: провайдеров услуг (Iberdrola, Endesa, Aguas de Torrevieja и т.д.)
  → **Переслать на**: тот же адрес

## Тестовый запуск (без записи в БД)

```bash
cd agent
npm install
node index.js --dry-run
```
