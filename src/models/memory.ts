/**
 * Memory class implements a simple in-memory store for beliefs with time-based eviction.
 */

export type Observation<T> = {
    value: T;
    seenAt: number;
};