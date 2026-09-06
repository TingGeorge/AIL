export type AccountSaveQueue = {
  enqueue<T>(operation: () => Promise<T>): Promise<T>;
};

export function createAccountSaveQueue(): AccountSaveQueue {
  let tail = Promise.resolve<unknown>(undefined);

  return {
    enqueue<T>(operation: () => Promise<T>) {
      const result = tail.then(operation, operation);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
