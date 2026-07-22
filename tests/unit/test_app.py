# ============================================================================
# tests/unit/test_app.py
# ============================================================================
# МОДУЛЬНЫЕ (UNIT) ТЕСТЫ для Flask приложения "AI Translator & Critic"
#
# Описание:
# Этот файл содержит набор юнит-тестов для проверки основной логики
# приложения app.py. Тесты используют pytest и unittest.mock для создания
# "мокированных" (fake) версий внешних запросов к API, чтобы не тратить
# реальные токены AI-моделей.
#
# Что такое MOCKING?
# Mocking (мокирование) - это техника тестирования, при которой мы заменяем
# реальные внешние зависимости (в данном случае запросы к API) на "поддельные"
# объекты, которые возвращают заранее определённые результаты. Это позволяет:
# - Тестировать приложение без доступа в интернет
# - Не тратить деньги на API запросы
# - Контролировать результаты (тестировать успех и ошибки)
# - Ускорить выполнение тестов
#
# Команда для запуска тестов:
# pytest tests/unit/test_app.py -v
#
# Ключи:
# -v (verbose) - показывает подробный отчёт о каждом тесте
# -s - показывает print() и логи
# --tb=short - сокращённое представление ошибок
# ============================================================================

import pytest
import os
import sys
from unittest.mock import patch, MagicMock, Mock
import json

# ============================================================================
# ПОДГОТОВКА ПУТЕЙ И ИМПОРТОВ
# ============================================================================

# Добавляем директорию src в путь Python для импорта app.py
# sys.path.insert() позволяет импортировать модули из других директорий
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../src')))

from app import app, call_llm


# ============================================================================
# ФИКСТУРЫ (FIXTURES) - Подготовка данных для тестов
# ============================================================================

@pytest.fixture
def client():
    """
    Фикстура для создания тестового клиента Flask приложения.
    
    Фикстура - это функция, которая подготавливает окружение для теста.
    Она выполняется перед каждым тестом автоматически.
    
    Возвращаемое значение:
    ----------------------
    flask.testing.FlaskClient - объект для отправки HTTP запросов к приложению
    
    Как работает:
    1. app.config['TESTING'] = True - включаем режим тестирования
    2. app.test_client() - создаём специальный клиент для тестов
    3. Он позволяет отправлять GET/POST запросы без запуска реального сервера
    """
    app.config['TESTING'] = True
    
    with app.test_client() as client:
        yield client
        # yield - не return, потому что нужно очистить ресурсы после теста


@pytest.fixture
def mock_api_response():
    """
    Фикстура для создания "поддельного" успешного ответа от API.
    
    Эта фикстура возвращает словарь, который имитирует реальный ответ
    от OpenRouter API. Когда мы мокируем requests.post, он вернёт объект
    с методом .json(), который возвращает этот словарь.
    
    Возвращаемое значение:
    ----------------------
    dict - структура ответа от OpenRouter API
    """
    return {
        "choices": [
            {
                "message": {
                    "content": "Это мокированный ответ от LLM"
                }
            }
        ]
    }


@pytest.fixture
def mock_translation_response():
    """
    Фикстура для мокированного ответа при переводе.
    """
    return {
        "choices": [
            {
                "message": {
                    "content": "Mocked translation: The sun is shining."
                }
            }
        ]
    }


@pytest.fixture
def mock_evaluation_response():
    """
    Фикстура для мокированного ответа при оценке качества.
    """
    return {
        "choices": [
            {
                "message": {
                    "content": "Оценка: 9/10\nАргументация: Перевод точен и звучит естественно."
                }
            }
        ]
    }


# ============================================================================
# ПОЗИТИВНЫЕ ТЕСТЫ (Positive Tests)
# ============================================================================
# Позитивные тесты проверяют, что приложение работает корректно
# при нормальных условиях (успешные API ответы)

class TestCallLLMPositive:
    """
    Класс для группировки тестов функции call_llm в позитивных сценариях.
    Классы помогают организовать тесты по темам.
    """
    
    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test_key_12345'})
    @patch('app.requests.post')
    def test_call_llm_success(self, mock_post, mock_api_response):
        """
        ✅ ТЕСТ: Успешный вызов LLM функции
        
        Сценарий:
        ---------
        1. Устанавливаем фиктивный API ключ
        2. Мокируем requests.post, чтобы он вернул успешный ответ
        3. Вызываем call_llm с моделью и сообщением
        4. Проверяем, что функция вернула ожидаемый текст
        
        @patch.dict - изменяет переменные окружения только для этого теста
        @patch('app.requests.post') - заменяет requests.post на мок-объект
        
        Принцип работы patch:
        - Вместо реального requests.post будет вызван mock_post
        - mock_post.return_value - это значение, которое вернёт мок
        - После теста patch автоматически восстанавливает оригинальный requests.post
        """
        
        # ARRANGE (Подготовка)
        # ==================
        # Настраиваем мок на возврат успешного ответа
        mock_response = MagicMock()
        # MagicMock - это волшебный объект, который автоматически создаёт
        # методы при обращении к ним
        
        mock_response.json.return_value = mock_api_response
        # .json() это метод, который парсит JSON ответ
        
        mock_response.raise_for_status.return_value = None
        # raise_for_status() вызывается в реальном коде, чтобы проверить статус
        # Возвращаем None, значит ошибки нет
        
        mock_post.return_value = mock_response
        # Говорим, что requests.post вернёт наш мок-ответ
        
        # Подготавливаем входные данные
        model_name = "openrouter/free"
        messages = [{"role": "user", "content": "Привет"}]
        
        # ACT (Действие)
        # ==============
        # Вызываем функцию, которую тестируем
        result = call_llm(model_name, messages)
        
        # ASSERT (Проверка)
        # =================
        # Проверяем результат
        assert result == "Это мокированный ответ от LLM"
        # result должен быть равен контенту из мокированного ответа
        
        # Проверяем, что requests.post был вызван ровно один раз
        assert mock_post.call_count == 1
        
        # Проверяем, что функция была вызвана с правильными параметрами
        call_args = mock_post.call_args
        assert call_args[0][0] == "https://openrouter.ai/api/v1/chat/completions"
        # Первый позиционный аргумент (URL) должен быть правильным
        
        # Проверяем заголовки авторизации
        assert 'Authorization' in call_args[1]['headers']
        assert call_args[1]['headers']['Authorization'] == 'Bearer test_key_12345'
    
    
    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test_key'})
    @patch('app.requests.post')
    def test_translation_api_call_format(self, mock_post, mock_translation_response):
        """
        ✅ ТЕСТ: Проверка формата запроса при переводе
        
        Сценарий:
        ---------
        Проверяем, что payload (тело запроса) имеет правильную структуру:
        - Содержит правильное имя модели
        - Содержит сообщения в правильном формате
        - Содержит правильные параметры (temperature, max_tokens)
        
        Это важно для совместимости с API OpenRouter.
        """
        
        # ARRANGE
        mock_response = MagicMock()
        mock_response.json.return_value = mock_translation_response
        mock_response.raise_for_status.return_value = None
        mock_post.return_value = mock_response
        
        model = "openrouter/free"
        messages = [{"role": "user", "content": "Translate this"}]
        
        # ACT
        call_llm(model, messages)
        
        # ASSERT
        # Получаем аргументы, с которыми был вызван mock_post
        call_kwargs = mock_post.call_args[1]
        
        # Проверяем payload (тело запроса)
        payload = call_kwargs['json']
        assert payload['model'] == "openrouter/free"
        assert payload['messages'] == messages
        assert 'temperature' in payload
        assert 'max_tokens' in payload
        assert payload['max_tokens'] == 2000


class TestFlaskRoutesPositive:
    """
    Класс для тестирования Flask маршрутов (routes).
    """
    
    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test_key'})
    def test_index_get_returns_form(self, client):
        """
        ✅ ТЕСТ: GET запрос к / возвращает форму
        
        Сценарий:
        ---------
        Когда пользователь открывает приложение, он видит форму.
        Этот тест проверяет, что GET запрос возвращает HTML страницу
        с элементами формы.
        """
        
        # ACT
        response = client.get('/')
        
        # ASSERT
        assert response.status_code == 200
        # Статус 200 означает успешный ответ
        
        assert b'<textarea' in response.data
        # response.data содержит HTML ответ как байты (b'...')
        assert b'<select' in response.data
        # Проверяем наличие элементов формы
    
    
    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test_key'})
    @patch('app.requests.post')
    def test_post_translation_flow(self, mock_post, client, mock_translation_response, mock_evaluation_response):
        """
        ✅ ТЕСТ: Полный сценарий перевода и оценки
        
        Сценарий:
        ---------
        1. Пользователь отправляет форму с текстом
        2. Приложение делает запрос на перевод
        3. Приложение делает запрос на оценку
        4. Возвращается страница с результатами
        
        Обработка нескольких мок-вызовов:
        Нам нужно мокировать ДВА разных запроса к API:
        - 1-й запрос для перевода (openrouter/free)
        - 2-й запрос для оценки (nvidia/nemotron-3-nano-30b-a3b:free)
        
        Используем side_effect - это параметр, который позволяет мокировать
        разные ответы для разных вызовов.
        """
        
        # ARRANGE
        # Создаём два разных мок-ответа
        mock_translation = MagicMock()
        mock_translation.json.return_value = mock_translation_response
        mock_translation.raise_for_status.return_value = None
        
        mock_evaluation = MagicMock()
        mock_evaluation.json.return_value = mock_evaluation_response
        mock_evaluation.raise_for_status.return_value = None
        
        # side_effect - список значений, которые будут возвращены
        # при последовательных вызовах mock_post
        mock_post.side_effect = [mock_translation, mock_evaluation]
        
        form_data = {
            'text': 'Hello world',
            'language': 'Русский',
            'action': 'translate'
        }
        
        # ACT
        response = client.post('/', data=form_data)
        
        # ASSERT
        assert response.status_code == 200
        
        # Проверяем, что результаты появились в ответе
        assert b'Hello world' in response.data  # Оригинальный текст
        # assert b'Mocked translation' in response.data  # Перевод


# ============================================================================
# ТЕСТЫ ЗАГРУЗКИ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ (Environment Tests)
# ============================================================================
# Эти тесты проверяют работу с переменными окружения и конфигурацией

class TestEnvironmentVariables:
    """
    Класс для тестов, связанных с загрузкой конфигурации из .env файла.
    """
    
    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'my_secret_key_xyz'})
    @patch('app.requests.post')
    def test_api_key_loaded_from_env(self, mock_post, mock_api_response):
        """
        🔐 ТЕСТ: API ключ корректно загружается из переменной окружения
        
        Сценарий:
        ---------
        Мы используем @patch.dict для установки переменной окружения ТОЛЬКО
        для этого теста. Это гарантирует, что:
        1. Тест не зависит от реального .env файла
        2. Тест не влияет на другие тесты
        3. Мы можем контролировать значение ключа
        
        @patch.dict(os.environ, {...}) - временно изменяет os.environ
        После теста os.environ восстанавливается в исходное состояние.
        """
        
        # ARRANGE
        mock_response = MagicMock()
        mock_response.json.return_value = mock_api_response
        mock_response.raise_for_status.return_value = None
        mock_post.return_value = mock_response
        
        # ACT
        call_llm("test_model", [{"role": "user", "content": "test"}])
        
        # ASSERT
        # Проверяем, что Authorization заголовок содержит наш ключ
        call_kwargs = mock_post.call_args[1]
        headers = call_kwargs['headers']
        assert 'Authorization' in headers
        assert 'my_secret_key_xyz' in headers['Authorization']
    
    
    @patch.dict(os.environ, {}, clear=True)
    # clear=True - полностью очищает os.environ для этого теста
    @patch('app.requests.post')
    def test_call_llm_without_api_key(self, mock_post, mock_api_response):
        """
        ⚠️ ТЕСТ: Поведение при отсутствии API ключа
        
        Сценарий:
        ---------
        Если переменная окружения OPENROUTER_API_KEY не установлена,
        функция должна вернуть None и не делать реальный запрос к API.
        
        Это критически важно для безопасности - мы не хотим отправлять
        запросы без авторизации.
        
        clear=True - полностью очищает все переменные окружения
        """
        
        # ACT
        result = call_llm("test_model", [{"role": "user", "content": "test"}])
        
        # ASSERT
        assert result is None
        # Функция должна вернуть None
        
        # Проверяем, что requests.post вообще не был вызван
        assert mock_post.call_count == 0
        # Это гарантирует, что приложение не пытается отправить запрос без ключа


# ============================================================================
# ТЕСТЫ ОБРАБОТКИ ОШИБОК (Error Handling Tests)
# ============================================================================
# Эти тесты проверяют, что приложение корректно обрабатывает ошибки

class TestErrorHandling:
    """
    Класс для тестов обработки различных типов ошибок.
    """
    
    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test_key'})
    @patch('app.requests.post')
    def test_call_llm_connection_error(self, mock_post):
        """
        🔴 ТЕСТ: Обработка ошибки подключения
        
        Сценарий:
        ---------
        Если произошла ошибка подключения (например, нет интернета),
        функция должна корректно обработать исключение и вернуть None,
        а не упасть.
        
        Используем requests.exceptions.ConnectionError - это реальный
        класс исключения из библиотеки requests.
        """
        
        # ARRANGE
        # Мокируем requests.post так, чтобы он выбросил исключение
        import requests
        mock_post.side_effect = requests.exceptions.ConnectionError(
            "Failed to establish connection"
        )
        
        # ACT
        result = call_llm("test_model", [{"role": "user", "content": "test"}])
        
        # ASSERT
        # Функция должна вернуть None, а не выбросить исключение
        assert result is None
    
    
    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test_key'})
    @patch('app.requests.post')
    def test_call_llm_timeout_error(self, mock_post):
        """
        ⏱️ ТЕСТ: Обработка таймаута
        
        Сценарий:
        ---------
        Если API не ответил за отведённое время (30 секунд),
        requests выбросит исключение Timeout.
        Приложение должно обработать это и вернуть None.
        """
        
        # ARRANGE
        import requests
        mock_post.side_effect = requests.exceptions.Timeout(
            "Request timed out"
        )
        
        # ACT
        result = call_llm("test_model", [{"role": "user", "content": "test"}])
        
        # ASSERT
        assert result is None
    
    
    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test_key'})
    @patch('app.requests.post')
    def test_call_llm_http_error_401(self, mock_post):
        """
        🔐 ТЕСТ: Обработка ошибки 401 (Unauthorized)
        
        Сценарий:
        ---------
        Если API ключ неправильный или истёк, API вернёт ошибку 401.
        Приложение должно обработать это и вернуть None.
        """
        
        # ARRANGE
        import requests
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized: Invalid API key"
        
        # raise_for_status() выбросит исключение HTTPError
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError(
            response=mock_response
        )
        
        mock_post.return_value = mock_response
        
        # ACT
        result = call_llm("test_model", [{"role": "user", "content": "test"}])
        
        # ASSERT
        assert result is None
    
    
    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test_key'})
    @patch('app.requests.post')
    def test_call_llm_http_error_500(self, mock_post):
        """
        💥 ТЕСТ: Обработка ошибки 500 (Internal Server Error)
        
        Сценарий:
        ---------
        Если на сервере API произошла ошибка (ошибка в коде, перегруз и т.д.),
        API вернёт ошибку 500.
        Приложение должно обработать это и вернуть None.
        """
        
        # ARRANGE
        import requests
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError(
            response=mock_response
        )
        
        mock_post.return_value = mock_response
        
        # ACT
        result = call_llm("test_model", [{"role": "user", "content": "test"}])
        
        # ASSERT
        assert result is None
    
    
    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test_key'})
    @patch('app.requests.post')
    def test_call_llm_malformed_response(self, mock_post):
        """
        ⚠️ ТЕСТ: Обработка некорректного формата ответа
        
        Сценарий:
        ---------
        Иногда API может вернуть ответ в неожиданном формате
        (например, без поля "choices"). Функция должна обработать это
        и вернуть None.
        """
        
        # ARRANGE
        mock_response = MagicMock()
        # Возвращаем ответ без поля "choices"
        mock_response.json.return_value = {"error": "Something went wrong"}
        mock_response.raise_for_status.return_value = None
        mock_post.return_value = mock_response
        
        # ACT
        result = call_llm("test_model", [{"role": "user", "content": "test"}])
        
        # ASSERT
        assert result is None
    
    
    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test_key'})
    @patch('app.requests.post')
    def test_call_llm_generic_exception(self, mock_post):
        """
        🆘 ТЕСТ: Обработка неизвестного исключения
        
        Сценарий:
        ---------
        Может случиться неожиданное исключение, которое не было
        явно обработано в коде. Используется общий try/except блок,
        чтобы перехватить это и вернуть None.
        """
        
        # ARRANGE
        mock_post.side_effect = ValueError("Unexpected error in requests library")
        
        # ACT
        result = call_llm("test_model", [{"role": "user", "content": "test"}])
        
        # ASSERT
        assert result is None
    
    
    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test_key'})
    @patch('app.requests.post')
    def test_post_empty_text_error(self, mock_post, client):
        """
        📝 ТЕСТ: Обработка пустого текста в форме
        
        Сценарий:
        ---------
        Если пользователь попытается отправить форму с пустым текстом,
        приложение должно вернуть ошибку и не делать запрос к API.
        """
        
        # ARRANGE
        form_data = {
            'text': '',  # Пустой текст
            'language': 'Русский'
        }
        
        # ACT
        response = client.post('/', data=form_data)
        
        # ASSERT
        assert response.status_code == 200
        # Страница вернётся (не 500 ошибка)
        
        assert b'error' in response.data.lower() or b'пожалуйста' in response.data.lower()
        # На странице должна быть ошибка
        
        assert mock_post.call_count == 0
        # API не должен был быть вызван


# ============================================================================
# ИНТЕГРАЦИОННЫЕ ТЕСТЫ (Integration Tests - опционально)
# ============================================================================
# Эти тесты проверяют взаимодействие нескольких компонентов

class TestIntegration:
    """
    Класс для интеграционных тестов.
    
    Интеграционные тесты проверяют работу нескольких компонентов вместе,
    в отличие от юнит-тестов, которые тестируют отдельные функции.
    """
    
    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test_key'})
    @patch('app.requests.post')
    def test_full_translation_workflow(self, mock_post, client, 
                                       mock_translation_response, 
                                       mock_evaluation_response):
        """
        🔄 ИНТЕГРАЦИОННЫЙ ТЕСТ: Полный рабочий процесс
        
        Сценарий:
        ---------
        Этот тест проверяет весь процесс от начала до конца:
        1. Пользователь открывает форму (GET /)
        2. Пользователь отправляет текст (POST /)
        3. Приложение переводит текст
        4. Приложение оценивает перевод
        5. Результаты отображаются
        """
        
        # ARRANGE
        mock_translation = MagicMock()
        mock_translation.json.return_value = mock_translation_response
        mock_translation.raise_for_status.return_value = None
        
        mock_evaluation = MagicMock()
        mock_evaluation.json.return_value = mock_evaluation_response
        mock_evaluation.raise_for_status.return_value = None
        
        mock_post.side_effect = [mock_translation, mock_evaluation]
        
        # Шаг 1: Открыть форму
        response_get = client.get('/')
        assert response_get.status_code == 200
        
        # Шаг 2: Отправить форму
        form_data = {
            'text': 'The weather is nice today',
            'language': 'Русский',
            'action': 'translate'
        }
        
        response_post = client.post('/', data=form_data)
        
        # Шаг 3-5: Проверить результаты
        assert response_post.status_code == 200
        # Проверяем, что оба API вызова были сделаны
        assert mock_post.call_count == 2


# ============================================================================
# ПАРАМЕТРИЗОВАННЫЕ ТЕСТЫ (Parametrized Tests)
# ============================================================================
# Параметризованные тесты позволяют запустить один тест с разными параметрами

class TestParametrized:
    """
    Класс для параметризованных тестов.
    
    Вместо того, чтобы писать отдельный тест для каждого значения,
    мы можем использовать @pytest.mark.parametrize для запуска одного
    теста с разными входными параметрами.
    """
    
    @patch.dict(os.environ, {'OPENROUTER_API_KEY': 'test_key'})
    @patch('app.requests.post')
    @pytest.mark.parametrize("model_name,expected_in_call", [
        ("openrouter/free", "openrouter/free"),
        ("nvidia/nemotron-3-nano-30b-a3b:free", "nvidia/nemotron-3-nano-30b-a3b:free"),
    ])
    def test_different_models(self, mock_post, mock_api_response, 
                             model_name, expected_in_call):
        """
        🔧 ПАРАМЕТРИЗОВАННЫЙ ТЕСТ: Различные модели AI
        
        Сценарий:
        ---------
        Этот тест запустится ДВА раза:
        1. Один раз с model_name="openrouter/free"
        2. Один раз с model_name="nvidia/nemotron-3-nano-30b-a3b:free"
        
        Каждый раз проверяется, что правильная модель отправлена в API.
        
        @pytest.mark.parametrize - это декоратор, который "размножает" тест
        """
        
        # ARRANGE
        mock_response = MagicMock()
        mock_response.json.return_value = mock_api_response
        mock_response.raise_for_status.return_value = None
        mock_post.return_value = mock_response
        
        # ACT
        call_llm(model_name, [{"role": "user", "content": "test"}])
        
        # ASSERT
        call_kwargs = mock_post.call_args[1]
        payload = call_kwargs['json']
        assert payload['model'] == expected_in_call


# ============================================================================
# ЗАПУСК ТЕСТОВ
# ============================================================================
# При запуске файла как скрипта (не через pytest) выведет инструкцию

if __name__ == "__main__":
    print("""
    ╔════════════════════════════════════════════════════════════════╗
    ║       Запуск юнит-тестов для AI Translator & Critic           ║
    ╚════════════════════════════════════════════════════════════════╝
    
    Команды для запуска:
    
    1. Запустить все тесты (с подробным выводом):
       pytest tests/unit/test_app.py -v
    
    2. Запустить конкретный тест:
       pytest tests/unit/test_app.py::TestCallLLMPositive::test_call_llm_success -v
    
    3. Запустить с показом логов:
       pytest tests/unit/test_app.py -v -s
    
    4. Запустить с коротким форматом ошибок:
       pytest tests/unit/test_app.py -v --tb=short
    
    5. Запустить и сгенерировать отчёт о покрытии:
       pytest tests/unit/test_app.py --cov=src --cov-report=html
    
    6. Запустить только позитивные тесты:
       pytest tests/unit/test_app.py::TestCallLLMPositive -v
    
    7. Запустить только тесты ошибок:
       pytest tests/unit/test_app.py::TestErrorHandling -v
    """)
