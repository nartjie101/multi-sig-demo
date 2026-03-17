declare global {
  interface Window {
    haha?: {
      request: (args: {
        method: string;
        params?: readonly unknown[] | object;
      }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (
        event: string,
        handler: (...args: unknown[]) => void,
      ) => void;
    };
  }
}

export {};
