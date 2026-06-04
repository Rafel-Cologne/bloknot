// ============================================================================
// cypress/e2e/translator_critic.cy.js
// ============================================================================
// UI ТЕСТЫ для Flask приложения "AI Translator & Critic" с использованием Cypress
//
// Что такое Cypress?
// -----------------
// Cypress - это инструмент для автоматизированного тестирования веб-приложений.
// Он позволяет писать тесты на JavaScript, которые:
// - Автоматически открывают браузер
// - Взаимодействуют с элементами страницы (кликают, вводят текст)
// - Проверяют результаты (assertions)
// - Записывают видео и скриншоты при ошибках
//
// Что такое cy.intercept()?
// -------------------------
// cy.intercept() - это метод Cypress для "перехвата" (mocking) сетевых запросов.
// Вместо того, чтобы отправлять реальный HTTP запрос на сервер, Cypress
// перехватывает этот запрос и возвращает поддельный ответ.
//
// Преимущества:
// - Не тратим токены на реальные API запросы
// - Контролируем ответ (можем симулировать успех или ошибку)
// - Тесты выполняются быстро (нет сетевых задержек)
// - Тесты не зависят от состояния реального API
//
// Синтаксис cy.intercept():
// -------------------------
// cy.intercept('METHOD', 'URL/PATTERN', { statusCode, body }).as('alias')
// - METHOD: GET, POST, PUT, DELETE и т.д.
// - URL/PATTERN: может быть строка или regex
// - statusCode: HTTP статус код (200, 500 и т.д.)
// - body: поддельное тело ответа
// - .as('alias'): даёт имя перехвату для использования в cy.wait()
//
// ============================================================================

describe('AI Translator & Critic - UI Тесты', () => {
  // ========================================================================
  // ОПИСАНИЕ ТЕСТОВЫХ СЦЕНАРИЕВ
  // ========================================================================
  // describe() - это блок, который группирует связанные тесты
  // Первый аргумент - название группы тестов (строка)
  // Второй аргумент - функция со все тестами

  // ========================================================================
  // ПЕРЕД КАЖДЫМ ТЕСТОМ (beforeEach hook)
  // ========================================================================

  beforeEach(() => {
    // ====================================================================
    // МОКИРОВАНИЕ API ЗАПРОСОВ
    // ====================================================================
    // Эта часть выполняется перед КАЖДЫМ тестом.
    // Мы устанавливаем "поддельные" ответы для API запросов,
    // чтобы тесты не делали реальные запросы к внешнему API.

    // МОКИРОВАНИЕ: Запрос на ПЕРЕВОД
    // =================================
    // Узнаём по полю "model" в теле запроса, что это запрос на перевод
    cy.intercept(
      {
        method: 'POST',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        // Фильтруем по содержимому тела запроса (используя функцию)
        middleware: (req) => {
          // Проверяем, что это запрос для модели перевода
          if (req.body.model === 'openrouter/free') {
            // Отправляем поддельный ответ для модели перевода
            req.reply((res) => {
              res.send({
                statusCode: 200,
                body: {
                  choices: [
                    {
                      message: {
                        content: 'Mocked Translation: The sun is shining.'
                      }
                    }
                  ]
                }
              });
            });
          }
        }
      },
      // Этот объект - просто для отладки (не обязательно)
      {
        statusCode: 200,
        body: {
          choices: [
            {
              message: {
                content: 'Mocked Translation: The sun is shining.'
              }
            }
          ]
        }
      }
    ).as('translationRequest');
    // .as('translationRequest') - даём имя перехвату
    // Позже мы сможем проверить, был ли он вызван: cy.wait('@translationRequest')

    // МОКИРОВАНИЕ: Запрос на ОЦЕНКУ КАЧЕСТВА (LLM-as-a-Judge)
    // =====================================================
    cy.intercept(
      {
        method: 'POST',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        middleware: (req) => {
          // Проверяем, что это запрос для модели оценки
          if (req.body.model === 'nvidia/nemotron-3-nano-30b-a3b:free') {
            // Отправляем поддельный ответ для модели оценки
            req.reply((res) => {
              res.send({
                statusCode: 200,
                body: {
                  choices: [
                    {
                      message: {
                        content: 'Оценка: 9/10. Fluent and accurate.'
                      }
                    }
                  ]
                }
              });
            });
          }
        }
      },
      {
        statusCode: 200,
        body: {
          choices: [
            {
              message: {
                content: 'Оценка: 9/10. Fluent and accurate.'
              }
            }
          ]
        }
      }
    ).as('evaluationRequest');
    // .as('evaluationRequest') - даём имя этому перехвату

    // ПОСЕЩЕНИЕ СТРАНИЦЫ
    // ===================
    // cy.visit('/') - открывает приложение в браузере на URL localhost:5000/
    // Это выполняется для каждого теста
    cy.visit('/');
  });

  // ========================================================================
  // ОСНОВНОЙ ТЕСТ: Успешный Перевод и Оценка
  // ========================================================================
  // Это основной сценарий использования приложения:
  // 1. Пользователь вводит текст
  // 2. Пользователь выбирает язык
  // 3. Пользователь нажимает "Перевести"
  // 4. Приложение показывает перевод
  // 5. Пользователь нажимает "Оценить"
  // 6. Приложение показывает оценку

  it('✅ Успешный Перевод и Оценка Качества', () => {
    // ARRANGE (Подготовка)
    // ===================
    // Нам не нужно ничего подготавливать, т.к. всё сделано в beforeEach()

    // ACT (Действие)
    // ==============

    // ШАГ 1: Ввод текста в textarea
    // cy.get() - находит элемент HTML на странице
    // Селектор 'textarea[name="text"]' ищет <textarea name="text">
    cy.get('textarea[name="text"]')
      .should('be.visible')  // Проверяем, что элемент видимый
      .type('Солнце светит.');  // Вводим текст в textarea
    // type() - это как если бы пользователь печатал на клавиатуре

    // ШАГ 2: Выбор языка из выпадающего списка
    cy.get('select[name="language"]')
      .should('be.visible')
      .select('Английский');  // Выбираем опцию "Английский"
    // select() - специальный метод для работы с <select> элементами

    // ШАГ 3: Нажать кнопку "Перевести"
    cy.get('button').contains('Перевести')  // Ищем кнопку с текстом "Перевести"
      .should('be.visible')
      .click();  // click() - нажимаем кнопку

    // ASSERT (Проверка)
    // =================

    // ПРОВЕРКА 1: Убедиться, что запрос на перевод был отправлен
    // cy.wait('@translationRequest') - ждёт, пока будет выполнен перехват
    // с названием "translationRequest" (который мы установили в cy.intercept)
    cy.wait('@translationRequest').then((interception) => {
      // interception.request.body - тело запроса
      // Проверяем, что модель правильная
      expect(interception.request.body.model).to.equal('openrouter/free');
      
      // Проверяем, что есть сообщение с текстом для перевода
      expect(interception.request.body.messages).to.be.an('array');
      expect(interception.request.body.messages.length).to.be.greaterThan(0);
    });

    // ПРОВЕРКА 2: Убедиться, что перевод появился на странице
    // cy.contains() - ищет элемент, который содержит текст
    cy.contains('Mocked Translation: The sun is shining.')
      .should('be.visible')
      // should('be.visible') - проверяет, что элемент видимый
      // Если элемент не появился в течение 4 секунд (default timeout),
      // тест будет считаться FAILED
    ;

    // ШАГ 4: Нажать кнопку "Оценить при помощи LLM-as-a-Judge"
    cy.get('button').contains('Оценить при помощи LLM-as-a-Judge')
      .should('be.visible')
      .click();

    // ПРОВЕРКА 3: Убедиться, что запрос на оценку был отправлен
    cy.wait('@evaluationRequest').then((interception) => {
      // Проверяем, что это была модель оценки
      expect(interception.request.body.model).to.equal(
        'nvidia/nemotron-3-nano-30b-a3b:free'
      );
    });

    // ПРОВЕРКА 4: Убедиться, что оценка появилась на странице
    cy.contains('Оценка: 9/10')
      .should('be.visible');
    
    cy.contains('Fluent and accurate')
      .should('be.visible');
  });

  // ========================================================================
  // ТЕСТ: Обработка Ошибки API (500 Internal Server Error)
  // ========================================================================
  // В этом тесте мы проверяем, что приложение корректно обрабатывает
  // ошибки от API.

  it('🔴 Обработка Ошибки API (500 Internal Server Error)', () => {
    // ПЕРЕОПРЕДЕЛЕНИЕ МОКИРОВАНИЯ
    // ============================
    // Мы переопределяем перехваты из beforeEach для этого теста.
    // Теперь они будут возвращать ошибку вместо успешного ответа.

    // Переопределяем перехват для перевода - возвращаем ошибку 500
    cy.intercept(
      {
        method: 'POST',
        url: 'https://openrouter.ai/api/v1/chat/completions'
      },
      {
        statusCode: 500,  // Статус код 500 = Internal Server Error
        body: {
          error: 'Internal Server Error'
        }
      }
    ).as('errorRequest');

    // ACT
    cy.get('textarea[name="text"]')
      .type('Солнце светит.');

    cy.get('select[name="language"]')
      .select('Английский');

    cy.get('button').contains('Перевести')
      .click();

    // ASSERT
    // Ждём, пока будет выполнена попытка запроса
    cy.wait('@errorRequest');

    // Проверяем, что на странице появилось сообщение об ошибке
    // Сообщение об ошибке должно содержать слова типа "ошибка", "error", "failed"
    cy.get('body').then(($body) => {
      // Проверяем, что на странице есть сообщение об ошибке
      const hasErrorMessage = 
        $body.text().includes('Ошибка') ||
        $body.text().includes('ошибка') ||
        $body.text().includes('error') ||
        $body.text().includes('Error');
      
      expect(hasErrorMessage).to.be.true;
    });

    // Убеждаемся, что НЕТ сообщения об успехе (перевод)
    cy.contains('Mocked Translation')
      .should('not.exist');
    // .should('not.exist') - проверяет, что элемент НЕ существует на странице
  });

  // ========================================================================
  // ТЕСТ: Пустое поле текста (валидация на клиенте)
  // ========================================================================
  // Проверяем, что приложение требует ввода текста перед отправкой

  it('📝 Валидация - Пустое Поле Текста', () => {
    // ACT
    // Не вводим текст, пытаемся отправить форму
    cy.get('select[name="language"]')
      .select('Английский');

    cy.get('button').contains('Перевести')
      .click();

    // ASSERT
    // На некоторых браузерах HTML5 валидация предотвратит отправку
    // Мы проверяем, что перевод НЕ был выполнен
    cy.wait(1000);  // Ждём 1 секунду
    
    // Проверяем, что запрос к API вообще не был сделан
    // Для этого используем cy.get() для поиска элемента с результатом
    cy.contains('Mocked Translation')
      .should('not.exist');
  });

  // ========================================================================
  // ТЕСТ: Проверка Присутствия Элементов Формы
  // ========================================================================
  // Этот тест проверяет, что все необходимые элементы формы присутствуют на странице

  it('✅ Все элементы формы присутствуют и видимы', () => {
    // ASSERT
    // Проверяем наличие textarea для ввода текста
    cy.get('textarea[name="text"]')
      .should('be.visible')
      .should('have.attr', 'placeholder');
    // .should('have.attr', 'placeholder') - проверяет наличие атрибута placeholder

    // Проверяем наличие select для выбора языка
    cy.get('select[name="language"]')
      .should('be.visible');

    // Проверяем, что есть опции в select
    cy.get('select[name="language"] option')
      .should('have.length.greaterThan', 0);

    // Проверяем кнопку "Перевести"
    cy.get('button').contains('Перевести')
      .should('be.visible')
      .should('be.enabled');  // .should('be.enabled') - кнопка не отключена

    // Проверяем кнопку "Оценить"
    cy.get('button').contains('Оценить при помощи LLM-as-a-Judge')
      .should('be.visible')
      .should('be.enabled');

    // Проверяем наличие заголовка
    cy.get('h1').contains('AI Translator & Critic')
      .should('be.visible');
  });

  // ========================================================================
  // ТЕСТ: Выбор Разных Языков
  // ========================================================================
  // Параметризованный тест (проверяем разные языки)

  it('🌍 Выбор Разных Языков Работает Корректно', () => {
    const languages = ['Русский', 'Английский', 'Французский', 'Немецкий'];

    languages.forEach((language) => {
      // Для каждого языка проверяем, что его можно выбрать
      cy.get('select[name="language"]')
        .select(language);

      // Проверяем, что язык был выбран
      cy.get('select[name="language"]')
        .should('have.value', language);
    });
  });

  // ========================================================================
  // ТЕСТ: Проверка Содержимого Результатов
  // ========================================================================

  it('📊 Результаты содержат правильные секции', () => {
    // ACT
    cy.get('textarea[name="text"]')
      .type('Hello world');

    cy.get('select[name="language"]')
      .select('Русский');

    cy.get('button').contains('Перевести')
      .click();

    cy.wait('@translationRequest');

    // ASSERT
    // Проверяем, что на странице есть:
    // 1. Оригинальный текст
    cy.contains('Оригинальный текст')
      .should('be.visible');

    // 2. Перевод
    cy.contains('Перевод на Русский')
      .should('be.visible');

    cy.contains('Mocked Translation: The sun is shining.')
      .should('be.visible');
  });

  // ========================================================================
  // ТЕСТ: Дважды Кликнуть Кнопку Перевести
  // ========================================================================
  // Проверяем, что приложение корректно обрабатывает повторные клики

  it('🔄 Повторный Перевод Работает Корректно', () => {
    // ПЕРВЫЙ ПЕРЕВОД
    cy.get('textarea[name="text"]')
      .type('First text');

    cy.get('select[name="language"]')
      .select('Английский');

    cy.get('button').contains('Перевести')
      .click();

    cy.wait('@translationRequest');

    // Очищаем textarea
    cy.get('textarea[name="text"]')
      .clear();

    // ВТОРОЙ ПЕРЕВОД
    cy.get('textarea[name="text"]')
      .type('Second text');

    cy.get('button').contains('Перевести')
      .click();

    cy.wait('@translationRequest');

    // Проверяем, что перевод был обновлён
    cy.contains('Mocked Translation: The sun is shining.')
      .should('be.visible');
  });

  // ========================================================================
  // ТЕСТ: Длинный Текст
  // ========================================================================
  // Проверяем, что приложение корректно обрабатывает длинный текст

  it('📖 Длинный Текст Обрабатывается Корректно', () => {
    const longText = 'Lorem ipsum dolor sit amet, '.repeat(20); // Длинный текст

    // ACT
    cy.get('textarea[name="text"]')
      .type(longText);

    cy.get('select[name="language"]')
      .select('Английский');

    cy.get('button').contains('Перевести')
      .click();

    // ASSERT
    cy.wait('@translationRequest');

    // Проверяем, что текст был отправлен корректно
    cy.wait('@translationRequest').then((interception) => {
      const content = interception.request.body.messages[0].content;
      expect(content).to.include('Lorem ipsum');
    });
  });

  // ========================================================================
  // ТЕСТ: Спецсимволы и Эмодзи
  // ========================================================================

  it('😀 Спецсимволы и Эмодзи Обрабатываются Корректно', () => {
    const specialText = 'Hello! @#$% & *() - это тест 😊 🎉';

    cy.get('textarea[name="text"]')
      .type(specialText);

    cy.get('select[name="language"]')
      .select('Русский');

    cy.get('button').contains('Перевести')
      .click();

    cy.wait('@translationRequest');

    // Проверяем, что спецсимволы были отправлены
    cy.wait('@translationRequest').then((interception) => {
      const content = interception.request.body.messages[0].content;
      expect(content).to.include('😊');
    });
  });

  // ========================================================================
  // ТЕСТ: Проверка Адаптивности (Responsive Design)
  // ========================================================================
  // Проверяем, что приложение работает на мобильных устройствах

  it('📱 Адаптивный Дизайн - Мобильное Устройство', () => {
    // Устанавливаем размер экрана мобильного устройства
    cy.viewport('iphone-x');  // iPhone X размер

    // Проверяем, что все элементы видимы
    cy.get('textarea[name="text"]')
      .should('be.visible');

    cy.get('select[name="language"]')
      .should('be.visible');

    cy.get('button').contains('Перевести')
      .should('be.visible');

    // Проверяем, что текст можно ввести
    cy.get('textarea[name="text"]')
      .type('Mobile test');

    cy.get('select[name="language"]')
      .select('Английский');

    cy.get('button').contains('Перевести')
      .click();

    cy.wait('@translationRequest');

    // Проверяем результаты
    cy.contains('Mocked Translation')
      .should('be.visible');
  });
});

// ============================================================================
// ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ И NOTES
// ============================================================================
/*

ПОЛЕЗНЫЕ cy КОМАНДЫ:
====================

cy.visit(url) - открыть страницу
cy.get(selector) - найти элемент по CSS селектору
cy.contains(text) - найти элемент по тексту
cy.type(text) - ввести текст в фокусированный элемент
cy.click() - кликнуть на элемент
cy.select(value) - выбрать опцию в select
cy.wait(ms) - ждать миллисекунд
cy.wait('@alias') - ждать перехвата с названием alias

ASSERTIONS (ПРОВЕРКИ):
======================

.should('be.visible') - элемент видимый
.should('be.enabled') - элемент включен (не отключен)
.should('exist') - элемент существует
.should('not.exist') - элемент НЕ существует
.should('have.value', value) - элемент имеет значение
.should('have.text', text) - элемент содержит текст
.should('have.attr', attr) - элемент имеет атрибут
.should('have.length', n) - элемент имеет длину n

ТАЙМАУТЫ:
=========

По умолчанию Cypress ждёт элемента 4 секунды.
Если элемент не появился, тест считается FAILED.

Можно установить свой таймаут:
cy.get('selector', { timeout: 10000 })  // 10 секунд

*/
