# Interaction Engine readiness audit

Дата аудита: 2026-08-21  
Репозиторий: `/Users/macair/Desktop/ulika`  
Ветка на момент проверки: `staging` (`HEAD` совпадал с `origin/staging`)

## 1. Цель и границы проверки

Этот документ фиксирует готовность фундамента Interaction Engine к началу
Evidence Tray. Проверка выполнена непосредственно по содержимому репозитория.

В ходе аудита не изменялись код, SQL, конфигурация или существующая
документация. Утверждения о состоянии живой Supabase, истории Vercel-деплоев и
scopes переменных окружения не считаются доказанными, если соответствующие
артефакты отсутствуют в репозитории.

Проверки текущего дерева на момент аудита:

- ESLint прошёл без ошибок.
- TypeScript (`tsc --noEmit --incremental false`) прошёл без ошибок.
- Vitest: 1 test file, 32 теста из 32 прошли.
- В репозитории найден только один автоматический test file:
  `src/lib/interaction/interaction.test.ts`.

## 2. Итоговый вывод

Фундамент Interaction Engine существует: типизированный whitelist событий,
серверный API, RLS, журнал событий, чистый reducer, context builder и
детерминированные block IDs. Однако полный пользовательский round-trip доказан
кодом только для `CHECKLIST_TOGGLED`, а несколько заявленных гарантий —
server-side проверка block ID и optimistic concurrency — фактически отсутствуют.

Критические зависимости Evidence Tray пока не готовы:

1. Разговоры и сообщения авторизованных пользователей не хранятся на сервере.
2. Block ID зависит от клиентского индекса сообщения и не проверяется сервером.
3. Evidence не имеет проверяемой ссылки на исходное сообщение и точный фрагмент.
4. `caseVersion` не является рабочей версией состояния, а конфликт не может
   привести к обещанному HTTP 409.
5. Для evidence events нет воспроизводимого интеграционного и E2E round-trip.

> **Решение readiness gate:** Evidence Tray нельзя начинать до выполнения всех
> P0-гейтов, перечисленных в разделе 5. Реализация UI Evidence Tray раньше этого
> момента будет одновременно отлаживать хранение разговоров, идентичность,
> provenance, concurrency и саму механику, поэтому дефекты фундамента будут
> ошибочно выглядеть как дефекты Evidence Tray.

## 3. Подтверждённые и опровергнутые замечания

### 3.1. Interaction Engine подключён только одним пользовательским сценарием

**Приоритет: P0 до Evidence Tray.**

Подтверждено:

- В [`src/lib/interaction/events.ts`](../src/lib/interaction/events.ts) объявлено
  10 event types: evidence pin/dismiss, confidence, choice, hypothesis,
  prediction, outcome, question answer, checklist и case close.
- Комментарий в этом файле говорит о девяти shapes, но union содержит десять.
- Единственный вызов `onEvent` вне interaction library находится в
  [`src/components/chat/ReplyBlocks.tsx`](../src/components/chat/ReplyBlocks.tsx)
  и отправляет только `CHECKLIST_TOGGLED`.
- `Questions` хранит введённые ответы только в локальном `useState` и не
  отправляет `QUESTION_ANSWERED`.
- Drill completion остаётся локальным состоянием компонента.
- Envelope сохраняет текст в `training_responses`, но не создаёт interaction
  event и не обновляет `CaseState`.
- Единственный автоматический test file —
  [`src/lib/interaction/interaction.test.ts`](../src/lib/interaction/interaction.test.ts).
  Он проверяет чистые validator/reducer/context/block ID/parser/i18n функции, но
  не Route Handler, Supabase, RLS или UI.
- Коммит `40ffa1a` изменил route и migration, но не добавил воспроизводимый
  acceptance test в репозиторий.

Оговорка: остальные девять типов не являются полностью «мёртвыми» внутри
системы — validator, reducer и context builder умеют часть из них обрабатывать.
Они недостижимы именно из текущего пользовательского UI.

Необходимое исправление:

- Для каждого типа явно зафиксировать статус `wired`, `reserved` или `tested`.
- Не представлять reserved events как готовые пользовательские возможности.
- До Evidence Tray автоматизировать полный round-trip как минимум для
  `EVIDENCE_PINNED` и `EVIDENCE_DISMISSED`.

Критерий приёмки:

- Authenticated integration test выполняет `POST /api/interaction`, проверяет
  запись, затем `GET /api/interaction`, reducer state, RLS и dedupe.
- E2E-сценарий выполняет действие, перезагружает страницу, видит восстановленное
  состояние и подтверждает, что следующий `/api/chat` получил interaction
  context с этим действием.

### 3.2. Checklist context сообщает количество, но не содержание действий

**Приоритет: P1.**

Подтверждено:

- [`src/lib/interaction/context.ts`](../src/lib/interaction/context.ts) строит
  внутренние ссылки вида `blockId#index`, но использует только `ticked.length`.
- Модель получает сообщение вида «They have completed N assigned action(s)», не
  получая текст конкретных выполненных пунктов.
- Payload `CHECKLIST_TOGGLED` не содержит текста пункта.
- Сервер не хранит сообщение, из которого мог бы безопасно разрешить block ID и
  индекс обратно в текст.

Необходимое исправление:

- Связать event с серверно сохранённым block/message и разрешать пункт по
  стабильной ссылке.
- Не использовать продублированный клиентом произвольный текст как единственный
  источник истины.

Критерий приёмки:

- Context builder способен отличить выполненный пункт A от невыполненного B.
- Следующий AI-turn получает содержание или серверно разрешённую устойчивую
  ссылку на конкретно выполненную работу.

### 3.3. Серверная история разговоров не подключена

**Приоритет: P0.**

Подтверждено:

- [`src/app/chat/page.tsx`](../src/app/chat/page.tsx) читает и записывает историю
  только через ключ `ulika-conversations` в `localStorage`.
- Таблица `mentalist_conversations` существует в
  [`supabase/migration_memory.sql`](../supabase/migration_memory.sql), но в `src/`
  и `scripts/` нет обращений к ней.
- [`src/app/api/chat/route.ts`](../src/app/api/chat/route.ts) получает всю историю
  сообщений из тела клиентского запроса и не сохраняет её.
- `interaction_events.conversation_id` имеет тип `text` и не имеет FK на
  `mentalist_conversations`.
- Удаление разговора из UI удаляет только localStorage-запись; серверные events
  для этого ID не удаляются и становятся недостижимыми из UI.

Необходимое исправление:

- Для авторизованных пользователей реализовать read-both/write-new migration:
  импорт существующего localStorage, серверную запись новых разговоров и
  сообщений, синхронизацию и идемпотентное разрешение дублей.
- Оставить localStorage источником истины только для гостевого режима.
- Определить явную семантику удаления: cascade, archive или tombstone.

Критерий приёмки:

- Разговор, созданный авторизованным пользователем на устройстве A, доступен на
  устройстве B.
- Reload не меняет message IDs.
- Повторный импорт localStorage не создаёт дубли и не теряет сообщения.
- Удаление разговора предсказуемо обрабатывает связанные interaction events.

### 3.4. Block IDs минтятся клиентом и не проверяются сервером

**Приоритет: P0.**

Подтверждено:

- [`src/lib/mentalist/blockIds.ts`](../src/lib/mentalist/blockIds.ts) вычисляет ID
  из `conversationId`, `messageIndex`, `blockIndex` и content fingerprint.
- Вызов выполняется при клиентском рендере в
  [`src/components/chat/ReplyBlocks.tsx`](../src/components/chat/ReplyBlocks.tsx).
- [`src/app/api/interaction/route.ts`](../src/app/api/interaction/route.ts) только
  проверяет, что `blockId` — непустая строка допустимой длины; сообщение не
  загружается и ID не пересчитывается.
- Комментарий в `blockIds.ts` утверждает, что ID проверяются сервером повторной
  деривацией из сохранённого сообщения. Такой реализации нет, а сохранённого
  серверного сообщения сейчас тоже нет.
- План требует server-minted IDs в Phase 0:
  [`docs/interaction-engine-plan.md`](interaction-engine-plan.md).

Оговорка: штатный UI сейчас не умеет удалять отдельные сообщения или обрезать
историю. Поэтому массовое изменение последующих ID из-за такого редактирования
пока является риском миграции/будущей функции, а не текущим пользовательским
сценарием. Возможность отправить forged block ID существует уже сейчас.

Необходимое исправление:

- Ввести постоянные server message IDs и server block IDs.
- Сохранять structured reply вместе с этими идентификаторами.
- Проверять на сервере принадлежность `conversation → message → block`
  авторизованному пользователю при каждой записи event.
- Исключить индекс массива из постоянной идентичности блока.

Критерий приёмки:

- Block ID одинаков после reload, синхронизации и загрузки на другом устройстве.
- Добавление или миграция соседнего сообщения не меняет ID существующего блока.
- Поддельный или принадлежащий другому пользователю `blockId` отклоняется с
  400/403 и не создаёт event.

### 3.5. Evidence не имеет проверяемой provenance-ссылки

**Приоритет: P0.**

Подтверждено:

- Запланированная модель в
  [`docs/interaction-engine-plan.md`](interaction-engine-plan.md) включает
  `sourceMessageId`, evidence grade и `kind: fact|inference`.
- Реальный `Evidence` в
  [`src/lib/interaction/reducer.ts`](../src/lib/interaction/reducer.ts) содержит
  только `id`, `excerpt`, `pinnedAt` и `dismissed`.
- `EVIDENCE_PINNED` содержит клиентские `blockId`, `evidenceId` и `excerpt`.
- Сервер не проверяет, что excerpt действительно присутствует в сообщении или
  принадлежит выбранному блоку.

Следствие: клиент может записать любой текст и назвать его evidence. Такой
payload не обеспечивает Provenance Trace, точное выделение исходника или
устойчивое различение fact/inference.

Необходимое исправление:

- Ввести `EvidenceReference`: `sourceMessageId`, `sourceBlockId`, устойчивый
  span/offset или другой точный locator и явный `kind`.
- Валидировать ссылку и соответствие текста исходному сообщению на сервере.
- Добавлять evidence grade только если он имеет определённую семантику для этого
  вида evidence, а не механически копировать grade учебного источника.

Критерий приёмки:

- Нельзя закрепить фрагмент, отсутствующий в принадлежащем пользователю
  сообщении.
- Клик по evidence после reload открывает точное исходное сообщение и выделяет
  точный фрагмент.
- Fact/inference сохраняется явно и не выводится повторно моделью.

### 3.6. Optimistic concurrency существует только в клиенте и комментариях

**Приоритет: P0.**

Подтверждено:

- [`src/lib/interaction/useCaseState.ts`](../src/lib/interaction/useCaseState.ts)
  отправляет `caseVersion` и обрабатывает HTTP 409.
- [`src/app/api/interaction/route.ts`](../src/app/api/interaction/route.ts)
  записывает полученное значение в `case_version`, но не сравнивает его с
  текущей версией.
- После любой успешной записи route возвращает HTTP 200; серверного пути 409 нет.
- Комментарий в
  [`supabase/migration_interaction_events.sql`](../supabase/migration_interaction_events.sql)
  и failure-handling section плана утверждают, что stale event отклоняется. Это
  не соответствует реализации.
- Уникальный индекс обеспечивает dedupe/last-write-wins для отдельных типов
  событий, но не контроль конкурентности.

Оценка предложения Opus: минимальная схема `read current version → compare →
write` не обеспечивает заявленную гарантию, потому что два параллельных запроса
могут прочитать одну версию и оба пройти проверку. Проверка и запись должны быть
атомарными.

Необходимое исправление:

- Создать authoritative case/conversation state row с монотонной версией.
- Выполнять compare version, insert/upsert event и increment version в одной
  транзакции или Supabase RPC.
- Для каждого event type явно определить политику `replace`, `append` или
  `reject-on-stale` рядом с dedupe policy.

Критерий приёмки:

- Два конкурентных запроса с одной expected version приводят ровно к одному
  принятому изменению; второй получает HTTP 409.
- Ни одно состояние не делит authoritative version с другим состоянием.
- Клиент показывает stale state и способен безопасно перезагрузить CaseState.

### 3.7. Текущий `CaseState.version` — число строк, а не версия изменений

**Приоритет: P0.**

Подтверждено:

- `deriveCase` увеличивает `state.version` один раз на каждую загруженную строку
  event log.
- Значение `StoredEvent.caseVersion` не участвует в вычислении версии.
- Dedupe upsert обновляет существующую строку, поэтому физическое количество
  строк и вычисленная `state.version` не увеличиваются при новом логическом
  изменении.
- `created_at` при fallback update также не обновляется.

Необходимое исправление:

- Хранить authoritative version отдельно от количества событий.
- Инкрементировать её транзакционно при каждом принятом логическом изменении,
  включая replace/dedupe update.
- Однозначно определить, содержит event expected version или resulting version.

Критерий приёмки:

- Последовательность toggle `false → true → false` создаёт три различимые версии
  состояния, даже если dedupe оставляет одну физическую event-строку.

### 3.8. Fallback update зависит от RLS и не фильтрует `user_id`

**Приоритет: P1.**

Подтверждено:

- Fallback в
  [`src/app/api/interaction/route.ts`](../src/app/api/interaction/route.ts)
  фильтрует update по `conversation_id` и `dedupe_key`, но не по `user_id`.
- Сейчас route создаёт Supabase client с anon key и пользовательскими cookies,
  а RLS update policy ограничивает строки текущим `auth.uid()`.

Это не доказанная текущая межпользовательская уязвимость: RLS закрывает её в
нынешней конфигурации. Это хрупкая defense-in-depth граница, которая станет
опасной при переходе route на service-role или при изменении политики.

Необходимое исправление:

- Добавить явный user predicate либо удалить fallback после гарантированного
  применения правильного уникального индекса.
- Предпочтительно заменить весь путь атомарной RPC из раздела concurrency.

Критерий приёмки:

- Совпадающий dedupe key другого пользователя нельзя обновить даже при тесте
  серверной функции с повышенными правами.
- Основной путь не зависит от regex-разбора текста ошибки `ON CONFLICT`.

### 3.9. Инструкция развёртывания не создаёт полную базу

**Приоритет: P1, обязательно до создания нового окружения.**

Подтверждено:

- [`README.md`](../README.md) предлагает применить только
  `supabase/schema.sql`.
- [`supabase/schema.sql`](../supabase/schema.sql) создаёт только
  `learning_plans` и использует `create policy` без предварительного
  `drop policy if exists`, поэтому повторное применение падает на уже
  существующих policies.
- Остальные SQL-файлы создают ещё 13 таблиц, pgvector extension, RPC и ALTER-ы.
- Порядок имеет реальные зависимости:
  - `migration_expert.sql` создаёт `training_responses`;
  - `migration_knowledge.sql` ALTER-ит `training_responses` и создаёт knowledge
    tables/RPC;
  - `migration_sources_depth.sql` ALTER-ит knowledge tables и переводит RPC на
    четырёхаргументную форму;
  - `migration_license_verification.sql` ожидает эту форму RPC и дополняет
    knowledge tables;
  - `migration_interaction_events.sql` создаёт event log.
- Ingest-скриптам нужен `SUPABASE_SERVICE_ROLE_KEY_ULIKA`, но переменная не
  указана в [`.env.local.example`](../.env.local.example).
- README не описывает seed/ingest и smoke-проверку корпуса.

Корректный логический порядок текущих файлов:

1. `schema.sql`
2. `migration_memory.sql`
3. `migration_expert.sql`
4. `migration_knowledge.sql`
5. `migration_sources_depth.sql`
6. `migration_license_verification.sql`
7. `migration_interaction_events.sql`

Необходимое исправление:

- Перейти на timestamped migrations Supabase CLI, чтобы порядок и применённое
  состояние фиксировались системой, а не памятью оператора.
- Добавить одну документированную seed-команду поверх существующих ingest tools.
- Добавить schema/seed smoke test.
- Указать имя service-role переменной в example env без реального секрета.

Критерий приёмки:

- Чистый Supabase-проект поднимается одной документированной командой.
- Повторный запуск не падает.
- Все ожидаемые таблицы, RLS policies и RPC существуют.
- Seed завершается успешно; `knowledge_chunks` непуст и vector RPC возвращает
  ожидаемую форму результата.

### 3.10. Пустая knowledge DB якобы воспроизводит grade-D bug

**Вердикт: опровергнуто для текущего кода. Приоритет связанной защиты: P1.**

Утверждение Opus: пустые knowledge tables заставят `buildMaterialRules` сообщить,
что лучший материал имеет grade D.

Что делает код:

- При пустом или ошибочном vector result
  [`src/lib/knowledge/router.ts`](../src/lib/knowledge/router.ts) переключается на
  cue fallback и возвращает `chunks: []` плюс локальный knowledge block.
- [`src/lib/knowledge/materialRules.ts`](../src/lib/knowledge/materialRules.ts)
  при `chunks.length === 0` сразу возвращает пустую строку.
- Следовательно, пустая vector DB не создаёт grade-D material warning.
- Grade D выбирается, когда chunks существуют, но среди них нет A/B/C grade.
  Такой исторический дефект с неоценёнными существующими chunks согласуется с
  changelog, но это другой сценарий.

Необходимое исправление:

- Зафиксировать это поведение unit-тестом.
- Seed smoke должен запрещать retrievable chunks без эффективного grade.
- В observability явно различать `retrieval: vector` и `retrieval: cues`.

Критерий приёмки:

- Тест подтверждает `buildMaterialRules([]) === ""`.
- Seed validation не пропускает ungraded retrievable chunks.
- Пустой corpus приводит к cue fallback, а не к фиктивной grade-D оценке.

### 3.11. Настоящее staging-окружение якобы отсутствует

**Вердикт: не подтверждено и не опровергнуто репозиторием. Приоритет проверки: P1.**

Opus приводит внешние наблюдения: production `/api/interaction` возвращает 404,
деплои старше feature commit, а Vercel variables существуют только в Production.

Репозиторий подтверждает только следующее:

- Существует ветка `staging`, синхронизированная с `origin/staging` на момент
  аудита.
- Локальный `.vercel/project.json` содержит только project/org IDs.
- В репозитории нет deployment history, env scope inventory, CI workflow или
  versioned preview smoke test.

Поэтому конкретные HTTP-результаты, даты деплоев и env scopes нельзя принять как
доказанные непосредственно по репозиторию. Их нужно повторно проверить с
авторизованным доступом и сохранить воспроизводимый отчёт без секретов.

Необходимое исправление:

- Формализовать preview deployment ветки `staging`.
- Явно настроить необходимые Preview/Development env scopes.
- Не подключать preview к production DB для write-тестов без отдельного
  осознанного решения.
- Добавить deployment smoke, фиксирующий commit SHA и результаты API-проверок.

Критерий приёмки:

- Preview URL однозначно соответствует проверяемому commit SHA.
- `/api/interaction` не возвращает 404 или `503 Not configured`.
- Тестовый пользователь проходит auth, event round-trip и chat smoke.
- CI-отчёт не раскрывает значения секретов.

## 4. Приоритеты

### P0 — блокируют Evidence Tray

1. Серверное хранение authenticated conversations и messages.
2. Постоянные server message/block IDs и серверная проверка принадлежности.
3. Проверяемая Evidence provenance-модель с точной ссылкой на исходник.
4. Атомарная optimistic concurrency с authoritative version.
5. Версия состояния, независимая от количества event rows.
6. Автоматический integration/E2E round-trip для evidence events.

### P1 — обязательны для воспроизводимого staging и безопасного продолжения

1. Содержание выполненных checklist actions в AI context.
2. Удаление хрупкого fallback update или явный user predicate.
3. Упорядоченные migrations, seed и schema smoke.
4. Тест поведения пустого/ungraded knowledge corpus.
5. Проверяемый preview deployment и env scopes.

## 5. Согласованный план до начала Evidence Tray

### Этап 1. Зафиксировать честную baseline-границу

Работа:

- Называть текущий статус `event foundation + checklist vertical slice`, а не
  полностью готовой Phase 0/1.
- Исправить ложные комментарии о server-side ID verification и stale rejection.
- Для каждого event type указать `wired`, `reserved`, `tested`.
- Перенести ручной acceptance-сценарий в воспроизводимый тестовый артефакт.

Критерий приёмки этапа:

- Документация, комментарии и поведение не противоречат друг другу.
- Из репозитория однозначно видно, какие events доступны пользователю.
- Acceptance-сценарий запускается одной документированной командой.

### Этап 2. Сделать окружение и БД воспроизводимыми

Работа:

- Перенести SQL в упорядоченные Supabase migrations.
- Зафиксировать зависимости schema → memory → expert → knowledge → depth →
  licence → interaction.
- Добавить seed-команду и schema/corpus smoke.
- Документировать service-role variable без значения.
- Поднять проверяемый preview отдельно от production.

Критерий приёмки этапа:

- Чистое окружение поднимается одной командой и повторный запуск безопасен.
- Все таблицы, RLS policies, extension и RPC присутствуют.
- Corpus непуст, все retrievable chunks имеют effective grade.
- Preview связан с текущим SHA и проходит auth/API smoke.

### Этап 3. Перенести authenticated conversations на сервер

Работа:

- Ввести серверные conversation/message records.
- Реализовать read-both/write-new для localStorage migration.
- Оставить localStorage основным хранилищем только для гостей.
- Определить sync, conflict и deletion semantics.

Критерий приёмки этапа:

- Разговор доступен после reload и на втором устройстве.
- Импорт localStorage идемпотентен и не теряет сообщения.
- Message IDs постоянны.
- Удаление не оставляет необъяснимого недостижимого server state.

### Этап 4. Исправить идентичность и provenance

Работа:

- Минтить message/block IDs на сервере и сохранять structured replies.
- Проверять ownership/reference chain при event write.
- Удалить array index из постоянной идентичности.
- Ввести точный `EvidenceReference` с message, block, locator и fact/inference.

Критерий приёмки этапа:

- Валидная ссылка переживает reload, sync и migration.
- Forged/foreign reference отклоняется сервером.
- Evidence открывает и выделяет точный исходный фрагмент.
- Сервер может доказать соответствие excerpt исходному сообщению.

### Этап 5. Реализовать атомарную модель версии

Работа:

- Добавить authoritative case/conversation version.
- Реализовать транзакционную compare-and-append RPC.
- Объявить conflict policy для каждого event type.
- Удалить вычисление версии из количества строк и старый неатомарный fallback.

Критерий приёмки этапа:

- Два конкурентных запроса с одной expected version дают один success и один
  409.
- Каждый принятый логический transition увеличивает версию.
- Dedupe update не скрывает изменение версии.
- Клиент восстанавливается после stale response без потери подтверждённого
  server state.

### Этап 6. Автоматизировать минимальный вертикальный срез

Работа:

- Unit: validator, reducer, context и reference validation.
- Integration: authenticated Route Handler + database + RLS + dedupe +
  concurrency.
- E2E: action → reload → restored state → next AI context.
- Сохранить checklist как регрессионный slice.
- Добавить `EVIDENCE_PINNED`, `EVIDENCE_DISMISSED`, forged reference и crisis
  no-interaction scenarios.

Критерий приёмки этапа:

- Весь набор проходит одной CI-командой на preview schema.
- Pin и dismiss переживают reload и видны следующему AI-turn.
- Поддельный fragment/reference не записывается.
- Crisis response не содержит интерактивных блоков.
- Результат тестов привязан к конкретному commit SHA.

## 6. Финальный P0-гейт Evidence Tray

Evidence Tray разрешено начинать только когда одновременно выполнено следующее:

- Этап 3 принят: разговоры и сообщения имеют серверный источник истины для
  авторизованного пользователя.
- Этап 4 принят: message/block identity и evidence provenance стабильны и
  проверяются сервером.
- Этап 5 принят: concurrency атомарна, authoritative version работает и stale
  request реально получает 409.
- P0-часть этапа 6 принята: evidence pin/dismiss имеют автоматический
  authenticated round-trip, reload и AI-context test.

Этапы 1 и 2 должны быть завершены раньше как условия честной проверки и
воспроизводимого окружения. P1-задачи не должны бесконтрольно переноситься за
Evidence Tray; исключение возможно только для пункта, который не влияет на
identity, provenance, persistence, RLS, concurrency или воспроизводимость
тестового окружения.

До прохождения этого гейта допустимы проектирование contract/schema, UX-прототип
без интеграции и тестовые fixtures. Начинать production implementation Evidence
Tray поверх текущего event path нельзя.
