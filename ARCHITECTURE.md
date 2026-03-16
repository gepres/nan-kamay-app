# 🏗️ Arquitectura Limpia & Hexagonal — React Native

> Guía de arquitectura para proyectos React Native con NativeWind (TailwindCSS), Axios, Zustand y buenas prácticas de ingeniería.

---

## Tabla de Contenidos

1. [Filosofía General](#1-filosofía-general)
2. [Estructura de Carpetas](#2-estructura-de-carpetas)
3. [Capas de la Arquitectura](#3-capas-de-la-arquitectura)
4. [Capa de Dominio](#4-capa-de-dominio)
5. [Capa de Aplicación (Casos de Uso)](#5-capa-de-aplicación-casos-de-uso)
6. [Capa de Infraestructura](#6-capa-de-infraestructura)
7. [Capa de Presentación (UI)](#7-capa-de-presentación-ui)
8. [HTTP Client — Axios](#8-http-client--axios)
9. [Estado Global — Zustand](#9-estado-global--zustand)
10. [Inyección de Dependencias](#10-inyección-de-dependencias)
11. [Navegación con Expo Router](#11-navegación-con-expo-router)
12. [NativeWind / TailwindCSS](#12-nativewind--tailwindcss)
13. [Manejo de Errores](#13-manejo-de-errores)
14. [Testing](#14-testing)
15. [Seguridad](#15-seguridad)
16. [Performance](#16-performance)
17. [CI/CD y Calidad de Código](#17-cicd-y-calidad-de-código)
18. [Convenciones y Reglas del Proyecto](#18-convenciones-y-reglas-del-proyecto)

---

## 1. Filosofía General

Esta arquitectura combina los principios de **Clean Architecture** (Robert C. Martin) y **Arquitectura Hexagonal / Ports & Adapters** (Alistair Cockburn), adaptados al ecosistema React Native.

### Principios Rectores

- **Independencia del framework**: La lógica de negocio no conoce React Native, Expo, ni NativeWind.
- **Independencia de la UI**: La capa de dominio puede funcionar sin una interfaz gráfica.
- **Independencia de la base de datos**: El dominio no sabe si los datos vienen de una API REST, GraphQL, SQLite o AsyncStorage.
- **Testeable por diseño**: Cada capa se puede testear de forma aislada gracias a la inyección de dependencias.
- **Regla de dependencia**: Las dependencias siempre apuntan hacia adentro (UI → Aplicación → Dominio). Nunca al revés.

### Diagrama Conceptual

```
┌─────────────────────────────────────────────────┐
│                  PRESENTACIÓN                    │
│        Screens · Components · Hooks · Stores     │
├─────────────────────────────────────────────────┤
│                  APLICACIÓN                      │
│              Casos de Uso (UseCases)             │
├─────────────────────────────────────────────────┤
│                    DOMINIO                       │
│     Entities · ValueObjects · Ports (interfaces) │
├─────────────────────────────────────────────────┤
│                INFRAESTRUCTURA                   │
│   Adapters: API · Storage · Geolocation · etc.   │
└─────────────────────────────────────────────────┘
```

---

## 2. Estructura de Carpetas

```
src/
├── app/                          # Expo Router (file-based routing)
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── home.tsx
│   │   ├── profile.tsx
│   │   └── settings.tsx
│   ├── _layout.tsx               # Root layout
│   └── index.tsx                 # Entry redirect
│
├── core/                         # === DOMINIO ===
│   ├── entities/
│   │   ├── User.ts
│   │   ├── Product.ts
│   │   └── Order.ts
│   ├── value-objects/
│   │   ├── Email.ts
│   │   ├── Money.ts
│   │   └── Coordinates.ts
│   ├── errors/
│   │   ├── DomainError.ts
│   │   ├── AuthenticationError.ts
│   │   └── ValidationError.ts
│   ├── ports/
│   │   ├── repositories/
│   │   │   ├── IAuthRepository.ts
│   │   │   ├── IUserRepository.ts
│   │   │   └── IProductRepository.ts
│   │   └── services/
│   │       ├── ILocationService.ts
│   │       ├── IStorageService.ts
│   │       └── INotificationService.ts
│   └── rules/                    # Reglas de negocio puras
│       ├── OrderRules.ts
│       └── PricingRules.ts
│
├── application/                  # === CASOS DE USO ===
│   ├── auth/
│   │   ├── LoginUseCase.ts
│   │   ├── RegisterUseCase.ts
│   │   ├── LogoutUseCase.ts
│   │   └── RefreshTokenUseCase.ts
│   ├── user/
│   │   ├── GetProfileUseCase.ts
│   │   └── UpdateProfileUseCase.ts
│   ├── product/
│   │   ├── GetProductsUseCase.ts
│   │   ├── SearchProductsUseCase.ts
│   │   └── GetProductDetailUseCase.ts
│   └── order/
│       ├── CreateOrderUseCase.ts
│       ├── GetOrderHistoryUseCase.ts
│       └── CancelOrderUseCase.ts
│
├── infrastructure/               # === ADAPTADORES ===
│   ├── http/
│   │   ├── axiosClient.ts        # Instancia configurada de Axios
│   │   ├── interceptors/
│   │   │   ├── authInterceptor.ts
│   │   │   ├── errorInterceptor.ts
│   │   │   └── loggingInterceptor.ts
│   │   └── dtos/                 # Data Transfer Objects (API shapes)
│   │       ├── LoginRequestDTO.ts
│   │       ├── LoginResponseDTO.ts
│   │       ├── UserDTO.ts
│   │       └── ProductDTO.ts
│   ├── repositories/
│   │   ├── AuthRepositoryImpl.ts
│   │   ├── UserRepositoryImpl.ts
│   │   └── ProductRepositoryImpl.ts
│   ├── services/
│   │   ├── LocationServiceImpl.ts
│   │   ├── SecureStorageServiceImpl.ts
│   │   └── PushNotificationServiceImpl.ts
│   ├── mappers/
│   │   ├── UserMapper.ts
│   │   ├── ProductMapper.ts
│   │   └── OrderMapper.ts
│   ├── storage/
│   │   ├── mmkvStorage.ts        # MMKV para persistencia rápida
│   │   └── secureStorage.ts      # expo-secure-store para tokens
│   └── config/
│       ├── env.ts                # Variables de entorno tipadas
│       └── apiRoutes.ts          # Constantes de rutas de la API
│
├── presentation/                 # === UI ===
│   ├── components/
│   │   ├── ui/                   # Componentes genéricos/design system
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Avatar.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Skeleton.tsx
│   │   │   └── Toast.tsx
│   │   ├── forms/
│   │   │   ├── LoginForm.tsx
│   │   │   └── RegisterForm.tsx
│   │   ├── layout/
│   │   │   ├── SafeContainer.tsx
│   │   │   ├── Header.tsx
│   │   │   └── BottomSheet.tsx
│   │   └── shared/
│   │       ├── ErrorBoundary.tsx
│   │       ├── EmptyState.tsx
│   │       ├── LoadingOverlay.tsx
│   │       └── NetworkStatus.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useProducts.ts
│   │   ├── useDebounce.ts
│   │   ├── useNetworkStatus.ts
│   │   ├── useKeyboard.ts
│   │   └── useRefreshOnFocus.ts
│   ├── stores/                   # Zustand stores
│   │   ├── authStore.ts
│   │   ├── userStore.ts
│   │   ├── productStore.ts
│   │   ├── cartStore.ts
│   │   └── uiStore.ts           # Toasts, modals, loading global
│   └── theme/
│       ├── colors.ts
│       ├── typography.ts
│       └── spacing.ts
│
├── shared/                       # Utilidades transversales
│   ├── types/
│   │   ├── Result.ts             # Result<T, E> monad
│   │   ├── Pagination.ts
│   │   └── AsyncState.ts
│   ├── utils/
│   │   ├── formatCurrency.ts
│   │   ├── formatDate.ts
│   │   ├── validators.ts
│   │   └── logger.ts
│   ├── constants/
│   │   ├── queryKeys.ts
│   │   └── errorMessages.ts
│   └── i18n/
│       ├── es.json
│       └── en.json
│
├── di/                           # Inyección de Dependencias
│   ├── container.ts              # Registro del contenedor
│   └── providers.tsx             # React Context wrappers
│
└── __tests__/
    ├── core/
    ├── application/
    ├── infrastructure/
    └── presentation/
```

---

## 3. Capas de la Arquitectura

### Regla de Dependencia (estricta)

```
Presentación  →  Aplicación  →  Dominio  ←  Infraestructura
     │                │             ▲              │
     │                │             │              │
     └────────────────┴─────────────┘──────────────┘
              Todo apunta hacia DOMINIO
```

| Capa | Conoce a | No conoce a |
|------|----------|-------------|
| **Dominio** | Nada externo | React, Axios, Zustand, NativeWind |
| **Aplicación** | Dominio (ports) | Implementaciones concretas |
| **Infraestructura** | Dominio (implementa ports) | Presentación |
| **Presentación** | Aplicación, Dominio (entities) | Infraestructura directamente |

---

## 4. Capa de Dominio

La capa más interna y protegida. **Cero dependencias externas**. Solo TypeScript puro.

### 4.1 Entities

Las entidades encapsulan la lógica de negocio más crítica.

```typescript
// src/core/entities/User.ts

import { Email } from '../value-objects/Email';

export interface UserProps {
  id: string;
  email: Email;
  fullName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: Date;
}

export class User {
  private constructor(private readonly props: UserProps) {}

  static create(props: UserProps): User {
    if (!props.fullName || props.fullName.trim().length < 2) {
      throw new Error('El nombre debe tener al menos 2 caracteres');
    }
    return new User(props);
  }

  get id(): string { return this.props.id; }
  get email(): Email { return this.props.email; }
  get fullName(): string { return this.props.fullName; }
  get avatarUrl(): string | null { return this.props.avatarUrl; }
  get isVerified(): boolean { return this.props.isVerified; }
  get displayName(): string { return this.props.fullName.split(' ')[0]; }

  canPlaceOrder(): boolean {
    return this.props.isVerified;
  }

  toJSON(): UserProps {
    return { ...this.props };
  }
}
```

### 4.2 Value Objects

Objetos inmutables que encapsulan validación.

```typescript
// src/core/value-objects/Email.ts

export class Email {
  private readonly value: string;

  private constructor(email: string) {
    this.value = email;
  }

  static create(email: string): Email {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(email)) {
      throw new Error(`Email inválido: ${email}`);
    }
    return new Email(email.toLowerCase().trim());
  }

  toString(): string {
    return this.value;
  }

  equals(other: Email): boolean {
    return this.value === other.toString();
  }
}
```

```typescript
// src/core/value-objects/Money.ts

export class Money {
  private constructor(
    readonly amount: number,
    readonly currency: string,
  ) {}

  static create(amount: number, currency: string = 'PEN'): Money {
    if (amount < 0) throw new Error('El monto no puede ser negativo');
    return new Money(Math.round(amount * 100) / 100, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.create(this.amount + other.amount, this.currency);
  }

  multiply(factor: number): Money {
    return Money.create(this.amount * factor, this.currency);
  }

  format(): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: this.currency,
    }).format(this.amount);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error('No se pueden operar monedas diferentes');
    }
  }
}
```

### 4.3 Ports (Interfaces)

Los puertos definen **contratos** que la infraestructura debe implementar.

```typescript
// src/core/ports/repositories/IAuthRepository.ts

import { User } from '../../entities/User';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface IAuthRepository {
  login(credentials: LoginCredentials): Promise<{ user: User; tokens: AuthTokens }>;
  register(data: RegisterData): Promise<{ user: User; tokens: AuthTokens }>;
  refreshToken(refreshToken: string): Promise<AuthTokens>;
  logout(): Promise<void>;
}
```

```typescript
// src/core/ports/services/IStorageService.ts

export interface IStorageService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}
```

```typescript
// src/core/ports/services/ILocationService.ts

import { Coordinates } from '../../value-objects/Coordinates';

export interface ILocationService {
  getCurrentPosition(): Promise<Coordinates>;
  watchPosition(callback: (coords: Coordinates) => void): () => void;
  requestPermissions(): Promise<boolean>;
}
```

### 4.4 Errores de Dominio

```typescript
// src/core/errors/DomainError.ts

export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// src/core/errors/AuthenticationError.ts
export class AuthenticationError extends DomainError {
  readonly code = 'AUTH_ERROR';

  static invalidCredentials(): AuthenticationError {
    return new AuthenticationError('Credenciales inválidas');
  }

  static sessionExpired(): AuthenticationError {
    return new AuthenticationError('La sesión ha expirado');
  }
}

// src/core/errors/ValidationError.ts
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';

  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}
```

---

## 5. Capa de Aplicación (Casos de Uso)

Orquesta la lógica de negocio. Cada caso de uso tiene **una sola responsabilidad**.

### Patrón Result para manejo de errores

```typescript
// src/shared/types/Result.ts

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export const Result = {
  ok: <T>(data: T): Result<T, never> => ({ success: true, data }),
  fail: <E>(error: E): Result<never, E> => ({ success: false, error }),
};
```

### Ejemplo de Caso de Uso

```typescript
// src/application/auth/LoginUseCase.ts

import { IAuthRepository, LoginCredentials } from '../../core/ports/repositories/IAuthRepository';
import { IStorageService } from '../../core/ports/services/IStorageService';
import { User } from '../../core/entities/User';
import { Result } from '../../shared/types/Result';
import { AuthenticationError } from '../../core/errors/AuthenticationError';

export class LoginUseCase {
  constructor(
    private readonly authRepository: IAuthRepository,
    private readonly storageService: IStorageService,
  ) {}

  async execute(credentials: LoginCredentials): Promise<Result<User, AuthenticationError>> {
    try {
      const { user, tokens } = await this.authRepository.login(credentials);

      await this.storageService.set('access_token', tokens.accessToken);
      await this.storageService.set('refresh_token', tokens.refreshToken);

      return Result.ok(user);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return Result.fail(error);
      }
      return Result.fail(AuthenticationError.invalidCredentials());
    }
  }
}
```

```typescript
// src/application/product/GetProductsUseCase.ts

import { IProductRepository, ProductFilters } from '../../core/ports/repositories/IProductRepository';
import { Product } from '../../core/entities/Product';
import { Result } from '../../shared/types/Result';
import { Pagination } from '../../shared/types/Pagination';

export class GetProductsUseCase {
  constructor(private readonly productRepository: IProductRepository) {}

  async execute(
    filters: ProductFilters,
    page: number = 1,
  ): Promise<Result<Pagination<Product>>> {
    try {
      const result = await this.productRepository.getAll(filters, page);
      return Result.ok(result);
    } catch (error) {
      return Result.fail(error as Error);
    }
  }
}
```

---

## 6. Capa de Infraestructura

Implementaciones concretas de los puertos. Aquí viven Axios, MMKV, Expo Location, etc.

### 6.1 DTOs y Mappers

```typescript
// src/infrastructure/http/dtos/UserDTO.ts

export interface UserDTO {
  id: string;
  email: string;
  full_name: string;       // snake_case de la API
  avatar_url: string | null;
  is_verified: boolean;
  created_at: string;       // ISO string de la API
}
```

```typescript
// src/infrastructure/mappers/UserMapper.ts

import { User } from '../../core/entities/User';
import { Email } from '../../core/value-objects/Email';
import { UserDTO } from '../http/dtos/UserDTO';

export class UserMapper {
  static toDomain(dto: UserDTO): User {
    return User.create({
      id: dto.id,
      email: Email.create(dto.email),
      fullName: dto.full_name,
      avatarUrl: dto.avatar_url,
      isVerified: dto.is_verified,
      createdAt: new Date(dto.created_at),
    });
  }

  static toDTO(entity: User): Partial<UserDTO> {
    return {
      full_name: entity.fullName,
      email: entity.email.toString(),
    };
  }
}
```

### 6.2 Implementación de Repositorios

```typescript
// src/infrastructure/repositories/AuthRepositoryImpl.ts

import { IAuthRepository, LoginCredentials, AuthTokens } from '../../core/ports/repositories/IAuthRepository';
import { User } from '../../core/entities/User';
import { UserMapper } from '../mappers/UserMapper';
import { apiClient } from '../http/axiosClient';
import { API_ROUTES } from '../config/apiRoutes';

export class AuthRepositoryImpl implements IAuthRepository {
  async login(credentials: LoginCredentials): Promise<{ user: User; tokens: AuthTokens }> {
    const { data } = await apiClient.post(API_ROUTES.AUTH.LOGIN, {
      email: credentials.email,
      password: credentials.password,
    });

    return {
      user: UserMapper.toDomain(data.user),
      tokens: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      },
    };
  }

  async register(registerData: RegisterData): Promise<{ user: User; tokens: AuthTokens }> {
    const { data } = await apiClient.post(API_ROUTES.AUTH.REGISTER, registerData);

    return {
      user: UserMapper.toDomain(data.user),
      tokens: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const { data } = await apiClient.post(API_ROUTES.AUTH.REFRESH, {
      refresh_token: refreshToken,
    });

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
  }

  async logout(): Promise<void> {
    await apiClient.post(API_ROUTES.AUTH.LOGOUT);
  }
}
```

### 6.3 Configuración de Rutas de API

```typescript
// src/infrastructure/config/apiRoutes.ts

export const API_ROUTES = {
  AUTH: {
    LOGIN:    '/auth/login',
    REGISTER: '/auth/register',
    REFRESH:  '/auth/refresh',
    LOGOUT:   '/auth/logout',
  },
  USERS: {
    PROFILE:  '/users/me',
    UPDATE:   '/users/me',
    AVATAR:   '/users/me/avatar',
  },
  PRODUCTS: {
    LIST:     '/products',
    DETAIL:   (id: string) => `/products/${id}`,
    SEARCH:   '/products/search',
  },
  ORDERS: {
    CREATE:   '/orders',
    LIST:     '/orders',
    DETAIL:   (id: string) => `/orders/${id}`,
    CANCEL:   (id: string) => `/orders/${id}/cancel`,
  },
} as const;
```

### 6.4 Variables de Entorno

```typescript
// src/infrastructure/config/env.ts

import Constants from 'expo-constants';

interface EnvConfig {
  API_BASE_URL: string;
  API_TIMEOUT: number;
  GOOGLE_MAPS_API_KEY: string;
  SENTRY_DSN: string;
  ENVIRONMENT: 'development' | 'staging' | 'production';
}

const extra = Constants.expoConfig?.extra ?? {};

export const env: EnvConfig = {
  API_BASE_URL: extra.API_BASE_URL ?? 'http://localhost:3000/api',
  API_TIMEOUT: Number(extra.API_TIMEOUT ?? 15000),
  GOOGLE_MAPS_API_KEY: extra.GOOGLE_MAPS_API_KEY ?? '',
  SENTRY_DSN: extra.SENTRY_DSN ?? '',
  ENVIRONMENT: (extra.ENVIRONMENT ?? 'development') as EnvConfig['ENVIRONMENT'],
};
```

---

## 7. Capa de Presentación (UI)

### 7.1 Componente de UI (Design System)

```tsx
// src/presentation/components/ui/Button.tsx

import { TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, { container: string; text: string }> = {
  primary:   { container: 'bg-brand-500 active:bg-brand-600',    text: 'text-white' },
  secondary: { container: 'bg-gray-100 active:bg-gray-200',      text: 'text-gray-800' },
  outline:   { container: 'border border-brand-500 bg-transparent', text: 'text-brand-500' },
  ghost:     { container: 'bg-transparent active:bg-gray-100',   text: 'text-gray-700' },
  danger:    { container: 'bg-red-500 active:bg-red-600',        text: 'text-white' },
};

const sizeStyles: Record<ButtonSize, { container: string; text: string }> = {
  sm: { container: 'px-3 py-2 rounded-lg',    text: 'text-sm' },
  md: { container: 'px-5 py-3 rounded-xl',    text: 'text-base' },
  lg: { container: 'px-6 py-4 rounded-2xl',   text: 'text-lg' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
}: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      className={`
        flex-row items-center justify-center
        ${s.container} ${v.container}
        ${fullWidth ? 'w-full' : 'self-start'}
        ${isDisabled ? 'opacity-50' : ''}
      `}
    >
      {loading ? (
        <ActivityIndicator color="white" className="mr-2" />
      ) : icon ? (
        <View className="mr-2">{icon}</View>
      ) : null}
      <Text className={`font-semibold ${s.text} ${v.text}`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
```

### 7.2 Screens como Contenedores Livianos

Las screens solo conectan stores + hooks con componentes. **Cero lógica de negocio aquí.**

```tsx
// src/app/(auth)/login.tsx

import { View, KeyboardAvoidingView, Platform } from 'react-native';
import { LoginForm } from '../../presentation/components/forms/LoginForm';
import { useAuth } from '../../presentation/hooks/useAuth';
import { SafeContainer } from '../../presentation/components/layout/SafeContainer';

export default function LoginScreen() {
  const { login, isLoading, error } = useAuth();

  return (
    <SafeContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-center px-6"
      >
        <View className="mb-10">
          <Text className="text-3xl font-bold text-gray-900 dark:text-white">
            Bienvenido
          </Text>
          <Text className="text-base text-gray-500 mt-1">
            Inicia sesión para continuar
          </Text>
        </View>

        <LoginForm
          onSubmit={login}
          isLoading={isLoading}
          error={error}
        />
      </KeyboardAvoidingView>
    </SafeContainer>
  );
}
```

---

## 8. HTTP Client — Axios

### 8.1 Instancia Base

```typescript
// src/infrastructure/http/axiosClient.ts

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { env } from '../config/env';
import { setupAuthInterceptor } from './interceptors/authInterceptor';
import { setupErrorInterceptor } from './interceptors/errorInterceptor';
import { setupLoggingInterceptor } from './interceptors/loggingInterceptor';

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: env.API_BASE_URL,
    timeout: env.API_TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  // Orden de interceptores: logging → auth → error
  setupLoggingInterceptor(client);
  setupAuthInterceptor(client);
  setupErrorInterceptor(client);

  return client;
}

export const apiClient = createApiClient();
```

### 8.2 Auth Interceptor con Refresh Automático

```typescript
// src/infrastructure/http/interceptors/authInterceptor.ts

import { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

function processQueue(error: Error | null, token: string | null): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  failedQueue = [];
}

export function setupAuthInterceptor(client: AxiosInstance): void {
  // REQUEST: Adjuntar token
  client.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      const token = await SecureStore.getItemAsync('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
  );

  // RESPONSE: Manejar 401 con refresh
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      if (error.response?.status !== 401 || originalRequest._retry) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(client(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await client.post('/auth/refresh', {
          refresh_token: refreshToken,
        });

        const newAccessToken = data.access_token;
        await SecureStore.setItemAsync('access_token', newAccessToken);
        await SecureStore.setItemAsync('refresh_token', data.refresh_token);

        processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return client(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error, null);

        // Limpiar storage y forzar logout
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');

        // Emitir evento para que la UI reaccione
        // (el authStore escucha este evento)
        globalThis.dispatchEvent?.(new Event('auth:force-logout'));

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    },
  );
}
```

### 8.3 Error Interceptor

```typescript
// src/infrastructure/http/interceptors/errorInterceptor.ts

import { AxiosInstance, AxiosError } from 'axios';
import { AuthenticationError } from '../../../core/errors/AuthenticationError';
import { ValidationError } from '../../../core/errors/ValidationError';
import { DomainError } from '../../../core/errors/DomainError';

interface ApiErrorResponse {
  message: string;
  code?: string;
  errors?: Record<string, string[]>;
}

export class NetworkError extends DomainError {
  readonly code = 'NETWORK_ERROR';
}

export class ServerError extends DomainError {
  readonly code = 'SERVER_ERROR';
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

export function setupErrorInterceptor(client: AxiosInstance): void {
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiErrorResponse>) => {
      // Sin respuesta del servidor (timeout, sin conexión)
      if (!error.response) {
        return Promise.reject(
          new NetworkError('Sin conexión a internet. Verifica tu red.'),
        );
      }

      const { status, data } = error.response;

      switch (status) {
        case 401:
          return Promise.reject(AuthenticationError.sessionExpired());
        case 422:
          return Promise.reject(
            new ValidationError(data?.message ?? 'Datos inválidos'),
          );
        case 429:
          return Promise.reject(
            new ServerError('Demasiadas solicitudes. Intenta más tarde.', 429),
          );
        case 500:
        case 502:
        case 503:
          return Promise.reject(
            new ServerError('Error del servidor. Intenta más tarde.', status),
          );
        default:
          return Promise.reject(
            new ServerError(data?.message ?? 'Error inesperado', status),
          );
      }
    },
  );
}
```

### 8.4 Logging Interceptor (solo dev)

```typescript
// src/infrastructure/http/interceptors/loggingInterceptor.ts

import { AxiosInstance } from 'axios';
import { env } from '../../config/env';

export function setupLoggingInterceptor(client: AxiosInstance): void {
  if (env.ENVIRONMENT === 'production') return;

  client.interceptors.request.use((config) => {
    console.log(`🌐 ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  });

  client.interceptors.response.use(
    (response) => {
      console.log(`✅ ${response.status} ${response.config.url}`);
      return response;
    },
    (error) => {
      console.log(`❌ ${error.response?.status ?? 'NETWORK'} ${error.config?.url}`);
      return Promise.reject(error);
    },
  );
}
```

---

## 9. Estado Global — Zustand

### 9.1 Principios de Diseño de Stores

- **Un store por dominio**, no por pantalla.
- **Slices atómicos**: Solo guardar lo necesario. Derivar el resto.
- **Acciones async dentro del store**: El store orquesta casos de uso.
- **Selectores granulares**: Evitar re-renders innecesarios.
- **Middleware**: `persist` para hidratación, `devtools` para debugging.
- **Nunca guardar entidades de dominio complejas** en el store. Usar plain objects serializables.

### 9.2 Auth Store

```typescript
// src/presentation/stores/authStore.ts

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '../../infrastructure/storage/mmkvStorage';
import { LoginUseCase } from '../../application/auth/LoginUseCase';
import { LogoutUseCase } from '../../application/auth/LogoutUseCase';
import { container } from '../../di/container';

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isHydrated: boolean;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  setHydrated: () => void;
  forceLogout: () => void;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  isHydrated: false,
};

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      login: async (email, password) => {
        set({ isLoading: true, error: null });

        const loginUseCase = container.resolve<LoginUseCase>('LoginUseCase');
        const result = await loginUseCase.execute({ email, password });

        if (result.success) {
          const user = result.data;
          set({
            user: {
              id: user.id,
              email: user.email.toString(),
              fullName: user.fullName,
              avatarUrl: user.avatarUrl,
            },
            isAuthenticated: true,
            isLoading: false,
          });
          return true;
        }

        set({ error: result.error.message, isLoading: false });
        return false;
      },

      logout: async () => {
        set({ isLoading: true });
        const logoutUseCase = container.resolve<LogoutUseCase>('LogoutUseCase');
        await logoutUseCase.execute();
        set({ ...initialState, isHydrated: true });
      },

      clearError: () => set({ error: null }),
      setHydrated: () => set({ isHydrated: true }),

      forceLogout: () => {
        set({ ...initialState, isHydrated: true });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

// Listener para force-logout desde interceptors
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('auth:force-logout', () => {
    useAuthStore.getState().forceLogout();
  });
}
```

### 9.3 UI Store (toasts, modales, loading global)

```typescript
// src/presentation/stores/uiStore.ts

import { create } from 'zustand';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface UIState {
  toasts: Toast[];
  globalLoading: boolean;
  loadingMessage: string | null;
}

interface UIActions {
  showToast: (type: ToastType, message: string, duration?: number) => void;
  dismissToast: (id: string) => void;
  setGlobalLoading: (loading: boolean, message?: string) => void;
}

export const useUIStore = create<UIState & UIActions>((set, get) => ({
  toasts: [],
  globalLoading: false,
  loadingMessage: null,

  showToast: (type, message, duration = 3000) => {
    const id = Date.now().toString(36);
    const toast: Toast = { id, type, message, duration };

    set((state) => ({ toasts: [...state.toasts, toast] }));

    if (duration > 0) {
      setTimeout(() => get().dismissToast(id), duration);
    }
  },

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  setGlobalLoading: (loading, message) =>
    set({ globalLoading: loading, loadingMessage: message ?? null }),
}));
```

### 9.4 Store con Datos Paginados (patrón estándar)

```typescript
// src/presentation/stores/productStore.ts

import { create } from 'zustand';
import { container } from '../../di/container';
import { GetProductsUseCase } from '../../application/product/GetProductsUseCase';

interface ProductItem {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  category: string;
}

interface ProductState {
  items: ProductItem[];
  page: number;
  hasMore: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  searchQuery: string;
}

interface ProductActions {
  fetchProducts: (reset?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  setSearchQuery: (query: string) => void;
}

export const useProductStore = create<ProductState & ProductActions>((set, get) => ({
  items: [],
  page: 1,
  hasMore: true,
  isLoading: false,
  isRefreshing: false,
  error: null,
  searchQuery: '',

  fetchProducts: async (reset = false) => {
    const { isLoading, searchQuery } = get();
    if (isLoading) return;

    const page = reset ? 1 : get().page;
    set({ isLoading: true, error: null });

    const useCase = container.resolve<GetProductsUseCase>('GetProductsUseCase');
    const result = await useCase.execute({ search: searchQuery }, page);

    if (result.success) {
      set((state) => ({
        items: reset ? result.data.items : [...state.items, ...result.data.items],
        page: page + 1,
        hasMore: result.data.hasMore,
        isLoading: false,
      }));
    } else {
      set({ error: result.error.message, isLoading: false });
    }
  },

  loadMore: async () => {
    const { hasMore, isLoading } = get();
    if (!hasMore || isLoading) return;
    await get().fetchProducts();
  },

  refresh: async () => {
    set({ isRefreshing: true });
    await get().fetchProducts(true);
    set({ isRefreshing: false });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },
}));
```

### 9.5 Custom Hooks como Puente UI ↔ Store

```typescript
// src/presentation/hooks/useAuth.ts

import { useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { useRouter } from 'expo-router';

export function useAuth() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, error, login, logout, clearError } = useAuthStore();
  const showToast = useUIStore((s) => s.showToast);

  const handleLogin = useCallback(
    async (email: string, password: string) => {
      const success = await login(email, password);
      if (success) {
        showToast('success', '¡Bienvenido de vuelta!');
        router.replace('/(tabs)/home');
      }
    },
    [login, showToast, router],
  );

  const handleLogout = useCallback(async () => {
    await logout();
    showToast('info', 'Sesión cerrada');
    router.replace('/(auth)/login');
  }, [logout, showToast, router]);

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    login: handleLogin,
    logout: handleLogout,
    clearError,
  };
}
```

---

## 10. Inyección de Dependencias

### Contenedor Simple (sin librerías externas)

```typescript
// src/di/container.ts

type Factory<T> = () => T;

class DIContainer {
  private factories = new Map<string, Factory<unknown>>();
  private singletons = new Map<string, unknown>();

  register<T>(key: string, factory: Factory<T>, singleton = false): void {
    this.factories.set(key, factory);
    if (singleton) {
      this.singletons.delete(key); // Reset si se re-registra
    }
  }

  registerSingleton<T>(key: string, factory: Factory<T>): void {
    this.register(key, factory, true);
  }

  resolve<T>(key: string): T {
    // Singleton
    if (this.singletons.has(key)) {
      return this.singletons.get(key) as T;
    }

    const factory = this.factories.get(key);
    if (!factory) {
      throw new Error(`Dependencia no registrada: ${key}`);
    }

    const instance = factory() as T;

    // Verificar si fue registrado como singleton
    if (!this.singletons.has(key) && this.factories.has(key)) {
      this.singletons.set(key, instance);
    }

    return instance;
  }
}

export const container = new DIContainer();
```

### Bootstrap / Registro

```typescript
// src/di/bootstrap.ts

import { container } from './container';

// Infraestructura
import { AuthRepositoryImpl } from '../infrastructure/repositories/AuthRepositoryImpl';
import { UserRepositoryImpl } from '../infrastructure/repositories/UserRepositoryImpl';
import { ProductRepositoryImpl } from '../infrastructure/repositories/ProductRepositoryImpl';
import { SecureStorageServiceImpl } from '../infrastructure/services/SecureStorageServiceImpl';

// Casos de uso
import { LoginUseCase } from '../application/auth/LoginUseCase';
import { LogoutUseCase } from '../application/auth/LogoutUseCase';
import { GetProductsUseCase } from '../application/product/GetProductsUseCase';

export function bootstrapDependencies(): void {
  // Repositorios (singletons)
  container.registerSingleton('AuthRepository', () => new AuthRepositoryImpl());
  container.registerSingleton('UserRepository', () => new UserRepositoryImpl());
  container.registerSingleton('ProductRepository', () => new ProductRepositoryImpl());

  // Servicios (singletons)
  container.registerSingleton('StorageService', () => new SecureStorageServiceImpl());

  // Casos de uso (transient — nueva instancia cada vez)
  container.register('LoginUseCase', () =>
    new LoginUseCase(
      container.resolve('AuthRepository'),
      container.resolve('StorageService'),
    ),
  );

  container.register('LogoutUseCase', () =>
    new LogoutUseCase(
      container.resolve('AuthRepository'),
      container.resolve('StorageService'),
    ),
  );

  container.register('GetProductsUseCase', () =>
    new GetProductsUseCase(
      container.resolve('ProductRepository'),
    ),
  );
}
```

### Inicialización en Root Layout

```tsx
// src/app/_layout.tsx

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { bootstrapDependencies } from '../di/bootstrap';
import { useAuthStore } from '../presentation/stores/authStore';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    bootstrapDependencies();
    setIsReady(true);
  }, []);

  if (!isReady || !isHydrated) {
    return <SplashScreen />;  // O tu propio splash
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
```

---

## 11. Navegación con Expo Router

### Protección de Rutas

```tsx
// src/app/(tabs)/_layout.tsx

import { Redirect, Tabs } from 'expo-router';
import { useAuthStore } from '../../presentation/stores/authStore';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#9ca3af',
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

---

## 12. NativeWind / TailwindCSS

### Configuración Base

```javascript
// tailwind.config.js

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/presentation/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f0ff',
          100: '#e0e0ff',
          200: '#c2c2ff',
          300: '#9999ff',
          400: '#7a7aff',
          500: '#6366f1',  // Primary
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#f8fafc',
          dark: '#0f172a',
        },
      },
      fontFamily: {
        sans: ['Montserrat_400Regular'],
        'sans-medium': ['Montserrat_500Medium'],
        'sans-semibold': ['Montserrat_600SemiBold'],
        'sans-bold': ['Montserrat_700Bold'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
```

### Convenciones de Estilo

```tsx
// ✅ CORRECTO — Usar className con NativeWind
<View className="flex-1 bg-surface px-4 pt-safe">
  <Text className="text-2xl font-sans-bold text-gray-900 dark:text-white">
    Título
  </Text>
</View>

// ❌ INCORRECTO — No mezclar StyleSheet con NativeWind
<View style={styles.container} className="px-4">  {/* No mezclar */}
```

---

## 13. Manejo de Errores

### Estrategia Global con ErrorBoundary

```tsx
// src/presentation/components/shared/ErrorBoundary.tsx

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Enviar a Sentry/Crashlytics
    console.error('ErrorBoundary:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-xl font-sans-bold text-gray-900 mb-2">
              Algo salió mal
            </Text>
            <Text className="text-sm text-gray-500 text-center mb-6">
              {this.state.error?.message ?? 'Error inesperado'}
            </Text>
            <TouchableOpacity
              onPress={this.handleRetry}
              className="bg-brand-500 px-6 py-3 rounded-xl"
            >
              <Text className="text-white font-sans-semibold">Reintentar</Text>
            </TouchableOpacity>
          </View>
        )
      );
    }

    return this.props.children;
  }
}
```

### Patrón AsyncState para UI

```typescript
// src/shared/types/AsyncState.ts

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

export const AsyncState = {
  idle: <T>(): AsyncState<T> => ({ status: 'idle' }),
  loading: <T>(): AsyncState<T> => ({ status: 'loading' }),
  success: <T>(data: T): AsyncState<T> => ({ status: 'success', data }),
  error: <T>(error: string): AsyncState<T> => ({ status: 'error', error }),
};
```

---

## 14. Testing

### 14.1 Estructura de Tests

```
__tests__/
├── core/                    # Tests de entidades y value objects
│   ├── entities/
│   │   └── User.test.ts
│   └── value-objects/
│       ├── Email.test.ts
│       └── Money.test.ts
├── application/             # Tests de casos de uso (mocks de ports)
│   └── auth/
│       └── LoginUseCase.test.ts
├── infrastructure/          # Tests de integración (API, storage)
│   └── repositories/
│       └── AuthRepositoryImpl.test.ts
└── presentation/            # Tests de componentes y stores
    ├── stores/
    │   └── authStore.test.ts
    └── hooks/
        └── useAuth.test.ts
```

### 14.2 Ejemplo: Test de Caso de Uso

```typescript
// __tests__/application/auth/LoginUseCase.test.ts

import { LoginUseCase } from '../../../src/application/auth/LoginUseCase';
import { IAuthRepository } from '../../../src/core/ports/repositories/IAuthRepository';
import { IStorageService } from '../../../src/core/ports/services/IStorageService';
import { User } from '../../../src/core/entities/User';
import { Email } from '../../../src/core/value-objects/Email';

describe('LoginUseCase', () => {
  let useCase: LoginUseCase;
  let mockAuthRepo: jest.Mocked<IAuthRepository>;
  let mockStorage: jest.Mocked<IStorageService>;

  const fakeUser = User.create({
    id: '1',
    email: Email.create('test@example.com'),
    fullName: 'Test User',
    avatarUrl: null,
    isVerified: true,
    createdAt: new Date(),
  });

  beforeEach(() => {
    mockAuthRepo = {
      login: jest.fn(),
      register: jest.fn(),
      refreshToken: jest.fn(),
      logout: jest.fn(),
    };

    mockStorage = {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn(),
    };

    useCase = new LoginUseCase(mockAuthRepo, mockStorage);
  });

  it('debería retornar el usuario al hacer login exitoso', async () => {
    mockAuthRepo.login.mockResolvedValue({
      user: fakeUser,
      tokens: { accessToken: 'token', refreshToken: 'refresh' },
    });

    const result = await useCase.execute({
      email: 'test@example.com',
      password: '123456',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('1');
    }
    expect(mockStorage.set).toHaveBeenCalledWith('access_token', 'token');
    expect(mockStorage.set).toHaveBeenCalledWith('refresh_token', 'refresh');
  });

  it('debería retornar error con credenciales inválidas', async () => {
    mockAuthRepo.login.mockRejectedValue(new Error('Invalid'));

    const result = await useCase.execute({
      email: 'bad@example.com',
      password: 'wrong',
    });

    expect(result.success).toBe(false);
  });
});
```

### 14.3 Ejemplo: Test de Value Object

```typescript
// __tests__/core/value-objects/Money.test.ts

import { Money } from '../../../src/core/value-objects/Money';

describe('Money', () => {
  it('debería crear con monto válido', () => {
    const money = Money.create(10.5, 'PEN');
    expect(money.amount).toBe(10.5);
    expect(money.currency).toBe('PEN');
  });

  it('debería lanzar error con monto negativo', () => {
    expect(() => Money.create(-5)).toThrow('no puede ser negativo');
  });

  it('debería sumar dos montos de la misma moneda', () => {
    const a = Money.create(10, 'PEN');
    const b = Money.create(5.5, 'PEN');
    const result = a.add(b);
    expect(result.amount).toBe(15.5);
  });

  it('debería formatearse correctamente', () => {
    const money = Money.create(1500, 'PEN');
    expect(money.format()).toMatch(/1[.,]500/);
  });
});
```

---

## 15. Seguridad

### Checklist de Seguridad

| Área | Implementación |
|------|---------------|
| **Tokens** | Guardar en `expo-secure-store`, nunca en AsyncStorage |
| **Refresh automático** | Interceptor de Axios con cola de espera |
| **Certificados** | SSL pinning con `expo-cert-transparency` en producción |
| **Variables de entorno** | Nunca hardcodear. Usar `app.config.ts` + `.env` |
| **Datos sensibles** | No guardar contraseñas localmente. No loggear tokens |
| **Deep links** | Validar esquemas y parámetros antes de navegar |
| **Inputs** | Sanitizar en el backend. Validar formato en frontend |
| **Biometría** | Usar `expo-local-authentication` para acciones sensibles |
| **Ofuscación** | Habilitar ProGuard (Android) y bitcode (iOS) en builds de producción |

### Secure Storage

```typescript
// src/infrastructure/storage/secureStorage.ts

import * as SecureStore from 'expo-secure-store';
import { IStorageService } from '../../core/ports/services/IStorageService';

export class SecureStorageServiceImpl implements IStorageService {
  async get<T>(key: string): Promise<T | null> {
    const value = await SecureStore.getItemAsync(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await SecureStore.setItemAsync(key, serialized);
  }

  async remove(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  }

  async clear(): Promise<void> {
    // SecureStore no tiene clear nativo, eliminar keys conocidas
    const keys = ['access_token', 'refresh_token', 'user_preferences'];
    await Promise.all(keys.map((k) => SecureStore.deleteItemAsync(k)));
  }
}
```

---

## 16. Performance

### 16.1 Optimización de Listas

```tsx
// Usar FlashList en lugar de FlatList para listas largas
import { FlashList } from '@shopify/flash-list';

<FlashList
  data={products}
  renderItem={({ item }) => <ProductCard product={item} />}
  estimatedItemSize={120}
  keyExtractor={(item) => item.id}
  onEndReached={loadMore}
  onEndReachedThreshold={0.5}
/>
```

### 16.2 Memoización Estratégica

```typescript
// Selectores de Zustand — solo suscribirse a lo necesario
// ✅ CORRECTO
const userName = useAuthStore((s) => s.user?.fullName);

// ❌ INCORRECTO — re-render en CUALQUIER cambio del store
const store = useAuthStore();
```

### 16.3 Optimización de Imágenes

```tsx
// Usar expo-image (con cache automático) en lugar de Image de RN
import { Image } from 'expo-image';

<Image
  source={{ uri: product.imageUrl }}
  placeholder={blurhash}
  contentFit="cover"
  transition={200}
  className="w-full h-48 rounded-xl"
/>
```

### 16.4 Checklist de Performance

- Usar `React.memo()` en componentes de lista que reciben props estables.
- Evitar funciones anónimas en `onPress` dentro de listas.
- Usar `useCallback` solo en handlers que se pasan a componentes memoizados.
- MMKV para persistencia síncrona (más rápido que AsyncStorage).
- Lazy loading de screens con `React.lazy` o dynamic imports en Expo Router.
- Reducir el tamaño de imágenes antes de subir (usar `expo-image-manipulator`).
- Habilitar Hermes (habilitado por defecto en Expo SDK 49+).

---

## 17. CI/CD y Calidad de Código

### ESLint + Prettier

```json
// .eslintrc.json (configuración recomendada)
{
  "extends": [
    "expo",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/explicit-function-return-type": "off",
    "import/order": ["error", {
      "groups": ["builtin", "external", "internal", "parent", "sibling"],
      "newlines-between": "always"
    }]
  }
}
```

### Git Hooks con Husky + lint-staged

```json
// package.json (parcial)
{
  "scripts": {
    "lint": "eslint src/ --ext .ts,.tsx",
    "format": "prettier --write 'src/**/*.{ts,tsx}'",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "type-check": "tsc --noEmit"
  },
  "lint-staged": {
    "src/**/*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

### Estructura de CI (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm run test:coverage
```

---

## 18. Convenciones y Reglas del Proyecto

### Nomenclatura

| Elemento | Convención | Ejemplo |
|----------|-----------|---------|
| Archivos componente | PascalCase | `ProductCard.tsx` |
| Archivos hook | camelCase con `use` | `useAuth.ts` |
| Archivos store | camelCase con `Store` | `authStore.ts` |
| Archivos caso de uso | PascalCase con `UseCase` | `LoginUseCase.ts` |
| Archivos entidad | PascalCase | `User.ts` |
| Archivos port/interface | PascalCase con `I` | `IAuthRepository.ts` |
| Archivos mapper | PascalCase con `Mapper` | `UserMapper.ts` |
| Archivos DTO | PascalCase con `DTO` | `UserDTO.ts` |
| Constantes | SCREAMING_SNAKE | `API_BASE_URL` |
| Variables de entorno | SCREAMING_SNAKE | `GOOGLE_MAPS_API_KEY` |

### Reglas de Importación

```typescript
// Orden estricto de imports:
// 1. Dependencias externas (react, expo, librerías)
// 2. Core / Dominio
// 3. Aplicación
// 4. Infraestructura
// 5. Presentación
// 6. Shared / Utils
// 7. Types (si aplica)

import { useState, useCallback } from 'react';           // 1
import { View, Text } from 'react-native';                // 1

import { User } from '@/core/entities/User';               // 2
import { LoginUseCase } from '@/application/auth/LoginUseCase'; // 3
import { apiClient } from '@/infrastructure/http/axiosClient';  // 4
import { useAuthStore } from '@/presentation/stores/authStore'; // 5
import { formatDate } from '@/shared/utils/formatDate';    // 6
```

### Alias de Paths (tsconfig)

```json
// tsconfig.json (parcial)
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@core/*": ["src/core/*"],
      "@app/*": ["src/application/*"],
      "@infra/*": ["src/infrastructure/*"],
      "@ui/*": ["src/presentation/*"],
      "@shared/*": ["src/shared/*"]
    }
  }
}
```

### Reglas de Oro

1. **Nunca importar infraestructura desde el dominio.** La dirección es inversa.
2. **Las screens no contienen lógica de negocio.** Solo conectan hooks/stores con componentes.
3. **Los stores de Zustand llaman a casos de uso**, no directamente a repositorios.
4. **Todo DTO se transforma a entidad de dominio** antes de llegar a la UI vía mappers.
5. **Cada puerto tiene exactamente un adaptador** por entorno (prod, test, mock).
6. **Los tests del dominio no necesitan mocks** — son funciones puras.
7. **Nunca hacer `catch` silencioso.** Siempre transformar o propagar el error.
8. **Preferir composición sobre herencia.** Hooks > HOCs > Herencia.

---

## Dependencias Clave

| Paquete | Propósito |
|---------|-----------|
| `expo` ~52 | Framework base |
| `expo-router` ~4 | File-based routing |
| `nativewind` ^4 | TailwindCSS para RN |
| `zustand` ^5 | Estado global |
| `axios` ^1.7 | HTTP client |
| `expo-secure-store` | Storage de tokens |
| `react-native-mmkv` | Storage rápido (persistencia Zustand) |
| `@shopify/flash-list` | Listas performantes |
| `expo-image` | Imágenes con cache |
| `expo-location` | Geolocalización |
| `react-hook-form` + `zod` | Formularios + validación |
| `jest` + `@testing-library/react-native` | Testing |

---

> **Última actualización**: Marzo 2026
> **Autor**: Genaro — Fullstack Developer
