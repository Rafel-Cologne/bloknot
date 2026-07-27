import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import ru from './locales/ru.json'
import en from './locales/en.json'
import de from './locales/de.json'
import es from './locales/es.json'
import fr from './locales/fr.json'

// Пока в приложении нет переключателя языка в интерфейсе, всегда показываем русский —
// раньше язык браузера (`navigator`) автоматически подставлял немецкий/английский и т.д.
// для пользователей с соответствующей локалью ОС, хотя выбрать язык самим было негде.
// Когда добавим переключатель языка в UI, тут нужно будет вернуть LanguageDetector
// (order: ['localStorage', 'navigator']) и сохранение выбора в localStorage.
i18n
  .use(initReactI18next)
  .init({
    resources: { ru: { translation: ru }, en: { translation: en }, de: { translation: de }, es: { translation: es }, fr: { translation: fr } },
    lng: 'ru',
    fallbackLng: 'ru',
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
  })

export default i18n
