/**
 * Compatibility helpers for the Shaka player bundle.
 *
 * Shaka 5 relies on `Map.prototype.getOrInsert` and
 * `Map.prototype.getOrInsertComputed`. Browsers without those methods throw
 * while the player is constructed, which leaves the media element without a
 * source and the UI stuck in its loading state.
 */

interface MapWithInsert<K, V> extends Map<K, V> {
  getOrInsert?: (key: K, value: V) => V
  getOrInsertComputed?: (key: K, callback: (key: K) => V) => V
}

/**
 * Installs the `Map` helpers Shaka needs when the browser does not ship them.
 *
 * The shims follow the proposal semantics: an existing value is never
 * replaced, and the computed variant only calls the callback for keys that are
 * not present yet.
 */
export function ensureShakaCompatibility(): void {
  const mapPrototype = Map.prototype as MapWithInsert<unknown, unknown>

  if (typeof mapPrototype.getOrInsert !== "function") {
    Object.defineProperty(mapPrototype, "getOrInsert", {
      configurable: true,
      writable: true,
      value: function getOrInsert<K, V>(this: Map<K, V>, key: K, value: V): V {
        if (!this.has(key)) {
          this.set(key, value)
        }

        return this.get(key) as V
      },
    })
  }

  if (typeof mapPrototype.getOrInsertComputed !== "function") {
    Object.defineProperty(mapPrototype, "getOrInsertComputed", {
      configurable: true,
      writable: true,
      value: function getOrInsertComputed<K, V>(
        this: Map<K, V>,
        key: K,
        callback: (key: K) => V
      ): V {
        if (!this.has(key)) {
          this.set(key, callback(key))
        }

        return this.get(key) as V
      },
    })
  }
}
