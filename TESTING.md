# Руководство по тестированию

## 🧪 Настроенное окружение

Проект использует **Vitest** - быстрый и современный тестовый фреймворк для TypeScript.

### Установленные зависимости
- `vitest` - тестовый фреймворк
- `@vitest/ui` - UI для просмотра тестов
- `supertest` - библиотека для тестирования HTTP endpoints
- `@types/supertest` - типы для supertest

## 📝 Команды

```bash
# Запустить тесты в watch режиме (автоматически перезапускаются при изменениях)
yarn test

# Запустить тесты один раз
yarn test:run

# Запустить тесты с UI (веб-интерфейс)
yarn test:ui

# Запустить тесты с покрытием кода
yarn test:coverage

# Запустить только e2e тесты
yarn test:e2e
```

## 📁 Структура тестов

Тесты должны находиться рядом с тестируемым кодом:

```
src/
├── application/
│   └── use-cases/
│       ├── StreamVideoUseCase.ts
│       └── StreamVideoUseCase.test.ts    # Тест рядом с кодом
├── infrastructure/
│   └── logging/
│       ├── ConsoleLogger.ts
│       └── ConsoleLogger.test.ts         # Тест рядом с кодом
```

Или использовать папку `__tests__`:

```
src/
└── application/
    └── use-cases/
        ├── StreamVideoUseCase.ts
        └── __tests__/
            └── StreamVideoUseCase.test.ts
```

## ✍️ Примеры тестов

### Unit-тест Use Case

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamVideoUseCase } from './StreamVideoUseCase';
import { ITorrentRepository, ILogger } from '../../domain/interfaces';

describe('StreamVideoUseCase', () => {
  let useCase: StreamVideoUseCase;
  let mockRepo: ITorrentRepository;
  let mockLogger: ILogger;

  beforeEach(() => {
    // Создаём моки
    mockRepo = {
      add: vi.fn(),
      get: vi.fn(),
      // ... остальные методы
    };
    
    mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
      // ... остальные методы
    };

    useCase = new StreamVideoUseCase(mockRepo, mockLogger);
  });

  it('should return error for invalid magnet', async () => {
    const result = await useCase.execute({ magnet: 'invalid' });
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid magnet link');
  });
});
```

### Тест с моками

```typescript
it('should handle repository errors', async () => {
  const error = new Error('Repository error');
  vi.mocked(mockRepo.add).mockRejectedValue(error);

  const result = await useCase.execute({ 
    magnet: 'magnet:?xt=urn:btih:test' 
  });

  expect(result.success).toBe(false);
  expect(result.error).toBe('Repository error');
});
```

## 🎯 Стратегия тестирования

### 1. Unit-тесты (Use Cases)
- Тестируют бизнес-логику изолированно
- Используют моки для всех зависимостей
- Быстрые и детерминированные

### 2. Integration-тесты (Repositories)
- Тестируют взаимодействие с внешними библиотеками
- Могут использовать реальные зависимости (WebTorrent)
- Проверяют адаптеры и конвертацию данных

### 3. E2E-тесты (API)
- Тестируют полный поток через HTTP
- Используют реальный Express сервер
- Проверяют интеграцию всех слоёв
- Используют моки для WebTorrent (не требуют реальных торрентов)
- Находятся в `src/presentation/http/__tests__/e2e.test.ts`

#### Пример e2e теста:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';

describe('E2E Tests', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it('should return 400 when magnet link is missing', async () => {
    const response = await request(app).get('/stream');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });
});
```

#### Покрытие e2e тестами:
- ✅ GET /stream - стриминг видео
- ✅ GET /info - информация о торренте
- ✅ GET /torrents - список активных торрентов
- ✅ DELETE /torrent - удаление торрента
- ✅ Обработка ошибок и валидация

## 📊 Покрытие кода

Запустить с покрытием:
```bash
yarn test:coverage
```

Отчёт будет в папке `coverage/`.

## 🔧 Конфигурация

Конфигурация Vitest находится в `vitest.config.ts`:

- `globals: true` - глобальные функции (describe, it, expect)
- `environment: 'node'` - Node.js окружение
- `include` - паттерны для поиска тестов
- `coverage` - настройки покрытия кода

## 💡 Советы

1. **Используйте моки** - тестируйте изолированно
2. **Один тест = одна проверка** - проще отлаживать
3. **Используйте describe для группировки** - структурируйте тесты
4. **Пишите тесты перед кодом (TDD)** - помогает проектировать API
5. **Тестируйте граничные случаи** - ошибки, null, undefined

## 🚀 Следующие шаги

1. ✅ Добавить e2e тесты для всех API endpoints
2. Добавить тесты для всех use cases
3. Добавить тесты для репозиториев
4. Добавить integration-тесты
5. Настроить CI/CD для автоматического запуска тестов

## 📦 Моки

Проект использует моки для WebTorrent в e2e тестах:
- `src/__mocks__/webtorrent.ts` - моки для WebTorrent клиента и торрентов
- Моки позволяют тестировать API без реальных торрентов
- Моки эмулируют поведение WebTorrent (метаданные, файлы, стриминг)
