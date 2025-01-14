import {
  Worterbuch,
  Key,
  StateEvent,
  TransactionID,
  Value,
  Rejection,
} from ".";
import { v4 as uuidv4 } from "uuid";

export type SubscriptionID = string;
export type Callback = (value: Value | null) => void;
export type SubscriptionPool = {
  subscribe: (key: Key, callback: Callback) => SubscriptionID;
  unsubscribe: (
    subscriptionId: SubscriptionID,
    keepBackendSubscriptions?: boolean
  ) => void;
};

export function subscriptionPool(wb: Worterbuch): SubscriptionPool {
  const keysByTransactionIds: Map<TransactionID, Key> = new Map();
  const transactionIdsByKey: Map<Key, TransactionID> = new Map();
  const transactionIdsBySubscriptionId: Map<SubscriptionID, TransactionID> =
    new Map();
  const subscriptions: Map<
    TransactionID,
    Map<SubscriptionID, [Callback, Rejection | undefined]>
  > = new Map();
  const cache: Map<Key, Value> = new Map();

  const subscribe = (
    key: Key,
    callback: Callback,
    unique?: boolean,
    onerror?: Rejection
  ) => {
    const subscriptionId = uuidv4();

    const existingTransactionId = transactionIdsByKey.get(key);
    if (existingTransactionId !== undefined) {
      const value = cache.get(key);
      const subscribers = subscriptions.get(existingTransactionId);
      if (subscribers !== undefined) {
        subscribers.set(subscriptionId, [callback, onerror]);
      }
      if (value) {
        callback(value);
      }
    } else {
      let transactionId = wb.subscribe(
        key,
        (event: StateEvent) => {
          if (event.value) {
            cache.set(key, event.value);
          } else {
            cache.delete(key);
          }
          subscriptions
            .get(transactionId)
            ?.forEach((cb) => cb[0](event.value || null));
        },
        unique,
        (err) => {
          // TODO propagate error
        }
      );
      transactionIdsByKey.set(key, transactionId);
      keysByTransactionIds.set(transactionId, key);
      transactionIdsBySubscriptionId.set(subscriptionId, transactionId);
      const subscribers = new Map();
      subscribers.set(subscriptionId, callback);
      subscriptions.set(transactionId, subscribers);
    }

    return subscriptionId;
  };

  const unsubscribe = (
    subscriptionId: SubscriptionID,
    keepBackendSubscriptions?: boolean
  ) => {
    const transactionId = transactionIdsBySubscriptionId.get(subscriptionId);
    if (transactionId !== undefined) {
      transactionIdsBySubscriptionId.delete(subscriptionId);
      const subscribers = subscriptions.get(transactionId);
      if (subscribers) {
        subscribers.delete(subscriptionId);
        if (subscribers.size == 0 && !keepBackendSubscriptions) {
          subscriptions.delete(transactionId);
          wb.unsubscribe(transactionId);
          const key = keysByTransactionIds.get(transactionId);
          if (key) {
            keysByTransactionIds.delete(transactionId);
            transactionIdsByKey.delete(key);
            cache.delete(key);
          }
        }
      }
    }
  };

  return {
    subscribe,
    unsubscribe,
  };
}
