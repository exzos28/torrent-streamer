# Анализ архитектуры и план рефакторинга

## 🔍 Текущие проблемы

### 1. Тесная связанность (Tight Coupling)
- ❌ `TorrentManager` напрямую зависит от WebTorrent
- ❌ `StreamHandler` напрямую работает с Express Request/Response
- ❌ `routes/stream.ts` напрямую использует конкретный класс `TorrentManager`
- ❌ Нет абстракций/интерфейсов

### 2. Нарушение принципов SOLID

#### Single Responsibility Principle (SRP)
- ❌ `TorrentManager` делает слишком много:
  - Управление WebTorrent клиентом
  - Управление торрентами
  - Поиск видео файлов
  - Преобразование данных
  - Управление памятью

#### Dependency Inversion Principle (DIP)
- ❌ Зависимости от конкретных реализаций, а не от абстракций
- ❌ Невозможно заменить WebTorrent на другую реализацию
- ❌ Сложно мокировать для тестов

#### Open/Closed Principle (OCP)
- ❌ Сложно расширять функциональность без изменения существующего кода

### 3. Проблемы с тестированием
- ❌ Статические методы в `StreamHandler` - сложно мокировать
- ❌ Прямые зависимости от внешних библиотек
- ❌ Нет dependency injection
- ❌ Сложно изолировать компоненты для unit-тестов

### 4. Смешение слоёв
- ❌ Бизнес-логика смешана с инфраструктурой
- ❌ Нет разделения на domain, application, infrastructure, presentation

---

## 🏗️ Предлагаемая архитектура (Clean Architecture)

```
src/
├── domain/                      # Domain Layer (бизнес-логика, не зависит ни от чего)
│   ├── entities/               # Сущности
│   │   ├── Torrent.ts
│   │   ├── TorrentFile.ts
│   │   └── StreamRange.ts
│   ├── interfaces/             # Интерфейсы (порты)
│   │   ├── ITorrentRepository.ts
│   │   ├── IStreamService.ts
│   │   ├── IChunkStore.ts
│   │   └── ILogger.ts
│   └── types/                  # Domain типы
│       └── index.ts
│
├── application/                 # Application Layer (use cases)
│   ├── use-cases/              # Use cases
│   │   ├── AddTorrentUseCase.ts
│   │   ├── StreamVideoUseCase.ts
│   │   ├── GetTorrentInfoUseCase.ts
│   │   └── RemoveTorrentUseCase.ts
│   └── services/               # Application services
│       └── TorrentService.ts
│
├── infrastructure/             # Infrastructure Layer (реализации)
│   ├── torrent/                # WebTorrent реализация
│   │   ├── WebTorrentRepository.ts
│   │   └── WebTorrentAdapter.ts
│   ├── storage/                # Storage реализация
│   │   ├── MemoryLimitedStore.ts
│   │   └── ChunkStoreFactory.ts
│   ├── streaming/              # Streaming реализация
│   │   └── RangeStreamService.ts
│   └── logging/                # Logging реализация
│       └── ConsoleLogger.ts
│
└── presentation/               # Presentation Layer (HTTP, CLI, etc.)
    ├── http/                   # HTTP controllers
    │   ├── StreamController.ts
    │   └── TorrentController.ts
    ├── routes/                 # Express routes
    │   └── stream.routes.ts
    └── middleware/             # Express middleware
        └── error-handler.ts
```

---

## 📋 План рефакторинга

### Этап 1: Создание интерфейсов (Domain Layer)

#### 1.1. Интерфейсы для репозиториев
```typescript
// domain/interfaces/ITorrentRepository.ts
export interface ITorrentRepository {
  add(magnet: string): Promise<Torrent>;
  get(magnet: string): Torrent | null;
  getAll(): Torrent[];
  remove(magnet: string): boolean;
  destroy(): Promise<void>;
}
```

#### 1.2. Интерфейсы для сервисов
```typescript
// domain/interfaces/IStreamService.ts
export interface IStreamService {
  streamVideo(file: TorrentFile, range: string | undefined): Promise<StreamResult>;
  waitForPieces(file: TorrentFile, start: number, end: number): Promise<boolean>;
}
```

#### 1.3. Интерфейсы для утилит
```typescript
// domain/interfaces/IVideoFileFinder.ts
export interface IVideoFileFinder {
  find(torrent: Torrent): TorrentFile | null;
}
```

### Этап 2: Разделение ответственности

#### 2.1. TorrentManager → TorrentRepository + TorrentService
- `TorrentRepository` - только работа с WebTorrent (инфраструктура)
- `TorrentService` - бизнес-логика работы с торрентами (application)

#### 2.2. StreamHandler → StreamService
- Убрать статические методы
- Сделать инжектируемым сервисом
- Разделить на RangeParser, StreamHandler, PieceAvailabilityChecker

### Этап 3: Use Cases (Application Layer)

#### 3.1. AddTorrentUseCase
```typescript
class AddTorrentUseCase {
  constructor(
    private torrentRepo: ITorrentRepository,
    private logger: ILogger
  ) {}
  
  async execute(magnet: string): Promise<Torrent> {
    // Бизнес-логика добавления торрента
  }
}
```

#### 3.2. StreamVideoUseCase
```typescript
class StreamVideoUseCase {
  constructor(
    private torrentRepo: ITorrentRepository,
    private streamService: IStreamService,
    private videoFinder: IVideoFileFinder
  ) {}
  
  async execute(magnet: string, range?: string): Promise<StreamResult> {
    // Бизнес-логика стриминга
  }
}
```

### Этап 4: Dependency Injection

#### 4.1. Создать DI контейнер
```typescript
// infrastructure/di/container.ts
class Container {
  private services = new Map();
  
  register<T>(token: string, factory: () => T): void;
  resolve<T>(token: string): T;
}
```

#### 4.2. Настроить зависимости
```typescript
// infrastructure/di/setup.ts
container.register('ITorrentRepository', () => new WebTorrentRepository());
container.register('IStreamService', () => new RangeStreamService());
container.register('ILogger', () => new ConsoleLogger());
```

### Этап 5: Контроллеры (Presentation Layer)

#### 5.1. StreamController
```typescript
class StreamController {
  constructor(
    private streamVideoUseCase: StreamVideoUseCase
  ) {}
  
  async stream(req: Request, res: Response): Promise<void> {
    // Только HTTP логика, делегирует в use case
  }
}
```

---

## ✅ Преимущества новой архитектуры

### 1. Тестируемость
- ✅ Легко мокировать интерфейсы
- ✅ Изолированное тестирование use cases
- ✅ Unit-тесты без внешних зависимостей

### 2. Гибкость
- ✅ Можно заменить WebTorrent на другую реализацию
- ✅ Легко добавить новые use cases
- ✅ Можно добавить другие интерфейсы (CLI, gRPC)

### 3. Поддерживаемость
- ✅ Чёткое разделение ответственности
- ✅ Легко понять, где что находится
- ✅ Проще добавлять новые фичи

### 4. Расширяемость
- ✅ Новые use cases не требуют изменения существующего кода
- ✅ Можно добавить кеширование, валидацию, авторизацию

---

## 🧪 Примеры тестов после рефакторинга

### Unit-тест Use Case
```typescript
describe('StreamVideoUseCase', () => {
  it('should stream video when torrent exists', async () => {
    const mockRepo = createMockTorrentRepository();
    const mockStreamService = createMockStreamService();
    const useCase = new StreamVideoUseCase(mockRepo, mockStreamService);
    
    // Тест изолирован, не зависит от WebTorrent или Express
  });
});
```

### Integration-тест
```typescript
describe('StreamController Integration', () => {
  it('should handle HTTP request', async () => {
    // Тест с реальными зависимостями
  });
});
```

---

## 📊 Сравнение

| Аспект | Текущая архитектура | Чистая архитектура |
|--------|---------------------|-------------------|
| Тестируемость | ❌ Сложно | ✅ Легко |
| Зависимости | ❌ Жёсткие | ✅ Через интерфейсы |
| Расширяемость | ❌ Сложно | ✅ Легко |
| Понимание | ⚠️ Средне | ✅ Понятно |
| Количество кода | ✅ Меньше | ⚠️ Больше |

---

## 🚀 План миграции

1. **Создать интерфейсы** (domain/interfaces)
2. **Выделить use cases** (application/use-cases)
3. **Реализовать репозитории** (infrastructure/torrent)
4. **Создать контроллеры** (presentation/http)
5. **Настроить DI** (infrastructure/di)
6. **Мигрировать по одному компоненту**
7. **Написать тесты для каждого слоя**

---

## 📝 Рекомендации

1. **Начать с интерфейсов** - это основа всей архитектуры
2. **Мигрировать постепенно** - не переписывать всё сразу
3. **Писать тесты параллельно** - для каждого нового компонента
4. **Использовать DI контейнер** - для управления зависимостями
5. **Документировать** - каждый слой и его ответственность

---

**Готов начать рефакторинг?** Предлагаю начать с создания интерфейсов и постепенной миграции компонентов.
