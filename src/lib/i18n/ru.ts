import type { EN } from "./en";

/**
 * Russian is a fully supported locale, so this is typed as a COMPLETE record
 * of the English keys. Omitting one is a compile error — which is the point.
 * Armenian, when it comes, will be Partial with an English fallback, because
 * a half-translated locale is better than a blocked one.
 */
export const RU: Record<keyof typeof EN, string> = {
  "action.continue": "Дальше",
  "action.back": "Назад",
  "action.finish": "Закончить",
  "action.send": "Отправить",
  "action.skip": "Пропустить",
  "action.dismiss": "Закрыть",
  "action.retry": "Ещё раз",
  "action.open": "Открыть",
  "action.reveal": "Показать",
  "action.commit": "Зафиксировать",
  "action.challenge": "Возрази этому",
  "action.thatsWrong": "Это неверно",

  "evidence.pin": "В дело",
  "evidence.remove": "Убрать",
  "evidence.tray": "Улики",
  "evidence.empty": "Пока ничего не приобщено.",
  "evidence.grade": "Доказательность {grade}",
  "evidence.source": "Откуда это",
  "evidence.fact": "Наблюдение",
  "evidence.inference": "Вывод",

  "hypothesis.title": "Что может происходить",
  "hypothesis.commit": "Выбрать эту",
  "hypothesis.supports": "Подтверждается",
  "hypothesis.contradicts": "Противоречит",
  "hypothesis.wouldChangeMind": "Что заставит тебя передумать?",
  "hypothesis.superseded": "Заменена более поздней версией",

  "confidence.question": "Насколько ты уверен?",
  "confidence.commit": "Зафиксировать",
  "confidence.yours": "Твоя уверенность",
  "confidence.locked": "Записано до ответа",

  "case.open": "Открыто",
  "case.inquiry": "Выясняем",
  "case.reassessment": "Пересматриваем",
  "case.closed": "Закрыто",
  "case.unresolved": "Не выяснено: {count}",

  "retrospective.title": "Разбор",
  "retrospective.initialModel": "Что ты думал вначале",
  "retrospective.finalModel": "Что ты думал в конце",
  "retrospective.outcome": "Что оказалось на деле",
  "retrospective.biggestUpdate": "Самая большая перемена",
  "retrospective.missedEvidence": "Чего у тебя не было",
  "retrospective.calibration": "Насколько уверенность совпала",

  "block.noticed": "Что я заметил",
  "block.needToKnow": "Что мне нужно знать",
  "block.awayFromScreen": "Не за экраном",
  "block.drill": "Отработка",
  "block.patternBefore": "Это уже было",
  "block.inDossier": "{subject} в твоём досье",
  "block.sealedHint": "Открой, когда будешь готов делать.",
  "block.recorded": "Записано.",
  "block.unknown": "Эта часть не загрузилась.",

  "thinking.facts": "Смотрю на факты",
  "thinking.questions": "Разбираюсь, чего не хватает",
  "thinking.weighing": "Взвешиваю",
  "thinking.crisis": "Секунду.",

  "state.loading": "Загрузка",
  "state.empty": "Пока пусто.",
  "state.error": "Что-то пошло не так.",
  "state.stale": "Дело изменилось, пока это было открыто. Обнови страницу.",
  "state.offline": "Не получилось связаться с сервером.",

  "feedback.question": "Это было полезно?",
  "feedback.placeholder": "Что было не так? Это полезнее, чем что было хорошо.",
  "feedback.send": "Отправить",
  "feedback.later": "Не сейчас",
  "feedback.thanks": "Принято. Это правда полезно.",

  "a11y.checkbox": "Отметить как сделанное",
  "a11y.confidenceSlider": "Уверенность от 0 до 100",
  "a11y.deleteItem": "Убрать",
  "a11y.openMenu": "Открыть меню",
  "a11y.closeMenu": "Закрыть меню",
  "a11y.practiceRecord": "Журнал практики",
};
