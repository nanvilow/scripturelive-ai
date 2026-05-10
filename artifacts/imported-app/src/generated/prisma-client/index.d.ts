
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model Song
 * 
 */
export type Song = $Result.DefaultSelection<Prisma.$SongPayload>
/**
 * Model SermonNote
 * 
 */
export type SermonNote = $Result.DefaultSelection<Prisma.$SermonNotePayload>
/**
 * Model Presentation
 * 
 */
export type Presentation = $Result.DefaultSelection<Prisma.$PresentationPayload>
/**
 * Model BibleVerseCache
 * 
 */
export type BibleVerseCache = $Result.DefaultSelection<Prisma.$BibleVerseCachePayload>
/**
 * Model BibleTranslationDownload
 * 
 */
export type BibleTranslationDownload = $Result.DefaultSelection<Prisma.$BibleTranslationDownloadPayload>
/**
 * Model BibleChapterCache
 * 
 */
export type BibleChapterCache = $Result.DefaultSelection<Prisma.$BibleChapterCachePayload>

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Songs
 * const songs = await prisma.song.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Songs
   * const songs = await prisma.song.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.song`: Exposes CRUD operations for the **Song** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Songs
    * const songs = await prisma.song.findMany()
    * ```
    */
  get song(): Prisma.SongDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.sermonNote`: Exposes CRUD operations for the **SermonNote** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SermonNotes
    * const sermonNotes = await prisma.sermonNote.findMany()
    * ```
    */
  get sermonNote(): Prisma.SermonNoteDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.presentation`: Exposes CRUD operations for the **Presentation** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Presentations
    * const presentations = await prisma.presentation.findMany()
    * ```
    */
  get presentation(): Prisma.PresentationDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.bibleVerseCache`: Exposes CRUD operations for the **BibleVerseCache** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more BibleVerseCaches
    * const bibleVerseCaches = await prisma.bibleVerseCache.findMany()
    * ```
    */
  get bibleVerseCache(): Prisma.BibleVerseCacheDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.bibleTranslationDownload`: Exposes CRUD operations for the **BibleTranslationDownload** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more BibleTranslationDownloads
    * const bibleTranslationDownloads = await prisma.bibleTranslationDownload.findMany()
    * ```
    */
  get bibleTranslationDownload(): Prisma.BibleTranslationDownloadDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.bibleChapterCache`: Exposes CRUD operations for the **BibleChapterCache** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more BibleChapterCaches
    * const bibleChapterCaches = await prisma.bibleChapterCache.findMany()
    * ```
    */
  get bibleChapterCache(): Prisma.BibleChapterCacheDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.19.3
   * Query Engine version: c2990dca591cba766e3b7ef5d9e8a84796e47ab7
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    Song: 'Song',
    SermonNote: 'SermonNote',
    Presentation: 'Presentation',
    BibleVerseCache: 'BibleVerseCache',
    BibleTranslationDownload: 'BibleTranslationDownload',
    BibleChapterCache: 'BibleChapterCache'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "song" | "sermonNote" | "presentation" | "bibleVerseCache" | "bibleTranslationDownload" | "bibleChapterCache"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      Song: {
        payload: Prisma.$SongPayload<ExtArgs>
        fields: Prisma.SongFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SongFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SongPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SongFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SongPayload>
          }
          findFirst: {
            args: Prisma.SongFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SongPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SongFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SongPayload>
          }
          findMany: {
            args: Prisma.SongFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SongPayload>[]
          }
          create: {
            args: Prisma.SongCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SongPayload>
          }
          createMany: {
            args: Prisma.SongCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SongCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SongPayload>[]
          }
          delete: {
            args: Prisma.SongDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SongPayload>
          }
          update: {
            args: Prisma.SongUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SongPayload>
          }
          deleteMany: {
            args: Prisma.SongDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SongUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SongUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SongPayload>[]
          }
          upsert: {
            args: Prisma.SongUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SongPayload>
          }
          aggregate: {
            args: Prisma.SongAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSong>
          }
          groupBy: {
            args: Prisma.SongGroupByArgs<ExtArgs>
            result: $Utils.Optional<SongGroupByOutputType>[]
          }
          count: {
            args: Prisma.SongCountArgs<ExtArgs>
            result: $Utils.Optional<SongCountAggregateOutputType> | number
          }
        }
      }
      SermonNote: {
        payload: Prisma.$SermonNotePayload<ExtArgs>
        fields: Prisma.SermonNoteFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SermonNoteFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SermonNotePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SermonNoteFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SermonNotePayload>
          }
          findFirst: {
            args: Prisma.SermonNoteFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SermonNotePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SermonNoteFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SermonNotePayload>
          }
          findMany: {
            args: Prisma.SermonNoteFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SermonNotePayload>[]
          }
          create: {
            args: Prisma.SermonNoteCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SermonNotePayload>
          }
          createMany: {
            args: Prisma.SermonNoteCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SermonNoteCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SermonNotePayload>[]
          }
          delete: {
            args: Prisma.SermonNoteDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SermonNotePayload>
          }
          update: {
            args: Prisma.SermonNoteUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SermonNotePayload>
          }
          deleteMany: {
            args: Prisma.SermonNoteDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SermonNoteUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SermonNoteUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SermonNotePayload>[]
          }
          upsert: {
            args: Prisma.SermonNoteUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SermonNotePayload>
          }
          aggregate: {
            args: Prisma.SermonNoteAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSermonNote>
          }
          groupBy: {
            args: Prisma.SermonNoteGroupByArgs<ExtArgs>
            result: $Utils.Optional<SermonNoteGroupByOutputType>[]
          }
          count: {
            args: Prisma.SermonNoteCountArgs<ExtArgs>
            result: $Utils.Optional<SermonNoteCountAggregateOutputType> | number
          }
        }
      }
      Presentation: {
        payload: Prisma.$PresentationPayload<ExtArgs>
        fields: Prisma.PresentationFieldRefs
        operations: {
          findUnique: {
            args: Prisma.PresentationFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PresentationPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.PresentationFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PresentationPayload>
          }
          findFirst: {
            args: Prisma.PresentationFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PresentationPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.PresentationFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PresentationPayload>
          }
          findMany: {
            args: Prisma.PresentationFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PresentationPayload>[]
          }
          create: {
            args: Prisma.PresentationCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PresentationPayload>
          }
          createMany: {
            args: Prisma.PresentationCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.PresentationCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PresentationPayload>[]
          }
          delete: {
            args: Prisma.PresentationDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PresentationPayload>
          }
          update: {
            args: Prisma.PresentationUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PresentationPayload>
          }
          deleteMany: {
            args: Prisma.PresentationDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.PresentationUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.PresentationUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PresentationPayload>[]
          }
          upsert: {
            args: Prisma.PresentationUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PresentationPayload>
          }
          aggregate: {
            args: Prisma.PresentationAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregatePresentation>
          }
          groupBy: {
            args: Prisma.PresentationGroupByArgs<ExtArgs>
            result: $Utils.Optional<PresentationGroupByOutputType>[]
          }
          count: {
            args: Prisma.PresentationCountArgs<ExtArgs>
            result: $Utils.Optional<PresentationCountAggregateOutputType> | number
          }
        }
      }
      BibleVerseCache: {
        payload: Prisma.$BibleVerseCachePayload<ExtArgs>
        fields: Prisma.BibleVerseCacheFieldRefs
        operations: {
          findUnique: {
            args: Prisma.BibleVerseCacheFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleVerseCachePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.BibleVerseCacheFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleVerseCachePayload>
          }
          findFirst: {
            args: Prisma.BibleVerseCacheFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleVerseCachePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.BibleVerseCacheFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleVerseCachePayload>
          }
          findMany: {
            args: Prisma.BibleVerseCacheFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleVerseCachePayload>[]
          }
          create: {
            args: Prisma.BibleVerseCacheCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleVerseCachePayload>
          }
          createMany: {
            args: Prisma.BibleVerseCacheCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.BibleVerseCacheCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleVerseCachePayload>[]
          }
          delete: {
            args: Prisma.BibleVerseCacheDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleVerseCachePayload>
          }
          update: {
            args: Prisma.BibleVerseCacheUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleVerseCachePayload>
          }
          deleteMany: {
            args: Prisma.BibleVerseCacheDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.BibleVerseCacheUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.BibleVerseCacheUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleVerseCachePayload>[]
          }
          upsert: {
            args: Prisma.BibleVerseCacheUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleVerseCachePayload>
          }
          aggregate: {
            args: Prisma.BibleVerseCacheAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateBibleVerseCache>
          }
          groupBy: {
            args: Prisma.BibleVerseCacheGroupByArgs<ExtArgs>
            result: $Utils.Optional<BibleVerseCacheGroupByOutputType>[]
          }
          count: {
            args: Prisma.BibleVerseCacheCountArgs<ExtArgs>
            result: $Utils.Optional<BibleVerseCacheCountAggregateOutputType> | number
          }
        }
      }
      BibleTranslationDownload: {
        payload: Prisma.$BibleTranslationDownloadPayload<ExtArgs>
        fields: Prisma.BibleTranslationDownloadFieldRefs
        operations: {
          findUnique: {
            args: Prisma.BibleTranslationDownloadFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleTranslationDownloadPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.BibleTranslationDownloadFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleTranslationDownloadPayload>
          }
          findFirst: {
            args: Prisma.BibleTranslationDownloadFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleTranslationDownloadPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.BibleTranslationDownloadFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleTranslationDownloadPayload>
          }
          findMany: {
            args: Prisma.BibleTranslationDownloadFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleTranslationDownloadPayload>[]
          }
          create: {
            args: Prisma.BibleTranslationDownloadCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleTranslationDownloadPayload>
          }
          createMany: {
            args: Prisma.BibleTranslationDownloadCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.BibleTranslationDownloadCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleTranslationDownloadPayload>[]
          }
          delete: {
            args: Prisma.BibleTranslationDownloadDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleTranslationDownloadPayload>
          }
          update: {
            args: Prisma.BibleTranslationDownloadUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleTranslationDownloadPayload>
          }
          deleteMany: {
            args: Prisma.BibleTranslationDownloadDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.BibleTranslationDownloadUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.BibleTranslationDownloadUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleTranslationDownloadPayload>[]
          }
          upsert: {
            args: Prisma.BibleTranslationDownloadUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleTranslationDownloadPayload>
          }
          aggregate: {
            args: Prisma.BibleTranslationDownloadAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateBibleTranslationDownload>
          }
          groupBy: {
            args: Prisma.BibleTranslationDownloadGroupByArgs<ExtArgs>
            result: $Utils.Optional<BibleTranslationDownloadGroupByOutputType>[]
          }
          count: {
            args: Prisma.BibleTranslationDownloadCountArgs<ExtArgs>
            result: $Utils.Optional<BibleTranslationDownloadCountAggregateOutputType> | number
          }
        }
      }
      BibleChapterCache: {
        payload: Prisma.$BibleChapterCachePayload<ExtArgs>
        fields: Prisma.BibleChapterCacheFieldRefs
        operations: {
          findUnique: {
            args: Prisma.BibleChapterCacheFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleChapterCachePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.BibleChapterCacheFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleChapterCachePayload>
          }
          findFirst: {
            args: Prisma.BibleChapterCacheFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleChapterCachePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.BibleChapterCacheFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleChapterCachePayload>
          }
          findMany: {
            args: Prisma.BibleChapterCacheFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleChapterCachePayload>[]
          }
          create: {
            args: Prisma.BibleChapterCacheCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleChapterCachePayload>
          }
          createMany: {
            args: Prisma.BibleChapterCacheCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.BibleChapterCacheCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleChapterCachePayload>[]
          }
          delete: {
            args: Prisma.BibleChapterCacheDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleChapterCachePayload>
          }
          update: {
            args: Prisma.BibleChapterCacheUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleChapterCachePayload>
          }
          deleteMany: {
            args: Prisma.BibleChapterCacheDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.BibleChapterCacheUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.BibleChapterCacheUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleChapterCachePayload>[]
          }
          upsert: {
            args: Prisma.BibleChapterCacheUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BibleChapterCachePayload>
          }
          aggregate: {
            args: Prisma.BibleChapterCacheAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateBibleChapterCache>
          }
          groupBy: {
            args: Prisma.BibleChapterCacheGroupByArgs<ExtArgs>
            result: $Utils.Optional<BibleChapterCacheGroupByOutputType>[]
          }
          count: {
            args: Prisma.BibleChapterCacheCountArgs<ExtArgs>
            result: $Utils.Optional<BibleChapterCacheCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory | null
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    song?: SongOmit
    sermonNote?: SermonNoteOmit
    presentation?: PresentationOmit
    bibleVerseCache?: BibleVerseCacheOmit
    bibleTranslationDownload?: BibleTranslationDownloadOmit
    bibleChapterCache?: BibleChapterCacheOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type SongCountOutputType
   */

  export type SongCountOutputType = {
    presentations: number
  }

  export type SongCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    presentations?: boolean | SongCountOutputTypeCountPresentationsArgs
  }

  // Custom InputTypes
  /**
   * SongCountOutputType without action
   */
  export type SongCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SongCountOutputType
     */
    select?: SongCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * SongCountOutputType without action
   */
  export type SongCountOutputTypeCountPresentationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PresentationWhereInput
  }


  /**
   * Count Type SermonNoteCountOutputType
   */

  export type SermonNoteCountOutputType = {
    presentations: number
  }

  export type SermonNoteCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    presentations?: boolean | SermonNoteCountOutputTypeCountPresentationsArgs
  }

  // Custom InputTypes
  /**
   * SermonNoteCountOutputType without action
   */
  export type SermonNoteCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SermonNoteCountOutputType
     */
    select?: SermonNoteCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * SermonNoteCountOutputType without action
   */
  export type SermonNoteCountOutputTypeCountPresentationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PresentationWhereInput
  }


  /**
   * Models
   */

  /**
   * Model Song
   */

  export type AggregateSong = {
    _count: SongCountAggregateOutputType | null
    _avg: SongAvgAggregateOutputType | null
    _sum: SongSumAggregateOutputType | null
    _min: SongMinAggregateOutputType | null
    _max: SongMaxAggregateOutputType | null
  }

  export type SongAvgAggregateOutputType = {
    tempo: number | null
  }

  export type SongSumAggregateOutputType = {
    tempo: number | null
  }

  export type SongMinAggregateOutputType = {
    id: string | null
    title: string | null
    artist: string | null
    lyrics: string | null
    structured: string | null
    category: string | null
    tags: string | null
    keySignature: string | null
    tempo: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SongMaxAggregateOutputType = {
    id: string | null
    title: string | null
    artist: string | null
    lyrics: string | null
    structured: string | null
    category: string | null
    tags: string | null
    keySignature: string | null
    tempo: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SongCountAggregateOutputType = {
    id: number
    title: number
    artist: number
    lyrics: number
    structured: number
    category: number
    tags: number
    keySignature: number
    tempo: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type SongAvgAggregateInputType = {
    tempo?: true
  }

  export type SongSumAggregateInputType = {
    tempo?: true
  }

  export type SongMinAggregateInputType = {
    id?: true
    title?: true
    artist?: true
    lyrics?: true
    structured?: true
    category?: true
    tags?: true
    keySignature?: true
    tempo?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SongMaxAggregateInputType = {
    id?: true
    title?: true
    artist?: true
    lyrics?: true
    structured?: true
    category?: true
    tags?: true
    keySignature?: true
    tempo?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SongCountAggregateInputType = {
    id?: true
    title?: true
    artist?: true
    lyrics?: true
    structured?: true
    category?: true
    tags?: true
    keySignature?: true
    tempo?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type SongAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Song to aggregate.
     */
    where?: SongWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Songs to fetch.
     */
    orderBy?: SongOrderByWithRelationInput | SongOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SongWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Songs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Songs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Songs
    **/
    _count?: true | SongCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SongAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SongSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SongMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SongMaxAggregateInputType
  }

  export type GetSongAggregateType<T extends SongAggregateArgs> = {
        [P in keyof T & keyof AggregateSong]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSong[P]>
      : GetScalarType<T[P], AggregateSong[P]>
  }




  export type SongGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SongWhereInput
    orderBy?: SongOrderByWithAggregationInput | SongOrderByWithAggregationInput[]
    by: SongScalarFieldEnum[] | SongScalarFieldEnum
    having?: SongScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SongCountAggregateInputType | true
    _avg?: SongAvgAggregateInputType
    _sum?: SongSumAggregateInputType
    _min?: SongMinAggregateInputType
    _max?: SongMaxAggregateInputType
  }

  export type SongGroupByOutputType = {
    id: string
    title: string
    artist: string | null
    lyrics: string
    structured: string | null
    category: string
    tags: string | null
    keySignature: string | null
    tempo: number | null
    createdAt: Date
    updatedAt: Date
    _count: SongCountAggregateOutputType | null
    _avg: SongAvgAggregateOutputType | null
    _sum: SongSumAggregateOutputType | null
    _min: SongMinAggregateOutputType | null
    _max: SongMaxAggregateOutputType | null
  }

  type GetSongGroupByPayload<T extends SongGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SongGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SongGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SongGroupByOutputType[P]>
            : GetScalarType<T[P], SongGroupByOutputType[P]>
        }
      >
    >


  export type SongSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    title?: boolean
    artist?: boolean
    lyrics?: boolean
    structured?: boolean
    category?: boolean
    tags?: boolean
    keySignature?: boolean
    tempo?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    presentations?: boolean | Song$presentationsArgs<ExtArgs>
    _count?: boolean | SongCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["song"]>

  export type SongSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    title?: boolean
    artist?: boolean
    lyrics?: boolean
    structured?: boolean
    category?: boolean
    tags?: boolean
    keySignature?: boolean
    tempo?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["song"]>

  export type SongSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    title?: boolean
    artist?: boolean
    lyrics?: boolean
    structured?: boolean
    category?: boolean
    tags?: boolean
    keySignature?: boolean
    tempo?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["song"]>

  export type SongSelectScalar = {
    id?: boolean
    title?: boolean
    artist?: boolean
    lyrics?: boolean
    structured?: boolean
    category?: boolean
    tags?: boolean
    keySignature?: boolean
    tempo?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type SongOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "title" | "artist" | "lyrics" | "structured" | "category" | "tags" | "keySignature" | "tempo" | "createdAt" | "updatedAt", ExtArgs["result"]["song"]>
  export type SongInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    presentations?: boolean | Song$presentationsArgs<ExtArgs>
    _count?: boolean | SongCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type SongIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type SongIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $SongPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Song"
    objects: {
      presentations: Prisma.$PresentationPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      title: string
      artist: string | null
      lyrics: string
      structured: string | null
      category: string
      tags: string | null
      keySignature: string | null
      tempo: number | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["song"]>
    composites: {}
  }

  type SongGetPayload<S extends boolean | null | undefined | SongDefaultArgs> = $Result.GetResult<Prisma.$SongPayload, S>

  type SongCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SongFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SongCountAggregateInputType | true
    }

  export interface SongDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Song'], meta: { name: 'Song' } }
    /**
     * Find zero or one Song that matches the filter.
     * @param {SongFindUniqueArgs} args - Arguments to find a Song
     * @example
     * // Get one Song
     * const song = await prisma.song.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SongFindUniqueArgs>(args: SelectSubset<T, SongFindUniqueArgs<ExtArgs>>): Prisma__SongClient<$Result.GetResult<Prisma.$SongPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Song that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SongFindUniqueOrThrowArgs} args - Arguments to find a Song
     * @example
     * // Get one Song
     * const song = await prisma.song.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SongFindUniqueOrThrowArgs>(args: SelectSubset<T, SongFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SongClient<$Result.GetResult<Prisma.$SongPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Song that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SongFindFirstArgs} args - Arguments to find a Song
     * @example
     * // Get one Song
     * const song = await prisma.song.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SongFindFirstArgs>(args?: SelectSubset<T, SongFindFirstArgs<ExtArgs>>): Prisma__SongClient<$Result.GetResult<Prisma.$SongPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Song that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SongFindFirstOrThrowArgs} args - Arguments to find a Song
     * @example
     * // Get one Song
     * const song = await prisma.song.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SongFindFirstOrThrowArgs>(args?: SelectSubset<T, SongFindFirstOrThrowArgs<ExtArgs>>): Prisma__SongClient<$Result.GetResult<Prisma.$SongPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Songs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SongFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Songs
     * const songs = await prisma.song.findMany()
     * 
     * // Get first 10 Songs
     * const songs = await prisma.song.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const songWithIdOnly = await prisma.song.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SongFindManyArgs>(args?: SelectSubset<T, SongFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SongPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Song.
     * @param {SongCreateArgs} args - Arguments to create a Song.
     * @example
     * // Create one Song
     * const Song = await prisma.song.create({
     *   data: {
     *     // ... data to create a Song
     *   }
     * })
     * 
     */
    create<T extends SongCreateArgs>(args: SelectSubset<T, SongCreateArgs<ExtArgs>>): Prisma__SongClient<$Result.GetResult<Prisma.$SongPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Songs.
     * @param {SongCreateManyArgs} args - Arguments to create many Songs.
     * @example
     * // Create many Songs
     * const song = await prisma.song.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SongCreateManyArgs>(args?: SelectSubset<T, SongCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Songs and returns the data saved in the database.
     * @param {SongCreateManyAndReturnArgs} args - Arguments to create many Songs.
     * @example
     * // Create many Songs
     * const song = await prisma.song.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Songs and only return the `id`
     * const songWithIdOnly = await prisma.song.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SongCreateManyAndReturnArgs>(args?: SelectSubset<T, SongCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SongPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Song.
     * @param {SongDeleteArgs} args - Arguments to delete one Song.
     * @example
     * // Delete one Song
     * const Song = await prisma.song.delete({
     *   where: {
     *     // ... filter to delete one Song
     *   }
     * })
     * 
     */
    delete<T extends SongDeleteArgs>(args: SelectSubset<T, SongDeleteArgs<ExtArgs>>): Prisma__SongClient<$Result.GetResult<Prisma.$SongPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Song.
     * @param {SongUpdateArgs} args - Arguments to update one Song.
     * @example
     * // Update one Song
     * const song = await prisma.song.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SongUpdateArgs>(args: SelectSubset<T, SongUpdateArgs<ExtArgs>>): Prisma__SongClient<$Result.GetResult<Prisma.$SongPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Songs.
     * @param {SongDeleteManyArgs} args - Arguments to filter Songs to delete.
     * @example
     * // Delete a few Songs
     * const { count } = await prisma.song.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SongDeleteManyArgs>(args?: SelectSubset<T, SongDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Songs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SongUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Songs
     * const song = await prisma.song.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SongUpdateManyArgs>(args: SelectSubset<T, SongUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Songs and returns the data updated in the database.
     * @param {SongUpdateManyAndReturnArgs} args - Arguments to update many Songs.
     * @example
     * // Update many Songs
     * const song = await prisma.song.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Songs and only return the `id`
     * const songWithIdOnly = await prisma.song.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SongUpdateManyAndReturnArgs>(args: SelectSubset<T, SongUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SongPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Song.
     * @param {SongUpsertArgs} args - Arguments to update or create a Song.
     * @example
     * // Update or create a Song
     * const song = await prisma.song.upsert({
     *   create: {
     *     // ... data to create a Song
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Song we want to update
     *   }
     * })
     */
    upsert<T extends SongUpsertArgs>(args: SelectSubset<T, SongUpsertArgs<ExtArgs>>): Prisma__SongClient<$Result.GetResult<Prisma.$SongPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Songs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SongCountArgs} args - Arguments to filter Songs to count.
     * @example
     * // Count the number of Songs
     * const count = await prisma.song.count({
     *   where: {
     *     // ... the filter for the Songs we want to count
     *   }
     * })
    **/
    count<T extends SongCountArgs>(
      args?: Subset<T, SongCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SongCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Song.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SongAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SongAggregateArgs>(args: Subset<T, SongAggregateArgs>): Prisma.PrismaPromise<GetSongAggregateType<T>>

    /**
     * Group by Song.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SongGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SongGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SongGroupByArgs['orderBy'] }
        : { orderBy?: SongGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SongGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSongGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Song model
   */
  readonly fields: SongFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Song.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SongClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    presentations<T extends Song$presentationsArgs<ExtArgs> = {}>(args?: Subset<T, Song$presentationsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PresentationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Song model
   */
  interface SongFieldRefs {
    readonly id: FieldRef<"Song", 'String'>
    readonly title: FieldRef<"Song", 'String'>
    readonly artist: FieldRef<"Song", 'String'>
    readonly lyrics: FieldRef<"Song", 'String'>
    readonly structured: FieldRef<"Song", 'String'>
    readonly category: FieldRef<"Song", 'String'>
    readonly tags: FieldRef<"Song", 'String'>
    readonly keySignature: FieldRef<"Song", 'String'>
    readonly tempo: FieldRef<"Song", 'Int'>
    readonly createdAt: FieldRef<"Song", 'DateTime'>
    readonly updatedAt: FieldRef<"Song", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Song findUnique
   */
  export type SongFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Song
     */
    select?: SongSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Song
     */
    omit?: SongOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SongInclude<ExtArgs> | null
    /**
     * Filter, which Song to fetch.
     */
    where: SongWhereUniqueInput
  }

  /**
   * Song findUniqueOrThrow
   */
  export type SongFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Song
     */
    select?: SongSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Song
     */
    omit?: SongOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SongInclude<ExtArgs> | null
    /**
     * Filter, which Song to fetch.
     */
    where: SongWhereUniqueInput
  }

  /**
   * Song findFirst
   */
  export type SongFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Song
     */
    select?: SongSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Song
     */
    omit?: SongOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SongInclude<ExtArgs> | null
    /**
     * Filter, which Song to fetch.
     */
    where?: SongWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Songs to fetch.
     */
    orderBy?: SongOrderByWithRelationInput | SongOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Songs.
     */
    cursor?: SongWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Songs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Songs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Songs.
     */
    distinct?: SongScalarFieldEnum | SongScalarFieldEnum[]
  }

  /**
   * Song findFirstOrThrow
   */
  export type SongFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Song
     */
    select?: SongSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Song
     */
    omit?: SongOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SongInclude<ExtArgs> | null
    /**
     * Filter, which Song to fetch.
     */
    where?: SongWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Songs to fetch.
     */
    orderBy?: SongOrderByWithRelationInput | SongOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Songs.
     */
    cursor?: SongWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Songs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Songs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Songs.
     */
    distinct?: SongScalarFieldEnum | SongScalarFieldEnum[]
  }

  /**
   * Song findMany
   */
  export type SongFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Song
     */
    select?: SongSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Song
     */
    omit?: SongOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SongInclude<ExtArgs> | null
    /**
     * Filter, which Songs to fetch.
     */
    where?: SongWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Songs to fetch.
     */
    orderBy?: SongOrderByWithRelationInput | SongOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Songs.
     */
    cursor?: SongWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Songs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Songs.
     */
    skip?: number
    distinct?: SongScalarFieldEnum | SongScalarFieldEnum[]
  }

  /**
   * Song create
   */
  export type SongCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Song
     */
    select?: SongSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Song
     */
    omit?: SongOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SongInclude<ExtArgs> | null
    /**
     * The data needed to create a Song.
     */
    data: XOR<SongCreateInput, SongUncheckedCreateInput>
  }

  /**
   * Song createMany
   */
  export type SongCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Songs.
     */
    data: SongCreateManyInput | SongCreateManyInput[]
  }

  /**
   * Song createManyAndReturn
   */
  export type SongCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Song
     */
    select?: SongSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Song
     */
    omit?: SongOmit<ExtArgs> | null
    /**
     * The data used to create many Songs.
     */
    data: SongCreateManyInput | SongCreateManyInput[]
  }

  /**
   * Song update
   */
  export type SongUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Song
     */
    select?: SongSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Song
     */
    omit?: SongOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SongInclude<ExtArgs> | null
    /**
     * The data needed to update a Song.
     */
    data: XOR<SongUpdateInput, SongUncheckedUpdateInput>
    /**
     * Choose, which Song to update.
     */
    where: SongWhereUniqueInput
  }

  /**
   * Song updateMany
   */
  export type SongUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Songs.
     */
    data: XOR<SongUpdateManyMutationInput, SongUncheckedUpdateManyInput>
    /**
     * Filter which Songs to update
     */
    where?: SongWhereInput
    /**
     * Limit how many Songs to update.
     */
    limit?: number
  }

  /**
   * Song updateManyAndReturn
   */
  export type SongUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Song
     */
    select?: SongSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Song
     */
    omit?: SongOmit<ExtArgs> | null
    /**
     * The data used to update Songs.
     */
    data: XOR<SongUpdateManyMutationInput, SongUncheckedUpdateManyInput>
    /**
     * Filter which Songs to update
     */
    where?: SongWhereInput
    /**
     * Limit how many Songs to update.
     */
    limit?: number
  }

  /**
   * Song upsert
   */
  export type SongUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Song
     */
    select?: SongSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Song
     */
    omit?: SongOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SongInclude<ExtArgs> | null
    /**
     * The filter to search for the Song to update in case it exists.
     */
    where: SongWhereUniqueInput
    /**
     * In case the Song found by the `where` argument doesn't exist, create a new Song with this data.
     */
    create: XOR<SongCreateInput, SongUncheckedCreateInput>
    /**
     * In case the Song was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SongUpdateInput, SongUncheckedUpdateInput>
  }

  /**
   * Song delete
   */
  export type SongDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Song
     */
    select?: SongSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Song
     */
    omit?: SongOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SongInclude<ExtArgs> | null
    /**
     * Filter which Song to delete.
     */
    where: SongWhereUniqueInput
  }

  /**
   * Song deleteMany
   */
  export type SongDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Songs to delete
     */
    where?: SongWhereInput
    /**
     * Limit how many Songs to delete.
     */
    limit?: number
  }

  /**
   * Song.presentations
   */
  export type Song$presentationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Presentation
     */
    select?: PresentationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Presentation
     */
    omit?: PresentationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PresentationInclude<ExtArgs> | null
    where?: PresentationWhereInput
    orderBy?: PresentationOrderByWithRelationInput | PresentationOrderByWithRelationInput[]
    cursor?: PresentationWhereUniqueInput
    take?: number
    skip?: number
    distinct?: PresentationScalarFieldEnum | PresentationScalarFieldEnum[]
  }

  /**
   * Song without action
   */
  export type SongDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Song
     */
    select?: SongSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Song
     */
    omit?: SongOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SongInclude<ExtArgs> | null
  }


  /**
   * Model SermonNote
   */

  export type AggregateSermonNote = {
    _count: SermonNoteCountAggregateOutputType | null
    _min: SermonNoteMinAggregateOutputType | null
    _max: SermonNoteMaxAggregateOutputType | null
  }

  export type SermonNoteMinAggregateOutputType = {
    id: string | null
    title: string | null
    content: string | null
    outline: string | null
    bibleRefs: string | null
    date: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SermonNoteMaxAggregateOutputType = {
    id: string | null
    title: string | null
    content: string | null
    outline: string | null
    bibleRefs: string | null
    date: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SermonNoteCountAggregateOutputType = {
    id: number
    title: number
    content: number
    outline: number
    bibleRefs: number
    date: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type SermonNoteMinAggregateInputType = {
    id?: true
    title?: true
    content?: true
    outline?: true
    bibleRefs?: true
    date?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SermonNoteMaxAggregateInputType = {
    id?: true
    title?: true
    content?: true
    outline?: true
    bibleRefs?: true
    date?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SermonNoteCountAggregateInputType = {
    id?: true
    title?: true
    content?: true
    outline?: true
    bibleRefs?: true
    date?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type SermonNoteAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SermonNote to aggregate.
     */
    where?: SermonNoteWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SermonNotes to fetch.
     */
    orderBy?: SermonNoteOrderByWithRelationInput | SermonNoteOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SermonNoteWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SermonNotes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SermonNotes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SermonNotes
    **/
    _count?: true | SermonNoteCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SermonNoteMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SermonNoteMaxAggregateInputType
  }

  export type GetSermonNoteAggregateType<T extends SermonNoteAggregateArgs> = {
        [P in keyof T & keyof AggregateSermonNote]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSermonNote[P]>
      : GetScalarType<T[P], AggregateSermonNote[P]>
  }




  export type SermonNoteGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SermonNoteWhereInput
    orderBy?: SermonNoteOrderByWithAggregationInput | SermonNoteOrderByWithAggregationInput[]
    by: SermonNoteScalarFieldEnum[] | SermonNoteScalarFieldEnum
    having?: SermonNoteScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SermonNoteCountAggregateInputType | true
    _min?: SermonNoteMinAggregateInputType
    _max?: SermonNoteMaxAggregateInputType
  }

  export type SermonNoteGroupByOutputType = {
    id: string
    title: string
    content: string
    outline: string | null
    bibleRefs: string | null
    date: Date
    createdAt: Date
    updatedAt: Date
    _count: SermonNoteCountAggregateOutputType | null
    _min: SermonNoteMinAggregateOutputType | null
    _max: SermonNoteMaxAggregateOutputType | null
  }

  type GetSermonNoteGroupByPayload<T extends SermonNoteGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SermonNoteGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SermonNoteGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SermonNoteGroupByOutputType[P]>
            : GetScalarType<T[P], SermonNoteGroupByOutputType[P]>
        }
      >
    >


  export type SermonNoteSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    title?: boolean
    content?: boolean
    outline?: boolean
    bibleRefs?: boolean
    date?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    presentations?: boolean | SermonNote$presentationsArgs<ExtArgs>
    _count?: boolean | SermonNoteCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["sermonNote"]>

  export type SermonNoteSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    title?: boolean
    content?: boolean
    outline?: boolean
    bibleRefs?: boolean
    date?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["sermonNote"]>

  export type SermonNoteSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    title?: boolean
    content?: boolean
    outline?: boolean
    bibleRefs?: boolean
    date?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["sermonNote"]>

  export type SermonNoteSelectScalar = {
    id?: boolean
    title?: boolean
    content?: boolean
    outline?: boolean
    bibleRefs?: boolean
    date?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type SermonNoteOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "title" | "content" | "outline" | "bibleRefs" | "date" | "createdAt" | "updatedAt", ExtArgs["result"]["sermonNote"]>
  export type SermonNoteInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    presentations?: boolean | SermonNote$presentationsArgs<ExtArgs>
    _count?: boolean | SermonNoteCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type SermonNoteIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type SermonNoteIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $SermonNotePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SermonNote"
    objects: {
      presentations: Prisma.$PresentationPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      title: string
      content: string
      outline: string | null
      bibleRefs: string | null
      date: Date
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["sermonNote"]>
    composites: {}
  }

  type SermonNoteGetPayload<S extends boolean | null | undefined | SermonNoteDefaultArgs> = $Result.GetResult<Prisma.$SermonNotePayload, S>

  type SermonNoteCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SermonNoteFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SermonNoteCountAggregateInputType | true
    }

  export interface SermonNoteDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SermonNote'], meta: { name: 'SermonNote' } }
    /**
     * Find zero or one SermonNote that matches the filter.
     * @param {SermonNoteFindUniqueArgs} args - Arguments to find a SermonNote
     * @example
     * // Get one SermonNote
     * const sermonNote = await prisma.sermonNote.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SermonNoteFindUniqueArgs>(args: SelectSubset<T, SermonNoteFindUniqueArgs<ExtArgs>>): Prisma__SermonNoteClient<$Result.GetResult<Prisma.$SermonNotePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SermonNote that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SermonNoteFindUniqueOrThrowArgs} args - Arguments to find a SermonNote
     * @example
     * // Get one SermonNote
     * const sermonNote = await prisma.sermonNote.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SermonNoteFindUniqueOrThrowArgs>(args: SelectSubset<T, SermonNoteFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SermonNoteClient<$Result.GetResult<Prisma.$SermonNotePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SermonNote that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SermonNoteFindFirstArgs} args - Arguments to find a SermonNote
     * @example
     * // Get one SermonNote
     * const sermonNote = await prisma.sermonNote.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SermonNoteFindFirstArgs>(args?: SelectSubset<T, SermonNoteFindFirstArgs<ExtArgs>>): Prisma__SermonNoteClient<$Result.GetResult<Prisma.$SermonNotePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SermonNote that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SermonNoteFindFirstOrThrowArgs} args - Arguments to find a SermonNote
     * @example
     * // Get one SermonNote
     * const sermonNote = await prisma.sermonNote.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SermonNoteFindFirstOrThrowArgs>(args?: SelectSubset<T, SermonNoteFindFirstOrThrowArgs<ExtArgs>>): Prisma__SermonNoteClient<$Result.GetResult<Prisma.$SermonNotePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SermonNotes that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SermonNoteFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SermonNotes
     * const sermonNotes = await prisma.sermonNote.findMany()
     * 
     * // Get first 10 SermonNotes
     * const sermonNotes = await prisma.sermonNote.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const sermonNoteWithIdOnly = await prisma.sermonNote.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SermonNoteFindManyArgs>(args?: SelectSubset<T, SermonNoteFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SermonNotePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SermonNote.
     * @param {SermonNoteCreateArgs} args - Arguments to create a SermonNote.
     * @example
     * // Create one SermonNote
     * const SermonNote = await prisma.sermonNote.create({
     *   data: {
     *     // ... data to create a SermonNote
     *   }
     * })
     * 
     */
    create<T extends SermonNoteCreateArgs>(args: SelectSubset<T, SermonNoteCreateArgs<ExtArgs>>): Prisma__SermonNoteClient<$Result.GetResult<Prisma.$SermonNotePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SermonNotes.
     * @param {SermonNoteCreateManyArgs} args - Arguments to create many SermonNotes.
     * @example
     * // Create many SermonNotes
     * const sermonNote = await prisma.sermonNote.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SermonNoteCreateManyArgs>(args?: SelectSubset<T, SermonNoteCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SermonNotes and returns the data saved in the database.
     * @param {SermonNoteCreateManyAndReturnArgs} args - Arguments to create many SermonNotes.
     * @example
     * // Create many SermonNotes
     * const sermonNote = await prisma.sermonNote.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SermonNotes and only return the `id`
     * const sermonNoteWithIdOnly = await prisma.sermonNote.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SermonNoteCreateManyAndReturnArgs>(args?: SelectSubset<T, SermonNoteCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SermonNotePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SermonNote.
     * @param {SermonNoteDeleteArgs} args - Arguments to delete one SermonNote.
     * @example
     * // Delete one SermonNote
     * const SermonNote = await prisma.sermonNote.delete({
     *   where: {
     *     // ... filter to delete one SermonNote
     *   }
     * })
     * 
     */
    delete<T extends SermonNoteDeleteArgs>(args: SelectSubset<T, SermonNoteDeleteArgs<ExtArgs>>): Prisma__SermonNoteClient<$Result.GetResult<Prisma.$SermonNotePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SermonNote.
     * @param {SermonNoteUpdateArgs} args - Arguments to update one SermonNote.
     * @example
     * // Update one SermonNote
     * const sermonNote = await prisma.sermonNote.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SermonNoteUpdateArgs>(args: SelectSubset<T, SermonNoteUpdateArgs<ExtArgs>>): Prisma__SermonNoteClient<$Result.GetResult<Prisma.$SermonNotePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SermonNotes.
     * @param {SermonNoteDeleteManyArgs} args - Arguments to filter SermonNotes to delete.
     * @example
     * // Delete a few SermonNotes
     * const { count } = await prisma.sermonNote.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SermonNoteDeleteManyArgs>(args?: SelectSubset<T, SermonNoteDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SermonNotes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SermonNoteUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SermonNotes
     * const sermonNote = await prisma.sermonNote.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SermonNoteUpdateManyArgs>(args: SelectSubset<T, SermonNoteUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SermonNotes and returns the data updated in the database.
     * @param {SermonNoteUpdateManyAndReturnArgs} args - Arguments to update many SermonNotes.
     * @example
     * // Update many SermonNotes
     * const sermonNote = await prisma.sermonNote.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SermonNotes and only return the `id`
     * const sermonNoteWithIdOnly = await prisma.sermonNote.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SermonNoteUpdateManyAndReturnArgs>(args: SelectSubset<T, SermonNoteUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SermonNotePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SermonNote.
     * @param {SermonNoteUpsertArgs} args - Arguments to update or create a SermonNote.
     * @example
     * // Update or create a SermonNote
     * const sermonNote = await prisma.sermonNote.upsert({
     *   create: {
     *     // ... data to create a SermonNote
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SermonNote we want to update
     *   }
     * })
     */
    upsert<T extends SermonNoteUpsertArgs>(args: SelectSubset<T, SermonNoteUpsertArgs<ExtArgs>>): Prisma__SermonNoteClient<$Result.GetResult<Prisma.$SermonNotePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SermonNotes.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SermonNoteCountArgs} args - Arguments to filter SermonNotes to count.
     * @example
     * // Count the number of SermonNotes
     * const count = await prisma.sermonNote.count({
     *   where: {
     *     // ... the filter for the SermonNotes we want to count
     *   }
     * })
    **/
    count<T extends SermonNoteCountArgs>(
      args?: Subset<T, SermonNoteCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SermonNoteCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SermonNote.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SermonNoteAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SermonNoteAggregateArgs>(args: Subset<T, SermonNoteAggregateArgs>): Prisma.PrismaPromise<GetSermonNoteAggregateType<T>>

    /**
     * Group by SermonNote.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SermonNoteGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SermonNoteGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SermonNoteGroupByArgs['orderBy'] }
        : { orderBy?: SermonNoteGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SermonNoteGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSermonNoteGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SermonNote model
   */
  readonly fields: SermonNoteFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SermonNote.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SermonNoteClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    presentations<T extends SermonNote$presentationsArgs<ExtArgs> = {}>(args?: Subset<T, SermonNote$presentationsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PresentationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SermonNote model
   */
  interface SermonNoteFieldRefs {
    readonly id: FieldRef<"SermonNote", 'String'>
    readonly title: FieldRef<"SermonNote", 'String'>
    readonly content: FieldRef<"SermonNote", 'String'>
    readonly outline: FieldRef<"SermonNote", 'String'>
    readonly bibleRefs: FieldRef<"SermonNote", 'String'>
    readonly date: FieldRef<"SermonNote", 'DateTime'>
    readonly createdAt: FieldRef<"SermonNote", 'DateTime'>
    readonly updatedAt: FieldRef<"SermonNote", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SermonNote findUnique
   */
  export type SermonNoteFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SermonNote
     */
    select?: SermonNoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SermonNote
     */
    omit?: SermonNoteOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SermonNoteInclude<ExtArgs> | null
    /**
     * Filter, which SermonNote to fetch.
     */
    where: SermonNoteWhereUniqueInput
  }

  /**
   * SermonNote findUniqueOrThrow
   */
  export type SermonNoteFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SermonNote
     */
    select?: SermonNoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SermonNote
     */
    omit?: SermonNoteOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SermonNoteInclude<ExtArgs> | null
    /**
     * Filter, which SermonNote to fetch.
     */
    where: SermonNoteWhereUniqueInput
  }

  /**
   * SermonNote findFirst
   */
  export type SermonNoteFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SermonNote
     */
    select?: SermonNoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SermonNote
     */
    omit?: SermonNoteOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SermonNoteInclude<ExtArgs> | null
    /**
     * Filter, which SermonNote to fetch.
     */
    where?: SermonNoteWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SermonNotes to fetch.
     */
    orderBy?: SermonNoteOrderByWithRelationInput | SermonNoteOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SermonNotes.
     */
    cursor?: SermonNoteWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SermonNotes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SermonNotes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SermonNotes.
     */
    distinct?: SermonNoteScalarFieldEnum | SermonNoteScalarFieldEnum[]
  }

  /**
   * SermonNote findFirstOrThrow
   */
  export type SermonNoteFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SermonNote
     */
    select?: SermonNoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SermonNote
     */
    omit?: SermonNoteOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SermonNoteInclude<ExtArgs> | null
    /**
     * Filter, which SermonNote to fetch.
     */
    where?: SermonNoteWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SermonNotes to fetch.
     */
    orderBy?: SermonNoteOrderByWithRelationInput | SermonNoteOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SermonNotes.
     */
    cursor?: SermonNoteWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SermonNotes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SermonNotes.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SermonNotes.
     */
    distinct?: SermonNoteScalarFieldEnum | SermonNoteScalarFieldEnum[]
  }

  /**
   * SermonNote findMany
   */
  export type SermonNoteFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SermonNote
     */
    select?: SermonNoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SermonNote
     */
    omit?: SermonNoteOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SermonNoteInclude<ExtArgs> | null
    /**
     * Filter, which SermonNotes to fetch.
     */
    where?: SermonNoteWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SermonNotes to fetch.
     */
    orderBy?: SermonNoteOrderByWithRelationInput | SermonNoteOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SermonNotes.
     */
    cursor?: SermonNoteWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SermonNotes from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SermonNotes.
     */
    skip?: number
    distinct?: SermonNoteScalarFieldEnum | SermonNoteScalarFieldEnum[]
  }

  /**
   * SermonNote create
   */
  export type SermonNoteCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SermonNote
     */
    select?: SermonNoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SermonNote
     */
    omit?: SermonNoteOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SermonNoteInclude<ExtArgs> | null
    /**
     * The data needed to create a SermonNote.
     */
    data: XOR<SermonNoteCreateInput, SermonNoteUncheckedCreateInput>
  }

  /**
   * SermonNote createMany
   */
  export type SermonNoteCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SermonNotes.
     */
    data: SermonNoteCreateManyInput | SermonNoteCreateManyInput[]
  }

  /**
   * SermonNote createManyAndReturn
   */
  export type SermonNoteCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SermonNote
     */
    select?: SermonNoteSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SermonNote
     */
    omit?: SermonNoteOmit<ExtArgs> | null
    /**
     * The data used to create many SermonNotes.
     */
    data: SermonNoteCreateManyInput | SermonNoteCreateManyInput[]
  }

  /**
   * SermonNote update
   */
  export type SermonNoteUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SermonNote
     */
    select?: SermonNoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SermonNote
     */
    omit?: SermonNoteOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SermonNoteInclude<ExtArgs> | null
    /**
     * The data needed to update a SermonNote.
     */
    data: XOR<SermonNoteUpdateInput, SermonNoteUncheckedUpdateInput>
    /**
     * Choose, which SermonNote to update.
     */
    where: SermonNoteWhereUniqueInput
  }

  /**
   * SermonNote updateMany
   */
  export type SermonNoteUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SermonNotes.
     */
    data: XOR<SermonNoteUpdateManyMutationInput, SermonNoteUncheckedUpdateManyInput>
    /**
     * Filter which SermonNotes to update
     */
    where?: SermonNoteWhereInput
    /**
     * Limit how many SermonNotes to update.
     */
    limit?: number
  }

  /**
   * SermonNote updateManyAndReturn
   */
  export type SermonNoteUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SermonNote
     */
    select?: SermonNoteSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SermonNote
     */
    omit?: SermonNoteOmit<ExtArgs> | null
    /**
     * The data used to update SermonNotes.
     */
    data: XOR<SermonNoteUpdateManyMutationInput, SermonNoteUncheckedUpdateManyInput>
    /**
     * Filter which SermonNotes to update
     */
    where?: SermonNoteWhereInput
    /**
     * Limit how many SermonNotes to update.
     */
    limit?: number
  }

  /**
   * SermonNote upsert
   */
  export type SermonNoteUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SermonNote
     */
    select?: SermonNoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SermonNote
     */
    omit?: SermonNoteOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SermonNoteInclude<ExtArgs> | null
    /**
     * The filter to search for the SermonNote to update in case it exists.
     */
    where: SermonNoteWhereUniqueInput
    /**
     * In case the SermonNote found by the `where` argument doesn't exist, create a new SermonNote with this data.
     */
    create: XOR<SermonNoteCreateInput, SermonNoteUncheckedCreateInput>
    /**
     * In case the SermonNote was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SermonNoteUpdateInput, SermonNoteUncheckedUpdateInput>
  }

  /**
   * SermonNote delete
   */
  export type SermonNoteDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SermonNote
     */
    select?: SermonNoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SermonNote
     */
    omit?: SermonNoteOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SermonNoteInclude<ExtArgs> | null
    /**
     * Filter which SermonNote to delete.
     */
    where: SermonNoteWhereUniqueInput
  }

  /**
   * SermonNote deleteMany
   */
  export type SermonNoteDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SermonNotes to delete
     */
    where?: SermonNoteWhereInput
    /**
     * Limit how many SermonNotes to delete.
     */
    limit?: number
  }

  /**
   * SermonNote.presentations
   */
  export type SermonNote$presentationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Presentation
     */
    select?: PresentationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Presentation
     */
    omit?: PresentationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PresentationInclude<ExtArgs> | null
    where?: PresentationWhereInput
    orderBy?: PresentationOrderByWithRelationInput | PresentationOrderByWithRelationInput[]
    cursor?: PresentationWhereUniqueInput
    take?: number
    skip?: number
    distinct?: PresentationScalarFieldEnum | PresentationScalarFieldEnum[]
  }

  /**
   * SermonNote without action
   */
  export type SermonNoteDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SermonNote
     */
    select?: SermonNoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SermonNote
     */
    omit?: SermonNoteOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SermonNoteInclude<ExtArgs> | null
  }


  /**
   * Model Presentation
   */

  export type AggregatePresentation = {
    _count: PresentationCountAggregateOutputType | null
    _min: PresentationMinAggregateOutputType | null
    _max: PresentationMaxAggregateOutputType | null
  }

  export type PresentationMinAggregateOutputType = {
    id: string | null
    title: string | null
    slides: string | null
    songId: string | null
    sermonId: string | null
    bibleRefs: string | null
    theme: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type PresentationMaxAggregateOutputType = {
    id: string | null
    title: string | null
    slides: string | null
    songId: string | null
    sermonId: string | null
    bibleRefs: string | null
    theme: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type PresentationCountAggregateOutputType = {
    id: number
    title: number
    slides: number
    songId: number
    sermonId: number
    bibleRefs: number
    theme: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type PresentationMinAggregateInputType = {
    id?: true
    title?: true
    slides?: true
    songId?: true
    sermonId?: true
    bibleRefs?: true
    theme?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PresentationMaxAggregateInputType = {
    id?: true
    title?: true
    slides?: true
    songId?: true
    sermonId?: true
    bibleRefs?: true
    theme?: true
    createdAt?: true
    updatedAt?: true
  }

  export type PresentationCountAggregateInputType = {
    id?: true
    title?: true
    slides?: true
    songId?: true
    sermonId?: true
    bibleRefs?: true
    theme?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type PresentationAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Presentation to aggregate.
     */
    where?: PresentationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Presentations to fetch.
     */
    orderBy?: PresentationOrderByWithRelationInput | PresentationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: PresentationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Presentations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Presentations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Presentations
    **/
    _count?: true | PresentationCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: PresentationMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: PresentationMaxAggregateInputType
  }

  export type GetPresentationAggregateType<T extends PresentationAggregateArgs> = {
        [P in keyof T & keyof AggregatePresentation]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregatePresentation[P]>
      : GetScalarType<T[P], AggregatePresentation[P]>
  }




  export type PresentationGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PresentationWhereInput
    orderBy?: PresentationOrderByWithAggregationInput | PresentationOrderByWithAggregationInput[]
    by: PresentationScalarFieldEnum[] | PresentationScalarFieldEnum
    having?: PresentationScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: PresentationCountAggregateInputType | true
    _min?: PresentationMinAggregateInputType
    _max?: PresentationMaxAggregateInputType
  }

  export type PresentationGroupByOutputType = {
    id: string
    title: string
    slides: string
    songId: string | null
    sermonId: string | null
    bibleRefs: string | null
    theme: string
    createdAt: Date
    updatedAt: Date
    _count: PresentationCountAggregateOutputType | null
    _min: PresentationMinAggregateOutputType | null
    _max: PresentationMaxAggregateOutputType | null
  }

  type GetPresentationGroupByPayload<T extends PresentationGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<PresentationGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof PresentationGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], PresentationGroupByOutputType[P]>
            : GetScalarType<T[P], PresentationGroupByOutputType[P]>
        }
      >
    >


  export type PresentationSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    title?: boolean
    slides?: boolean
    songId?: boolean
    sermonId?: boolean
    bibleRefs?: boolean
    theme?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    song?: boolean | Presentation$songArgs<ExtArgs>
    sermon?: boolean | Presentation$sermonArgs<ExtArgs>
  }, ExtArgs["result"]["presentation"]>

  export type PresentationSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    title?: boolean
    slides?: boolean
    songId?: boolean
    sermonId?: boolean
    bibleRefs?: boolean
    theme?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    song?: boolean | Presentation$songArgs<ExtArgs>
    sermon?: boolean | Presentation$sermonArgs<ExtArgs>
  }, ExtArgs["result"]["presentation"]>

  export type PresentationSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    title?: boolean
    slides?: boolean
    songId?: boolean
    sermonId?: boolean
    bibleRefs?: boolean
    theme?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    song?: boolean | Presentation$songArgs<ExtArgs>
    sermon?: boolean | Presentation$sermonArgs<ExtArgs>
  }, ExtArgs["result"]["presentation"]>

  export type PresentationSelectScalar = {
    id?: boolean
    title?: boolean
    slides?: boolean
    songId?: boolean
    sermonId?: boolean
    bibleRefs?: boolean
    theme?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type PresentationOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "title" | "slides" | "songId" | "sermonId" | "bibleRefs" | "theme" | "createdAt" | "updatedAt", ExtArgs["result"]["presentation"]>
  export type PresentationInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    song?: boolean | Presentation$songArgs<ExtArgs>
    sermon?: boolean | Presentation$sermonArgs<ExtArgs>
  }
  export type PresentationIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    song?: boolean | Presentation$songArgs<ExtArgs>
    sermon?: boolean | Presentation$sermonArgs<ExtArgs>
  }
  export type PresentationIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    song?: boolean | Presentation$songArgs<ExtArgs>
    sermon?: boolean | Presentation$sermonArgs<ExtArgs>
  }

  export type $PresentationPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Presentation"
    objects: {
      song: Prisma.$SongPayload<ExtArgs> | null
      sermon: Prisma.$SermonNotePayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      title: string
      slides: string
      songId: string | null
      sermonId: string | null
      bibleRefs: string | null
      theme: string
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["presentation"]>
    composites: {}
  }

  type PresentationGetPayload<S extends boolean | null | undefined | PresentationDefaultArgs> = $Result.GetResult<Prisma.$PresentationPayload, S>

  type PresentationCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<PresentationFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: PresentationCountAggregateInputType | true
    }

  export interface PresentationDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Presentation'], meta: { name: 'Presentation' } }
    /**
     * Find zero or one Presentation that matches the filter.
     * @param {PresentationFindUniqueArgs} args - Arguments to find a Presentation
     * @example
     * // Get one Presentation
     * const presentation = await prisma.presentation.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends PresentationFindUniqueArgs>(args: SelectSubset<T, PresentationFindUniqueArgs<ExtArgs>>): Prisma__PresentationClient<$Result.GetResult<Prisma.$PresentationPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Presentation that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {PresentationFindUniqueOrThrowArgs} args - Arguments to find a Presentation
     * @example
     * // Get one Presentation
     * const presentation = await prisma.presentation.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends PresentationFindUniqueOrThrowArgs>(args: SelectSubset<T, PresentationFindUniqueOrThrowArgs<ExtArgs>>): Prisma__PresentationClient<$Result.GetResult<Prisma.$PresentationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Presentation that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PresentationFindFirstArgs} args - Arguments to find a Presentation
     * @example
     * // Get one Presentation
     * const presentation = await prisma.presentation.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends PresentationFindFirstArgs>(args?: SelectSubset<T, PresentationFindFirstArgs<ExtArgs>>): Prisma__PresentationClient<$Result.GetResult<Prisma.$PresentationPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Presentation that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PresentationFindFirstOrThrowArgs} args - Arguments to find a Presentation
     * @example
     * // Get one Presentation
     * const presentation = await prisma.presentation.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends PresentationFindFirstOrThrowArgs>(args?: SelectSubset<T, PresentationFindFirstOrThrowArgs<ExtArgs>>): Prisma__PresentationClient<$Result.GetResult<Prisma.$PresentationPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Presentations that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PresentationFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Presentations
     * const presentations = await prisma.presentation.findMany()
     * 
     * // Get first 10 Presentations
     * const presentations = await prisma.presentation.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const presentationWithIdOnly = await prisma.presentation.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends PresentationFindManyArgs>(args?: SelectSubset<T, PresentationFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PresentationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Presentation.
     * @param {PresentationCreateArgs} args - Arguments to create a Presentation.
     * @example
     * // Create one Presentation
     * const Presentation = await prisma.presentation.create({
     *   data: {
     *     // ... data to create a Presentation
     *   }
     * })
     * 
     */
    create<T extends PresentationCreateArgs>(args: SelectSubset<T, PresentationCreateArgs<ExtArgs>>): Prisma__PresentationClient<$Result.GetResult<Prisma.$PresentationPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Presentations.
     * @param {PresentationCreateManyArgs} args - Arguments to create many Presentations.
     * @example
     * // Create many Presentations
     * const presentation = await prisma.presentation.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends PresentationCreateManyArgs>(args?: SelectSubset<T, PresentationCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Presentations and returns the data saved in the database.
     * @param {PresentationCreateManyAndReturnArgs} args - Arguments to create many Presentations.
     * @example
     * // Create many Presentations
     * const presentation = await prisma.presentation.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Presentations and only return the `id`
     * const presentationWithIdOnly = await prisma.presentation.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends PresentationCreateManyAndReturnArgs>(args?: SelectSubset<T, PresentationCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PresentationPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Presentation.
     * @param {PresentationDeleteArgs} args - Arguments to delete one Presentation.
     * @example
     * // Delete one Presentation
     * const Presentation = await prisma.presentation.delete({
     *   where: {
     *     // ... filter to delete one Presentation
     *   }
     * })
     * 
     */
    delete<T extends PresentationDeleteArgs>(args: SelectSubset<T, PresentationDeleteArgs<ExtArgs>>): Prisma__PresentationClient<$Result.GetResult<Prisma.$PresentationPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Presentation.
     * @param {PresentationUpdateArgs} args - Arguments to update one Presentation.
     * @example
     * // Update one Presentation
     * const presentation = await prisma.presentation.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends PresentationUpdateArgs>(args: SelectSubset<T, PresentationUpdateArgs<ExtArgs>>): Prisma__PresentationClient<$Result.GetResult<Prisma.$PresentationPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Presentations.
     * @param {PresentationDeleteManyArgs} args - Arguments to filter Presentations to delete.
     * @example
     * // Delete a few Presentations
     * const { count } = await prisma.presentation.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends PresentationDeleteManyArgs>(args?: SelectSubset<T, PresentationDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Presentations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PresentationUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Presentations
     * const presentation = await prisma.presentation.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends PresentationUpdateManyArgs>(args: SelectSubset<T, PresentationUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Presentations and returns the data updated in the database.
     * @param {PresentationUpdateManyAndReturnArgs} args - Arguments to update many Presentations.
     * @example
     * // Update many Presentations
     * const presentation = await prisma.presentation.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Presentations and only return the `id`
     * const presentationWithIdOnly = await prisma.presentation.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends PresentationUpdateManyAndReturnArgs>(args: SelectSubset<T, PresentationUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PresentationPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Presentation.
     * @param {PresentationUpsertArgs} args - Arguments to update or create a Presentation.
     * @example
     * // Update or create a Presentation
     * const presentation = await prisma.presentation.upsert({
     *   create: {
     *     // ... data to create a Presentation
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Presentation we want to update
     *   }
     * })
     */
    upsert<T extends PresentationUpsertArgs>(args: SelectSubset<T, PresentationUpsertArgs<ExtArgs>>): Prisma__PresentationClient<$Result.GetResult<Prisma.$PresentationPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Presentations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PresentationCountArgs} args - Arguments to filter Presentations to count.
     * @example
     * // Count the number of Presentations
     * const count = await prisma.presentation.count({
     *   where: {
     *     // ... the filter for the Presentations we want to count
     *   }
     * })
    **/
    count<T extends PresentationCountArgs>(
      args?: Subset<T, PresentationCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], PresentationCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Presentation.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PresentationAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends PresentationAggregateArgs>(args: Subset<T, PresentationAggregateArgs>): Prisma.PrismaPromise<GetPresentationAggregateType<T>>

    /**
     * Group by Presentation.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PresentationGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends PresentationGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: PresentationGroupByArgs['orderBy'] }
        : { orderBy?: PresentationGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, PresentationGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPresentationGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Presentation model
   */
  readonly fields: PresentationFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Presentation.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__PresentationClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    song<T extends Presentation$songArgs<ExtArgs> = {}>(args?: Subset<T, Presentation$songArgs<ExtArgs>>): Prisma__SongClient<$Result.GetResult<Prisma.$SongPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    sermon<T extends Presentation$sermonArgs<ExtArgs> = {}>(args?: Subset<T, Presentation$sermonArgs<ExtArgs>>): Prisma__SermonNoteClient<$Result.GetResult<Prisma.$SermonNotePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Presentation model
   */
  interface PresentationFieldRefs {
    readonly id: FieldRef<"Presentation", 'String'>
    readonly title: FieldRef<"Presentation", 'String'>
    readonly slides: FieldRef<"Presentation", 'String'>
    readonly songId: FieldRef<"Presentation", 'String'>
    readonly sermonId: FieldRef<"Presentation", 'String'>
    readonly bibleRefs: FieldRef<"Presentation", 'String'>
    readonly theme: FieldRef<"Presentation", 'String'>
    readonly createdAt: FieldRef<"Presentation", 'DateTime'>
    readonly updatedAt: FieldRef<"Presentation", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Presentation findUnique
   */
  export type PresentationFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Presentation
     */
    select?: PresentationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Presentation
     */
    omit?: PresentationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PresentationInclude<ExtArgs> | null
    /**
     * Filter, which Presentation to fetch.
     */
    where: PresentationWhereUniqueInput
  }

  /**
   * Presentation findUniqueOrThrow
   */
  export type PresentationFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Presentation
     */
    select?: PresentationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Presentation
     */
    omit?: PresentationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PresentationInclude<ExtArgs> | null
    /**
     * Filter, which Presentation to fetch.
     */
    where: PresentationWhereUniqueInput
  }

  /**
   * Presentation findFirst
   */
  export type PresentationFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Presentation
     */
    select?: PresentationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Presentation
     */
    omit?: PresentationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PresentationInclude<ExtArgs> | null
    /**
     * Filter, which Presentation to fetch.
     */
    where?: PresentationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Presentations to fetch.
     */
    orderBy?: PresentationOrderByWithRelationInput | PresentationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Presentations.
     */
    cursor?: PresentationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Presentations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Presentations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Presentations.
     */
    distinct?: PresentationScalarFieldEnum | PresentationScalarFieldEnum[]
  }

  /**
   * Presentation findFirstOrThrow
   */
  export type PresentationFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Presentation
     */
    select?: PresentationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Presentation
     */
    omit?: PresentationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PresentationInclude<ExtArgs> | null
    /**
     * Filter, which Presentation to fetch.
     */
    where?: PresentationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Presentations to fetch.
     */
    orderBy?: PresentationOrderByWithRelationInput | PresentationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Presentations.
     */
    cursor?: PresentationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Presentations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Presentations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Presentations.
     */
    distinct?: PresentationScalarFieldEnum | PresentationScalarFieldEnum[]
  }

  /**
   * Presentation findMany
   */
  export type PresentationFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Presentation
     */
    select?: PresentationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Presentation
     */
    omit?: PresentationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PresentationInclude<ExtArgs> | null
    /**
     * Filter, which Presentations to fetch.
     */
    where?: PresentationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Presentations to fetch.
     */
    orderBy?: PresentationOrderByWithRelationInput | PresentationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Presentations.
     */
    cursor?: PresentationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Presentations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Presentations.
     */
    skip?: number
    distinct?: PresentationScalarFieldEnum | PresentationScalarFieldEnum[]
  }

  /**
   * Presentation create
   */
  export type PresentationCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Presentation
     */
    select?: PresentationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Presentation
     */
    omit?: PresentationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PresentationInclude<ExtArgs> | null
    /**
     * The data needed to create a Presentation.
     */
    data: XOR<PresentationCreateInput, PresentationUncheckedCreateInput>
  }

  /**
   * Presentation createMany
   */
  export type PresentationCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Presentations.
     */
    data: PresentationCreateManyInput | PresentationCreateManyInput[]
  }

  /**
   * Presentation createManyAndReturn
   */
  export type PresentationCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Presentation
     */
    select?: PresentationSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Presentation
     */
    omit?: PresentationOmit<ExtArgs> | null
    /**
     * The data used to create many Presentations.
     */
    data: PresentationCreateManyInput | PresentationCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PresentationIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Presentation update
   */
  export type PresentationUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Presentation
     */
    select?: PresentationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Presentation
     */
    omit?: PresentationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PresentationInclude<ExtArgs> | null
    /**
     * The data needed to update a Presentation.
     */
    data: XOR<PresentationUpdateInput, PresentationUncheckedUpdateInput>
    /**
     * Choose, which Presentation to update.
     */
    where: PresentationWhereUniqueInput
  }

  /**
   * Presentation updateMany
   */
  export type PresentationUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Presentations.
     */
    data: XOR<PresentationUpdateManyMutationInput, PresentationUncheckedUpdateManyInput>
    /**
     * Filter which Presentations to update
     */
    where?: PresentationWhereInput
    /**
     * Limit how many Presentations to update.
     */
    limit?: number
  }

  /**
   * Presentation updateManyAndReturn
   */
  export type PresentationUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Presentation
     */
    select?: PresentationSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Presentation
     */
    omit?: PresentationOmit<ExtArgs> | null
    /**
     * The data used to update Presentations.
     */
    data: XOR<PresentationUpdateManyMutationInput, PresentationUncheckedUpdateManyInput>
    /**
     * Filter which Presentations to update
     */
    where?: PresentationWhereInput
    /**
     * Limit how many Presentations to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PresentationIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Presentation upsert
   */
  export type PresentationUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Presentation
     */
    select?: PresentationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Presentation
     */
    omit?: PresentationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PresentationInclude<ExtArgs> | null
    /**
     * The filter to search for the Presentation to update in case it exists.
     */
    where: PresentationWhereUniqueInput
    /**
     * In case the Presentation found by the `where` argument doesn't exist, create a new Presentation with this data.
     */
    create: XOR<PresentationCreateInput, PresentationUncheckedCreateInput>
    /**
     * In case the Presentation was found with the provided `where` argument, update it with this data.
     */
    update: XOR<PresentationUpdateInput, PresentationUncheckedUpdateInput>
  }

  /**
   * Presentation delete
   */
  export type PresentationDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Presentation
     */
    select?: PresentationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Presentation
     */
    omit?: PresentationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PresentationInclude<ExtArgs> | null
    /**
     * Filter which Presentation to delete.
     */
    where: PresentationWhereUniqueInput
  }

  /**
   * Presentation deleteMany
   */
  export type PresentationDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Presentations to delete
     */
    where?: PresentationWhereInput
    /**
     * Limit how many Presentations to delete.
     */
    limit?: number
  }

  /**
   * Presentation.song
   */
  export type Presentation$songArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Song
     */
    select?: SongSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Song
     */
    omit?: SongOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SongInclude<ExtArgs> | null
    where?: SongWhereInput
  }

  /**
   * Presentation.sermon
   */
  export type Presentation$sermonArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SermonNote
     */
    select?: SermonNoteSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SermonNote
     */
    omit?: SermonNoteOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SermonNoteInclude<ExtArgs> | null
    where?: SermonNoteWhereInput
  }

  /**
   * Presentation without action
   */
  export type PresentationDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Presentation
     */
    select?: PresentationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Presentation
     */
    omit?: PresentationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PresentationInclude<ExtArgs> | null
  }


  /**
   * Model BibleVerseCache
   */

  export type AggregateBibleVerseCache = {
    _count: BibleVerseCacheCountAggregateOutputType | null
    _avg: BibleVerseCacheAvgAggregateOutputType | null
    _sum: BibleVerseCacheSumAggregateOutputType | null
    _min: BibleVerseCacheMinAggregateOutputType | null
    _max: BibleVerseCacheMaxAggregateOutputType | null
  }

  export type BibleVerseCacheAvgAggregateOutputType = {
    chapter: number | null
    verseStart: number | null
    verseEnd: number | null
  }

  export type BibleVerseCacheSumAggregateOutputType = {
    chapter: number | null
    verseStart: number | null
    verseEnd: number | null
  }

  export type BibleVerseCacheMinAggregateOutputType = {
    id: string | null
    reference: string | null
    translation: string | null
    text: string | null
    book: string | null
    chapter: number | null
    verseStart: number | null
    verseEnd: number | null
    createdAt: Date | null
  }

  export type BibleVerseCacheMaxAggregateOutputType = {
    id: string | null
    reference: string | null
    translation: string | null
    text: string | null
    book: string | null
    chapter: number | null
    verseStart: number | null
    verseEnd: number | null
    createdAt: Date | null
  }

  export type BibleVerseCacheCountAggregateOutputType = {
    id: number
    reference: number
    translation: number
    text: number
    book: number
    chapter: number
    verseStart: number
    verseEnd: number
    createdAt: number
    _all: number
  }


  export type BibleVerseCacheAvgAggregateInputType = {
    chapter?: true
    verseStart?: true
    verseEnd?: true
  }

  export type BibleVerseCacheSumAggregateInputType = {
    chapter?: true
    verseStart?: true
    verseEnd?: true
  }

  export type BibleVerseCacheMinAggregateInputType = {
    id?: true
    reference?: true
    translation?: true
    text?: true
    book?: true
    chapter?: true
    verseStart?: true
    verseEnd?: true
    createdAt?: true
  }

  export type BibleVerseCacheMaxAggregateInputType = {
    id?: true
    reference?: true
    translation?: true
    text?: true
    book?: true
    chapter?: true
    verseStart?: true
    verseEnd?: true
    createdAt?: true
  }

  export type BibleVerseCacheCountAggregateInputType = {
    id?: true
    reference?: true
    translation?: true
    text?: true
    book?: true
    chapter?: true
    verseStart?: true
    verseEnd?: true
    createdAt?: true
    _all?: true
  }

  export type BibleVerseCacheAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which BibleVerseCache to aggregate.
     */
    where?: BibleVerseCacheWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BibleVerseCaches to fetch.
     */
    orderBy?: BibleVerseCacheOrderByWithRelationInput | BibleVerseCacheOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: BibleVerseCacheWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BibleVerseCaches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BibleVerseCaches.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned BibleVerseCaches
    **/
    _count?: true | BibleVerseCacheCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: BibleVerseCacheAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: BibleVerseCacheSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: BibleVerseCacheMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: BibleVerseCacheMaxAggregateInputType
  }

  export type GetBibleVerseCacheAggregateType<T extends BibleVerseCacheAggregateArgs> = {
        [P in keyof T & keyof AggregateBibleVerseCache]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateBibleVerseCache[P]>
      : GetScalarType<T[P], AggregateBibleVerseCache[P]>
  }




  export type BibleVerseCacheGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: BibleVerseCacheWhereInput
    orderBy?: BibleVerseCacheOrderByWithAggregationInput | BibleVerseCacheOrderByWithAggregationInput[]
    by: BibleVerseCacheScalarFieldEnum[] | BibleVerseCacheScalarFieldEnum
    having?: BibleVerseCacheScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: BibleVerseCacheCountAggregateInputType | true
    _avg?: BibleVerseCacheAvgAggregateInputType
    _sum?: BibleVerseCacheSumAggregateInputType
    _min?: BibleVerseCacheMinAggregateInputType
    _max?: BibleVerseCacheMaxAggregateInputType
  }

  export type BibleVerseCacheGroupByOutputType = {
    id: string
    reference: string
    translation: string
    text: string
    book: string
    chapter: number
    verseStart: number
    verseEnd: number | null
    createdAt: Date
    _count: BibleVerseCacheCountAggregateOutputType | null
    _avg: BibleVerseCacheAvgAggregateOutputType | null
    _sum: BibleVerseCacheSumAggregateOutputType | null
    _min: BibleVerseCacheMinAggregateOutputType | null
    _max: BibleVerseCacheMaxAggregateOutputType | null
  }

  type GetBibleVerseCacheGroupByPayload<T extends BibleVerseCacheGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<BibleVerseCacheGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof BibleVerseCacheGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], BibleVerseCacheGroupByOutputType[P]>
            : GetScalarType<T[P], BibleVerseCacheGroupByOutputType[P]>
        }
      >
    >


  export type BibleVerseCacheSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    reference?: boolean
    translation?: boolean
    text?: boolean
    book?: boolean
    chapter?: boolean
    verseStart?: boolean
    verseEnd?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["bibleVerseCache"]>

  export type BibleVerseCacheSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    reference?: boolean
    translation?: boolean
    text?: boolean
    book?: boolean
    chapter?: boolean
    verseStart?: boolean
    verseEnd?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["bibleVerseCache"]>

  export type BibleVerseCacheSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    reference?: boolean
    translation?: boolean
    text?: boolean
    book?: boolean
    chapter?: boolean
    verseStart?: boolean
    verseEnd?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["bibleVerseCache"]>

  export type BibleVerseCacheSelectScalar = {
    id?: boolean
    reference?: boolean
    translation?: boolean
    text?: boolean
    book?: boolean
    chapter?: boolean
    verseStart?: boolean
    verseEnd?: boolean
    createdAt?: boolean
  }

  export type BibleVerseCacheOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "reference" | "translation" | "text" | "book" | "chapter" | "verseStart" | "verseEnd" | "createdAt", ExtArgs["result"]["bibleVerseCache"]>

  export type $BibleVerseCachePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "BibleVerseCache"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      reference: string
      translation: string
      text: string
      book: string
      chapter: number
      verseStart: number
      verseEnd: number | null
      createdAt: Date
    }, ExtArgs["result"]["bibleVerseCache"]>
    composites: {}
  }

  type BibleVerseCacheGetPayload<S extends boolean | null | undefined | BibleVerseCacheDefaultArgs> = $Result.GetResult<Prisma.$BibleVerseCachePayload, S>

  type BibleVerseCacheCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<BibleVerseCacheFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: BibleVerseCacheCountAggregateInputType | true
    }

  export interface BibleVerseCacheDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['BibleVerseCache'], meta: { name: 'BibleVerseCache' } }
    /**
     * Find zero or one BibleVerseCache that matches the filter.
     * @param {BibleVerseCacheFindUniqueArgs} args - Arguments to find a BibleVerseCache
     * @example
     * // Get one BibleVerseCache
     * const bibleVerseCache = await prisma.bibleVerseCache.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends BibleVerseCacheFindUniqueArgs>(args: SelectSubset<T, BibleVerseCacheFindUniqueArgs<ExtArgs>>): Prisma__BibleVerseCacheClient<$Result.GetResult<Prisma.$BibleVerseCachePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one BibleVerseCache that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {BibleVerseCacheFindUniqueOrThrowArgs} args - Arguments to find a BibleVerseCache
     * @example
     * // Get one BibleVerseCache
     * const bibleVerseCache = await prisma.bibleVerseCache.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends BibleVerseCacheFindUniqueOrThrowArgs>(args: SelectSubset<T, BibleVerseCacheFindUniqueOrThrowArgs<ExtArgs>>): Prisma__BibleVerseCacheClient<$Result.GetResult<Prisma.$BibleVerseCachePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first BibleVerseCache that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleVerseCacheFindFirstArgs} args - Arguments to find a BibleVerseCache
     * @example
     * // Get one BibleVerseCache
     * const bibleVerseCache = await prisma.bibleVerseCache.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends BibleVerseCacheFindFirstArgs>(args?: SelectSubset<T, BibleVerseCacheFindFirstArgs<ExtArgs>>): Prisma__BibleVerseCacheClient<$Result.GetResult<Prisma.$BibleVerseCachePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first BibleVerseCache that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleVerseCacheFindFirstOrThrowArgs} args - Arguments to find a BibleVerseCache
     * @example
     * // Get one BibleVerseCache
     * const bibleVerseCache = await prisma.bibleVerseCache.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends BibleVerseCacheFindFirstOrThrowArgs>(args?: SelectSubset<T, BibleVerseCacheFindFirstOrThrowArgs<ExtArgs>>): Prisma__BibleVerseCacheClient<$Result.GetResult<Prisma.$BibleVerseCachePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more BibleVerseCaches that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleVerseCacheFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all BibleVerseCaches
     * const bibleVerseCaches = await prisma.bibleVerseCache.findMany()
     * 
     * // Get first 10 BibleVerseCaches
     * const bibleVerseCaches = await prisma.bibleVerseCache.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const bibleVerseCacheWithIdOnly = await prisma.bibleVerseCache.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends BibleVerseCacheFindManyArgs>(args?: SelectSubset<T, BibleVerseCacheFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BibleVerseCachePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a BibleVerseCache.
     * @param {BibleVerseCacheCreateArgs} args - Arguments to create a BibleVerseCache.
     * @example
     * // Create one BibleVerseCache
     * const BibleVerseCache = await prisma.bibleVerseCache.create({
     *   data: {
     *     // ... data to create a BibleVerseCache
     *   }
     * })
     * 
     */
    create<T extends BibleVerseCacheCreateArgs>(args: SelectSubset<T, BibleVerseCacheCreateArgs<ExtArgs>>): Prisma__BibleVerseCacheClient<$Result.GetResult<Prisma.$BibleVerseCachePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many BibleVerseCaches.
     * @param {BibleVerseCacheCreateManyArgs} args - Arguments to create many BibleVerseCaches.
     * @example
     * // Create many BibleVerseCaches
     * const bibleVerseCache = await prisma.bibleVerseCache.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends BibleVerseCacheCreateManyArgs>(args?: SelectSubset<T, BibleVerseCacheCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many BibleVerseCaches and returns the data saved in the database.
     * @param {BibleVerseCacheCreateManyAndReturnArgs} args - Arguments to create many BibleVerseCaches.
     * @example
     * // Create many BibleVerseCaches
     * const bibleVerseCache = await prisma.bibleVerseCache.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many BibleVerseCaches and only return the `id`
     * const bibleVerseCacheWithIdOnly = await prisma.bibleVerseCache.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends BibleVerseCacheCreateManyAndReturnArgs>(args?: SelectSubset<T, BibleVerseCacheCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BibleVerseCachePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a BibleVerseCache.
     * @param {BibleVerseCacheDeleteArgs} args - Arguments to delete one BibleVerseCache.
     * @example
     * // Delete one BibleVerseCache
     * const BibleVerseCache = await prisma.bibleVerseCache.delete({
     *   where: {
     *     // ... filter to delete one BibleVerseCache
     *   }
     * })
     * 
     */
    delete<T extends BibleVerseCacheDeleteArgs>(args: SelectSubset<T, BibleVerseCacheDeleteArgs<ExtArgs>>): Prisma__BibleVerseCacheClient<$Result.GetResult<Prisma.$BibleVerseCachePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one BibleVerseCache.
     * @param {BibleVerseCacheUpdateArgs} args - Arguments to update one BibleVerseCache.
     * @example
     * // Update one BibleVerseCache
     * const bibleVerseCache = await prisma.bibleVerseCache.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends BibleVerseCacheUpdateArgs>(args: SelectSubset<T, BibleVerseCacheUpdateArgs<ExtArgs>>): Prisma__BibleVerseCacheClient<$Result.GetResult<Prisma.$BibleVerseCachePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more BibleVerseCaches.
     * @param {BibleVerseCacheDeleteManyArgs} args - Arguments to filter BibleVerseCaches to delete.
     * @example
     * // Delete a few BibleVerseCaches
     * const { count } = await prisma.bibleVerseCache.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends BibleVerseCacheDeleteManyArgs>(args?: SelectSubset<T, BibleVerseCacheDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more BibleVerseCaches.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleVerseCacheUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many BibleVerseCaches
     * const bibleVerseCache = await prisma.bibleVerseCache.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends BibleVerseCacheUpdateManyArgs>(args: SelectSubset<T, BibleVerseCacheUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more BibleVerseCaches and returns the data updated in the database.
     * @param {BibleVerseCacheUpdateManyAndReturnArgs} args - Arguments to update many BibleVerseCaches.
     * @example
     * // Update many BibleVerseCaches
     * const bibleVerseCache = await prisma.bibleVerseCache.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more BibleVerseCaches and only return the `id`
     * const bibleVerseCacheWithIdOnly = await prisma.bibleVerseCache.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends BibleVerseCacheUpdateManyAndReturnArgs>(args: SelectSubset<T, BibleVerseCacheUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BibleVerseCachePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one BibleVerseCache.
     * @param {BibleVerseCacheUpsertArgs} args - Arguments to update or create a BibleVerseCache.
     * @example
     * // Update or create a BibleVerseCache
     * const bibleVerseCache = await prisma.bibleVerseCache.upsert({
     *   create: {
     *     // ... data to create a BibleVerseCache
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the BibleVerseCache we want to update
     *   }
     * })
     */
    upsert<T extends BibleVerseCacheUpsertArgs>(args: SelectSubset<T, BibleVerseCacheUpsertArgs<ExtArgs>>): Prisma__BibleVerseCacheClient<$Result.GetResult<Prisma.$BibleVerseCachePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of BibleVerseCaches.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleVerseCacheCountArgs} args - Arguments to filter BibleVerseCaches to count.
     * @example
     * // Count the number of BibleVerseCaches
     * const count = await prisma.bibleVerseCache.count({
     *   where: {
     *     // ... the filter for the BibleVerseCaches we want to count
     *   }
     * })
    **/
    count<T extends BibleVerseCacheCountArgs>(
      args?: Subset<T, BibleVerseCacheCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], BibleVerseCacheCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a BibleVerseCache.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleVerseCacheAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends BibleVerseCacheAggregateArgs>(args: Subset<T, BibleVerseCacheAggregateArgs>): Prisma.PrismaPromise<GetBibleVerseCacheAggregateType<T>>

    /**
     * Group by BibleVerseCache.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleVerseCacheGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends BibleVerseCacheGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: BibleVerseCacheGroupByArgs['orderBy'] }
        : { orderBy?: BibleVerseCacheGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, BibleVerseCacheGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetBibleVerseCacheGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the BibleVerseCache model
   */
  readonly fields: BibleVerseCacheFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for BibleVerseCache.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__BibleVerseCacheClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the BibleVerseCache model
   */
  interface BibleVerseCacheFieldRefs {
    readonly id: FieldRef<"BibleVerseCache", 'String'>
    readonly reference: FieldRef<"BibleVerseCache", 'String'>
    readonly translation: FieldRef<"BibleVerseCache", 'String'>
    readonly text: FieldRef<"BibleVerseCache", 'String'>
    readonly book: FieldRef<"BibleVerseCache", 'String'>
    readonly chapter: FieldRef<"BibleVerseCache", 'Int'>
    readonly verseStart: FieldRef<"BibleVerseCache", 'Int'>
    readonly verseEnd: FieldRef<"BibleVerseCache", 'Int'>
    readonly createdAt: FieldRef<"BibleVerseCache", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * BibleVerseCache findUnique
   */
  export type BibleVerseCacheFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleVerseCache
     */
    select?: BibleVerseCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleVerseCache
     */
    omit?: BibleVerseCacheOmit<ExtArgs> | null
    /**
     * Filter, which BibleVerseCache to fetch.
     */
    where: BibleVerseCacheWhereUniqueInput
  }

  /**
   * BibleVerseCache findUniqueOrThrow
   */
  export type BibleVerseCacheFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleVerseCache
     */
    select?: BibleVerseCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleVerseCache
     */
    omit?: BibleVerseCacheOmit<ExtArgs> | null
    /**
     * Filter, which BibleVerseCache to fetch.
     */
    where: BibleVerseCacheWhereUniqueInput
  }

  /**
   * BibleVerseCache findFirst
   */
  export type BibleVerseCacheFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleVerseCache
     */
    select?: BibleVerseCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleVerseCache
     */
    omit?: BibleVerseCacheOmit<ExtArgs> | null
    /**
     * Filter, which BibleVerseCache to fetch.
     */
    where?: BibleVerseCacheWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BibleVerseCaches to fetch.
     */
    orderBy?: BibleVerseCacheOrderByWithRelationInput | BibleVerseCacheOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for BibleVerseCaches.
     */
    cursor?: BibleVerseCacheWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BibleVerseCaches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BibleVerseCaches.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of BibleVerseCaches.
     */
    distinct?: BibleVerseCacheScalarFieldEnum | BibleVerseCacheScalarFieldEnum[]
  }

  /**
   * BibleVerseCache findFirstOrThrow
   */
  export type BibleVerseCacheFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleVerseCache
     */
    select?: BibleVerseCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleVerseCache
     */
    omit?: BibleVerseCacheOmit<ExtArgs> | null
    /**
     * Filter, which BibleVerseCache to fetch.
     */
    where?: BibleVerseCacheWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BibleVerseCaches to fetch.
     */
    orderBy?: BibleVerseCacheOrderByWithRelationInput | BibleVerseCacheOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for BibleVerseCaches.
     */
    cursor?: BibleVerseCacheWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BibleVerseCaches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BibleVerseCaches.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of BibleVerseCaches.
     */
    distinct?: BibleVerseCacheScalarFieldEnum | BibleVerseCacheScalarFieldEnum[]
  }

  /**
   * BibleVerseCache findMany
   */
  export type BibleVerseCacheFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleVerseCache
     */
    select?: BibleVerseCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleVerseCache
     */
    omit?: BibleVerseCacheOmit<ExtArgs> | null
    /**
     * Filter, which BibleVerseCaches to fetch.
     */
    where?: BibleVerseCacheWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BibleVerseCaches to fetch.
     */
    orderBy?: BibleVerseCacheOrderByWithRelationInput | BibleVerseCacheOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing BibleVerseCaches.
     */
    cursor?: BibleVerseCacheWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BibleVerseCaches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BibleVerseCaches.
     */
    skip?: number
    distinct?: BibleVerseCacheScalarFieldEnum | BibleVerseCacheScalarFieldEnum[]
  }

  /**
   * BibleVerseCache create
   */
  export type BibleVerseCacheCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleVerseCache
     */
    select?: BibleVerseCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleVerseCache
     */
    omit?: BibleVerseCacheOmit<ExtArgs> | null
    /**
     * The data needed to create a BibleVerseCache.
     */
    data: XOR<BibleVerseCacheCreateInput, BibleVerseCacheUncheckedCreateInput>
  }

  /**
   * BibleVerseCache createMany
   */
  export type BibleVerseCacheCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many BibleVerseCaches.
     */
    data: BibleVerseCacheCreateManyInput | BibleVerseCacheCreateManyInput[]
  }

  /**
   * BibleVerseCache createManyAndReturn
   */
  export type BibleVerseCacheCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleVerseCache
     */
    select?: BibleVerseCacheSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the BibleVerseCache
     */
    omit?: BibleVerseCacheOmit<ExtArgs> | null
    /**
     * The data used to create many BibleVerseCaches.
     */
    data: BibleVerseCacheCreateManyInput | BibleVerseCacheCreateManyInput[]
  }

  /**
   * BibleVerseCache update
   */
  export type BibleVerseCacheUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleVerseCache
     */
    select?: BibleVerseCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleVerseCache
     */
    omit?: BibleVerseCacheOmit<ExtArgs> | null
    /**
     * The data needed to update a BibleVerseCache.
     */
    data: XOR<BibleVerseCacheUpdateInput, BibleVerseCacheUncheckedUpdateInput>
    /**
     * Choose, which BibleVerseCache to update.
     */
    where: BibleVerseCacheWhereUniqueInput
  }

  /**
   * BibleVerseCache updateMany
   */
  export type BibleVerseCacheUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update BibleVerseCaches.
     */
    data: XOR<BibleVerseCacheUpdateManyMutationInput, BibleVerseCacheUncheckedUpdateManyInput>
    /**
     * Filter which BibleVerseCaches to update
     */
    where?: BibleVerseCacheWhereInput
    /**
     * Limit how many BibleVerseCaches to update.
     */
    limit?: number
  }

  /**
   * BibleVerseCache updateManyAndReturn
   */
  export type BibleVerseCacheUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleVerseCache
     */
    select?: BibleVerseCacheSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the BibleVerseCache
     */
    omit?: BibleVerseCacheOmit<ExtArgs> | null
    /**
     * The data used to update BibleVerseCaches.
     */
    data: XOR<BibleVerseCacheUpdateManyMutationInput, BibleVerseCacheUncheckedUpdateManyInput>
    /**
     * Filter which BibleVerseCaches to update
     */
    where?: BibleVerseCacheWhereInput
    /**
     * Limit how many BibleVerseCaches to update.
     */
    limit?: number
  }

  /**
   * BibleVerseCache upsert
   */
  export type BibleVerseCacheUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleVerseCache
     */
    select?: BibleVerseCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleVerseCache
     */
    omit?: BibleVerseCacheOmit<ExtArgs> | null
    /**
     * The filter to search for the BibleVerseCache to update in case it exists.
     */
    where: BibleVerseCacheWhereUniqueInput
    /**
     * In case the BibleVerseCache found by the `where` argument doesn't exist, create a new BibleVerseCache with this data.
     */
    create: XOR<BibleVerseCacheCreateInput, BibleVerseCacheUncheckedCreateInput>
    /**
     * In case the BibleVerseCache was found with the provided `where` argument, update it with this data.
     */
    update: XOR<BibleVerseCacheUpdateInput, BibleVerseCacheUncheckedUpdateInput>
  }

  /**
   * BibleVerseCache delete
   */
  export type BibleVerseCacheDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleVerseCache
     */
    select?: BibleVerseCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleVerseCache
     */
    omit?: BibleVerseCacheOmit<ExtArgs> | null
    /**
     * Filter which BibleVerseCache to delete.
     */
    where: BibleVerseCacheWhereUniqueInput
  }

  /**
   * BibleVerseCache deleteMany
   */
  export type BibleVerseCacheDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which BibleVerseCaches to delete
     */
    where?: BibleVerseCacheWhereInput
    /**
     * Limit how many BibleVerseCaches to delete.
     */
    limit?: number
  }

  /**
   * BibleVerseCache without action
   */
  export type BibleVerseCacheDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleVerseCache
     */
    select?: BibleVerseCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleVerseCache
     */
    omit?: BibleVerseCacheOmit<ExtArgs> | null
  }


  /**
   * Model BibleTranslationDownload
   */

  export type AggregateBibleTranslationDownload = {
    _count: BibleTranslationDownloadCountAggregateOutputType | null
    _avg: BibleTranslationDownloadAvgAggregateOutputType | null
    _sum: BibleTranslationDownloadSumAggregateOutputType | null
    _min: BibleTranslationDownloadMinAggregateOutputType | null
    _max: BibleTranslationDownloadMaxAggregateOutputType | null
  }

  export type BibleTranslationDownloadAvgAggregateOutputType = {
    progress: number | null
    bookCount: number | null
    verseCount: number | null
  }

  export type BibleTranslationDownloadSumAggregateOutputType = {
    progress: number | null
    bookCount: number | null
    verseCount: number | null
  }

  export type BibleTranslationDownloadMinAggregateOutputType = {
    id: string | null
    translation: string | null
    name: string | null
    language: string | null
    status: string | null
    progress: number | null
    bookCount: number | null
    verseCount: number | null
    errorMessage: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type BibleTranslationDownloadMaxAggregateOutputType = {
    id: string | null
    translation: string | null
    name: string | null
    language: string | null
    status: string | null
    progress: number | null
    bookCount: number | null
    verseCount: number | null
    errorMessage: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type BibleTranslationDownloadCountAggregateOutputType = {
    id: number
    translation: number
    name: number
    language: number
    status: number
    progress: number
    bookCount: number
    verseCount: number
    errorMessage: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type BibleTranslationDownloadAvgAggregateInputType = {
    progress?: true
    bookCount?: true
    verseCount?: true
  }

  export type BibleTranslationDownloadSumAggregateInputType = {
    progress?: true
    bookCount?: true
    verseCount?: true
  }

  export type BibleTranslationDownloadMinAggregateInputType = {
    id?: true
    translation?: true
    name?: true
    language?: true
    status?: true
    progress?: true
    bookCount?: true
    verseCount?: true
    errorMessage?: true
    createdAt?: true
    updatedAt?: true
  }

  export type BibleTranslationDownloadMaxAggregateInputType = {
    id?: true
    translation?: true
    name?: true
    language?: true
    status?: true
    progress?: true
    bookCount?: true
    verseCount?: true
    errorMessage?: true
    createdAt?: true
    updatedAt?: true
  }

  export type BibleTranslationDownloadCountAggregateInputType = {
    id?: true
    translation?: true
    name?: true
    language?: true
    status?: true
    progress?: true
    bookCount?: true
    verseCount?: true
    errorMessage?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type BibleTranslationDownloadAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which BibleTranslationDownload to aggregate.
     */
    where?: BibleTranslationDownloadWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BibleTranslationDownloads to fetch.
     */
    orderBy?: BibleTranslationDownloadOrderByWithRelationInput | BibleTranslationDownloadOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: BibleTranslationDownloadWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BibleTranslationDownloads from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BibleTranslationDownloads.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned BibleTranslationDownloads
    **/
    _count?: true | BibleTranslationDownloadCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: BibleTranslationDownloadAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: BibleTranslationDownloadSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: BibleTranslationDownloadMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: BibleTranslationDownloadMaxAggregateInputType
  }

  export type GetBibleTranslationDownloadAggregateType<T extends BibleTranslationDownloadAggregateArgs> = {
        [P in keyof T & keyof AggregateBibleTranslationDownload]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateBibleTranslationDownload[P]>
      : GetScalarType<T[P], AggregateBibleTranslationDownload[P]>
  }




  export type BibleTranslationDownloadGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: BibleTranslationDownloadWhereInput
    orderBy?: BibleTranslationDownloadOrderByWithAggregationInput | BibleTranslationDownloadOrderByWithAggregationInput[]
    by: BibleTranslationDownloadScalarFieldEnum[] | BibleTranslationDownloadScalarFieldEnum
    having?: BibleTranslationDownloadScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: BibleTranslationDownloadCountAggregateInputType | true
    _avg?: BibleTranslationDownloadAvgAggregateInputType
    _sum?: BibleTranslationDownloadSumAggregateInputType
    _min?: BibleTranslationDownloadMinAggregateInputType
    _max?: BibleTranslationDownloadMaxAggregateInputType
  }

  export type BibleTranslationDownloadGroupByOutputType = {
    id: string
    translation: string
    name: string
    language: string
    status: string
    progress: number
    bookCount: number
    verseCount: number
    errorMessage: string | null
    createdAt: Date
    updatedAt: Date
    _count: BibleTranslationDownloadCountAggregateOutputType | null
    _avg: BibleTranslationDownloadAvgAggregateOutputType | null
    _sum: BibleTranslationDownloadSumAggregateOutputType | null
    _min: BibleTranslationDownloadMinAggregateOutputType | null
    _max: BibleTranslationDownloadMaxAggregateOutputType | null
  }

  type GetBibleTranslationDownloadGroupByPayload<T extends BibleTranslationDownloadGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<BibleTranslationDownloadGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof BibleTranslationDownloadGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], BibleTranslationDownloadGroupByOutputType[P]>
            : GetScalarType<T[P], BibleTranslationDownloadGroupByOutputType[P]>
        }
      >
    >


  export type BibleTranslationDownloadSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    translation?: boolean
    name?: boolean
    language?: boolean
    status?: boolean
    progress?: boolean
    bookCount?: boolean
    verseCount?: boolean
    errorMessage?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["bibleTranslationDownload"]>

  export type BibleTranslationDownloadSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    translation?: boolean
    name?: boolean
    language?: boolean
    status?: boolean
    progress?: boolean
    bookCount?: boolean
    verseCount?: boolean
    errorMessage?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["bibleTranslationDownload"]>

  export type BibleTranslationDownloadSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    translation?: boolean
    name?: boolean
    language?: boolean
    status?: boolean
    progress?: boolean
    bookCount?: boolean
    verseCount?: boolean
    errorMessage?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["bibleTranslationDownload"]>

  export type BibleTranslationDownloadSelectScalar = {
    id?: boolean
    translation?: boolean
    name?: boolean
    language?: boolean
    status?: boolean
    progress?: boolean
    bookCount?: boolean
    verseCount?: boolean
    errorMessage?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type BibleTranslationDownloadOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "translation" | "name" | "language" | "status" | "progress" | "bookCount" | "verseCount" | "errorMessage" | "createdAt" | "updatedAt", ExtArgs["result"]["bibleTranslationDownload"]>

  export type $BibleTranslationDownloadPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "BibleTranslationDownload"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      translation: string
      name: string
      language: string
      status: string
      progress: number
      bookCount: number
      verseCount: number
      errorMessage: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["bibleTranslationDownload"]>
    composites: {}
  }

  type BibleTranslationDownloadGetPayload<S extends boolean | null | undefined | BibleTranslationDownloadDefaultArgs> = $Result.GetResult<Prisma.$BibleTranslationDownloadPayload, S>

  type BibleTranslationDownloadCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<BibleTranslationDownloadFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: BibleTranslationDownloadCountAggregateInputType | true
    }

  export interface BibleTranslationDownloadDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['BibleTranslationDownload'], meta: { name: 'BibleTranslationDownload' } }
    /**
     * Find zero or one BibleTranslationDownload that matches the filter.
     * @param {BibleTranslationDownloadFindUniqueArgs} args - Arguments to find a BibleTranslationDownload
     * @example
     * // Get one BibleTranslationDownload
     * const bibleTranslationDownload = await prisma.bibleTranslationDownload.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends BibleTranslationDownloadFindUniqueArgs>(args: SelectSubset<T, BibleTranslationDownloadFindUniqueArgs<ExtArgs>>): Prisma__BibleTranslationDownloadClient<$Result.GetResult<Prisma.$BibleTranslationDownloadPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one BibleTranslationDownload that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {BibleTranslationDownloadFindUniqueOrThrowArgs} args - Arguments to find a BibleTranslationDownload
     * @example
     * // Get one BibleTranslationDownload
     * const bibleTranslationDownload = await prisma.bibleTranslationDownload.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends BibleTranslationDownloadFindUniqueOrThrowArgs>(args: SelectSubset<T, BibleTranslationDownloadFindUniqueOrThrowArgs<ExtArgs>>): Prisma__BibleTranslationDownloadClient<$Result.GetResult<Prisma.$BibleTranslationDownloadPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first BibleTranslationDownload that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleTranslationDownloadFindFirstArgs} args - Arguments to find a BibleTranslationDownload
     * @example
     * // Get one BibleTranslationDownload
     * const bibleTranslationDownload = await prisma.bibleTranslationDownload.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends BibleTranslationDownloadFindFirstArgs>(args?: SelectSubset<T, BibleTranslationDownloadFindFirstArgs<ExtArgs>>): Prisma__BibleTranslationDownloadClient<$Result.GetResult<Prisma.$BibleTranslationDownloadPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first BibleTranslationDownload that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleTranslationDownloadFindFirstOrThrowArgs} args - Arguments to find a BibleTranslationDownload
     * @example
     * // Get one BibleTranslationDownload
     * const bibleTranslationDownload = await prisma.bibleTranslationDownload.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends BibleTranslationDownloadFindFirstOrThrowArgs>(args?: SelectSubset<T, BibleTranslationDownloadFindFirstOrThrowArgs<ExtArgs>>): Prisma__BibleTranslationDownloadClient<$Result.GetResult<Prisma.$BibleTranslationDownloadPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more BibleTranslationDownloads that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleTranslationDownloadFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all BibleTranslationDownloads
     * const bibleTranslationDownloads = await prisma.bibleTranslationDownload.findMany()
     * 
     * // Get first 10 BibleTranslationDownloads
     * const bibleTranslationDownloads = await prisma.bibleTranslationDownload.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const bibleTranslationDownloadWithIdOnly = await prisma.bibleTranslationDownload.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends BibleTranslationDownloadFindManyArgs>(args?: SelectSubset<T, BibleTranslationDownloadFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BibleTranslationDownloadPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a BibleTranslationDownload.
     * @param {BibleTranslationDownloadCreateArgs} args - Arguments to create a BibleTranslationDownload.
     * @example
     * // Create one BibleTranslationDownload
     * const BibleTranslationDownload = await prisma.bibleTranslationDownload.create({
     *   data: {
     *     // ... data to create a BibleTranslationDownload
     *   }
     * })
     * 
     */
    create<T extends BibleTranslationDownloadCreateArgs>(args: SelectSubset<T, BibleTranslationDownloadCreateArgs<ExtArgs>>): Prisma__BibleTranslationDownloadClient<$Result.GetResult<Prisma.$BibleTranslationDownloadPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many BibleTranslationDownloads.
     * @param {BibleTranslationDownloadCreateManyArgs} args - Arguments to create many BibleTranslationDownloads.
     * @example
     * // Create many BibleTranslationDownloads
     * const bibleTranslationDownload = await prisma.bibleTranslationDownload.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends BibleTranslationDownloadCreateManyArgs>(args?: SelectSubset<T, BibleTranslationDownloadCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many BibleTranslationDownloads and returns the data saved in the database.
     * @param {BibleTranslationDownloadCreateManyAndReturnArgs} args - Arguments to create many BibleTranslationDownloads.
     * @example
     * // Create many BibleTranslationDownloads
     * const bibleTranslationDownload = await prisma.bibleTranslationDownload.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many BibleTranslationDownloads and only return the `id`
     * const bibleTranslationDownloadWithIdOnly = await prisma.bibleTranslationDownload.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends BibleTranslationDownloadCreateManyAndReturnArgs>(args?: SelectSubset<T, BibleTranslationDownloadCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BibleTranslationDownloadPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a BibleTranslationDownload.
     * @param {BibleTranslationDownloadDeleteArgs} args - Arguments to delete one BibleTranslationDownload.
     * @example
     * // Delete one BibleTranslationDownload
     * const BibleTranslationDownload = await prisma.bibleTranslationDownload.delete({
     *   where: {
     *     // ... filter to delete one BibleTranslationDownload
     *   }
     * })
     * 
     */
    delete<T extends BibleTranslationDownloadDeleteArgs>(args: SelectSubset<T, BibleTranslationDownloadDeleteArgs<ExtArgs>>): Prisma__BibleTranslationDownloadClient<$Result.GetResult<Prisma.$BibleTranslationDownloadPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one BibleTranslationDownload.
     * @param {BibleTranslationDownloadUpdateArgs} args - Arguments to update one BibleTranslationDownload.
     * @example
     * // Update one BibleTranslationDownload
     * const bibleTranslationDownload = await prisma.bibleTranslationDownload.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends BibleTranslationDownloadUpdateArgs>(args: SelectSubset<T, BibleTranslationDownloadUpdateArgs<ExtArgs>>): Prisma__BibleTranslationDownloadClient<$Result.GetResult<Prisma.$BibleTranslationDownloadPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more BibleTranslationDownloads.
     * @param {BibleTranslationDownloadDeleteManyArgs} args - Arguments to filter BibleTranslationDownloads to delete.
     * @example
     * // Delete a few BibleTranslationDownloads
     * const { count } = await prisma.bibleTranslationDownload.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends BibleTranslationDownloadDeleteManyArgs>(args?: SelectSubset<T, BibleTranslationDownloadDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more BibleTranslationDownloads.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleTranslationDownloadUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many BibleTranslationDownloads
     * const bibleTranslationDownload = await prisma.bibleTranslationDownload.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends BibleTranslationDownloadUpdateManyArgs>(args: SelectSubset<T, BibleTranslationDownloadUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more BibleTranslationDownloads and returns the data updated in the database.
     * @param {BibleTranslationDownloadUpdateManyAndReturnArgs} args - Arguments to update many BibleTranslationDownloads.
     * @example
     * // Update many BibleTranslationDownloads
     * const bibleTranslationDownload = await prisma.bibleTranslationDownload.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more BibleTranslationDownloads and only return the `id`
     * const bibleTranslationDownloadWithIdOnly = await prisma.bibleTranslationDownload.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends BibleTranslationDownloadUpdateManyAndReturnArgs>(args: SelectSubset<T, BibleTranslationDownloadUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BibleTranslationDownloadPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one BibleTranslationDownload.
     * @param {BibleTranslationDownloadUpsertArgs} args - Arguments to update or create a BibleTranslationDownload.
     * @example
     * // Update or create a BibleTranslationDownload
     * const bibleTranslationDownload = await prisma.bibleTranslationDownload.upsert({
     *   create: {
     *     // ... data to create a BibleTranslationDownload
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the BibleTranslationDownload we want to update
     *   }
     * })
     */
    upsert<T extends BibleTranslationDownloadUpsertArgs>(args: SelectSubset<T, BibleTranslationDownloadUpsertArgs<ExtArgs>>): Prisma__BibleTranslationDownloadClient<$Result.GetResult<Prisma.$BibleTranslationDownloadPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of BibleTranslationDownloads.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleTranslationDownloadCountArgs} args - Arguments to filter BibleTranslationDownloads to count.
     * @example
     * // Count the number of BibleTranslationDownloads
     * const count = await prisma.bibleTranslationDownload.count({
     *   where: {
     *     // ... the filter for the BibleTranslationDownloads we want to count
     *   }
     * })
    **/
    count<T extends BibleTranslationDownloadCountArgs>(
      args?: Subset<T, BibleTranslationDownloadCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], BibleTranslationDownloadCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a BibleTranslationDownload.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleTranslationDownloadAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends BibleTranslationDownloadAggregateArgs>(args: Subset<T, BibleTranslationDownloadAggregateArgs>): Prisma.PrismaPromise<GetBibleTranslationDownloadAggregateType<T>>

    /**
     * Group by BibleTranslationDownload.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleTranslationDownloadGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends BibleTranslationDownloadGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: BibleTranslationDownloadGroupByArgs['orderBy'] }
        : { orderBy?: BibleTranslationDownloadGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, BibleTranslationDownloadGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetBibleTranslationDownloadGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the BibleTranslationDownload model
   */
  readonly fields: BibleTranslationDownloadFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for BibleTranslationDownload.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__BibleTranslationDownloadClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the BibleTranslationDownload model
   */
  interface BibleTranslationDownloadFieldRefs {
    readonly id: FieldRef<"BibleTranslationDownload", 'String'>
    readonly translation: FieldRef<"BibleTranslationDownload", 'String'>
    readonly name: FieldRef<"BibleTranslationDownload", 'String'>
    readonly language: FieldRef<"BibleTranslationDownload", 'String'>
    readonly status: FieldRef<"BibleTranslationDownload", 'String'>
    readonly progress: FieldRef<"BibleTranslationDownload", 'Int'>
    readonly bookCount: FieldRef<"BibleTranslationDownload", 'Int'>
    readonly verseCount: FieldRef<"BibleTranslationDownload", 'Int'>
    readonly errorMessage: FieldRef<"BibleTranslationDownload", 'String'>
    readonly createdAt: FieldRef<"BibleTranslationDownload", 'DateTime'>
    readonly updatedAt: FieldRef<"BibleTranslationDownload", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * BibleTranslationDownload findUnique
   */
  export type BibleTranslationDownloadFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleTranslationDownload
     */
    select?: BibleTranslationDownloadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleTranslationDownload
     */
    omit?: BibleTranslationDownloadOmit<ExtArgs> | null
    /**
     * Filter, which BibleTranslationDownload to fetch.
     */
    where: BibleTranslationDownloadWhereUniqueInput
  }

  /**
   * BibleTranslationDownload findUniqueOrThrow
   */
  export type BibleTranslationDownloadFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleTranslationDownload
     */
    select?: BibleTranslationDownloadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleTranslationDownload
     */
    omit?: BibleTranslationDownloadOmit<ExtArgs> | null
    /**
     * Filter, which BibleTranslationDownload to fetch.
     */
    where: BibleTranslationDownloadWhereUniqueInput
  }

  /**
   * BibleTranslationDownload findFirst
   */
  export type BibleTranslationDownloadFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleTranslationDownload
     */
    select?: BibleTranslationDownloadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleTranslationDownload
     */
    omit?: BibleTranslationDownloadOmit<ExtArgs> | null
    /**
     * Filter, which BibleTranslationDownload to fetch.
     */
    where?: BibleTranslationDownloadWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BibleTranslationDownloads to fetch.
     */
    orderBy?: BibleTranslationDownloadOrderByWithRelationInput | BibleTranslationDownloadOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for BibleTranslationDownloads.
     */
    cursor?: BibleTranslationDownloadWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BibleTranslationDownloads from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BibleTranslationDownloads.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of BibleTranslationDownloads.
     */
    distinct?: BibleTranslationDownloadScalarFieldEnum | BibleTranslationDownloadScalarFieldEnum[]
  }

  /**
   * BibleTranslationDownload findFirstOrThrow
   */
  export type BibleTranslationDownloadFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleTranslationDownload
     */
    select?: BibleTranslationDownloadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleTranslationDownload
     */
    omit?: BibleTranslationDownloadOmit<ExtArgs> | null
    /**
     * Filter, which BibleTranslationDownload to fetch.
     */
    where?: BibleTranslationDownloadWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BibleTranslationDownloads to fetch.
     */
    orderBy?: BibleTranslationDownloadOrderByWithRelationInput | BibleTranslationDownloadOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for BibleTranslationDownloads.
     */
    cursor?: BibleTranslationDownloadWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BibleTranslationDownloads from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BibleTranslationDownloads.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of BibleTranslationDownloads.
     */
    distinct?: BibleTranslationDownloadScalarFieldEnum | BibleTranslationDownloadScalarFieldEnum[]
  }

  /**
   * BibleTranslationDownload findMany
   */
  export type BibleTranslationDownloadFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleTranslationDownload
     */
    select?: BibleTranslationDownloadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleTranslationDownload
     */
    omit?: BibleTranslationDownloadOmit<ExtArgs> | null
    /**
     * Filter, which BibleTranslationDownloads to fetch.
     */
    where?: BibleTranslationDownloadWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BibleTranslationDownloads to fetch.
     */
    orderBy?: BibleTranslationDownloadOrderByWithRelationInput | BibleTranslationDownloadOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing BibleTranslationDownloads.
     */
    cursor?: BibleTranslationDownloadWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BibleTranslationDownloads from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BibleTranslationDownloads.
     */
    skip?: number
    distinct?: BibleTranslationDownloadScalarFieldEnum | BibleTranslationDownloadScalarFieldEnum[]
  }

  /**
   * BibleTranslationDownload create
   */
  export type BibleTranslationDownloadCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleTranslationDownload
     */
    select?: BibleTranslationDownloadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleTranslationDownload
     */
    omit?: BibleTranslationDownloadOmit<ExtArgs> | null
    /**
     * The data needed to create a BibleTranslationDownload.
     */
    data: XOR<BibleTranslationDownloadCreateInput, BibleTranslationDownloadUncheckedCreateInput>
  }

  /**
   * BibleTranslationDownload createMany
   */
  export type BibleTranslationDownloadCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many BibleTranslationDownloads.
     */
    data: BibleTranslationDownloadCreateManyInput | BibleTranslationDownloadCreateManyInput[]
  }

  /**
   * BibleTranslationDownload createManyAndReturn
   */
  export type BibleTranslationDownloadCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleTranslationDownload
     */
    select?: BibleTranslationDownloadSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the BibleTranslationDownload
     */
    omit?: BibleTranslationDownloadOmit<ExtArgs> | null
    /**
     * The data used to create many BibleTranslationDownloads.
     */
    data: BibleTranslationDownloadCreateManyInput | BibleTranslationDownloadCreateManyInput[]
  }

  /**
   * BibleTranslationDownload update
   */
  export type BibleTranslationDownloadUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleTranslationDownload
     */
    select?: BibleTranslationDownloadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleTranslationDownload
     */
    omit?: BibleTranslationDownloadOmit<ExtArgs> | null
    /**
     * The data needed to update a BibleTranslationDownload.
     */
    data: XOR<BibleTranslationDownloadUpdateInput, BibleTranslationDownloadUncheckedUpdateInput>
    /**
     * Choose, which BibleTranslationDownload to update.
     */
    where: BibleTranslationDownloadWhereUniqueInput
  }

  /**
   * BibleTranslationDownload updateMany
   */
  export type BibleTranslationDownloadUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update BibleTranslationDownloads.
     */
    data: XOR<BibleTranslationDownloadUpdateManyMutationInput, BibleTranslationDownloadUncheckedUpdateManyInput>
    /**
     * Filter which BibleTranslationDownloads to update
     */
    where?: BibleTranslationDownloadWhereInput
    /**
     * Limit how many BibleTranslationDownloads to update.
     */
    limit?: number
  }

  /**
   * BibleTranslationDownload updateManyAndReturn
   */
  export type BibleTranslationDownloadUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleTranslationDownload
     */
    select?: BibleTranslationDownloadSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the BibleTranslationDownload
     */
    omit?: BibleTranslationDownloadOmit<ExtArgs> | null
    /**
     * The data used to update BibleTranslationDownloads.
     */
    data: XOR<BibleTranslationDownloadUpdateManyMutationInput, BibleTranslationDownloadUncheckedUpdateManyInput>
    /**
     * Filter which BibleTranslationDownloads to update
     */
    where?: BibleTranslationDownloadWhereInput
    /**
     * Limit how many BibleTranslationDownloads to update.
     */
    limit?: number
  }

  /**
   * BibleTranslationDownload upsert
   */
  export type BibleTranslationDownloadUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleTranslationDownload
     */
    select?: BibleTranslationDownloadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleTranslationDownload
     */
    omit?: BibleTranslationDownloadOmit<ExtArgs> | null
    /**
     * The filter to search for the BibleTranslationDownload to update in case it exists.
     */
    where: BibleTranslationDownloadWhereUniqueInput
    /**
     * In case the BibleTranslationDownload found by the `where` argument doesn't exist, create a new BibleTranslationDownload with this data.
     */
    create: XOR<BibleTranslationDownloadCreateInput, BibleTranslationDownloadUncheckedCreateInput>
    /**
     * In case the BibleTranslationDownload was found with the provided `where` argument, update it with this data.
     */
    update: XOR<BibleTranslationDownloadUpdateInput, BibleTranslationDownloadUncheckedUpdateInput>
  }

  /**
   * BibleTranslationDownload delete
   */
  export type BibleTranslationDownloadDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleTranslationDownload
     */
    select?: BibleTranslationDownloadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleTranslationDownload
     */
    omit?: BibleTranslationDownloadOmit<ExtArgs> | null
    /**
     * Filter which BibleTranslationDownload to delete.
     */
    where: BibleTranslationDownloadWhereUniqueInput
  }

  /**
   * BibleTranslationDownload deleteMany
   */
  export type BibleTranslationDownloadDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which BibleTranslationDownloads to delete
     */
    where?: BibleTranslationDownloadWhereInput
    /**
     * Limit how many BibleTranslationDownloads to delete.
     */
    limit?: number
  }

  /**
   * BibleTranslationDownload without action
   */
  export type BibleTranslationDownloadDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleTranslationDownload
     */
    select?: BibleTranslationDownloadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleTranslationDownload
     */
    omit?: BibleTranslationDownloadOmit<ExtArgs> | null
  }


  /**
   * Model BibleChapterCache
   */

  export type AggregateBibleChapterCache = {
    _count: BibleChapterCacheCountAggregateOutputType | null
    _avg: BibleChapterCacheAvgAggregateOutputType | null
    _sum: BibleChapterCacheSumAggregateOutputType | null
    _min: BibleChapterCacheMinAggregateOutputType | null
    _max: BibleChapterCacheMaxAggregateOutputType | null
  }

  export type BibleChapterCacheAvgAggregateOutputType = {
    chapter: number | null
  }

  export type BibleChapterCacheSumAggregateOutputType = {
    chapter: number | null
  }

  export type BibleChapterCacheMinAggregateOutputType = {
    id: string | null
    translation: string | null
    book: string | null
    chapter: number | null
    verses: string | null
    createdAt: Date | null
  }

  export type BibleChapterCacheMaxAggregateOutputType = {
    id: string | null
    translation: string | null
    book: string | null
    chapter: number | null
    verses: string | null
    createdAt: Date | null
  }

  export type BibleChapterCacheCountAggregateOutputType = {
    id: number
    translation: number
    book: number
    chapter: number
    verses: number
    createdAt: number
    _all: number
  }


  export type BibleChapterCacheAvgAggregateInputType = {
    chapter?: true
  }

  export type BibleChapterCacheSumAggregateInputType = {
    chapter?: true
  }

  export type BibleChapterCacheMinAggregateInputType = {
    id?: true
    translation?: true
    book?: true
    chapter?: true
    verses?: true
    createdAt?: true
  }

  export type BibleChapterCacheMaxAggregateInputType = {
    id?: true
    translation?: true
    book?: true
    chapter?: true
    verses?: true
    createdAt?: true
  }

  export type BibleChapterCacheCountAggregateInputType = {
    id?: true
    translation?: true
    book?: true
    chapter?: true
    verses?: true
    createdAt?: true
    _all?: true
  }

  export type BibleChapterCacheAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which BibleChapterCache to aggregate.
     */
    where?: BibleChapterCacheWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BibleChapterCaches to fetch.
     */
    orderBy?: BibleChapterCacheOrderByWithRelationInput | BibleChapterCacheOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: BibleChapterCacheWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BibleChapterCaches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BibleChapterCaches.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned BibleChapterCaches
    **/
    _count?: true | BibleChapterCacheCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: BibleChapterCacheAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: BibleChapterCacheSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: BibleChapterCacheMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: BibleChapterCacheMaxAggregateInputType
  }

  export type GetBibleChapterCacheAggregateType<T extends BibleChapterCacheAggregateArgs> = {
        [P in keyof T & keyof AggregateBibleChapterCache]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateBibleChapterCache[P]>
      : GetScalarType<T[P], AggregateBibleChapterCache[P]>
  }




  export type BibleChapterCacheGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: BibleChapterCacheWhereInput
    orderBy?: BibleChapterCacheOrderByWithAggregationInput | BibleChapterCacheOrderByWithAggregationInput[]
    by: BibleChapterCacheScalarFieldEnum[] | BibleChapterCacheScalarFieldEnum
    having?: BibleChapterCacheScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: BibleChapterCacheCountAggregateInputType | true
    _avg?: BibleChapterCacheAvgAggregateInputType
    _sum?: BibleChapterCacheSumAggregateInputType
    _min?: BibleChapterCacheMinAggregateInputType
    _max?: BibleChapterCacheMaxAggregateInputType
  }

  export type BibleChapterCacheGroupByOutputType = {
    id: string
    translation: string
    book: string
    chapter: number
    verses: string
    createdAt: Date
    _count: BibleChapterCacheCountAggregateOutputType | null
    _avg: BibleChapterCacheAvgAggregateOutputType | null
    _sum: BibleChapterCacheSumAggregateOutputType | null
    _min: BibleChapterCacheMinAggregateOutputType | null
    _max: BibleChapterCacheMaxAggregateOutputType | null
  }

  type GetBibleChapterCacheGroupByPayload<T extends BibleChapterCacheGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<BibleChapterCacheGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof BibleChapterCacheGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], BibleChapterCacheGroupByOutputType[P]>
            : GetScalarType<T[P], BibleChapterCacheGroupByOutputType[P]>
        }
      >
    >


  export type BibleChapterCacheSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    translation?: boolean
    book?: boolean
    chapter?: boolean
    verses?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["bibleChapterCache"]>

  export type BibleChapterCacheSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    translation?: boolean
    book?: boolean
    chapter?: boolean
    verses?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["bibleChapterCache"]>

  export type BibleChapterCacheSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    translation?: boolean
    book?: boolean
    chapter?: boolean
    verses?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["bibleChapterCache"]>

  export type BibleChapterCacheSelectScalar = {
    id?: boolean
    translation?: boolean
    book?: boolean
    chapter?: boolean
    verses?: boolean
    createdAt?: boolean
  }

  export type BibleChapterCacheOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "translation" | "book" | "chapter" | "verses" | "createdAt", ExtArgs["result"]["bibleChapterCache"]>

  export type $BibleChapterCachePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "BibleChapterCache"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      translation: string
      book: string
      chapter: number
      verses: string
      createdAt: Date
    }, ExtArgs["result"]["bibleChapterCache"]>
    composites: {}
  }

  type BibleChapterCacheGetPayload<S extends boolean | null | undefined | BibleChapterCacheDefaultArgs> = $Result.GetResult<Prisma.$BibleChapterCachePayload, S>

  type BibleChapterCacheCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<BibleChapterCacheFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: BibleChapterCacheCountAggregateInputType | true
    }

  export interface BibleChapterCacheDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['BibleChapterCache'], meta: { name: 'BibleChapterCache' } }
    /**
     * Find zero or one BibleChapterCache that matches the filter.
     * @param {BibleChapterCacheFindUniqueArgs} args - Arguments to find a BibleChapterCache
     * @example
     * // Get one BibleChapterCache
     * const bibleChapterCache = await prisma.bibleChapterCache.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends BibleChapterCacheFindUniqueArgs>(args: SelectSubset<T, BibleChapterCacheFindUniqueArgs<ExtArgs>>): Prisma__BibleChapterCacheClient<$Result.GetResult<Prisma.$BibleChapterCachePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one BibleChapterCache that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {BibleChapterCacheFindUniqueOrThrowArgs} args - Arguments to find a BibleChapterCache
     * @example
     * // Get one BibleChapterCache
     * const bibleChapterCache = await prisma.bibleChapterCache.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends BibleChapterCacheFindUniqueOrThrowArgs>(args: SelectSubset<T, BibleChapterCacheFindUniqueOrThrowArgs<ExtArgs>>): Prisma__BibleChapterCacheClient<$Result.GetResult<Prisma.$BibleChapterCachePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first BibleChapterCache that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleChapterCacheFindFirstArgs} args - Arguments to find a BibleChapterCache
     * @example
     * // Get one BibleChapterCache
     * const bibleChapterCache = await prisma.bibleChapterCache.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends BibleChapterCacheFindFirstArgs>(args?: SelectSubset<T, BibleChapterCacheFindFirstArgs<ExtArgs>>): Prisma__BibleChapterCacheClient<$Result.GetResult<Prisma.$BibleChapterCachePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first BibleChapterCache that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleChapterCacheFindFirstOrThrowArgs} args - Arguments to find a BibleChapterCache
     * @example
     * // Get one BibleChapterCache
     * const bibleChapterCache = await prisma.bibleChapterCache.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends BibleChapterCacheFindFirstOrThrowArgs>(args?: SelectSubset<T, BibleChapterCacheFindFirstOrThrowArgs<ExtArgs>>): Prisma__BibleChapterCacheClient<$Result.GetResult<Prisma.$BibleChapterCachePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more BibleChapterCaches that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleChapterCacheFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all BibleChapterCaches
     * const bibleChapterCaches = await prisma.bibleChapterCache.findMany()
     * 
     * // Get first 10 BibleChapterCaches
     * const bibleChapterCaches = await prisma.bibleChapterCache.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const bibleChapterCacheWithIdOnly = await prisma.bibleChapterCache.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends BibleChapterCacheFindManyArgs>(args?: SelectSubset<T, BibleChapterCacheFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BibleChapterCachePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a BibleChapterCache.
     * @param {BibleChapterCacheCreateArgs} args - Arguments to create a BibleChapterCache.
     * @example
     * // Create one BibleChapterCache
     * const BibleChapterCache = await prisma.bibleChapterCache.create({
     *   data: {
     *     // ... data to create a BibleChapterCache
     *   }
     * })
     * 
     */
    create<T extends BibleChapterCacheCreateArgs>(args: SelectSubset<T, BibleChapterCacheCreateArgs<ExtArgs>>): Prisma__BibleChapterCacheClient<$Result.GetResult<Prisma.$BibleChapterCachePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many BibleChapterCaches.
     * @param {BibleChapterCacheCreateManyArgs} args - Arguments to create many BibleChapterCaches.
     * @example
     * // Create many BibleChapterCaches
     * const bibleChapterCache = await prisma.bibleChapterCache.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends BibleChapterCacheCreateManyArgs>(args?: SelectSubset<T, BibleChapterCacheCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many BibleChapterCaches and returns the data saved in the database.
     * @param {BibleChapterCacheCreateManyAndReturnArgs} args - Arguments to create many BibleChapterCaches.
     * @example
     * // Create many BibleChapterCaches
     * const bibleChapterCache = await prisma.bibleChapterCache.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many BibleChapterCaches and only return the `id`
     * const bibleChapterCacheWithIdOnly = await prisma.bibleChapterCache.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends BibleChapterCacheCreateManyAndReturnArgs>(args?: SelectSubset<T, BibleChapterCacheCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BibleChapterCachePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a BibleChapterCache.
     * @param {BibleChapterCacheDeleteArgs} args - Arguments to delete one BibleChapterCache.
     * @example
     * // Delete one BibleChapterCache
     * const BibleChapterCache = await prisma.bibleChapterCache.delete({
     *   where: {
     *     // ... filter to delete one BibleChapterCache
     *   }
     * })
     * 
     */
    delete<T extends BibleChapterCacheDeleteArgs>(args: SelectSubset<T, BibleChapterCacheDeleteArgs<ExtArgs>>): Prisma__BibleChapterCacheClient<$Result.GetResult<Prisma.$BibleChapterCachePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one BibleChapterCache.
     * @param {BibleChapterCacheUpdateArgs} args - Arguments to update one BibleChapterCache.
     * @example
     * // Update one BibleChapterCache
     * const bibleChapterCache = await prisma.bibleChapterCache.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends BibleChapterCacheUpdateArgs>(args: SelectSubset<T, BibleChapterCacheUpdateArgs<ExtArgs>>): Prisma__BibleChapterCacheClient<$Result.GetResult<Prisma.$BibleChapterCachePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more BibleChapterCaches.
     * @param {BibleChapterCacheDeleteManyArgs} args - Arguments to filter BibleChapterCaches to delete.
     * @example
     * // Delete a few BibleChapterCaches
     * const { count } = await prisma.bibleChapterCache.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends BibleChapterCacheDeleteManyArgs>(args?: SelectSubset<T, BibleChapterCacheDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more BibleChapterCaches.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleChapterCacheUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many BibleChapterCaches
     * const bibleChapterCache = await prisma.bibleChapterCache.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends BibleChapterCacheUpdateManyArgs>(args: SelectSubset<T, BibleChapterCacheUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more BibleChapterCaches and returns the data updated in the database.
     * @param {BibleChapterCacheUpdateManyAndReturnArgs} args - Arguments to update many BibleChapterCaches.
     * @example
     * // Update many BibleChapterCaches
     * const bibleChapterCache = await prisma.bibleChapterCache.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more BibleChapterCaches and only return the `id`
     * const bibleChapterCacheWithIdOnly = await prisma.bibleChapterCache.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends BibleChapterCacheUpdateManyAndReturnArgs>(args: SelectSubset<T, BibleChapterCacheUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BibleChapterCachePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one BibleChapterCache.
     * @param {BibleChapterCacheUpsertArgs} args - Arguments to update or create a BibleChapterCache.
     * @example
     * // Update or create a BibleChapterCache
     * const bibleChapterCache = await prisma.bibleChapterCache.upsert({
     *   create: {
     *     // ... data to create a BibleChapterCache
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the BibleChapterCache we want to update
     *   }
     * })
     */
    upsert<T extends BibleChapterCacheUpsertArgs>(args: SelectSubset<T, BibleChapterCacheUpsertArgs<ExtArgs>>): Prisma__BibleChapterCacheClient<$Result.GetResult<Prisma.$BibleChapterCachePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of BibleChapterCaches.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleChapterCacheCountArgs} args - Arguments to filter BibleChapterCaches to count.
     * @example
     * // Count the number of BibleChapterCaches
     * const count = await prisma.bibleChapterCache.count({
     *   where: {
     *     // ... the filter for the BibleChapterCaches we want to count
     *   }
     * })
    **/
    count<T extends BibleChapterCacheCountArgs>(
      args?: Subset<T, BibleChapterCacheCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], BibleChapterCacheCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a BibleChapterCache.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleChapterCacheAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends BibleChapterCacheAggregateArgs>(args: Subset<T, BibleChapterCacheAggregateArgs>): Prisma.PrismaPromise<GetBibleChapterCacheAggregateType<T>>

    /**
     * Group by BibleChapterCache.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BibleChapterCacheGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends BibleChapterCacheGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: BibleChapterCacheGroupByArgs['orderBy'] }
        : { orderBy?: BibleChapterCacheGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, BibleChapterCacheGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetBibleChapterCacheGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the BibleChapterCache model
   */
  readonly fields: BibleChapterCacheFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for BibleChapterCache.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__BibleChapterCacheClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the BibleChapterCache model
   */
  interface BibleChapterCacheFieldRefs {
    readonly id: FieldRef<"BibleChapterCache", 'String'>
    readonly translation: FieldRef<"BibleChapterCache", 'String'>
    readonly book: FieldRef<"BibleChapterCache", 'String'>
    readonly chapter: FieldRef<"BibleChapterCache", 'Int'>
    readonly verses: FieldRef<"BibleChapterCache", 'String'>
    readonly createdAt: FieldRef<"BibleChapterCache", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * BibleChapterCache findUnique
   */
  export type BibleChapterCacheFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleChapterCache
     */
    select?: BibleChapterCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleChapterCache
     */
    omit?: BibleChapterCacheOmit<ExtArgs> | null
    /**
     * Filter, which BibleChapterCache to fetch.
     */
    where: BibleChapterCacheWhereUniqueInput
  }

  /**
   * BibleChapterCache findUniqueOrThrow
   */
  export type BibleChapterCacheFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleChapterCache
     */
    select?: BibleChapterCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleChapterCache
     */
    omit?: BibleChapterCacheOmit<ExtArgs> | null
    /**
     * Filter, which BibleChapterCache to fetch.
     */
    where: BibleChapterCacheWhereUniqueInput
  }

  /**
   * BibleChapterCache findFirst
   */
  export type BibleChapterCacheFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleChapterCache
     */
    select?: BibleChapterCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleChapterCache
     */
    omit?: BibleChapterCacheOmit<ExtArgs> | null
    /**
     * Filter, which BibleChapterCache to fetch.
     */
    where?: BibleChapterCacheWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BibleChapterCaches to fetch.
     */
    orderBy?: BibleChapterCacheOrderByWithRelationInput | BibleChapterCacheOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for BibleChapterCaches.
     */
    cursor?: BibleChapterCacheWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BibleChapterCaches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BibleChapterCaches.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of BibleChapterCaches.
     */
    distinct?: BibleChapterCacheScalarFieldEnum | BibleChapterCacheScalarFieldEnum[]
  }

  /**
   * BibleChapterCache findFirstOrThrow
   */
  export type BibleChapterCacheFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleChapterCache
     */
    select?: BibleChapterCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleChapterCache
     */
    omit?: BibleChapterCacheOmit<ExtArgs> | null
    /**
     * Filter, which BibleChapterCache to fetch.
     */
    where?: BibleChapterCacheWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BibleChapterCaches to fetch.
     */
    orderBy?: BibleChapterCacheOrderByWithRelationInput | BibleChapterCacheOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for BibleChapterCaches.
     */
    cursor?: BibleChapterCacheWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BibleChapterCaches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BibleChapterCaches.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of BibleChapterCaches.
     */
    distinct?: BibleChapterCacheScalarFieldEnum | BibleChapterCacheScalarFieldEnum[]
  }

  /**
   * BibleChapterCache findMany
   */
  export type BibleChapterCacheFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleChapterCache
     */
    select?: BibleChapterCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleChapterCache
     */
    omit?: BibleChapterCacheOmit<ExtArgs> | null
    /**
     * Filter, which BibleChapterCaches to fetch.
     */
    where?: BibleChapterCacheWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of BibleChapterCaches to fetch.
     */
    orderBy?: BibleChapterCacheOrderByWithRelationInput | BibleChapterCacheOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing BibleChapterCaches.
     */
    cursor?: BibleChapterCacheWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` BibleChapterCaches from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` BibleChapterCaches.
     */
    skip?: number
    distinct?: BibleChapterCacheScalarFieldEnum | BibleChapterCacheScalarFieldEnum[]
  }

  /**
   * BibleChapterCache create
   */
  export type BibleChapterCacheCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleChapterCache
     */
    select?: BibleChapterCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleChapterCache
     */
    omit?: BibleChapterCacheOmit<ExtArgs> | null
    /**
     * The data needed to create a BibleChapterCache.
     */
    data: XOR<BibleChapterCacheCreateInput, BibleChapterCacheUncheckedCreateInput>
  }

  /**
   * BibleChapterCache createMany
   */
  export type BibleChapterCacheCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many BibleChapterCaches.
     */
    data: BibleChapterCacheCreateManyInput | BibleChapterCacheCreateManyInput[]
  }

  /**
   * BibleChapterCache createManyAndReturn
   */
  export type BibleChapterCacheCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleChapterCache
     */
    select?: BibleChapterCacheSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the BibleChapterCache
     */
    omit?: BibleChapterCacheOmit<ExtArgs> | null
    /**
     * The data used to create many BibleChapterCaches.
     */
    data: BibleChapterCacheCreateManyInput | BibleChapterCacheCreateManyInput[]
  }

  /**
   * BibleChapterCache update
   */
  export type BibleChapterCacheUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleChapterCache
     */
    select?: BibleChapterCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleChapterCache
     */
    omit?: BibleChapterCacheOmit<ExtArgs> | null
    /**
     * The data needed to update a BibleChapterCache.
     */
    data: XOR<BibleChapterCacheUpdateInput, BibleChapterCacheUncheckedUpdateInput>
    /**
     * Choose, which BibleChapterCache to update.
     */
    where: BibleChapterCacheWhereUniqueInput
  }

  /**
   * BibleChapterCache updateMany
   */
  export type BibleChapterCacheUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update BibleChapterCaches.
     */
    data: XOR<BibleChapterCacheUpdateManyMutationInput, BibleChapterCacheUncheckedUpdateManyInput>
    /**
     * Filter which BibleChapterCaches to update
     */
    where?: BibleChapterCacheWhereInput
    /**
     * Limit how many BibleChapterCaches to update.
     */
    limit?: number
  }

  /**
   * BibleChapterCache updateManyAndReturn
   */
  export type BibleChapterCacheUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleChapterCache
     */
    select?: BibleChapterCacheSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the BibleChapterCache
     */
    omit?: BibleChapterCacheOmit<ExtArgs> | null
    /**
     * The data used to update BibleChapterCaches.
     */
    data: XOR<BibleChapterCacheUpdateManyMutationInput, BibleChapterCacheUncheckedUpdateManyInput>
    /**
     * Filter which BibleChapterCaches to update
     */
    where?: BibleChapterCacheWhereInput
    /**
     * Limit how many BibleChapterCaches to update.
     */
    limit?: number
  }

  /**
   * BibleChapterCache upsert
   */
  export type BibleChapterCacheUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleChapterCache
     */
    select?: BibleChapterCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleChapterCache
     */
    omit?: BibleChapterCacheOmit<ExtArgs> | null
    /**
     * The filter to search for the BibleChapterCache to update in case it exists.
     */
    where: BibleChapterCacheWhereUniqueInput
    /**
     * In case the BibleChapterCache found by the `where` argument doesn't exist, create a new BibleChapterCache with this data.
     */
    create: XOR<BibleChapterCacheCreateInput, BibleChapterCacheUncheckedCreateInput>
    /**
     * In case the BibleChapterCache was found with the provided `where` argument, update it with this data.
     */
    update: XOR<BibleChapterCacheUpdateInput, BibleChapterCacheUncheckedUpdateInput>
  }

  /**
   * BibleChapterCache delete
   */
  export type BibleChapterCacheDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleChapterCache
     */
    select?: BibleChapterCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleChapterCache
     */
    omit?: BibleChapterCacheOmit<ExtArgs> | null
    /**
     * Filter which BibleChapterCache to delete.
     */
    where: BibleChapterCacheWhereUniqueInput
  }

  /**
   * BibleChapterCache deleteMany
   */
  export type BibleChapterCacheDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which BibleChapterCaches to delete
     */
    where?: BibleChapterCacheWhereInput
    /**
     * Limit how many BibleChapterCaches to delete.
     */
    limit?: number
  }

  /**
   * BibleChapterCache without action
   */
  export type BibleChapterCacheDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BibleChapterCache
     */
    select?: BibleChapterCacheSelect<ExtArgs> | null
    /**
     * Omit specific fields from the BibleChapterCache
     */
    omit?: BibleChapterCacheOmit<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const SongScalarFieldEnum: {
    id: 'id',
    title: 'title',
    artist: 'artist',
    lyrics: 'lyrics',
    structured: 'structured',
    category: 'category',
    tags: 'tags',
    keySignature: 'keySignature',
    tempo: 'tempo',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type SongScalarFieldEnum = (typeof SongScalarFieldEnum)[keyof typeof SongScalarFieldEnum]


  export const SermonNoteScalarFieldEnum: {
    id: 'id',
    title: 'title',
    content: 'content',
    outline: 'outline',
    bibleRefs: 'bibleRefs',
    date: 'date',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type SermonNoteScalarFieldEnum = (typeof SermonNoteScalarFieldEnum)[keyof typeof SermonNoteScalarFieldEnum]


  export const PresentationScalarFieldEnum: {
    id: 'id',
    title: 'title',
    slides: 'slides',
    songId: 'songId',
    sermonId: 'sermonId',
    bibleRefs: 'bibleRefs',
    theme: 'theme',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type PresentationScalarFieldEnum = (typeof PresentationScalarFieldEnum)[keyof typeof PresentationScalarFieldEnum]


  export const BibleVerseCacheScalarFieldEnum: {
    id: 'id',
    reference: 'reference',
    translation: 'translation',
    text: 'text',
    book: 'book',
    chapter: 'chapter',
    verseStart: 'verseStart',
    verseEnd: 'verseEnd',
    createdAt: 'createdAt'
  };

  export type BibleVerseCacheScalarFieldEnum = (typeof BibleVerseCacheScalarFieldEnum)[keyof typeof BibleVerseCacheScalarFieldEnum]


  export const BibleTranslationDownloadScalarFieldEnum: {
    id: 'id',
    translation: 'translation',
    name: 'name',
    language: 'language',
    status: 'status',
    progress: 'progress',
    bookCount: 'bookCount',
    verseCount: 'verseCount',
    errorMessage: 'errorMessage',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type BibleTranslationDownloadScalarFieldEnum = (typeof BibleTranslationDownloadScalarFieldEnum)[keyof typeof BibleTranslationDownloadScalarFieldEnum]


  export const BibleChapterCacheScalarFieldEnum: {
    id: 'id',
    translation: 'translation',
    book: 'book',
    chapter: 'chapter',
    verses: 'verses',
    createdAt: 'createdAt'
  };

  export type BibleChapterCacheScalarFieldEnum = (typeof BibleChapterCacheScalarFieldEnum)[keyof typeof BibleChapterCacheScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    
  /**
   * Deep Input Types
   */


  export type SongWhereInput = {
    AND?: SongWhereInput | SongWhereInput[]
    OR?: SongWhereInput[]
    NOT?: SongWhereInput | SongWhereInput[]
    id?: StringFilter<"Song"> | string
    title?: StringFilter<"Song"> | string
    artist?: StringNullableFilter<"Song"> | string | null
    lyrics?: StringFilter<"Song"> | string
    structured?: StringNullableFilter<"Song"> | string | null
    category?: StringFilter<"Song"> | string
    tags?: StringNullableFilter<"Song"> | string | null
    keySignature?: StringNullableFilter<"Song"> | string | null
    tempo?: IntNullableFilter<"Song"> | number | null
    createdAt?: DateTimeFilter<"Song"> | Date | string
    updatedAt?: DateTimeFilter<"Song"> | Date | string
    presentations?: PresentationListRelationFilter
  }

  export type SongOrderByWithRelationInput = {
    id?: SortOrder
    title?: SortOrder
    artist?: SortOrderInput | SortOrder
    lyrics?: SortOrder
    structured?: SortOrderInput | SortOrder
    category?: SortOrder
    tags?: SortOrderInput | SortOrder
    keySignature?: SortOrderInput | SortOrder
    tempo?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    presentations?: PresentationOrderByRelationAggregateInput
  }

  export type SongWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: SongWhereInput | SongWhereInput[]
    OR?: SongWhereInput[]
    NOT?: SongWhereInput | SongWhereInput[]
    title?: StringFilter<"Song"> | string
    artist?: StringNullableFilter<"Song"> | string | null
    lyrics?: StringFilter<"Song"> | string
    structured?: StringNullableFilter<"Song"> | string | null
    category?: StringFilter<"Song"> | string
    tags?: StringNullableFilter<"Song"> | string | null
    keySignature?: StringNullableFilter<"Song"> | string | null
    tempo?: IntNullableFilter<"Song"> | number | null
    createdAt?: DateTimeFilter<"Song"> | Date | string
    updatedAt?: DateTimeFilter<"Song"> | Date | string
    presentations?: PresentationListRelationFilter
  }, "id">

  export type SongOrderByWithAggregationInput = {
    id?: SortOrder
    title?: SortOrder
    artist?: SortOrderInput | SortOrder
    lyrics?: SortOrder
    structured?: SortOrderInput | SortOrder
    category?: SortOrder
    tags?: SortOrderInput | SortOrder
    keySignature?: SortOrderInput | SortOrder
    tempo?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: SongCountOrderByAggregateInput
    _avg?: SongAvgOrderByAggregateInput
    _max?: SongMaxOrderByAggregateInput
    _min?: SongMinOrderByAggregateInput
    _sum?: SongSumOrderByAggregateInput
  }

  export type SongScalarWhereWithAggregatesInput = {
    AND?: SongScalarWhereWithAggregatesInput | SongScalarWhereWithAggregatesInput[]
    OR?: SongScalarWhereWithAggregatesInput[]
    NOT?: SongScalarWhereWithAggregatesInput | SongScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Song"> | string
    title?: StringWithAggregatesFilter<"Song"> | string
    artist?: StringNullableWithAggregatesFilter<"Song"> | string | null
    lyrics?: StringWithAggregatesFilter<"Song"> | string
    structured?: StringNullableWithAggregatesFilter<"Song"> | string | null
    category?: StringWithAggregatesFilter<"Song"> | string
    tags?: StringNullableWithAggregatesFilter<"Song"> | string | null
    keySignature?: StringNullableWithAggregatesFilter<"Song"> | string | null
    tempo?: IntNullableWithAggregatesFilter<"Song"> | number | null
    createdAt?: DateTimeWithAggregatesFilter<"Song"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Song"> | Date | string
  }

  export type SermonNoteWhereInput = {
    AND?: SermonNoteWhereInput | SermonNoteWhereInput[]
    OR?: SermonNoteWhereInput[]
    NOT?: SermonNoteWhereInput | SermonNoteWhereInput[]
    id?: StringFilter<"SermonNote"> | string
    title?: StringFilter<"SermonNote"> | string
    content?: StringFilter<"SermonNote"> | string
    outline?: StringNullableFilter<"SermonNote"> | string | null
    bibleRefs?: StringNullableFilter<"SermonNote"> | string | null
    date?: DateTimeFilter<"SermonNote"> | Date | string
    createdAt?: DateTimeFilter<"SermonNote"> | Date | string
    updatedAt?: DateTimeFilter<"SermonNote"> | Date | string
    presentations?: PresentationListRelationFilter
  }

  export type SermonNoteOrderByWithRelationInput = {
    id?: SortOrder
    title?: SortOrder
    content?: SortOrder
    outline?: SortOrderInput | SortOrder
    bibleRefs?: SortOrderInput | SortOrder
    date?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    presentations?: PresentationOrderByRelationAggregateInput
  }

  export type SermonNoteWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: SermonNoteWhereInput | SermonNoteWhereInput[]
    OR?: SermonNoteWhereInput[]
    NOT?: SermonNoteWhereInput | SermonNoteWhereInput[]
    title?: StringFilter<"SermonNote"> | string
    content?: StringFilter<"SermonNote"> | string
    outline?: StringNullableFilter<"SermonNote"> | string | null
    bibleRefs?: StringNullableFilter<"SermonNote"> | string | null
    date?: DateTimeFilter<"SermonNote"> | Date | string
    createdAt?: DateTimeFilter<"SermonNote"> | Date | string
    updatedAt?: DateTimeFilter<"SermonNote"> | Date | string
    presentations?: PresentationListRelationFilter
  }, "id">

  export type SermonNoteOrderByWithAggregationInput = {
    id?: SortOrder
    title?: SortOrder
    content?: SortOrder
    outline?: SortOrderInput | SortOrder
    bibleRefs?: SortOrderInput | SortOrder
    date?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: SermonNoteCountOrderByAggregateInput
    _max?: SermonNoteMaxOrderByAggregateInput
    _min?: SermonNoteMinOrderByAggregateInput
  }

  export type SermonNoteScalarWhereWithAggregatesInput = {
    AND?: SermonNoteScalarWhereWithAggregatesInput | SermonNoteScalarWhereWithAggregatesInput[]
    OR?: SermonNoteScalarWhereWithAggregatesInput[]
    NOT?: SermonNoteScalarWhereWithAggregatesInput | SermonNoteScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"SermonNote"> | string
    title?: StringWithAggregatesFilter<"SermonNote"> | string
    content?: StringWithAggregatesFilter<"SermonNote"> | string
    outline?: StringNullableWithAggregatesFilter<"SermonNote"> | string | null
    bibleRefs?: StringNullableWithAggregatesFilter<"SermonNote"> | string | null
    date?: DateTimeWithAggregatesFilter<"SermonNote"> | Date | string
    createdAt?: DateTimeWithAggregatesFilter<"SermonNote"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"SermonNote"> | Date | string
  }

  export type PresentationWhereInput = {
    AND?: PresentationWhereInput | PresentationWhereInput[]
    OR?: PresentationWhereInput[]
    NOT?: PresentationWhereInput | PresentationWhereInput[]
    id?: StringFilter<"Presentation"> | string
    title?: StringFilter<"Presentation"> | string
    slides?: StringFilter<"Presentation"> | string
    songId?: StringNullableFilter<"Presentation"> | string | null
    sermonId?: StringNullableFilter<"Presentation"> | string | null
    bibleRefs?: StringNullableFilter<"Presentation"> | string | null
    theme?: StringFilter<"Presentation"> | string
    createdAt?: DateTimeFilter<"Presentation"> | Date | string
    updatedAt?: DateTimeFilter<"Presentation"> | Date | string
    song?: XOR<SongNullableScalarRelationFilter, SongWhereInput> | null
    sermon?: XOR<SermonNoteNullableScalarRelationFilter, SermonNoteWhereInput> | null
  }

  export type PresentationOrderByWithRelationInput = {
    id?: SortOrder
    title?: SortOrder
    slides?: SortOrder
    songId?: SortOrderInput | SortOrder
    sermonId?: SortOrderInput | SortOrder
    bibleRefs?: SortOrderInput | SortOrder
    theme?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    song?: SongOrderByWithRelationInput
    sermon?: SermonNoteOrderByWithRelationInput
  }

  export type PresentationWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: PresentationWhereInput | PresentationWhereInput[]
    OR?: PresentationWhereInput[]
    NOT?: PresentationWhereInput | PresentationWhereInput[]
    title?: StringFilter<"Presentation"> | string
    slides?: StringFilter<"Presentation"> | string
    songId?: StringNullableFilter<"Presentation"> | string | null
    sermonId?: StringNullableFilter<"Presentation"> | string | null
    bibleRefs?: StringNullableFilter<"Presentation"> | string | null
    theme?: StringFilter<"Presentation"> | string
    createdAt?: DateTimeFilter<"Presentation"> | Date | string
    updatedAt?: DateTimeFilter<"Presentation"> | Date | string
    song?: XOR<SongNullableScalarRelationFilter, SongWhereInput> | null
    sermon?: XOR<SermonNoteNullableScalarRelationFilter, SermonNoteWhereInput> | null
  }, "id">

  export type PresentationOrderByWithAggregationInput = {
    id?: SortOrder
    title?: SortOrder
    slides?: SortOrder
    songId?: SortOrderInput | SortOrder
    sermonId?: SortOrderInput | SortOrder
    bibleRefs?: SortOrderInput | SortOrder
    theme?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: PresentationCountOrderByAggregateInput
    _max?: PresentationMaxOrderByAggregateInput
    _min?: PresentationMinOrderByAggregateInput
  }

  export type PresentationScalarWhereWithAggregatesInput = {
    AND?: PresentationScalarWhereWithAggregatesInput | PresentationScalarWhereWithAggregatesInput[]
    OR?: PresentationScalarWhereWithAggregatesInput[]
    NOT?: PresentationScalarWhereWithAggregatesInput | PresentationScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Presentation"> | string
    title?: StringWithAggregatesFilter<"Presentation"> | string
    slides?: StringWithAggregatesFilter<"Presentation"> | string
    songId?: StringNullableWithAggregatesFilter<"Presentation"> | string | null
    sermonId?: StringNullableWithAggregatesFilter<"Presentation"> | string | null
    bibleRefs?: StringNullableWithAggregatesFilter<"Presentation"> | string | null
    theme?: StringWithAggregatesFilter<"Presentation"> | string
    createdAt?: DateTimeWithAggregatesFilter<"Presentation"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Presentation"> | Date | string
  }

  export type BibleVerseCacheWhereInput = {
    AND?: BibleVerseCacheWhereInput | BibleVerseCacheWhereInput[]
    OR?: BibleVerseCacheWhereInput[]
    NOT?: BibleVerseCacheWhereInput | BibleVerseCacheWhereInput[]
    id?: StringFilter<"BibleVerseCache"> | string
    reference?: StringFilter<"BibleVerseCache"> | string
    translation?: StringFilter<"BibleVerseCache"> | string
    text?: StringFilter<"BibleVerseCache"> | string
    book?: StringFilter<"BibleVerseCache"> | string
    chapter?: IntFilter<"BibleVerseCache"> | number
    verseStart?: IntFilter<"BibleVerseCache"> | number
    verseEnd?: IntNullableFilter<"BibleVerseCache"> | number | null
    createdAt?: DateTimeFilter<"BibleVerseCache"> | Date | string
  }

  export type BibleVerseCacheOrderByWithRelationInput = {
    id?: SortOrder
    reference?: SortOrder
    translation?: SortOrder
    text?: SortOrder
    book?: SortOrder
    chapter?: SortOrder
    verseStart?: SortOrder
    verseEnd?: SortOrderInput | SortOrder
    createdAt?: SortOrder
  }

  export type BibleVerseCacheWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    reference_translation?: BibleVerseCacheReferenceTranslationCompoundUniqueInput
    AND?: BibleVerseCacheWhereInput | BibleVerseCacheWhereInput[]
    OR?: BibleVerseCacheWhereInput[]
    NOT?: BibleVerseCacheWhereInput | BibleVerseCacheWhereInput[]
    reference?: StringFilter<"BibleVerseCache"> | string
    translation?: StringFilter<"BibleVerseCache"> | string
    text?: StringFilter<"BibleVerseCache"> | string
    book?: StringFilter<"BibleVerseCache"> | string
    chapter?: IntFilter<"BibleVerseCache"> | number
    verseStart?: IntFilter<"BibleVerseCache"> | number
    verseEnd?: IntNullableFilter<"BibleVerseCache"> | number | null
    createdAt?: DateTimeFilter<"BibleVerseCache"> | Date | string
  }, "id" | "reference_translation">

  export type BibleVerseCacheOrderByWithAggregationInput = {
    id?: SortOrder
    reference?: SortOrder
    translation?: SortOrder
    text?: SortOrder
    book?: SortOrder
    chapter?: SortOrder
    verseStart?: SortOrder
    verseEnd?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    _count?: BibleVerseCacheCountOrderByAggregateInput
    _avg?: BibleVerseCacheAvgOrderByAggregateInput
    _max?: BibleVerseCacheMaxOrderByAggregateInput
    _min?: BibleVerseCacheMinOrderByAggregateInput
    _sum?: BibleVerseCacheSumOrderByAggregateInput
  }

  export type BibleVerseCacheScalarWhereWithAggregatesInput = {
    AND?: BibleVerseCacheScalarWhereWithAggregatesInput | BibleVerseCacheScalarWhereWithAggregatesInput[]
    OR?: BibleVerseCacheScalarWhereWithAggregatesInput[]
    NOT?: BibleVerseCacheScalarWhereWithAggregatesInput | BibleVerseCacheScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"BibleVerseCache"> | string
    reference?: StringWithAggregatesFilter<"BibleVerseCache"> | string
    translation?: StringWithAggregatesFilter<"BibleVerseCache"> | string
    text?: StringWithAggregatesFilter<"BibleVerseCache"> | string
    book?: StringWithAggregatesFilter<"BibleVerseCache"> | string
    chapter?: IntWithAggregatesFilter<"BibleVerseCache"> | number
    verseStart?: IntWithAggregatesFilter<"BibleVerseCache"> | number
    verseEnd?: IntNullableWithAggregatesFilter<"BibleVerseCache"> | number | null
    createdAt?: DateTimeWithAggregatesFilter<"BibleVerseCache"> | Date | string
  }

  export type BibleTranslationDownloadWhereInput = {
    AND?: BibleTranslationDownloadWhereInput | BibleTranslationDownloadWhereInput[]
    OR?: BibleTranslationDownloadWhereInput[]
    NOT?: BibleTranslationDownloadWhereInput | BibleTranslationDownloadWhereInput[]
    id?: StringFilter<"BibleTranslationDownload"> | string
    translation?: StringFilter<"BibleTranslationDownload"> | string
    name?: StringFilter<"BibleTranslationDownload"> | string
    language?: StringFilter<"BibleTranslationDownload"> | string
    status?: StringFilter<"BibleTranslationDownload"> | string
    progress?: IntFilter<"BibleTranslationDownload"> | number
    bookCount?: IntFilter<"BibleTranslationDownload"> | number
    verseCount?: IntFilter<"BibleTranslationDownload"> | number
    errorMessage?: StringNullableFilter<"BibleTranslationDownload"> | string | null
    createdAt?: DateTimeFilter<"BibleTranslationDownload"> | Date | string
    updatedAt?: DateTimeFilter<"BibleTranslationDownload"> | Date | string
  }

  export type BibleTranslationDownloadOrderByWithRelationInput = {
    id?: SortOrder
    translation?: SortOrder
    name?: SortOrder
    language?: SortOrder
    status?: SortOrder
    progress?: SortOrder
    bookCount?: SortOrder
    verseCount?: SortOrder
    errorMessage?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type BibleTranslationDownloadWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    translation?: string
    AND?: BibleTranslationDownloadWhereInput | BibleTranslationDownloadWhereInput[]
    OR?: BibleTranslationDownloadWhereInput[]
    NOT?: BibleTranslationDownloadWhereInput | BibleTranslationDownloadWhereInput[]
    name?: StringFilter<"BibleTranslationDownload"> | string
    language?: StringFilter<"BibleTranslationDownload"> | string
    status?: StringFilter<"BibleTranslationDownload"> | string
    progress?: IntFilter<"BibleTranslationDownload"> | number
    bookCount?: IntFilter<"BibleTranslationDownload"> | number
    verseCount?: IntFilter<"BibleTranslationDownload"> | number
    errorMessage?: StringNullableFilter<"BibleTranslationDownload"> | string | null
    createdAt?: DateTimeFilter<"BibleTranslationDownload"> | Date | string
    updatedAt?: DateTimeFilter<"BibleTranslationDownload"> | Date | string
  }, "id" | "translation">

  export type BibleTranslationDownloadOrderByWithAggregationInput = {
    id?: SortOrder
    translation?: SortOrder
    name?: SortOrder
    language?: SortOrder
    status?: SortOrder
    progress?: SortOrder
    bookCount?: SortOrder
    verseCount?: SortOrder
    errorMessage?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: BibleTranslationDownloadCountOrderByAggregateInput
    _avg?: BibleTranslationDownloadAvgOrderByAggregateInput
    _max?: BibleTranslationDownloadMaxOrderByAggregateInput
    _min?: BibleTranslationDownloadMinOrderByAggregateInput
    _sum?: BibleTranslationDownloadSumOrderByAggregateInput
  }

  export type BibleTranslationDownloadScalarWhereWithAggregatesInput = {
    AND?: BibleTranslationDownloadScalarWhereWithAggregatesInput | BibleTranslationDownloadScalarWhereWithAggregatesInput[]
    OR?: BibleTranslationDownloadScalarWhereWithAggregatesInput[]
    NOT?: BibleTranslationDownloadScalarWhereWithAggregatesInput | BibleTranslationDownloadScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"BibleTranslationDownload"> | string
    translation?: StringWithAggregatesFilter<"BibleTranslationDownload"> | string
    name?: StringWithAggregatesFilter<"BibleTranslationDownload"> | string
    language?: StringWithAggregatesFilter<"BibleTranslationDownload"> | string
    status?: StringWithAggregatesFilter<"BibleTranslationDownload"> | string
    progress?: IntWithAggregatesFilter<"BibleTranslationDownload"> | number
    bookCount?: IntWithAggregatesFilter<"BibleTranslationDownload"> | number
    verseCount?: IntWithAggregatesFilter<"BibleTranslationDownload"> | number
    errorMessage?: StringNullableWithAggregatesFilter<"BibleTranslationDownload"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"BibleTranslationDownload"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"BibleTranslationDownload"> | Date | string
  }

  export type BibleChapterCacheWhereInput = {
    AND?: BibleChapterCacheWhereInput | BibleChapterCacheWhereInput[]
    OR?: BibleChapterCacheWhereInput[]
    NOT?: BibleChapterCacheWhereInput | BibleChapterCacheWhereInput[]
    id?: StringFilter<"BibleChapterCache"> | string
    translation?: StringFilter<"BibleChapterCache"> | string
    book?: StringFilter<"BibleChapterCache"> | string
    chapter?: IntFilter<"BibleChapterCache"> | number
    verses?: StringFilter<"BibleChapterCache"> | string
    createdAt?: DateTimeFilter<"BibleChapterCache"> | Date | string
  }

  export type BibleChapterCacheOrderByWithRelationInput = {
    id?: SortOrder
    translation?: SortOrder
    book?: SortOrder
    chapter?: SortOrder
    verses?: SortOrder
    createdAt?: SortOrder
  }

  export type BibleChapterCacheWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    translation_book_chapter?: BibleChapterCacheTranslationBookChapterCompoundUniqueInput
    AND?: BibleChapterCacheWhereInput | BibleChapterCacheWhereInput[]
    OR?: BibleChapterCacheWhereInput[]
    NOT?: BibleChapterCacheWhereInput | BibleChapterCacheWhereInput[]
    translation?: StringFilter<"BibleChapterCache"> | string
    book?: StringFilter<"BibleChapterCache"> | string
    chapter?: IntFilter<"BibleChapterCache"> | number
    verses?: StringFilter<"BibleChapterCache"> | string
    createdAt?: DateTimeFilter<"BibleChapterCache"> | Date | string
  }, "id" | "translation_book_chapter">

  export type BibleChapterCacheOrderByWithAggregationInput = {
    id?: SortOrder
    translation?: SortOrder
    book?: SortOrder
    chapter?: SortOrder
    verses?: SortOrder
    createdAt?: SortOrder
    _count?: BibleChapterCacheCountOrderByAggregateInput
    _avg?: BibleChapterCacheAvgOrderByAggregateInput
    _max?: BibleChapterCacheMaxOrderByAggregateInput
    _min?: BibleChapterCacheMinOrderByAggregateInput
    _sum?: BibleChapterCacheSumOrderByAggregateInput
  }

  export type BibleChapterCacheScalarWhereWithAggregatesInput = {
    AND?: BibleChapterCacheScalarWhereWithAggregatesInput | BibleChapterCacheScalarWhereWithAggregatesInput[]
    OR?: BibleChapterCacheScalarWhereWithAggregatesInput[]
    NOT?: BibleChapterCacheScalarWhereWithAggregatesInput | BibleChapterCacheScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"BibleChapterCache"> | string
    translation?: StringWithAggregatesFilter<"BibleChapterCache"> | string
    book?: StringWithAggregatesFilter<"BibleChapterCache"> | string
    chapter?: IntWithAggregatesFilter<"BibleChapterCache"> | number
    verses?: StringWithAggregatesFilter<"BibleChapterCache"> | string
    createdAt?: DateTimeWithAggregatesFilter<"BibleChapterCache"> | Date | string
  }

  export type SongCreateInput = {
    id?: string
    title: string
    artist?: string | null
    lyrics: string
    structured?: string | null
    category?: string
    tags?: string | null
    keySignature?: string | null
    tempo?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    presentations?: PresentationCreateNestedManyWithoutSongInput
  }

  export type SongUncheckedCreateInput = {
    id?: string
    title: string
    artist?: string | null
    lyrics: string
    structured?: string | null
    category?: string
    tags?: string | null
    keySignature?: string | null
    tempo?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    presentations?: PresentationUncheckedCreateNestedManyWithoutSongInput
  }

  export type SongUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    artist?: NullableStringFieldUpdateOperationsInput | string | null
    lyrics?: StringFieldUpdateOperationsInput | string
    structured?: NullableStringFieldUpdateOperationsInput | string | null
    category?: StringFieldUpdateOperationsInput | string
    tags?: NullableStringFieldUpdateOperationsInput | string | null
    keySignature?: NullableStringFieldUpdateOperationsInput | string | null
    tempo?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    presentations?: PresentationUpdateManyWithoutSongNestedInput
  }

  export type SongUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    artist?: NullableStringFieldUpdateOperationsInput | string | null
    lyrics?: StringFieldUpdateOperationsInput | string
    structured?: NullableStringFieldUpdateOperationsInput | string | null
    category?: StringFieldUpdateOperationsInput | string
    tags?: NullableStringFieldUpdateOperationsInput | string | null
    keySignature?: NullableStringFieldUpdateOperationsInput | string | null
    tempo?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    presentations?: PresentationUncheckedUpdateManyWithoutSongNestedInput
  }

  export type SongCreateManyInput = {
    id?: string
    title: string
    artist?: string | null
    lyrics: string
    structured?: string | null
    category?: string
    tags?: string | null
    keySignature?: string | null
    tempo?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SongUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    artist?: NullableStringFieldUpdateOperationsInput | string | null
    lyrics?: StringFieldUpdateOperationsInput | string
    structured?: NullableStringFieldUpdateOperationsInput | string | null
    category?: StringFieldUpdateOperationsInput | string
    tags?: NullableStringFieldUpdateOperationsInput | string | null
    keySignature?: NullableStringFieldUpdateOperationsInput | string | null
    tempo?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SongUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    artist?: NullableStringFieldUpdateOperationsInput | string | null
    lyrics?: StringFieldUpdateOperationsInput | string
    structured?: NullableStringFieldUpdateOperationsInput | string | null
    category?: StringFieldUpdateOperationsInput | string
    tags?: NullableStringFieldUpdateOperationsInput | string | null
    keySignature?: NullableStringFieldUpdateOperationsInput | string | null
    tempo?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SermonNoteCreateInput = {
    id?: string
    title: string
    content: string
    outline?: string | null
    bibleRefs?: string | null
    date?: Date | string
    createdAt?: Date | string
    updatedAt?: Date | string
    presentations?: PresentationCreateNestedManyWithoutSermonInput
  }

  export type SermonNoteUncheckedCreateInput = {
    id?: string
    title: string
    content: string
    outline?: string | null
    bibleRefs?: string | null
    date?: Date | string
    createdAt?: Date | string
    updatedAt?: Date | string
    presentations?: PresentationUncheckedCreateNestedManyWithoutSermonInput
  }

  export type SermonNoteUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    outline?: NullableStringFieldUpdateOperationsInput | string | null
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    presentations?: PresentationUpdateManyWithoutSermonNestedInput
  }

  export type SermonNoteUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    outline?: NullableStringFieldUpdateOperationsInput | string | null
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    presentations?: PresentationUncheckedUpdateManyWithoutSermonNestedInput
  }

  export type SermonNoteCreateManyInput = {
    id?: string
    title: string
    content: string
    outline?: string | null
    bibleRefs?: string | null
    date?: Date | string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SermonNoteUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    outline?: NullableStringFieldUpdateOperationsInput | string | null
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SermonNoteUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    outline?: NullableStringFieldUpdateOperationsInput | string | null
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PresentationCreateInput = {
    id?: string
    title: string
    slides: string
    bibleRefs?: string | null
    theme?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    song?: SongCreateNestedOneWithoutPresentationsInput
    sermon?: SermonNoteCreateNestedOneWithoutPresentationsInput
  }

  export type PresentationUncheckedCreateInput = {
    id?: string
    title: string
    slides: string
    songId?: string | null
    sermonId?: string | null
    bibleRefs?: string | null
    theme?: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PresentationUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    slides?: StringFieldUpdateOperationsInput | string
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    theme?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    song?: SongUpdateOneWithoutPresentationsNestedInput
    sermon?: SermonNoteUpdateOneWithoutPresentationsNestedInput
  }

  export type PresentationUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    slides?: StringFieldUpdateOperationsInput | string
    songId?: NullableStringFieldUpdateOperationsInput | string | null
    sermonId?: NullableStringFieldUpdateOperationsInput | string | null
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    theme?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PresentationCreateManyInput = {
    id?: string
    title: string
    slides: string
    songId?: string | null
    sermonId?: string | null
    bibleRefs?: string | null
    theme?: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PresentationUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    slides?: StringFieldUpdateOperationsInput | string
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    theme?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PresentationUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    slides?: StringFieldUpdateOperationsInput | string
    songId?: NullableStringFieldUpdateOperationsInput | string | null
    sermonId?: NullableStringFieldUpdateOperationsInput | string | null
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    theme?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BibleVerseCacheCreateInput = {
    id?: string
    reference: string
    translation: string
    text: string
    book: string
    chapter: number
    verseStart: number
    verseEnd?: number | null
    createdAt?: Date | string
  }

  export type BibleVerseCacheUncheckedCreateInput = {
    id?: string
    reference: string
    translation: string
    text: string
    book: string
    chapter: number
    verseStart: number
    verseEnd?: number | null
    createdAt?: Date | string
  }

  export type BibleVerseCacheUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    reference?: StringFieldUpdateOperationsInput | string
    translation?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    book?: StringFieldUpdateOperationsInput | string
    chapter?: IntFieldUpdateOperationsInput | number
    verseStart?: IntFieldUpdateOperationsInput | number
    verseEnd?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BibleVerseCacheUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    reference?: StringFieldUpdateOperationsInput | string
    translation?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    book?: StringFieldUpdateOperationsInput | string
    chapter?: IntFieldUpdateOperationsInput | number
    verseStart?: IntFieldUpdateOperationsInput | number
    verseEnd?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BibleVerseCacheCreateManyInput = {
    id?: string
    reference: string
    translation: string
    text: string
    book: string
    chapter: number
    verseStart: number
    verseEnd?: number | null
    createdAt?: Date | string
  }

  export type BibleVerseCacheUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    reference?: StringFieldUpdateOperationsInput | string
    translation?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    book?: StringFieldUpdateOperationsInput | string
    chapter?: IntFieldUpdateOperationsInput | number
    verseStart?: IntFieldUpdateOperationsInput | number
    verseEnd?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BibleVerseCacheUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    reference?: StringFieldUpdateOperationsInput | string
    translation?: StringFieldUpdateOperationsInput | string
    text?: StringFieldUpdateOperationsInput | string
    book?: StringFieldUpdateOperationsInput | string
    chapter?: IntFieldUpdateOperationsInput | number
    verseStart?: IntFieldUpdateOperationsInput | number
    verseEnd?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BibleTranslationDownloadCreateInput = {
    id?: string
    translation: string
    name: string
    language?: string
    status?: string
    progress?: number
    bookCount?: number
    verseCount?: number
    errorMessage?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type BibleTranslationDownloadUncheckedCreateInput = {
    id?: string
    translation: string
    name: string
    language?: string
    status?: string
    progress?: number
    bookCount?: number
    verseCount?: number
    errorMessage?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type BibleTranslationDownloadUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    translation?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    language?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    progress?: IntFieldUpdateOperationsInput | number
    bookCount?: IntFieldUpdateOperationsInput | number
    verseCount?: IntFieldUpdateOperationsInput | number
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BibleTranslationDownloadUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    translation?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    language?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    progress?: IntFieldUpdateOperationsInput | number
    bookCount?: IntFieldUpdateOperationsInput | number
    verseCount?: IntFieldUpdateOperationsInput | number
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BibleTranslationDownloadCreateManyInput = {
    id?: string
    translation: string
    name: string
    language?: string
    status?: string
    progress?: number
    bookCount?: number
    verseCount?: number
    errorMessage?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type BibleTranslationDownloadUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    translation?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    language?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    progress?: IntFieldUpdateOperationsInput | number
    bookCount?: IntFieldUpdateOperationsInput | number
    verseCount?: IntFieldUpdateOperationsInput | number
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BibleTranslationDownloadUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    translation?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    language?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    progress?: IntFieldUpdateOperationsInput | number
    bookCount?: IntFieldUpdateOperationsInput | number
    verseCount?: IntFieldUpdateOperationsInput | number
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BibleChapterCacheCreateInput = {
    id?: string
    translation: string
    book: string
    chapter: number
    verses: string
    createdAt?: Date | string
  }

  export type BibleChapterCacheUncheckedCreateInput = {
    id?: string
    translation: string
    book: string
    chapter: number
    verses: string
    createdAt?: Date | string
  }

  export type BibleChapterCacheUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    translation?: StringFieldUpdateOperationsInput | string
    book?: StringFieldUpdateOperationsInput | string
    chapter?: IntFieldUpdateOperationsInput | number
    verses?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BibleChapterCacheUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    translation?: StringFieldUpdateOperationsInput | string
    book?: StringFieldUpdateOperationsInput | string
    chapter?: IntFieldUpdateOperationsInput | number
    verses?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BibleChapterCacheCreateManyInput = {
    id?: string
    translation: string
    book: string
    chapter: number
    verses: string
    createdAt?: Date | string
  }

  export type BibleChapterCacheUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    translation?: StringFieldUpdateOperationsInput | string
    book?: StringFieldUpdateOperationsInput | string
    chapter?: IntFieldUpdateOperationsInput | number
    verses?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BibleChapterCacheUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    translation?: StringFieldUpdateOperationsInput | string
    book?: StringFieldUpdateOperationsInput | string
    chapter?: IntFieldUpdateOperationsInput | number
    verses?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type PresentationListRelationFilter = {
    every?: PresentationWhereInput
    some?: PresentationWhereInput
    none?: PresentationWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type PresentationOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SongCountOrderByAggregateInput = {
    id?: SortOrder
    title?: SortOrder
    artist?: SortOrder
    lyrics?: SortOrder
    structured?: SortOrder
    category?: SortOrder
    tags?: SortOrder
    keySignature?: SortOrder
    tempo?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SongAvgOrderByAggregateInput = {
    tempo?: SortOrder
  }

  export type SongMaxOrderByAggregateInput = {
    id?: SortOrder
    title?: SortOrder
    artist?: SortOrder
    lyrics?: SortOrder
    structured?: SortOrder
    category?: SortOrder
    tags?: SortOrder
    keySignature?: SortOrder
    tempo?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SongMinOrderByAggregateInput = {
    id?: SortOrder
    title?: SortOrder
    artist?: SortOrder
    lyrics?: SortOrder
    structured?: SortOrder
    category?: SortOrder
    tags?: SortOrder
    keySignature?: SortOrder
    tempo?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SongSumOrderByAggregateInput = {
    tempo?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type SermonNoteCountOrderByAggregateInput = {
    id?: SortOrder
    title?: SortOrder
    content?: SortOrder
    outline?: SortOrder
    bibleRefs?: SortOrder
    date?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SermonNoteMaxOrderByAggregateInput = {
    id?: SortOrder
    title?: SortOrder
    content?: SortOrder
    outline?: SortOrder
    bibleRefs?: SortOrder
    date?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SermonNoteMinOrderByAggregateInput = {
    id?: SortOrder
    title?: SortOrder
    content?: SortOrder
    outline?: SortOrder
    bibleRefs?: SortOrder
    date?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SongNullableScalarRelationFilter = {
    is?: SongWhereInput | null
    isNot?: SongWhereInput | null
  }

  export type SermonNoteNullableScalarRelationFilter = {
    is?: SermonNoteWhereInput | null
    isNot?: SermonNoteWhereInput | null
  }

  export type PresentationCountOrderByAggregateInput = {
    id?: SortOrder
    title?: SortOrder
    slides?: SortOrder
    songId?: SortOrder
    sermonId?: SortOrder
    bibleRefs?: SortOrder
    theme?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PresentationMaxOrderByAggregateInput = {
    id?: SortOrder
    title?: SortOrder
    slides?: SortOrder
    songId?: SortOrder
    sermonId?: SortOrder
    bibleRefs?: SortOrder
    theme?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type PresentationMinOrderByAggregateInput = {
    id?: SortOrder
    title?: SortOrder
    slides?: SortOrder
    songId?: SortOrder
    sermonId?: SortOrder
    bibleRefs?: SortOrder
    theme?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type BibleVerseCacheReferenceTranslationCompoundUniqueInput = {
    reference: string
    translation: string
  }

  export type BibleVerseCacheCountOrderByAggregateInput = {
    id?: SortOrder
    reference?: SortOrder
    translation?: SortOrder
    text?: SortOrder
    book?: SortOrder
    chapter?: SortOrder
    verseStart?: SortOrder
    verseEnd?: SortOrder
    createdAt?: SortOrder
  }

  export type BibleVerseCacheAvgOrderByAggregateInput = {
    chapter?: SortOrder
    verseStart?: SortOrder
    verseEnd?: SortOrder
  }

  export type BibleVerseCacheMaxOrderByAggregateInput = {
    id?: SortOrder
    reference?: SortOrder
    translation?: SortOrder
    text?: SortOrder
    book?: SortOrder
    chapter?: SortOrder
    verseStart?: SortOrder
    verseEnd?: SortOrder
    createdAt?: SortOrder
  }

  export type BibleVerseCacheMinOrderByAggregateInput = {
    id?: SortOrder
    reference?: SortOrder
    translation?: SortOrder
    text?: SortOrder
    book?: SortOrder
    chapter?: SortOrder
    verseStart?: SortOrder
    verseEnd?: SortOrder
    createdAt?: SortOrder
  }

  export type BibleVerseCacheSumOrderByAggregateInput = {
    chapter?: SortOrder
    verseStart?: SortOrder
    verseEnd?: SortOrder
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type BibleTranslationDownloadCountOrderByAggregateInput = {
    id?: SortOrder
    translation?: SortOrder
    name?: SortOrder
    language?: SortOrder
    status?: SortOrder
    progress?: SortOrder
    bookCount?: SortOrder
    verseCount?: SortOrder
    errorMessage?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type BibleTranslationDownloadAvgOrderByAggregateInput = {
    progress?: SortOrder
    bookCount?: SortOrder
    verseCount?: SortOrder
  }

  export type BibleTranslationDownloadMaxOrderByAggregateInput = {
    id?: SortOrder
    translation?: SortOrder
    name?: SortOrder
    language?: SortOrder
    status?: SortOrder
    progress?: SortOrder
    bookCount?: SortOrder
    verseCount?: SortOrder
    errorMessage?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type BibleTranslationDownloadMinOrderByAggregateInput = {
    id?: SortOrder
    translation?: SortOrder
    name?: SortOrder
    language?: SortOrder
    status?: SortOrder
    progress?: SortOrder
    bookCount?: SortOrder
    verseCount?: SortOrder
    errorMessage?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type BibleTranslationDownloadSumOrderByAggregateInput = {
    progress?: SortOrder
    bookCount?: SortOrder
    verseCount?: SortOrder
  }

  export type BibleChapterCacheTranslationBookChapterCompoundUniqueInput = {
    translation: string
    book: string
    chapter: number
  }

  export type BibleChapterCacheCountOrderByAggregateInput = {
    id?: SortOrder
    translation?: SortOrder
    book?: SortOrder
    chapter?: SortOrder
    verses?: SortOrder
    createdAt?: SortOrder
  }

  export type BibleChapterCacheAvgOrderByAggregateInput = {
    chapter?: SortOrder
  }

  export type BibleChapterCacheMaxOrderByAggregateInput = {
    id?: SortOrder
    translation?: SortOrder
    book?: SortOrder
    chapter?: SortOrder
    verses?: SortOrder
    createdAt?: SortOrder
  }

  export type BibleChapterCacheMinOrderByAggregateInput = {
    id?: SortOrder
    translation?: SortOrder
    book?: SortOrder
    chapter?: SortOrder
    verses?: SortOrder
    createdAt?: SortOrder
  }

  export type BibleChapterCacheSumOrderByAggregateInput = {
    chapter?: SortOrder
  }

  export type PresentationCreateNestedManyWithoutSongInput = {
    create?: XOR<PresentationCreateWithoutSongInput, PresentationUncheckedCreateWithoutSongInput> | PresentationCreateWithoutSongInput[] | PresentationUncheckedCreateWithoutSongInput[]
    connectOrCreate?: PresentationCreateOrConnectWithoutSongInput | PresentationCreateOrConnectWithoutSongInput[]
    createMany?: PresentationCreateManySongInputEnvelope
    connect?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
  }

  export type PresentationUncheckedCreateNestedManyWithoutSongInput = {
    create?: XOR<PresentationCreateWithoutSongInput, PresentationUncheckedCreateWithoutSongInput> | PresentationCreateWithoutSongInput[] | PresentationUncheckedCreateWithoutSongInput[]
    connectOrCreate?: PresentationCreateOrConnectWithoutSongInput | PresentationCreateOrConnectWithoutSongInput[]
    createMany?: PresentationCreateManySongInputEnvelope
    connect?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type PresentationUpdateManyWithoutSongNestedInput = {
    create?: XOR<PresentationCreateWithoutSongInput, PresentationUncheckedCreateWithoutSongInput> | PresentationCreateWithoutSongInput[] | PresentationUncheckedCreateWithoutSongInput[]
    connectOrCreate?: PresentationCreateOrConnectWithoutSongInput | PresentationCreateOrConnectWithoutSongInput[]
    upsert?: PresentationUpsertWithWhereUniqueWithoutSongInput | PresentationUpsertWithWhereUniqueWithoutSongInput[]
    createMany?: PresentationCreateManySongInputEnvelope
    set?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    disconnect?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    delete?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    connect?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    update?: PresentationUpdateWithWhereUniqueWithoutSongInput | PresentationUpdateWithWhereUniqueWithoutSongInput[]
    updateMany?: PresentationUpdateManyWithWhereWithoutSongInput | PresentationUpdateManyWithWhereWithoutSongInput[]
    deleteMany?: PresentationScalarWhereInput | PresentationScalarWhereInput[]
  }

  export type PresentationUncheckedUpdateManyWithoutSongNestedInput = {
    create?: XOR<PresentationCreateWithoutSongInput, PresentationUncheckedCreateWithoutSongInput> | PresentationCreateWithoutSongInput[] | PresentationUncheckedCreateWithoutSongInput[]
    connectOrCreate?: PresentationCreateOrConnectWithoutSongInput | PresentationCreateOrConnectWithoutSongInput[]
    upsert?: PresentationUpsertWithWhereUniqueWithoutSongInput | PresentationUpsertWithWhereUniqueWithoutSongInput[]
    createMany?: PresentationCreateManySongInputEnvelope
    set?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    disconnect?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    delete?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    connect?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    update?: PresentationUpdateWithWhereUniqueWithoutSongInput | PresentationUpdateWithWhereUniqueWithoutSongInput[]
    updateMany?: PresentationUpdateManyWithWhereWithoutSongInput | PresentationUpdateManyWithWhereWithoutSongInput[]
    deleteMany?: PresentationScalarWhereInput | PresentationScalarWhereInput[]
  }

  export type PresentationCreateNestedManyWithoutSermonInput = {
    create?: XOR<PresentationCreateWithoutSermonInput, PresentationUncheckedCreateWithoutSermonInput> | PresentationCreateWithoutSermonInput[] | PresentationUncheckedCreateWithoutSermonInput[]
    connectOrCreate?: PresentationCreateOrConnectWithoutSermonInput | PresentationCreateOrConnectWithoutSermonInput[]
    createMany?: PresentationCreateManySermonInputEnvelope
    connect?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
  }

  export type PresentationUncheckedCreateNestedManyWithoutSermonInput = {
    create?: XOR<PresentationCreateWithoutSermonInput, PresentationUncheckedCreateWithoutSermonInput> | PresentationCreateWithoutSermonInput[] | PresentationUncheckedCreateWithoutSermonInput[]
    connectOrCreate?: PresentationCreateOrConnectWithoutSermonInput | PresentationCreateOrConnectWithoutSermonInput[]
    createMany?: PresentationCreateManySermonInputEnvelope
    connect?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
  }

  export type PresentationUpdateManyWithoutSermonNestedInput = {
    create?: XOR<PresentationCreateWithoutSermonInput, PresentationUncheckedCreateWithoutSermonInput> | PresentationCreateWithoutSermonInput[] | PresentationUncheckedCreateWithoutSermonInput[]
    connectOrCreate?: PresentationCreateOrConnectWithoutSermonInput | PresentationCreateOrConnectWithoutSermonInput[]
    upsert?: PresentationUpsertWithWhereUniqueWithoutSermonInput | PresentationUpsertWithWhereUniqueWithoutSermonInput[]
    createMany?: PresentationCreateManySermonInputEnvelope
    set?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    disconnect?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    delete?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    connect?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    update?: PresentationUpdateWithWhereUniqueWithoutSermonInput | PresentationUpdateWithWhereUniqueWithoutSermonInput[]
    updateMany?: PresentationUpdateManyWithWhereWithoutSermonInput | PresentationUpdateManyWithWhereWithoutSermonInput[]
    deleteMany?: PresentationScalarWhereInput | PresentationScalarWhereInput[]
  }

  export type PresentationUncheckedUpdateManyWithoutSermonNestedInput = {
    create?: XOR<PresentationCreateWithoutSermonInput, PresentationUncheckedCreateWithoutSermonInput> | PresentationCreateWithoutSermonInput[] | PresentationUncheckedCreateWithoutSermonInput[]
    connectOrCreate?: PresentationCreateOrConnectWithoutSermonInput | PresentationCreateOrConnectWithoutSermonInput[]
    upsert?: PresentationUpsertWithWhereUniqueWithoutSermonInput | PresentationUpsertWithWhereUniqueWithoutSermonInput[]
    createMany?: PresentationCreateManySermonInputEnvelope
    set?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    disconnect?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    delete?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    connect?: PresentationWhereUniqueInput | PresentationWhereUniqueInput[]
    update?: PresentationUpdateWithWhereUniqueWithoutSermonInput | PresentationUpdateWithWhereUniqueWithoutSermonInput[]
    updateMany?: PresentationUpdateManyWithWhereWithoutSermonInput | PresentationUpdateManyWithWhereWithoutSermonInput[]
    deleteMany?: PresentationScalarWhereInput | PresentationScalarWhereInput[]
  }

  export type SongCreateNestedOneWithoutPresentationsInput = {
    create?: XOR<SongCreateWithoutPresentationsInput, SongUncheckedCreateWithoutPresentationsInput>
    connectOrCreate?: SongCreateOrConnectWithoutPresentationsInput
    connect?: SongWhereUniqueInput
  }

  export type SermonNoteCreateNestedOneWithoutPresentationsInput = {
    create?: XOR<SermonNoteCreateWithoutPresentationsInput, SermonNoteUncheckedCreateWithoutPresentationsInput>
    connectOrCreate?: SermonNoteCreateOrConnectWithoutPresentationsInput
    connect?: SermonNoteWhereUniqueInput
  }

  export type SongUpdateOneWithoutPresentationsNestedInput = {
    create?: XOR<SongCreateWithoutPresentationsInput, SongUncheckedCreateWithoutPresentationsInput>
    connectOrCreate?: SongCreateOrConnectWithoutPresentationsInput
    upsert?: SongUpsertWithoutPresentationsInput
    disconnect?: SongWhereInput | boolean
    delete?: SongWhereInput | boolean
    connect?: SongWhereUniqueInput
    update?: XOR<XOR<SongUpdateToOneWithWhereWithoutPresentationsInput, SongUpdateWithoutPresentationsInput>, SongUncheckedUpdateWithoutPresentationsInput>
  }

  export type SermonNoteUpdateOneWithoutPresentationsNestedInput = {
    create?: XOR<SermonNoteCreateWithoutPresentationsInput, SermonNoteUncheckedCreateWithoutPresentationsInput>
    connectOrCreate?: SermonNoteCreateOrConnectWithoutPresentationsInput
    upsert?: SermonNoteUpsertWithoutPresentationsInput
    disconnect?: SermonNoteWhereInput | boolean
    delete?: SermonNoteWhereInput | boolean
    connect?: SermonNoteWhereUniqueInput
    update?: XOR<XOR<SermonNoteUpdateToOneWithWhereWithoutPresentationsInput, SermonNoteUpdateWithoutPresentationsInput>, SermonNoteUncheckedUpdateWithoutPresentationsInput>
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type PresentationCreateWithoutSongInput = {
    id?: string
    title: string
    slides: string
    bibleRefs?: string | null
    theme?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    sermon?: SermonNoteCreateNestedOneWithoutPresentationsInput
  }

  export type PresentationUncheckedCreateWithoutSongInput = {
    id?: string
    title: string
    slides: string
    sermonId?: string | null
    bibleRefs?: string | null
    theme?: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PresentationCreateOrConnectWithoutSongInput = {
    where: PresentationWhereUniqueInput
    create: XOR<PresentationCreateWithoutSongInput, PresentationUncheckedCreateWithoutSongInput>
  }

  export type PresentationCreateManySongInputEnvelope = {
    data: PresentationCreateManySongInput | PresentationCreateManySongInput[]
  }

  export type PresentationUpsertWithWhereUniqueWithoutSongInput = {
    where: PresentationWhereUniqueInput
    update: XOR<PresentationUpdateWithoutSongInput, PresentationUncheckedUpdateWithoutSongInput>
    create: XOR<PresentationCreateWithoutSongInput, PresentationUncheckedCreateWithoutSongInput>
  }

  export type PresentationUpdateWithWhereUniqueWithoutSongInput = {
    where: PresentationWhereUniqueInput
    data: XOR<PresentationUpdateWithoutSongInput, PresentationUncheckedUpdateWithoutSongInput>
  }

  export type PresentationUpdateManyWithWhereWithoutSongInput = {
    where: PresentationScalarWhereInput
    data: XOR<PresentationUpdateManyMutationInput, PresentationUncheckedUpdateManyWithoutSongInput>
  }

  export type PresentationScalarWhereInput = {
    AND?: PresentationScalarWhereInput | PresentationScalarWhereInput[]
    OR?: PresentationScalarWhereInput[]
    NOT?: PresentationScalarWhereInput | PresentationScalarWhereInput[]
    id?: StringFilter<"Presentation"> | string
    title?: StringFilter<"Presentation"> | string
    slides?: StringFilter<"Presentation"> | string
    songId?: StringNullableFilter<"Presentation"> | string | null
    sermonId?: StringNullableFilter<"Presentation"> | string | null
    bibleRefs?: StringNullableFilter<"Presentation"> | string | null
    theme?: StringFilter<"Presentation"> | string
    createdAt?: DateTimeFilter<"Presentation"> | Date | string
    updatedAt?: DateTimeFilter<"Presentation"> | Date | string
  }

  export type PresentationCreateWithoutSermonInput = {
    id?: string
    title: string
    slides: string
    bibleRefs?: string | null
    theme?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    song?: SongCreateNestedOneWithoutPresentationsInput
  }

  export type PresentationUncheckedCreateWithoutSermonInput = {
    id?: string
    title: string
    slides: string
    songId?: string | null
    bibleRefs?: string | null
    theme?: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PresentationCreateOrConnectWithoutSermonInput = {
    where: PresentationWhereUniqueInput
    create: XOR<PresentationCreateWithoutSermonInput, PresentationUncheckedCreateWithoutSermonInput>
  }

  export type PresentationCreateManySermonInputEnvelope = {
    data: PresentationCreateManySermonInput | PresentationCreateManySermonInput[]
  }

  export type PresentationUpsertWithWhereUniqueWithoutSermonInput = {
    where: PresentationWhereUniqueInput
    update: XOR<PresentationUpdateWithoutSermonInput, PresentationUncheckedUpdateWithoutSermonInput>
    create: XOR<PresentationCreateWithoutSermonInput, PresentationUncheckedCreateWithoutSermonInput>
  }

  export type PresentationUpdateWithWhereUniqueWithoutSermonInput = {
    where: PresentationWhereUniqueInput
    data: XOR<PresentationUpdateWithoutSermonInput, PresentationUncheckedUpdateWithoutSermonInput>
  }

  export type PresentationUpdateManyWithWhereWithoutSermonInput = {
    where: PresentationScalarWhereInput
    data: XOR<PresentationUpdateManyMutationInput, PresentationUncheckedUpdateManyWithoutSermonInput>
  }

  export type SongCreateWithoutPresentationsInput = {
    id?: string
    title: string
    artist?: string | null
    lyrics: string
    structured?: string | null
    category?: string
    tags?: string | null
    keySignature?: string | null
    tempo?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SongUncheckedCreateWithoutPresentationsInput = {
    id?: string
    title: string
    artist?: string | null
    lyrics: string
    structured?: string | null
    category?: string
    tags?: string | null
    keySignature?: string | null
    tempo?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SongCreateOrConnectWithoutPresentationsInput = {
    where: SongWhereUniqueInput
    create: XOR<SongCreateWithoutPresentationsInput, SongUncheckedCreateWithoutPresentationsInput>
  }

  export type SermonNoteCreateWithoutPresentationsInput = {
    id?: string
    title: string
    content: string
    outline?: string | null
    bibleRefs?: string | null
    date?: Date | string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SermonNoteUncheckedCreateWithoutPresentationsInput = {
    id?: string
    title: string
    content: string
    outline?: string | null
    bibleRefs?: string | null
    date?: Date | string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SermonNoteCreateOrConnectWithoutPresentationsInput = {
    where: SermonNoteWhereUniqueInput
    create: XOR<SermonNoteCreateWithoutPresentationsInput, SermonNoteUncheckedCreateWithoutPresentationsInput>
  }

  export type SongUpsertWithoutPresentationsInput = {
    update: XOR<SongUpdateWithoutPresentationsInput, SongUncheckedUpdateWithoutPresentationsInput>
    create: XOR<SongCreateWithoutPresentationsInput, SongUncheckedCreateWithoutPresentationsInput>
    where?: SongWhereInput
  }

  export type SongUpdateToOneWithWhereWithoutPresentationsInput = {
    where?: SongWhereInput
    data: XOR<SongUpdateWithoutPresentationsInput, SongUncheckedUpdateWithoutPresentationsInput>
  }

  export type SongUpdateWithoutPresentationsInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    artist?: NullableStringFieldUpdateOperationsInput | string | null
    lyrics?: StringFieldUpdateOperationsInput | string
    structured?: NullableStringFieldUpdateOperationsInput | string | null
    category?: StringFieldUpdateOperationsInput | string
    tags?: NullableStringFieldUpdateOperationsInput | string | null
    keySignature?: NullableStringFieldUpdateOperationsInput | string | null
    tempo?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SongUncheckedUpdateWithoutPresentationsInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    artist?: NullableStringFieldUpdateOperationsInput | string | null
    lyrics?: StringFieldUpdateOperationsInput | string
    structured?: NullableStringFieldUpdateOperationsInput | string | null
    category?: StringFieldUpdateOperationsInput | string
    tags?: NullableStringFieldUpdateOperationsInput | string | null
    keySignature?: NullableStringFieldUpdateOperationsInput | string | null
    tempo?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SermonNoteUpsertWithoutPresentationsInput = {
    update: XOR<SermonNoteUpdateWithoutPresentationsInput, SermonNoteUncheckedUpdateWithoutPresentationsInput>
    create: XOR<SermonNoteCreateWithoutPresentationsInput, SermonNoteUncheckedCreateWithoutPresentationsInput>
    where?: SermonNoteWhereInput
  }

  export type SermonNoteUpdateToOneWithWhereWithoutPresentationsInput = {
    where?: SermonNoteWhereInput
    data: XOR<SermonNoteUpdateWithoutPresentationsInput, SermonNoteUncheckedUpdateWithoutPresentationsInput>
  }

  export type SermonNoteUpdateWithoutPresentationsInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    outline?: NullableStringFieldUpdateOperationsInput | string | null
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SermonNoteUncheckedUpdateWithoutPresentationsInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    outline?: NullableStringFieldUpdateOperationsInput | string | null
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PresentationCreateManySongInput = {
    id?: string
    title: string
    slides: string
    sermonId?: string | null
    bibleRefs?: string | null
    theme?: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PresentationUpdateWithoutSongInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    slides?: StringFieldUpdateOperationsInput | string
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    theme?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    sermon?: SermonNoteUpdateOneWithoutPresentationsNestedInput
  }

  export type PresentationUncheckedUpdateWithoutSongInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    slides?: StringFieldUpdateOperationsInput | string
    sermonId?: NullableStringFieldUpdateOperationsInput | string | null
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    theme?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PresentationUncheckedUpdateManyWithoutSongInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    slides?: StringFieldUpdateOperationsInput | string
    sermonId?: NullableStringFieldUpdateOperationsInput | string | null
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    theme?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PresentationCreateManySermonInput = {
    id?: string
    title: string
    slides: string
    songId?: string | null
    bibleRefs?: string | null
    theme?: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type PresentationUpdateWithoutSermonInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    slides?: StringFieldUpdateOperationsInput | string
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    theme?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    song?: SongUpdateOneWithoutPresentationsNestedInput
  }

  export type PresentationUncheckedUpdateWithoutSermonInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    slides?: StringFieldUpdateOperationsInput | string
    songId?: NullableStringFieldUpdateOperationsInput | string | null
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    theme?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PresentationUncheckedUpdateManyWithoutSermonInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    slides?: StringFieldUpdateOperationsInput | string
    songId?: NullableStringFieldUpdateOperationsInput | string | null
    bibleRefs?: NullableStringFieldUpdateOperationsInput | string | null
    theme?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}