import mongoose, { type ClientSession } from 'mongoose';

function isTransactionUnsupported(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('Transaction numbers are only allowed') ||
    message.includes('replica set') ||
    message.includes('IllegalOperation')
  );
}

export async function withTransaction<T>(fn: (session?: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } catch (err) {
    if (isTransactionUnsupported(err)) {
      return fn(undefined);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
