# 📚 Документация по Тестированию AI Translator & Critic

> Полное руководство для QA специалистов по запуску юнит-тестов и UI тестов

## 📋 Содержание

1. [Юнит-тесты (Unit Tests)](#-юнит-тесты)
2. [UI Тесты (Cypress)](#-ui-тесты-cypress)
3. [Установка и Конфигурация](#-установка-и-конфигурация)
4. [Запуск Тестов](#-запуск-тестов)
5. [Интерпретация Результатов](#-интерпретация-результатов)
6. [Troubleshooting](#-troubleshooting)

---

## 🧪 Юнит-тесты

### Описание

Юнит-тесты проверяют отдельные функции Python приложения в изоляции от внешних зависимостей.

**Файл тестов:** `tests/unit/test_app.py`

### Что тестируется?

#### ✅ Позитивные тесты (Positive Tests)

Проверяют, что приложение работает корректно при нормальных условиях:

| Тест | Описание |
|------|---------|
| `test_call_llm_success` | Успешный вызов LLM функции с мокированным ответом |
| `test_translation_api_call_format` | Проверка правильного формата запроса к API |
| `test_index_get_returns_form` | GET / возвращает форму |
| `test_post_translation_flow` | Полный сценарий перевода и оценки |

#### 🔐 Тесты переменных окружения (Environment Tests)

Проверяют работу с API ключами и конфигурацией:

| Тест | Описание |
|------|---------|
| `test_api_key_loaded_from_env` | API ключ загружается из .env |
| `test_call_llm_without_api_key` | Приложение не падает без ключа |

#### 🔴 Тесты обработки ошибок (Error Handling Tests)

Проверяют корректную обработку различных ошибок:

| Тест | Описание |
|------|---------|
| `test_call_llm_connection_error` | Обработка ошибки подключения |
| `test_call_llm_timeout_error` | Обработка таймаута |
| `test_call_llm_http_error_401` | Обработка ошибки 401 (Unauthorized) |
| `test_call_llm_http_error_500` | Обработка ошибки 500 (Server Error) |
| `test_call_llm_malformed_response` | Обработка некорректного формата ответа |
| `test_call_llm_generic_exception` | Обработка неизвестного исключения |
| `test_post_empty_text_error` | Обработка пустого текста в форме |

#### 🔄 Интеграционные тесты (Integration Tests)

Проверяют взаимодействие нескольких компонентов:

| Тест | Описание |
|------|---------|
| `test_full_translation_workflow` | Полный процесс от открытия формы до результатов |

#### 🔧 Параметризованные тесты (Parametrized Tests)

Запускают один тест с разными параметрами:

| Тест | Параметры |
|------|-----------|
| `test_different_models` | Различные AI модели |

### Ключевые концепции

#### 🎭 MOCKING (Мокирование)

**Что это?**
Мокирование - это замена реальных внешних зависимостей на "поддельные" объекты.

**Зачем?**
- ✅ Не тратим реальные токены API
- ✅ Тесты выполняются быстро
- ✅ Тесты не зависят от состояния API
- ✅ Можем симулировать ошибки

**Как в коде?**
```python
@patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test_key'})
@patch('app.requests.post')
def test_example(self, mock_post):
    # mock_post - это поддельная версия requests.post
    mock_post.return_value = MagicMock()  # Возвращает фиктивный объект
```

#### 🔧 Фикстуры (Fixtures)

**Что это?**
Фикстуры - это функции, которые подготавливают данные для каждого теста.

**Пример:**
```python
@pytest.fixture
def client():
    """Создаёт тестовый клиент Flask"""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client
```

#### ✔️ Assertions (Проверки)

**Что это?**
Assertions - это команды проверки результатов.

**Примеры:**
```python
assert result == "expected value"
assert mock_post.call_count == 1
assert 'text' in response.data
```

---

## 🌐 UI Тесты (Cypress)

### Описание

UI тесты проверяют приложение с точки зрения пользователя, взаимодействуя с интерфейсом.

**Файл тестов:** `cypress/e2e/translator_critic.cy.js`

### Что тестируется?

#### 🎯 Основные сценарии

| Тест | Описание |
|------|---------|
| `Успешный Перевод и Оценка Качества` | Полный рабочий сценарий |
| `Обработка Ошибки API (500)` | Приложение обрабатывает ошибку сервера |
| `Валидация - Пустое Поле Текста` | Нельзя отправить форму с пустым текстом |
| `Все элементы формы присутствуют и видимы` | Проверка UI элементов |
| `Выбор Разных Языков Работает Корректно` | Все языки выбираются |
| `Результаты содержат правильные секции` | Проверка структуры результатов |
| `Повторный Перевод Работает Корректно` | Несколько переводов подряд |
| `Длинный Текст Обрабатывается Корректно` | Работа с большими текстами |
| `Спецсимволы и Эмодзи Обрабатываются Корректно` | Unicode поддержка |
| `Адаптивный Дизайн - Мобильное Устройство` | Работа на мобильных экранах |

### Ключевые концепции

#### 🚫 cy.intercept() - Перехват Запросов

**Что это?**
`cy.intercept()` перехватывает HTTP запросы и возвращает поддельные ответы.

**Как работает?**
```javascript
cy.intercept(
  {
    method: 'POST',
    url: 'https://openrouter.ai/api/v1/chat/completions'
  },
  {
    statusCode: 200,
    body: {
      choices: [{ message: { content: 'Mocked answer' } }]
    }
  }
).as('apiCall');  // Даём имя перехвату
```

**Преимущества:**
- ✅ Контролируем ответ API
- ✅ Симулируем ошибки (500, 401 и т.д.)
- ✅ Проверяем, был ли запрос отправлен
- ✅ Тесты не зависят от реального API

#### ⏳ cy.wait() - Ожидание Запроса

**Что это?**
`cy.wait('@aliasName')` ждёт, пока будет выполнен перехвачен запрос с названием.

**Пример:**
```javascript
cy.wait('@translationRequest').then((interception) => {
  // Проверяем параметры запроса
  expect(interception.request.body.model).to.equal('openrouter/free');
});
```

#### ✔️ Assertions в Cypress

**Основные проверки:**
```javascript
cy.get('selector').should('be.visible');     // Видимый
cy.get('selector').should('be.enabled');     // Включен
cy.get('selector').should('exist');          // Существует
cy.get('selector').should('have.value', 'x'); // Имеет значение
cy.contains('text').should('be.visible');    // Содержит текст
```

---

## 🛠️ Установка и Конфигурация

### Требования

- Python 3.8+
- Node.js 14+
- npm или yarn

### Шаг 1: Установка Python зависимостей

```bash
# Установить pytest и зависимости для юнит-тестов
pip install -r requirements.txt
pip install pytest pytest-mock

# Для отчётов о покрытии кода
pip install pytest-cov
```

**requirements.txt:**
```
Flask==2.3.3
requests==2.31.0
python-dotenv==1.0.0
pytest==7.4.0
pytest-mock==3.11.1
pytest-cov==4.1.0
```

### Шаг 2: Установка Cypress

```bash
# Установить Cypress через npm
npm install --save-dev cypress

# Или через yarn
yarn add --dev cypress
```

### Шаг 3: Конфигурация .env файла

Создайте файл `.env` в корневой директории:

```
OPENROUTER_API_KEY=your_actual_api_key_here
```

⚠️ **Важно:** Не коммитьте `.env` в git! Добавьте в `.gitignore`:
```
.env
__pycache__/
*.pyc
node_modules/
cypress/videos/
cypress/screenshots/
```

### Шаг 4: Запуск приложения

**Терминал 1: Запуск Flask приложения**
```bash
cd src
python app.py
```

Приложение будет доступно на `http://localhost:5000`

---

## ▶️ Запуск Тестов

### Юнит-тесты

#### Запустить все тесты
```bash
pytest tests/unit/test_app.py -v
```

#### Запустить конкретный тест
```bash
pytest tests/unit/test_app.py::TestCallLLMPositive::test_call_llm_success -v
```

#### Запустить с показом логов
```bash
pytest tests/unit/test_app.py -v -s
```

#### Запустить только позитивные тесты
```bash
pytest tests/unit/test_app.py::TestCallLLMPositive -v
```

#### Запустить только тесты ошибок
```bash
pytest tests/unit/test_app.py::TestErrorHandling -v
```

#### Создать отчёт о покрытии кода
```bash
pytest tests/unit/test_app.py --cov=src --cov-report=html
```

Отчёт будет в `htmlcov/index.html`

### UI Тесты (Cypress)

#### Открыть Cypress Interactive режим
```bash
npx cypress open
```

Откроется окно Cypress, где вы сможете выбрать браузер и запустить тесты.

#### Запустить все UI тесты в headless режиме
```bash
npx cypress run
```

#### Запустить конкретный тест файл
```bash
npx cypress run --spec "cypress/e2e/translator_critic.cy.js"
```

#### Запустить в конкретном браузере
```bash
# Chrome
npx cypress run --browser chrome

# Firefox
npx cypress run --browser firefox

# Edge
npx cypress run --browser edge
```

#### Запустить с видеозаписью
```bash
npx cypress run --record
```

#### Запустить на мобильном размере
```bash
npx cypress run --config viewportWidth=375,viewportHeight=667
```

---

## 📊 Интерпретация Результатов

### Юнит-тесты

#### Успешный запуск
```
tests/unit/test_app.py::TestCallLLMPositive::test_call_llm_success PASSED [10%]
tests/unit/test_app.py::TestCallLLMPositive::test_translation_api_call_format PASSED [20%]
...
========================= 20 passed in 2.34s =========================
```

✅ Всё работает!

#### Ошибка в тесте
```
tests/unit/test_app.py::TestErrorHandling::test_call_llm_connection_error FAILED [50%]

AssertionError: assert None != 'expected_value'
```

❌ Тест не прошёл. Нужно проверить функцию.

#### Ошибка в конфигурации
```
ModuleNotFoundError: No module named 'app'
```

❌ Путь до модуля некорректный. Проверьте sys.path.insert().

### UI Тесты (Cypress)

#### Успешный запуск
```
✓ Успешный Перевод и Оценка Качества (3.5s)
✓ Обработка Ошибки API (500 Internal Server Error) (2.1s)
✓ Валидация - Пустое Поле Текста (1.2s)

3 passing (6.8s)
```

✅ Все тесты прошли!

#### Ошибка в тесте
```
✗ Успешный Перевод и Оценка Качества (5.2s)

Error: Timed out after waiting 4000ms for the server to respond to the request:
  POST https://openrouter.ai/api/v1/chat/completions
```

❌ Элемент не появился за 4 секунды. Возможные причины:
- Приложение не запущено
- API запрос не был перехвачен
- Селектор неправильный

#### Скриншоты при ошибке
```
cypress/screenshots/translator_critic.cy.js/
  ├── Успешный Перевод и Оценка Качества -- failure.png
  └── [other failed tests...]
```

📸 Cypress сохраняет скриншоты ошибок в папке `cypress/screenshots/`

---

## 🔧 Troubleshooting

### Проблема: "pytest: command not found"

**Решение:**
```bash
pip install pytest
# или используйте
python -m pytest tests/unit/test_app.py -v
```

### Проблема: "Module not found: app"

**Решение:**
```bash
# Убедитесь, что запускаете из корневой директории проекта
pwd  # Проверьте текущую директорию

# Или явно установите PYTHONPATH
export PYTHONPATH="${PYTHONPATH}:$(pwd)/src"
pytest tests/unit/test_app.py -v
```

### Проблема: "API Key not found"

**Решение:**
1. Создайте файл `.env` в корневой директории
2. Добавьте: `OPENROUTER_API_KEY=your_key`
3. Убедитесь, что используется `python-dotenv` (уже установлен)

### Проблема: "Cannot GET /"

**Решение:**
```bash
# Убедитесь, что Flask приложение запущено
cd src
python app.py

# Проверьте, что приложение слушает на 5000 порту
curl http://localhost:5000/
```

### Проблема: Cypress не находит элемент

**Решение:**
1. Проверьте селектор в браузере (DevTools)
2. Убедитесь, что элемент видимый (не скрыт)
3. Увеличьте таймаут: `cy.get('selector', { timeout: 10000 })`
4. Используйте `cy.contains()` вместо `cy.get()`

### Проблема: Тесты падают на Codespaces

**Решение для Codespaces:**
```bash
# 1. Убедитесь, что приложение доступно через Codespaces URL
# Вместо localhost:5000 используйте Codespaces URL

# 2. Измените cypress.config.js:
baseUrl: 'https://your-codespace-url-5000'

# 3. Запустите Cypress в headless режиме:
npx cypress run
```

### Проблема: "Port 5000 already in use"

**Решение:**
```bash
# Найти процесс на порту 5000
lsof -i :5000

# Убить процесс
kill -9 <PID>

# Или использовать другой порт в app.py:
app.run(port=5001)
```

---

## 📈 Бест-практики

### ✅ Для юнит-тестов

1. **Всегда мокируйте внешние зависимости**
   ```python
   @patch('app.requests.post')
   def test_example(self, mock_post):
       ...
   ```

2. **Используйте фикстуры для подготовки данных**
   ```python
   @pytest.fixture
   def client():
       return app.test_client()
   ```

3. **Проверяйте позитивные и негативные сценарии**
   - Успех: что должно произойти
   - Ошибка: как приложение должно реагировать

4. **Записывайте понятные сообщения**
   ```python
   assert result is not None, "Функция должна вернуть значение"
   ```

### ✅ Для UI тестов (Cypress)

1. **Используйте cy.intercept() для всех API запросов**
   ```javascript
   cy.intercept('POST', '/api/**', { statusCode: 200 })
   ```

2. **Ждите явно перехватов вместо таймаутов**
   ```javascript
   cy.wait('@apiCall');  // ✅ Правильно
   // cy.wait(2000);     // ❌ Плохо
   ```

3. **Используйте data-testid атрибуты**
   ```html
   <button data-testid="translate-btn">Перевести</button>
   ```
   ```javascript
   cy.get('[data-testid="translate-btn"]').click();
   ```

4. **Проверяйте видимость перед взаимодействием**
   ```javascript
   cy.get('button').should('be.visible').click();
   ```

5. **Организуйте тесты логически (describe блоки)**
   ```javascript
   describe('Перевод', () => {
     it('успешный перевод', () => {...});
     it('ошибка при переводе', () => {...});
   });
   ```

---

## 📞 Поддержка и Помощь

### Документация

- [Pytest Docs](https://docs.pytest.org/)
- [Cypress Docs](https://docs.cypress.io/)
- [unittest.mock Docs](https://docs.python.org/3/library/unittest.mock.html)

### Команда разработки

Если у вас возникли проблемы с тестами, создайте Issue на GitHub с информацией:

1. Описание проблемы
2. Команда, которую вы запускали
3. Полный текст ошибки
4. Ваша операционная система и версии Python/Node.js

---

**Последнее обновление:** 2026-06-04
**Автор:** QA Automation Lead
**Версия документации:** 1.0
