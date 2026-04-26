// L-naver-2026rbush1 (2026-04-26): rbush 패키지에 공식 타입 없어서 ambient declaration.
//   사용 시점에 필요한 최소 시그니처만 정의.

declare module 'rbush' {
  export interface BBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }
  export default class RBush<T extends BBox = BBox> {
    constructor(maxEntries?: number);
    insert(item: T): this;
    load(items: T[]): this;
    remove(item: T, equalsFn?: (a: T, b: T) => boolean): this;
    clear(): this;
    search(bbox: BBox): T[];
    collides(bbox: BBox): boolean;
    all(): T[];
    toJSON(): unknown;
    fromJSON(data: unknown): this;
  }
}
